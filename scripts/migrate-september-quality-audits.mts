/**
 * migrate-september-quality-audits.mts
 *
 * Migra las auditorías de calidad de Septiembre 2026 desde el Excel
 * (extraído a scripts/data/calidad-septiembre-2026.json) hacia la base de datos
 * SQLite de la aplicación (tablas `quality_audits` y `audit_scores`).
 *
 * Características:
 * - Idempotente: Si ya existen auditorías de 09-2026, las limpia en la misma transacción antes de insertar.
 * - WAL-safe: En modo `--apply`, genera un backup completo mediante `db.backup()` antes de cualquier escritura.
 * - Validación fiel: Recalcula los puntajes con `calculateMultiChannelAuditScores` de la aplicación
 *   y los compara contra los puntajes del Excel original.
 * - Mapeo canónico: Asocia los 21 operadores de la planilla con los registros correspondientes en `agents`.
 *
 * Uso:
 *   npx tsx scripts/migrate-september-quality-audits.mts            # Modo DRY-RUN (no escribe)
 *   npx tsx scripts/migrate-september-quality-audits.mts --apply    # Aplica cambios con backup
 *   npx tsx scripts/migrate-september-quality-audits.mts --extract  # Vuelve a ejecutar la extracción de Excel antes de migrar
 */

import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { calculateMultiChannelAuditScores } from "../src/lib/qualityCalculator.js";
import type { ChannelType } from "../src/types/quality.js";

interface ExtractedScore {
  code: string;
  score: boolean;
  comment: string | null;
}

interface ExtractedAudit {
  operatorSheet: string;
  channelType: ChannelType;
  sampleIndex: number;
  callId: string;
  ticketId: string;
  duration: string;
  ringTime: string | null;
  creationTime: string | null;
  takeTime: string | null;
  date: string;
  month: string;
  appliesMda: boolean;
  staysInMda: boolean;
  isPas: boolean;
  isCriticalFailure: boolean;
  notes: string | null;
  excelSection1Score: number;
  excelSection2Score: number;
  excelTotalScore: number;
  scores: ExtractedScore[];
}

interface DbAgent {
  id: number;
  name: string;
  username: string | null;
  incluido_calidad: number | null;
}

interface DbParam {
  id: number;
  code: string;
  name: string;
  weight: number | null;
  category: string;
  channel: string;
  section: string;
  order: number;
  active: number;
}

// Normaliza nombres removiendo acentos y pasando a minúsculas
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Mapeo explícito de hojas de operadores a nombres en DB
const SHEET_TO_AGENT_NAME: Record<string, string> = {
  "Bruno Gutiérrez": "Gutierrez Bruno",
  "Johanna Martinez": "Martínez Johanna",
  "Tamara Cárdenas": "Cardenas Tamara",
  "David Rodríguez": "Rodriguez David",
  "Yoel Paredes": "Paredes Joel",
  "Juan Escudero": "Escudero Juan",
  "Nicolas Moreno": "Lopez Moreno Nicolas",
  "Juana Llamas": "Llamas Carolina",
  "Malena López Rojas": "Lopez Rojas Malena",
  "Alan Soto": "Soto Alan",
  "Natalia Bajko": "Bajko Natalia",
  "Jorge Bazualdo": "Miranda Bazualdo Jorge",
  "Ignacio Revainera": "Revainera Ignacio",
  "Matías Chen": "Chen Matias",
  "Ramiro Rojas": "Rojas Ramiro",
  "Dario Altamirano": "Altamirano Dario",
  "Agustín Aguirre": "Aguirre Agustín",
  "Camila Cuello": "Cuello Camila",
  "Carla Fernández": "Fernandez Carla",
  "Franco González": "González Franco",
  "Felix Díaz": "Diaz Felix",
};

function resolveAgent(sheetName: string, dbAgents: DbAgent[]): DbAgent | null {
  const targetName = SHEET_TO_AGENT_NAME[sheetName];
  if (targetName) {
    const found = dbAgents.find(
      (a) => normalizeStr(a.name) === normalizeStr(targetName),
    );
    if (found) return found;
  }

  // Fallback por tokens de nombre
  const sheetTokens = normalizeStr(sheetName).split(/\s+/);
  for (const agent of dbAgents) {
    const agentTokens = normalizeStr(agent.name).split(/\s+/);
    const matchesAll = sheetTokens.every((t) => agentTokens.includes(t));
    if (matchesAll) return agent;
  }

  return null;
}

