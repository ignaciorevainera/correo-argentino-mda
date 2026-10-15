import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { can } from "@lib/roleConfig";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";
import { db } from "@db/index";
import { offices } from "@db/schema";
import { logAdminFromAstro } from "@lib/auditLogger";
import { normalizeSearchValue } from "@lib/clientSearch";
import { buildBuildingKey } from "@lib/officeBuildingKey";
import { z } from "zod";

/**
 * Guarda de CRECIMIENTO, no un limite operativo: es inalcanzable via API. El
 * schema capa `groups` en 100, la base real tiene ~5.200 buckets cuyo mas grande
 * tiene 26 filas, y los 100 buckets mas grandes cubren ~487 filas; por eso los
 * 2000 no se tocan salvo que cambien los datos. Existe porque el driver
 * better-sqlite3 de Drizzle es sincrono (los `await` sobre `run`/`all` no ceden
 * el event loop): sin tope, un payload de 100 grupos nombrando una direccion muy
 * repetida genero 644.900 sentencias y 41,6 s de bloqueo del SSR. No bajarlo
 * pensando que es un limite de negocio: cortaria cargas legitimas (#181).
 */
const MAX_UPDATE_ROWS = 2000;

/** Snapshots `mda-reconcile-*` que se conservan en `database/backups/`. */
const MAX_RECONCILE_BACKUPS = 5;

/**
 * Snapshots que una respuesta todavia en curso va a nombrar. El `keep` de
 * `pruneReconcileBackups` solo protege el `dest` de la propia llamada, asi que
 * un POST concurrente podia borrar el snapshot que este POST le acababa de
 * devolver al operador (con un salto de reloj hacia atras, el sello del recien
 * escrito ordena por debajo de 5 snapshots viejos y el prune ajeno lo recorta).
 * Con este registro, ningun prune de otro pedido lo borra mientras la respuesta
 * se esta armando (#181).
 */
const inFlightBackups = new Set<string>();

const payloadSchema = z.object({
  groups: z
    .array(
      z.object({
        // El `key` llega desde la tabla (form `C#3443|JUAN+SAN`) y hoy no se
        // usa para la busqueda, pero se acota igual: sin tope, un payload con
        // una clave de 5.000.000 de caracteres entra y se guarda.
        key: z.string().min(1).max(100),
        // Normaliza a la forma que realmente se escribe (trim + upper) ANTES de
        // medir: el upper de Unicode no preserva longitud, asi que 255
        // caracteres de "ss" (ß) pasaban el `.max(255)` del input y se
        // almacenaban como 510 caracteres.
        canonical: z
          .string()
          .trim()
          .toUpperCase()
          .min(3, {
            message: "La dirección canónica debe tener al menos 3 caracteres",
          })
          .max(255),
      }),
    )
    .min(1)
    .max(100)
    // Una clave repetida en dos grupos se aplicaba a medias: `buildPlan` marca a
    // los miembros con `processed`, asi que el segundo grupo no escribia nada
    // pero igual emitia su fila de auditoria ("Unifico N oficinas" sobre un lote
    // que no toco). La pagina nunca genera claves repetidas, pero un POST a
    // mano si, y ahi el rechazo tiene que ser explicito.
    .refine(
      (groups) => {
        const seen = new Set<string>();
        return groups.every((group) => {
          if (seen.has(group.key)) return false;
          seen.add(group.key);
          return true;
        });
      },
      {
        message:
          "No se puede repetir la clave de un edificio en la misma operación",
      },
    ),
});

interface ReconcileTarget {
  id: number;
  code: string;
  name: string;
  address: string | null;
}

interface ReconcilePlan {
  updates: {
    id: number;
    address: string;
    searchableText: string;
  }[];
  auditMessages: string[];
}

/**
 * Arma el lote a partir de las filas cuya clave de edificio coincide con la del
 * grupo enviado. Deduplica por id de oficina (misma fila puede caer en dos
 * grupos) y descarta las filas que ya guardan exactamente la direccion destino,
 * de modo que `updates` solo contenga escrituras que cambian algo.
 *
 * Los miembros se resuelven por clave y NO por igualdad de direccion: el grupo
 * se armo en la pagina justamente porque sus direcciones estaban escritas de
 * forma distinta, asi que comparar contra la canonica dejaba afuera al miembro
 * que aun no la usaba.
 *
 * Los mensajes de auditoria se generan por grupo (no por fila) y se emiten
 * despues del commit, siguiendo el mismo criterio que `handleReorder`.
 */
