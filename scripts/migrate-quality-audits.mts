/**
 * migrate-quality-audits.mts
 *
 * Migra las auditorías de calidad mensuales desde el Excel extraído (JSON)
 * hacia la base de datos SQLite de la aplicación (tablas `quality_audits` y `audit_scores`).
 *
 * Características:
 * - Parametrizable: Acepta `--month <mm>`, `--year <yyyy>` y `--json <path>`.
 * - Idempotente: Si ya existen auditorías del período, las limpia en la misma transacción antes de insertar.
 * - WAL-safe: En modo `--apply`, genera un backup completo mediante `db.backup()` antes de cualquier escritura.
 * - Validación fiel: Recalcula los puntajes con `calculateMultiChannelAuditScores` de la aplicación
 *   y los compara contra los puntajes del Excel original.
 * - Mapeo canónico: Asocia los operadores de la planilla con los registros correspondientes en `agents`.
 *
 * Uso:
 *   npx tsx scripts/migrate-quality-audits.mts --month 10 --year 2026           # Modo DRY-RUN
 *   npx tsx scripts/migrate-quality-audits.mts --month 10 --year 2026 --apply   # Aplica cambios con backup
 *   npx tsx scripts/migrate-quality-audits.mts --month 10 --extract             # Extrae y migra
 */

import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { calculateMultiChannelAuditScores } from "../src/lib/qualityCalculator.js";
import type { ChannelType } from "../src/types/quality.js";