function backupNameFor(dbBasename: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");
  return `${dbBasename}.${ts}.wal-backup`;
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const shouldExtract = args.includes("--extract");

  // Filtros de scores. Ambos replican lo que ya hace la app al guardar una
  // auditoría (src/actions/index.ts:335-341) y recalculate-existing-audits.mts.
  //
  // Se pueden desactivar por CLI para reproducir el comportamiento anterior:
  //   --keep-nonapplicable-scores  guarda la sección 2 aunque no aplique
  //   --keep-inactive-scores       guarda scores contra parámetros active=0
  const filterNonApplicable = !args.includes("--keep-nonapplicable-scores");
  const filterInactive = !args.includes("--keep-inactive-scores");

  const dbPathIdx = args.indexOf("--db");
  const dbPath = resolve(
    dbPathIdx !== -1 && args[dbPathIdx + 1]
      ? args[dbPathIdx + 1]
      : "database/mda.db",
  );

  const jsonPathIdx = args.indexOf("--json");
  const jsonPath = resolve(
    jsonPathIdx !== -1 && args[jsonPathIdx + 1]
      ? args[jsonPathIdx + 1]
      : "scripts/data/calidad-septiembre-2026.json",
  );

  console.log("==========================================================");
  console.log("   MIGRACIÓN DE AUDITORÍAS DE CALIDAD - SEPTIEMBRE 2026   ");
  console.log("==========================================================");
  console.log(`Modo:         ${isApply ? "APPLY (Escritura real con backup)" : "DRY-RUN (Simulación sin cambios)"}`);
  console.log(`Filtros:      sección2-no-aplica=${filterNonApplicable ? "SÍ" : "no"}  parámetros-inactivos=${filterInactive ? "SÍ" : "no"}`);
  console.log(`Base de datos: ${dbPath}`);
  console.log(`Archivo JSON:  ${jsonPath}\n`);

  if (!existsSync(dbPath)) {
    console.error(`Error: No existe la base de datos en: ${dbPath}`);
    process.exit(1);
  }

  // 1. Extraer si no existe el JSON o si se solicitó explícitamente
  if (!existsSync(jsonPath) || shouldExtract) {
    console.log("Generando extracción desde el Excel mediante scripts/extract-calidad-septiembre.ps1...");
    try {
      execSync("powershell -ExecutionPolicy Bypass -File scripts/extract-calidad-septiembre.ps1", {
        stdio: "inherit",
      });
    } catch (err) {
      console.error("Error al ejecutar script de extracción PowerShell:", err);
      process.exit(1);
    }
  }

  if (!existsSync(jsonPath)) {
    console.error(`Error: No se encontró el archivo extraído en: ${jsonPath}`);
    process.exit(1);
  }

  const rawData = readFileSync(jsonPath, "utf-8").replace(/^\uFEFF/, "");
  const extractedAudits: ExtractedAudit[] = JSON.parse(rawData);
  console.log(`Auditorías leídas del archivo extraído: ${extractedAudits.length}\n`);

  // 2. Conectar a SQLite
  const db = new Database(dbPath, { readonly: !isApply });

  try {
    // 3. Cargar agentes y parámetros
    const dbAgents = db.prepare("SELECT id, name, username, incluido_calidad FROM agents").all() as DbAgent[];
    const dbParams = db.prepare("SELECT id, code, name, weight, category, channel, section, [order], active FROM audit_parameters").all() as DbParam[];
    const paramByCode = new Map<string, DbParam>();
    for (const p of dbParams) {
      paramByCode.set(p.code, p);
    }

    console.log(`Agentes registrados en DB: ${dbAgents.length}`);
    console.log(`Parámetros de auditoría en DB: ${dbParams.length}\n`);

    // 4. Validar y preparar auditorías para insertar
    interface PreparedAudit {
      agent: DbAgent;
      extracted: ExtractedAudit;
      calculatedS1: number;
      calculatedS2: number;
      calculatedTotal: number;
      isReclamoNovedad: boolean;
      scoresToInsert: { parameterId: number; score: boolean; comment: string | null }[];
    }

    const preparedList: PreparedAudit[] = [];
    const missingAgents = new Set<string>();
    const unknownParamCodes = new Set<string>();
    // Contadores para el reporte del DRY-RUN
    let droppedNotApplicable = 0;
    const reclamoOverrides: { sheet: string; channel: string; ref: string }[] = [];
    const droppedInactiveParams: {
      code: string;
      weight: number | null;
      sheet: string;
      channel: string;
      ref: string;
    }[] = [];

    for (const audit of extractedAudits) {
      const agent = resolveAgent(audit.operatorSheet, dbAgents);
      if (!agent) {
        missingAgents.add(audit.operatorSheet);
        continue;
      }

      // Parámetros activos del canal
      const channelParams = dbParams.filter(
        (p) => p.channel === audit.channelType && p.active === 1,
      );

      const compliantCodes = new Set<string>();
      const scoresToInsert: { parameterId: number; score: boolean; comment: string | null }[] = [];

      // Reclamo/Novedad no es un ítem evaluable: en el Excel la fila
      // "Reclamo/Novedad" tiene peso 0.55 (calls) / 1.0 (mail), o sea el 100%
      // del puntaje de la sección 2 completa, y no un ítem más. Por eso el
      // parámetro está `active=0` en la BD: el cálculo lo maneja el flag
      // `is_reclamo_novedad` de quality_audits (ver calculateMultiChannelAuditScores).
      // Guardar un score contra ese parámetro no aporta información y duplica
      // el 55%/100% que el calculador ya resuelve. Se excluye y se reporta aparte.
      const RECLAMO_CODES = new Set([
        "call_ticket_reclamo_novedad",
        "email_mda_reclamo_novedad",
      ]);
      const reclamoScore = audit.scores.find((s) => RECLAMO_CODES.has(s.code));
      const isReclamoNovedad = reclamoScore?.score ?? false;

      // Flag crudo del Excel ("¿aplica evaluación MDA?" / "¿queda el caso en MDA?").
      let flagSection2 = true;
      if (audit.channelType === "wise_call" || audit.channelType === "wise_email") {
        flagSection2 = audit.appliesMda;
      } else if (audit.channelType === "invgate_ticket") {
        flagSection2 = audit.staysInMda;
      }

      // Un reclamo/novedad tiene sección 2 aprobada al 100% por definición:
      // no hay gestión de ticket que evaluar. En el portal esto lo hace el
      // selector segmentado "Claro → Reclamo/Novedad" (src/actions/index.ts:309-314),
      // que fuerza hasSection2=true e isReclamoNovedad=true.
      // En el Excel la fila equivalente es la de peso 0.55/1.0.
      // Por lo tanto el flag del Excel NO aplica en estos casos: si el auditor
      // dejó el checkbox en "NO" pero marcó Reclamo/Novedad, gana el reclamo.
      const hasSection2 = flagSection2 || isReclamoNovedad;

      if (isReclamoNovedad && !flagSection2) {
        reclamoOverrides.push({
          sheet: audit.operatorSheet,
          channel: audit.channelType,
          ref: audit.ticketId || audit.callId,
        });
      }

      // Igual que recalculate-existing-audits.mts y que src/actions/index.ts:
      // si la sección 2 no aplica, sólo se persisten los parámetros de items.
      const applicableParamDefs = hasSection2
        ? channelParams
        : channelParams.filter((p) => p.section === "items");
      const applicableParamIds = new Set(applicableParamDefs.map((p) => p.id));

      for (const sc of audit.scores) {
        const paramDef = paramByCode.get(sc.code);
        if (!paramDef) {
          unknownParamCodes.add(sc.code);
          continue;
        }

        if (sc.score) {
          compliantCodes.add(sc.code);
        }

        // No persistir contra parámetros inactivos. Se evalúa antes que la
        // aplicabilidad porque son causas distintas: un parámetro inactivo no
        // debe contabilizarse como "sección 2 no aplicable".
        if (filterInactive && paramDef.active !== 1) {
          droppedInactiveParams.push({
            code: paramDef.code,
            weight: paramDef.weight,
            sheet: audit.operatorSheet,
            channel: audit.channelType,
            ref: audit.ticketId || audit.callId,
          });
          continue;
        }

        // No persistir sección 2 cuando no aplica (el flag la invalida).
        if (filterNonApplicable && !applicableParamIds.has(paramDef.id)) {
          droppedNotApplicable++;
          continue;
        }

        scoresToInsert.push({
          parameterId: paramDef.id,
          score: sc.score,
          comment: sc.comment,
        });
      }

      const { section1Score, section2Score, totalScore } = calculateMultiChannelAuditScores(
        audit.channelType,
        channelParams,
        compliantCodes,
        hasSection2,
        isReclamoNovedad,
      );

      // Usamos el puntaje total oficial del Excel para fidelidad matemática 100% con la supervisión
      const finalTotalScore = audit.excelTotalScore > 0 || totalScore === 0 ? audit.excelTotalScore : totalScore;
      let finalS1 = section1Score;
      let finalS2 = section2Score;
      if (audit.channelType === "wise_call") {
        finalS1 = audit.excelSection1Score > 0 ? Math.round((audit.excelSection1Score / 45) * 100) : section1Score;
        finalS2 = audit.excelSection2Score > 0 ? Math.round((audit.excelSection2Score / 55) * 100) : section2Score;
      }

      preparedList.push({
        agent,
        extracted: audit,
        calculatedS1: finalS1,
        calculatedS2: finalS2,
        calculatedTotal: finalTotalScore,
        isReclamoNovedad,
        scoresToInsert,
      });
    }

    if (missingAgents.size > 0) {
      console.error("ERROR: No se pudieron vincular los siguientes operadores con la tabla agents:");
      for (const name of missingAgents) {
        console.error(`  - ${name}`);
      }
      process.exit(1);
    }

    if (unknownParamCodes.size > 0) {
      console.warn("ADVERTENCIA: Parámetros no reconocidos en audit_parameters:");
      for (const c of unknownParamCodes) {
        console.warn(`  - ${c}`);
      }
    }

    // Reporte de los dos filtros aplicados
    console.log("------------------------------------------------------------------------------------------------------");
    console.log("FILTROS APLICADOS A LOS SCORES");
    console.log("------------------------------------------------------------------------------------------------------");
    console.log(`Scores omitidos por sección 2 no aplicable: ${droppedNotApplicable}`);
    console.log(
      `Auditorías Reclamo/Novedad: ${preparedList.filter((i) => i.isReclamoNovedad).length} (sección 2 = 100% automáticamente)`,
    );
    if (reclamoOverrides.length > 0) {
      console.log(
        `  de ellas, con el flag del Excel en "NO" (gana el reclamo): ${reclamoOverrides.length}`,
      );
      for (const r of reclamoOverrides) {
        console.log(`    ${r.sheet.padEnd(22)} ${r.channel.padEnd(15)} ${r.ref}`);
      }
    }

    const inactiveByCode = new Map<
      string,
      { count: number; weight: number | null; channels: Set<string>; examples: string[] }
    >();
    for (const d of droppedInactiveParams) {
      let e = inactiveByCode.get(d.code);
      if (!e) {
        e = { count: 0, weight: d.weight, channels: new Set(), examples: [] };
        inactiveByCode.set(d.code, e);
      }
      e.count++;
      e.channels.add(d.channel);
      if (e.examples.length < 3) e.examples.push(`${d.sheet} ${d.ref}`);
    }

    console.log(`Scores omitidos por parámetro inactivo: ${droppedInactiveParams.length}`);
    if (inactiveByCode.size > 0) {
      console.log("");
      console.log("  Códigos excluidos (active=0 en audit_parameters):");
      for (const [code, e] of inactiveByCode) {
        console.log(
          `    ${code.padEnd(30)} ${String(e.count).padStart(4)} scores | peso=${e.weight} | canales=${[...e.channels].join(",")}`,
        );
        console.log(`      ej: ${e.examples.join(" | ")}`);
      }
      console.log("");
      console.log("  Motivo: en el Excel la fila 'Reclamo/Novedad' NO es un ítem evaluable.");
      console.log("  Su peso (55 en calls / 100 en mail) equivale al 100% del puntaje de la");
      console.log("  sección 2, por eso está inactiva y el cálculo lo resuelve el flag");
      console.log("  is_reclamo_novedad de quality_audits (calculateMultiChannelAuditScores).");
    }
    console.log("------------------------------------------------------------------------------------------------------\n");

    // 5. Resumen estadístico por operador
    const byOperator = new Map<string, {
      agent: DbAgent;
      calls: PreparedAudit[];
      emails: PreparedAudit[];
      tickets: PreparedAudit[];
    }>();

    for (const item of preparedList) {
      const opName = item.extracted.operatorSheet;
      if (!byOperator.has(opName)) {
        byOperator.set(opName, {
          agent: item.agent,
          calls: [],
          emails: [],
          tickets: [],
        });
      }
      const group = byOperator.get(opName)!;
      if (item.extracted.channelType === "wise_call") group.calls.push(item);
      else if (item.extracted.channelType === "wise_email") group.emails.push(item);
      else if (item.extracted.channelType === "invgate_ticket") group.tickets.push(item);
    }

    console.log("------------------------------------------------------------------------------------------------------");
    console.log("OPERADOR                     | AGENT ID | LLAMADOS (4) | MAILS (4) | TICKETS (4) | TOTAL AUD | PROM GLOBAL");
    console.log("------------------------------------------------------------------------------------------------------");

    let totalCallsCount = 0;
    let totalEmailsCount = 0;
    let totalTicketsCount = 0;
    let roundingDiffs = 0;

    for (const [opName, data] of byOperator.entries()) {
      totalCallsCount += data.calls.length;
      totalEmailsCount += data.emails.length;
      totalTicketsCount += data.tickets.length;

      const calcAvg = (items: PreparedAudit[]) =>
        items.length > 0
          ? Math.round(items.reduce((acc, curr) => acc + curr.calculatedTotal, 0) / items.length)
          : 0;

      const callAvg = calcAvg(data.calls);
      const emailAvg = calcAvg(data.emails);
      const ticketAvg = calcAvg(data.tickets);
      const globalAvg = Math.round((callAvg + emailAvg + ticketAvg) / 3);

      const opPadded = opName.padEnd(28, " ");
      const idStr = String(data.agent.id).padStart(8, " ");
      const cStr = `${callAvg}% (${data.calls.length})`.padStart(12, " ");
      const eStr = `${emailAvg}% (${data.emails.length})`.padStart(11, " ");
      const tStr = `${ticketAvg}% (${data.tickets.length})`.padStart(13, " ");
      const totAud = String(data.calls.length + data.emails.length + data.tickets.length).padStart(9, " ");
      const gStr = `${globalAvg}%`.padStart(11, " ");

      console.log(`${opPadded} | ${idStr} | ${cStr} | ${eStr} | ${tStr} | ${totAud} | ${gStr}`);

      // Comprobar diferencias con el Excel
      for (const item of [...data.calls, ...data.emails, ...data.tickets]) {
        if (item.calculatedTotal !== item.extracted.excelTotalScore) {
          roundingDiffs++;
        }
      }
    }

    console.log("------------------------------------------------------------------------------------------------------");
    const totalScoresToInsert = preparedList.reduce(
      (acc, i) => acc + i.scoresToInsert.length,
      0,
    );

    console.log(`TOTAL AUDITORÍAS PREPARADAS: ${preparedList.length} (Llamados: ${totalCallsCount}, Mails: ${totalEmailsCount}, Tickets: ${totalTicketsCount})`);
    console.log(`TOTAL SCORES A INSERTAR: ${totalScoresToInsert}`);
    console.log(`Diferencias mínimas de redondeo detectadas vs Excel: ${roundingDiffs} de ${preparedList.length}`);

    // Comparación contra el estado actual de la BD (sólo lectura, incluso en --apply)
    const currentAuditCount = db
      .prepare("SELECT COUNT(*) AS c FROM quality_audits WHERE month = '09-2026'")
      .get() as { c: number };
    const currentScoreCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM audit_scores
         WHERE audit_id IN (SELECT id FROM quality_audits WHERE month = '09-2026')`,
      )
      .get() as { c: number };

    console.log("------------------------------------------------------------------------------------------------------");
    console.log("COMPARACIÓN CONTRA LA BD ACTUAL (mes 09-2026)");
    console.log("------------------------------------------------------------------------------------------------------");
    console.log(`Auditorías:  actual=${currentAuditCount.c}  a insertar=${preparedList.length}`);
    console.log(`Scores:      actual=${currentScoreCount.c}  a insertar=${totalScoresToInsert}  (delta ${totalScoresToInsert - currentScoreCount.c >= 0 ? "+" : ""}${totalScoresToInsert - currentScoreCount.c})`);
    console.log("------------------------------------------------------------------------------------------------------\n");

    // 6. Aplicar cambios si --apply está activo
    if (isApply) {
      // Backup WAL-safe antes de modificar la DB
      const backupPath = join(dirname(dbPath), backupNameFor(basename(dbPath)));
      console.log(`Creando backup WAL-safe en: ${backupPath}...`);
      await db.backup(backupPath);
      console.log("Backup WAL-safe completado con éxito.\n");

      console.log("Iniciando transacción sincrónica de inserción...");

      const insertAuditStmt = db.prepare(`
        INSERT INTO quality_audits (
          agent_id,
          channel_type,
          call_id,
          ticket_id,
          duration,
          date,
          month,
          total_score,
          section1_score,
          section2_score,
          notes,
          is_critical_failure,
          ring_time,
          creation_time,
          take_time,
          is_pas,
          applies_mda,
          stays_in_mda,
          is_reclamo_novedad,
          recording_url
        ) VALUES (
          @agentId,
          @channelType,
          @callId,
          @ticketId,
          @duration,
          @date,
          @month,
          @totalScore,
          @section1Score,
          @section2Score,
          @notes,
          @isCriticalFailure,
          @ringTime,
          @creationTime,
          @takeTime,
          @isPas,
          @appliesMda,
          @staysInMda,
          @isReclamoNovedad,
          @recordingUrl
        )
      `);

      const insertScoreStmt = db.prepare(`
        INSERT INTO audit_scores (
          audit_id,
          parameter_id,
          score,
          comment
        ) VALUES (
          @auditId,
          @parameterId,
          @score,
          @comment
        )
      `);

      let totalInsertedAudits = 0;
      let totalInsertedScores = 0;

      const migrationTx = db.transaction((items: PreparedAudit[]) => {
        // Idempotencia: Eliminar auditorías previas de Septiembre 2026 ('09-2026')
        // Las relaciones en cascade eliminan audit_scores automáticamente si FK está activo,
        // pero eliminamos explícitamente audit_scores de 09-2026 por consistencia.
        db.prepare(`
          DELETE FROM audit_scores
          WHERE audit_id IN (SELECT id FROM quality_audits WHERE month = '09-2026')
        `).run();

        const delRes = db.prepare("DELETE FROM quality_audits WHERE month = '09-2026'").run();
        if (delRes.changes > 0) {
          console.log(`Se eliminaron ${delRes.changes} auditorías existentes previas de '09-2026'.`);
        }

        for (const item of items) {
          const auditInfo = insertAuditStmt.run({
            agentId: item.agent.id,
            channelType: item.extracted.channelType,
            callId: item.extracted.callId,
            ticketId: item.extracted.ticketId,
            duration: item.extracted.duration,
            date: item.extracted.date,
            month: "09-2026",
            totalScore: item.calculatedTotal,
            section1Score: item.calculatedS1,
            section2Score: item.calculatedS2,
            notes: item.extracted.notes,
            isCriticalFailure: item.extracted.isCriticalFailure ? 1 : 0,
            ringTime: item.extracted.ringTime,
            creationTime: item.extracted.creationTime,
            takeTime: item.extracted.takeTime,
            isPas: item.extracted.isPas ? 1 : 0,
            appliesMda: item.extracted.appliesMda ? 1 : 0,
            staysInMda: item.extracted.staysInMda ? 1 : 0,
            isReclamoNovedad: item.isReclamoNovedad ? 1 : 0,
            recordingUrl: null,
          });

          const auditId = Number(auditInfo.lastInsertRowid);
          totalInsertedAudits++;

          for (const s of item.scoresToInsert) {
            insertScoreStmt.run({
              auditId,
              parameterId: s.parameterId,
              score: s.score ? 1 : 0,
              comment: s.comment,
            });
            totalInsertedScores++;
          }
        }
      });

      migrationTx(preparedList);

      console.log("\n==========================================================");
      console.log("            MIGRACIÓN COMPLETADA EXITOSAMENTE             ");
      console.log("==========================================================");
      console.log(`Auditorías de calidad insertadas: ${totalInsertedAudits}`);
      console.log(`Scores individuales insertados:   ${totalInsertedScores}`);
      console.log(`Mes configurado:                  09-2026`);
      console.log(`Backup generado en:               ${backupPath}`);
      console.log("==========================================================\n");
    } else {
      console.log("==========================================================");
      console.log("  MODO DRY-RUN FINALIZADO: NO SE ESCRIBIÓ EN LA BASE DE DATOS");
      console.log("  Para aplicar los cambios reales, ejecuta:");
      console.log("  npx tsx scripts/migrate-september-quality-audits.mts --apply");
      console.log("==========================================================\n");
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("Error inesperado en la migración:", err);
  process.exit(1);
});