function buildPlan(
  groups: { key: string; canonical: string }[],
  targetRows: ReconcileTarget[],
  keysByOfficeId: Map<number, string>,
): ReconcilePlan {
  const updates: ReconcilePlan["updates"] = [];
  const auditMessages: string[] = [];
  const processed = new Set<number>();

  for (const group of groups) {
    const canonical = group.canonical;
    const members = targetRows.filter(
      (r) => keysByOfficeId.get(r.id) === group.key,
    );

    const writtenForGroup: ReconcileTarget[] = [];
    for (const member of members) {
      if (processed.has(member.id)) continue;
      processed.add(member.id);
      if (member.address === canonical) continue;
      writtenForGroup.push(member);
      updates.push({
        id: member.id,
        address: canonical,
        searchableText: normalizeSearchValue(
          [member.code, member.name, canonical].filter(Boolean).join(" "),
        ),
      });
    }

    // El recuento sale de las escrituras EFECTIVAS de este grupo: una fila que
    // ya guarda la canónica no se escribe, y una oficina que aparezca en dos
    // grupos se cuenta una sola vez (`processed`). Un grupo que no escribe nada
    // no deja fila de auditoría.
    if (writtenForGroup.length === 0) continue;

    auditMessages.push(
      `Unificó ${writtenForGroup.length} oficinas bajo el edificio "${canonical}" [${group.key}] (${writtenForGroup
        .map((m) => m.code)
        .join(", ")})`,
    );
  }

  return { updates, auditMessages };
}

/**
 * Snapshot WAL-safe de `database/mda.db` en
 * `database/backups/mda-reconcile-<stamp>-<uuid>.db`. Es la convencion de los scripts
 * `scripts/*.mts`, NO la de `scripts/backup-db.bat` (que escribe fuera del
 * repo, en `..\..\correo-argentino-mda-database-backup`). `backup()` usa la API
 * de backup de SQLite, que incluye el contenido pendiente en `-wal` (a
 * diferencia de copiar el archivo); el handle se abre read-write, igual que en
 * los runbooks hermanos.
 *
 * La ruta se deriva de `process.cwd()`, igual que en `scripts/reconcile-buildings.ts`:
 * son dos lugares que derivan el mismo path y pueden desalinearse.
 */