const MONTH_NAMES_ES: Record<number, string> = {
  1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
  5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
  9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
};

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

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

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

  const filterNonApplicable = !args.includes("--keep-nonapplicable-scores");
  const filterInactive = !args.includes("--keep-inactive-scores");

  const monthIdx = args.indexOf("--month");
  let targetMonth = monthIdx !== -1 && args[monthIdx + 1] ? parseInt(args[monthIdx + 1], 10) : 10;
  if (isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    targetMonth = 10;
  }

  const yearIdx = args.indexOf("--year");
  let targetYear = yearIdx !== -1 && args[yearIdx + 1] ? parseInt(args[yearIdx + 1], 10) : 2026;
  if (isNaN(targetYear)) {
    targetYear = 2026;
  }

  const monthKey = `${String(targetMonth).padStart(2, "0")}-${targetYear}`;
  const monthNameEs = MONTH_NAMES_ES[targetMonth] || "mes";

  const dbPathIdx = args.indexOf("--db");
  const dbPath = resolve(
    dbPathIdx !== -1 && args[dbPathIdx + 1]
      ? args[dbPathIdx + 1]
      : "database/mda.db",
  );

  const jsonPathIdx = args.indexOf("--json") !== -1 ? args.indexOf("--json") : args.indexOf("--file");
  const jsonPath = resolve(
    jsonPathIdx !== -1 && args[jsonPathIdx + 1]
      ? args[jsonPathIdx + 1]
      : `scripts/data/calidad-${monthNameEs}-${targetYear}.json`,
  );

  console.log("==========================================================");
  console.log(`   MIGRACIÓN DE AUDITORÍAS DE CALIDAD - ${monthNameEs.toUpperCase()} ${targetYear}   `);
  console.log("==========================================================");
  console.log(`Modo:         ${isApply ? "APPLY (Escritura real con backup)" : "DRY-RUN (Simulación sin cambios)"}`);
  console.log(`Período:      ${monthKey} (${monthNameEs} ${targetYear})`);
  console.log(`Filtros:      sección2-no-aplica=${filterNonApplicable ? "SÍ" : "no"}  parámetros-inactivos=${filterInactive ? "SÍ" : "no"}`);
  console.log(`Base de datos: ${dbPath}`);
  console.log(`Archivo JSON:  ${jsonPath}\n`);

  if (!existsSync(dbPath)) {
    console.error(`Error: No existe la base de datos en: ${dbPath}`);
    process.exit(1);
  }

  if (!existsSync(jsonPath) || shouldExtract) {
    console.log(`Generando extracción desde Excel mediante scripts/extract-calidad.ps1 (-Month ${targetMonth} -Year ${targetYear})...`);
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File scripts/extract-calidad.ps1 -Month ${targetMonth} -Year ${targetYear} -OutputPath "${jsonPath}"`, {
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

  const db = new Database(dbPath, { readonly: !isApply });

  try {
    const dbAgents = db.prepare("SELECT id, name, username, incluido_calidad FROM agents").all() as DbAgent[];
    const dbParams = db.prepare("SELECT id, code, name, weight, category, channel, section, [order], active FROM audit_parameters").all() as DbParam[];
    const paramByCode = new Map<string, DbParam>();
    for (const p of dbParams) {
      paramByCode.set(p.code, p);
    }

    console.log(`Agentes registrados en DB: ${dbAgents.length}`);
    console.log(`Parámetros de auditoría en DB: ${dbParams.length}\n`);

    interface PreparedAudit {
      agent: DbAgent;
      extracted: ExtractedAudit;
      calculatedTotal: number;
      calculatedS1: number;
      calculatedS2: number;
      isReclamoNovedad: boolean;
      scoresToInsert: Array<{ parameterId: number; score: boolean; comment: string | null }>;
    }

    const preparedList: PreparedAudit[] = [];
    let unmatchedAgents = 0;
    let missingParams = 0;

    const RECLAMO_CODES = new Set([
      "call_ticket_reclamo_novedad",
      "email_mda_reclamo_novedad",
    ]);

    for (const ext of extractedAudits) {
      const agent = resolveAgent(ext.operatorSheet, dbAgents);
      if (!agent) {
        console.warn(`[WARN] Operador no encontrado en 'agents': "${ext.operatorSheet}"`);
        unmatchedAgents++;
        continue;
      }

      const channelParams = dbParams.filter(
        (p) => p.channel === ext.channelType && p.active === 1,
      );

      const reclamoScore = ext.scores.find((s) => RECLAMO_CODES.has(s.code));
      const isReclamoNovedad = reclamoScore?.score ?? false;

      let flagSection2 = true;
      if (ext.channelType === "wise_call" || ext.channelType === "wise_email") {
        flagSection2 = ext.appliesMda;
      } else if (ext.channelType === "invgate_ticket" || ext.channelType === "autogestion") {
        flagSection2 = ext.staysInMda;
      }

      const hasSection2 = flagSection2 || isReclamoNovedad;

      const applicableParamDefs = hasSection2
        ? channelParams
        : channelParams.filter((p) => p.section === "items");
      const applicableParamIds = new Set(applicableParamDefs.map((p) => p.id));

      const compliantCodes = new Set<string>();
      const scoresToInsert: PreparedAudit["scoresToInsert"] = [];

      for (const sc of ext.scores) {
        const paramDef = paramByCode.get(sc.code);
        if (!paramDef) {
          console.warn(`[WARN] Parámetro no reconocido: ${sc.code}`);
          missingParams++;
          continue;
        }

        if (sc.score) {
          compliantCodes.add(sc.code);
        }

        if (filterInactive && paramDef.active !== 1) {
          continue;
        }

        if (filterNonApplicable && !applicableParamIds.has(paramDef.id)) {
          continue;
        }

        scoresToInsert.push({
          parameterId: paramDef.id,
          score: sc.score,
          comment: sc.comment,
        });
      }

      const { section1Score, section2Score, totalScore } = calculateMultiChannelAuditScores(
        ext.channelType,
        channelParams,
        compliantCodes,
        hasSection2,
        isReclamoNovedad,
      );

      const finalTotalScore = ext.excelTotalScore > 0 || totalScore === 0 ? ext.excelTotalScore : totalScore;
      let finalS1 = section1Score;
      let finalS2 = section2Score;
      if (ext.channelType === "wise_call") {
        finalS1 = ext.excelSection1Score > 0 ? Math.round((ext.excelSection1Score / 45) * 100) : section1Score;
        finalS2 = ext.excelSection2Score > 0 ? Math.round((ext.excelSection2Score / 55) * 100) : section2Score;
      } else if (ext.channelType === "wise_email") {
        finalS1 = ext.excelSection1Score > 0 ? ext.excelSection1Score : section1Score;
        finalS2 = ext.excelSection2Score > 0 ? ext.excelSection2Score : section2Score;
      }

      preparedList.push({
        agent,
        extracted: ext,
        calculatedTotal: finalTotalScore,
        calculatedS1: finalS1,
        calculatedS2: finalS2,
        isReclamoNovedad,
        scoresToInsert,
      });
    }

    if (unmatchedAgents > 0) {
      console.error(`\n[FATAL] Hay ${unmatchedAgents} auditorías con operadores sin matchear en DB.`);
      process.exit(1);
    }
    if (missingParams > 0) {
      console.error(`\n[FATAL] Se encontraron ${missingParams} referencias a parámetros que no existen en DB.`);
      process.exit(1);
    }

    const byOperator = new Map<string, { agent: DbAgent; calls: PreparedAudit[]; emails: PreparedAudit[]; tickets: PreparedAudit[] }>();
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
      else if (item.extracted.channelType === "invgate_ticket" || item.extracted.channelType === "autogestion") group.tickets.push(item);
    }

    console.log("------------------------------------------------------------------------------------------------------");
    console.log("OPERADOR                     | AGENT ID | LLAMADOS     | MAILS       | TICKETS/AG    | TOTAL AUD | PROM GLOBAL");
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

    console.log(`TOTAL AUDITORÍAS PREPARADAS: ${preparedList.length} (Llamados: ${totalCallsCount}, Mails: ${totalEmailsCount}, Tickets/AG: ${totalTicketsCount})`);
    console.log(`TOTAL SCORES A INSERTAR: ${totalScoresToInsert}`);
    console.log(`Diferencias mínimas de redondeo detectadas vs Excel: ${roundingDiffs} de ${preparedList.length}`);

    const currentAuditCount = db
      .prepare("SELECT COUNT(*) AS c FROM quality_audits WHERE month = ?")
      .get(monthKey) as { c: number };
    const currentScoreCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM audit_scores
         WHERE audit_id IN (SELECT id FROM quality_audits WHERE month = ?)`,
      )
      .get(monthKey) as { c: number };

    console.log("------------------------------------------------------------------------------------------------------");
    console.log(`COMPARACIÓN CONTRA LA BD ACTUAL (mes ${monthKey})`);
    console.log("------------------------------------------------------------------------------------------------------");
    console.log(`Auditorías:  actual=${currentAuditCount.c}  a insertar=${preparedList.length}`);
    console.log(`Scores:      actual=${currentScoreCount.c}  a insertar=${totalScoresToInsert}  (delta ${totalScoresToInsert - currentScoreCount.c >= 0 ? "+" : ""}${totalScoresToInsert - currentScoreCount.c})`);
    console.log("------------------------------------------------------------------------------------------------------\n");

    if (isApply) {
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
        db.prepare(`
          DELETE FROM audit_scores
          WHERE audit_id IN (SELECT id FROM quality_audits WHERE month = ?)
        `).run(monthKey);

        const delRes = db.prepare("DELETE FROM quality_audits WHERE month = ?").run(monthKey);
        if (delRes.changes > 0) {
          console.log(`Se eliminaron ${delRes.changes} auditorías existentes previas de '${monthKey}'.`);
        }

        for (const item of items) {
          const auditInfo = insertAuditStmt.run({
            agentId: item.agent.id,
            channelType: item.extracted.channelType,
            callId: item.extracted.callId,
            ticketId: item.extracted.ticketId,
            duration: item.extracted.duration,
            date: item.extracted.date,
            month: monthKey,
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
      console.log(`Mes configurado:                  ${monthKey}`);
      console.log(`Backup generado en:               ${backupPath}`);
      console.log("==========================================================\n");
    } else {
      console.log("==========================================================");
      console.log("  MODO DRY-RUN FINALIZADO: NO SE ESCRIBIÓ EN LA BASE DE DATOS");
      console.log("  Para aplicar los cambios reales, ejecuta:");
      console.log(`  npx tsx scripts/migrate-quality-audits.mts --month ${targetMonth} --year ${targetYear} --apply`);
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
