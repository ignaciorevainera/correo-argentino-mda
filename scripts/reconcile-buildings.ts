import "./db-preflight";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { offices, auditLogs } from "../src/db/schema";
import {
  groupOfficesByBuilding,
  type BuildingCandidateGroup,
} from "../src/lib/officeBuildingReconcile";

const normalizeSearch = (value: string): string =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function printHelp() {
  console.log(`
Reconciliación de oficinas del mismo edificio
=============================================

Uso: tsx scripts/reconcile-buildings.ts [opciones]

Opciones:
  --apply            Aplica los cambios (pide CONFIRMAR). Sin esto solo releva.
  --only <key>       Solo unifica el grupo con esa clave. Repetible. Requiere un valor.
  --interactive      Pregunta sí/no por cada grupo (escribir CONFIRMAR).
  --province <code>  Filtra por provincia (ej. C, BA, o "all" para todas). Requiere un valor.
  --export <file>    Vuelca el reporte de grupos a CSV. Requiere un valor.
  --help             Muestra esta ayuda.

Ejemplos:
  # 1) Relevar todos los grupos candidatos
  npm run buildings:reconcile

  # 2) Revisar reporte antes de decidir
  npm run buildings:reconcile -- --export reporte.csv

  # 3) Unificar SOLO algunos grupos (por clave, del reporte)
  npm run buildings:reconcile -- --apply --only "1349|JUAN+SAN" --only "3443|GOBERNADOR+VALENTIN+VERGARA"

  # 4) Unificar grupo a grupo, decidiendo en cada uno
  npm run buildings:reconcile -- --apply --interactive

Notas:
  - Sin --apply el script NO modifica la base de datos.
  - --apply pide CONFIRMAR global; luego aplica --only/--interactive.
  - Antes de escribir se hace backup automático en database/backups/.
`);
}

/**
 * Lee el valor de una bandera y corta si no existe.
 *
 * Sin esta guarda, `--province` al final de los argumentos dejaba
 * `args.province === undefined`, que `args.province && ...` tomaba como "sin
 * filtro": combinado con `--apply` reconciliaba todo el país (#161). El corte
 * ocurre dentro de `parseArgs`.
 */
function readFlagValue(flag: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    console.error(`${flag} requiere un valor.`);
    process.exit(1);
  }
  return normalized;
}

function parseArgs(argv: string[]) {
  const args = {
    apply: false,
    province: undefined as string | undefined,
    exportCsv: undefined as string | undefined,
    interactive: false,
    only: [] as string[],
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--interactive") args.interactive = true;
    else if (arg === "--province") {
      const value = readFlagValue("--province", argv[++i]);
      // El chequeo de scope compara contra "all" en minúscula, así que ese
      // sentinela se normaliza sin mayúsculas; el resto va a mayúsculas para
      // coincidir con provinceCode.
      args.province =
        value.toLowerCase() === "all" ? "all" : value.toUpperCase();
    } else if (arg === "--export")
      args.exportCsv = readFlagValue("--export", argv[++i]);
    else if (arg === "--only")
      args.only.push(readFlagValue("--only", argv[++i]));
  }
  return args;
}