async function backupDatabase(): Promise<string> {
  const dbPath = path.resolve(process.cwd(), "database", "mda.db");
  const backupDir = path.resolve(process.cwd(), "database", "backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // El sufijo rompe la colisión entre dos POST simultáneos: `toISOString()` solo
  // tiene resolución de milisegundos, así que dos pedidos elegían el mismo
  // `dest` y escribían sobre el mismo archivo.
  const dest = path.join(
    backupDir,
    `mda-reconcile-${stamp}-${randomUUID().slice(0, 8)}.db`,
  );

  // `new Database(dbPath)` CREA el archivo si falta: sin este chequeo, una base
  // ausente (o vacia) produciria un snapshot de 0 bytes que el operador
  // leeria como un backup valido.
  let dbStat: fs.Stats;
  try {
    dbStat = fs.statSync(dbPath);
  } catch {
    throw new Error(`No se encontro la base de datos en ${dbPath}`);
  }
  if (!dbStat.isFile() || dbStat.size === 0) {
    throw new Error(
      `La base de datos en ${dbPath} no es un archivo con contenido`,
    );
  }

  fs.mkdirSync(backupDir, { recursive: true });

  // Handle propio y efimero: `db` (drizzle) no expone el handle crudo de
  // better-sqlite3.
  const handle = new Database(dbPath);
  try {
    await handle.backup(dest);
  } catch (error) {
    // `backup()` rechaza sin deshacer el destino: un snapshot a medias no
    // puede quedar en database/backups/ fingiendo ser válido.
    fs.rmSync(dest, { force: true });
    throw error;
  } finally {
    handle.close();
  }

  // El origen ya se validó antes de abrir el handle; el destino también: un
  // snapshot vacío no debe sobrevivir como uno de los `MAX_RECONCILE_BACKUPS`
  // más nuevos.
  const destStat = fs.statSync(dest);
  if (!destStat.isFile() || destStat.size === 0) {
    fs.rmSync(dest, { force: true });
    throw new Error(`El snapshot ${dest} salió vacío y fue eliminado`);
  }

  pruneReconcileBackups(backupDir, dest);

  return dest;
}

/**
 * Deja solo los `MAX_RECONCILE_BACKUPS` snapshots mas recientes de esta ruta,
 * sin contar el recién escrito (`keep`). El timestamp ISO del nombre ordena
 * lexicograficamente. Sin esta poda cada POST deja ~19,7 MB y el rate limit de
 * escritura del middleware (20/min por usuario) llenaria el disco: el ENOSPC se
 * lleva por delante los 5 procesos de PM2. Solo toca el patron
 * `mda-reconcile-*.db`: `database/backups/` puede guardar backups de otros
 * runbooks.
 */
function pruneReconcileBackups(backupDir: string, keep: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(backupDir);
  } catch {
    return;
  }

  const snapshots = entries
    .filter((name) => /^mda-reconcile-.*\.db$/.test(name))
    .map((name) => ({ name, full: path.join(backupDir, name) }))
    .filter(({ full }) => {
      try {
        return fs.statSync(full).isFile();
      } catch {
        return false;
      }
    })
    // Mas nuevo primero: el stamp ISO del nombre ordena lexicograficamente, y
    // el sufijo uuid desempata dentro del mismo milisegundo.
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0))
    // `keep` se aparta del recorte: un salto de reloj hacia atrás hace que 5
    // sellos existentes ordenen por encima del recién escrito y el prune lo
    // borraba aunque la respuesta lo nominara como `backup`. Los snapshots de
    // respuestas en curso (`inFlightBackups`) se protegen igual, porque el
    // `keep` solo cubre la llamada propia (#181).
    .filter((entry) => entry.full !== keep && !inFlightBackups.has(entry.name));

  // El `- 1` reserva el lugar que ocupa `keep` en el conjunto protegido.
  for (const stale of snapshots.slice(MAX_RECONCILE_BACKUPS - 1)) {
    try {
      fs.unlinkSync(stale.full);
    } catch (error) {
      console.error(
        "[reconcile-buildings] No se pudo podar el snapshot:",
        error,
      );
    }
  }
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }
  if (!can(locals.user.role, "admin")) {
    return jsonResponse({ error: "Prohibido" }, 403);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Payload inválido", 400);
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join(", "), 400);
  }

  let backupName: string | null = null;

  try {
    // El select va PRIMERO: define el lote, y sin filas que escribir no hay
    // nada que respaldar. Con el snapshot al principio, cada POST gastaba ~19,7 MB
    // (incluso para no cambiar nada) y sin poda llenaba el disco.
    //
    // Sin filtro de `active` a proposito: la pagina arma los grupos sobre TODAS
    // las oficinas, asi que filtrar aca dejaria visibles en la pagina miembros
    // que el endpoint nunca tocaria (y el grupo seguiria sin unificarse).
    const targetRows = await db
      .select({
        id: offices.id,
        code: offices.code,
        name: offices.name,
        address: offices.address,
        provinceCode: offices.provinceCode,
      })
      .from(offices);

    // Una sola pasada por las filas para armar id -> clave; dentro del loop de
    // grupos solo se consulta el mapa (6.449 filas x N grupos serian 400 mil
    // recomputos de la normalizacion).
    const keysByOfficeId = new Map<number, string>();
    for (const row of targetRows) {
      const { key } = buildBuildingKey(row.address, row.provinceCode);
      if (key) keysByOfficeId.set(row.id, key);
    }

    const plan = buildPlan(parsed.data.groups, targetRows, keysByOfficeId);

    if (plan.updates.length > MAX_UPDATE_ROWS) {
      return jsonError(
        `La operación tocaría ${plan.updates.length} oficinas y supera el máximo de ${MAX_UPDATE_ROWS} por pedido. Unificá los edificios en tandas más chicas.`,
        400,
      );
    }

    if (plan.updates.length > 0) {
      backupName = path.basename(await backupDatabase());
      // Se protege del prune de otros pedidos hasta que la respuesta quede
      // armada (finally). Sin esto, un POST concurrente podia borrarlo y la
      // respuesta nombraba un backup inexistente (#181).
      inFlightBackups.add(backupName);

      // Un solo lote atomico: sin esto, un throw a mitad de camino dejaba los
      // grupos anteriores ya unificados sin que el cliente supiera cuantos.
      // El select y el calculo de `searchableText` viven fuera del callback
      // porque better-sqlite3 exige callbacks sincronos.
      db.transaction((tx) => {
        for (const update of plan.updates) {
          tx.update(offices)
            .set({
              address: update.address,
              searchableText: update.searchableText,
            })
            .where(eq(offices.id, update.id))
            .run();
        }
      });
    }

    // `logAdminAction` traga sus propios errores (try/catch + console.error),
    // así que una auditoría fallida deja rastro en consola pero no puede hacer
    // fallar la respuesta una vez confirmada la transacción.
    for (const message of plan.auditMessages) {
      await logAdminFromAstro(locals, message);
    }

    return jsonResponse({
      success: true,
      updated: plan.updates.length,
      groups: parsed.data.groups.length,
      backup: backupName,
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  } finally {
    if (backupName) inFlightBackups.delete(backupName);
  }
};