async function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${message}\nEscriba CONFIRMAR para continuar: `, (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase() === "CONFIRMAR");
    });
  });
}

/**
 * Snapshot WAL-safe de `database/mda.db` en `database/backups/`.
 *
 * Copiar el archivo NO alcanza: con `journal_mode = wal`, lo pendiente en el
 * sidecar `-wal` no esta en `mda.db`, asi que `copyFileSync` puede producir un
 * respaldo incompleto (#162). `handle.backup()` usa la API de backup de SQLite
 * e incluye ese contenido. Mismo criterio que `scripts/backfill-asistencia.mts`
 * y `scripts/normalize-participaciones.mts`.
 */
async function backupDatabase(): Promise<string> {
  const dbPath = path.resolve(process.cwd(), "database", "mda.db");
  const backupDir = path.resolve(process.cwd(), "database", "backups");

  // `new Database(dbPath)` CREA el archivo si falta: sin este chequeo, una base
  // ausente produce un snapshot de 0 bytes que el operador leeria como valido.
  let dbStat: fs.Stats;
  try {
    dbStat = fs.statSync(dbPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`La base de datos en ${dbPath} no existe`);
    }
    throw error;
  }
  if (!dbStat.isFile() || dbStat.size === 0) {
    throw new Error(
      `La base de datos en ${dbPath} no es un archivo con contenido`,
    );
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(backupDir, `mda-reconcile-${stamp}.db`);

  // Handle propio y efimero: `db` (drizzle) no expone el handle crudo.
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

  const destStat = fs.statSync(dest);
  if (!destStat.isFile() || destStat.size === 0) {
    fs.rmSync(dest, { force: true });
    throw new Error(`El snapshot ${dest} salio vacio y fue eliminado`);
  }

  console.log(`Backup creado: ${dest}`);
  return dest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  // Import dinámico: `--help` no debe requerir una base. Con el import estático,
  // `src/db/index` se evaluaba al cargar el módulo y, desde #177, aborta si falta
  // `database/mda.db` (antes la creaba vacía). El respaldo `db-preflight` sigue
  // corriendo estático y corta antes para el resto de los casos.
  const { db } = await import("../src/db/index");

  const rows = await db
    .select({
      id: offices.id,
      code: offices.code,
      name: offices.name,
      address: offices.address,
      provinceCode: offices.provinceCode,
    })
    .from(offices);

  const candidates = groupOfficesByBuilding(
    rows.flatMap((r) =>
      r.address
        ? [
            {
              id: r.id,
              code: r.code,
              name: r.name,
              address: r.address,
              provinceCode: r.provinceCode,
            },
          ]
        : [],
    ),
  );

  const scoped =
    args.province && args.province !== "all"
      ? candidates.filter((g) =>
          g.members.every((m) => m.provinceCode === args.province),
        )
      : candidates;

  const totalOffices = scoped.reduce((n, g) => n + g.members.length, 0);
  console.log(
    `\nGrupos candidatos de mismo edificio: ${scoped.length} (${totalOffices} oficinas)\n`,
  );

  const scope =
    args.only.length > 0
      ? scoped.filter((c) => args.only.includes(c.key))
      : scoped;

  // El conjunto que se imprime y se exporta es el acotado por `--only`: el
  // relevamiento amplio ya se declaró en la línea de conteo, y mostrar 66 grupos
  // para después confirmar 1 hacía que el operador clickeara a ciegas.
  const list = scope;

  if (args.only.length > 0) {
    console.log(`Filtro --only: ${list.length} de ${scoped.length} grupo(s).`);
  }

  for (const group of list) {
    console.log(`=== Edificio [${group.key}] → canónica: ${group.canonical}`);
    for (const m of group.members) {
      console.log(`  ${m.code} · ${m.name} · ${m.address} (${m.provinceCode})`);
    }
    console.log("");
  }

  if (args.exportCsv) {
    const lines = ["key,canonical,code,name,address,provinceCode"];
    for (const g of list) {
      for (const m of g.members) {
        lines.push(
          [
            g.key,
            g.canonical,
            m.code,
            `"${m.name}"`,
            `"${m.address}"`,
            m.provinceCode,
          ].join(","),
        );
      }
    }
    fs.writeFileSync(args.exportCsv, lines.join("\n"), "utf8");
    console.log(`Reporte exportado: ${args.exportCsv}`);
  }

  if (!args.apply) {
    console.log(
      "Modo relevamiento (dry-run). Para aplicar, ejecutá con --apply.\n",
    );
    console.log("Unificar SOLO algunas oficinas (no todas):");
    console.log(
      '  npm run buildings:reconcile -- --apply --only "<key>"   (repetible por grupo)',
    );
    console.log(
      "  npm run buildings:reconcile -- --apply --interactive    (pregunta por cada grupo)",
    );
    console.log(
      "  npm run buildings:reconcile -- --export reporte.csv     (ver columna key)",
    );
    console.log(
      "  npm run buildings:reconcile -- --help               (ayuda completa)",
    );
    return;
  }

  if (scope.length === 0) {
    if (args.only.length > 0) {
      console.log(
        "Ningún grupo coincide con --only. La clave se imprime como PROVINCIA#NUMERO|tokens (la provincia es el prefijo), o se saca de la columna key del reporte de --export.",
      );
    } else if (args.province && args.province !== "all") {
      // Un código mal escrito y un código válido sin grupos candidatos dan el
      // mismo cero, así que no se puede aconsejar solo "revisá el código":
      // p. ej. `--province D` tiene 105 oficinas y ningún grupo candidato.
      console.log(
        `Ningún grupo coincide con --province ${args.province}. Puede que el código esté mal o que esa provincia no tenga grupos candidatos; probá --province all para relevar todo.`,
      );
    } else {
      console.log(
        "No hay grupos candidatos en la base (hacen falta 2 o más oficinas del mismo edificio con la dirección escrita distinto).",
      );
    }
    return;
  }

  const scopeOffices = scope.reduce((n, g) => n + g.members.length, 0);
  const confirmed = await promptConfirmation(
    `Se modificarán ${scopeOffices} oficinas en ${scope.length} grupo(s) para usar la dirección canónica.`,
  );
  if (!confirmed) {
    console.log("Operación cancelada. No se realizaron cambios.");
    return;
  }

  const toApply: BuildingCandidateGroup[] = [];
  for (const group of scope) {
    if (args.interactive) {
      const ok = await promptConfirmation(
        `Unificar grupo [${group.key}] → "${group.canonical}" (${group.members.length} oficinas)?`,
      );
      if (!ok) {
        console.log(`  Grupo omitido: ${group.key}`);
        continue;
      }
    }
    toApply.push(group);
  }

  if (toApply.length === 0) {
    console.log("Ningún grupo seleccionado. No se realizaron cambios.");
    return;
  }

  await backupDatabase();

  let updated = 0;
  // Un solo lote atomico: sin esto, un throw a mitad de camino dejaba los
  // grupos anteriores ya unificados y auditados (#162). El callback va
  // sincronico: better-sqlite3 rechaza una transaccion cuyo callback devuelva
  // una promesa, asi que las queries usan `.run()` y no `await`.
  db.transaction((tx) => {
    for (const group of toApply) {
      for (const m of group.members) {
        const searchableText = normalizeSearch(
          [m.code, m.name, group.canonical].filter(Boolean).join(" "),
        );
        tx.update(offices)
          .set({ address: group.canonical.toUpperCase(), searchableText })
          .where(eq(offices.id, m.id))
          .run();
        updated++;
      }
      tx.insert(auditLogs)
        .values({
          username: "system:reconcile-buildings",
          action: `Reconciliación de edificio: ${group.members.length} oficinas → "${group.canonical}" (${group.members
            .map((m) => m.code)
            .join(", ")})`,
          timestamp: new Date().toISOString(),
        })
        .run();
    }
  });

  console.log(`\nListo. ${updated} oficinas actualizadas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
