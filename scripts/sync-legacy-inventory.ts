import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { db } from "../src/db/index";
import { terminals, offices } from "../src/db/schema";
import { normalizeSearchValue } from "../src/lib/clientSearch";

const LEGACY_URL = "http://b1842zacs0255/mda/terminales_consulta.php";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const STATUS_PATH = resolve("src/data/last-sync-status.json");

import { parseJsonPayload, type TerminalRecord } from "../src/lib/inventory/legacyParser";

async function upsertRecord(
  record: TerminalRecord,
  syncedAt: string,
): Promise<void> {
  let displayArch = "";
  if (record.osArchitecture) {
    if (record.osArchitecture.includes("64")) {
      displayArch = "64 bits";
    } else if (record.osArchitecture.includes("32") || record.osArchitecture.includes("86")) {
      displayArch = "32 bits";
    } else {
      displayArch = record.osArchitecture;
    }
  }

  const textToSearch = [
    record.hostname,
    record.ipAddress,
    record.macAddress,
    record.manufacturer,
    record.model,
    record.serialNumber,
    record.operatingSystem,
    record.osArchitecture,
    displayArch,
    record.ram
  ].filter(Boolean).join(" ");
  const searchableText = normalizeSearchValue(textToSearch);

  await db
    .insert(terminals)
    .values({
      hostname: record.hostname,
      macAddress: record.macAddress,
      ipAddress: record.ipAddress,
      operatingSystem: record.operatingSystem,
      osArchitecture: record.osArchitecture,
      ram: record.ram,
      serialNumber: record.serialNumber,
      manufacturer: record.manufacturer,
      model: record.model,
      nis: record.nis,
      nis2: record.nis2,
      lastContact: record.lastContact,
      syncedAt,
      searchableText,
    })
    .onConflictDoUpdate({
      target: terminals.hostname,
      set: {
        macAddress: record.macAddress,
        ipAddress: record.ipAddress,
        operatingSystem: record.operatingSystem,
        osArchitecture: record.osArchitecture,
        ram: record.ram,
        serialNumber: record.serialNumber,
        manufacturer: record.manufacturer,
        model: record.model,
        nis: record.nis,
        nis2: record.nis2,
        lastContact: record.lastContact,
        syncedAt,
        searchableText,
      },
    });
}

async function fetchRemoteRecords(validNisSet: Set<string>): Promise<TerminalRecord[]> {
  const response = await fetch(LEGACY_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: unknown = await response.json();
  const records = parseJsonPayload(data, validNisSet);

  console.log(
    `[Sync] Respuesta obtenida y procesada. Registros válidos: ${records.length}`,
  );

  return records;
}

async function writeSyncStatus(status: "success" | "error", errorDetail: string | null = null): Promise<void> {
  const data = {
    lastExecution: new Date().toISOString(),
    status,
    error: errorDetail,
  };
  try {
    await writeFile(STATUS_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Sync] Error al escribir el archivo de estado de sincronización:", err);
  }
}

function cleanupOrphanFtsTriggers(): void {
  const sqlite = new Database("database/mda.db");
  try {
    const triggers = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%_fts_%'",
    ).all() as { name: string }[];
    if (triggers.length > 0) {
      for (const { name } of triggers) {
        sqlite.exec(`DROP TRIGGER IF EXISTS "${name}"`);
      }
      console.log(`[Sync] Triggers FTS huérfanos eliminados: ${triggers.length}`);
    }
  } finally {
    sqlite.close();
  }
}

async function syncLegacyInventory(): Promise<void> {
  const startTime = new Date();
  console.log(
    `[Sync] Sincronización de inventario legacy iniciada: ${startTime.toISOString()}`,
  );

  cleanupOrphanFtsTriggers();

  const officesList = await db.select({ code: offices.code }).from(offices);
  const validNisSet = new Set<string>(officesList.map((o) => o.code));
  console.log(`[Sync] Códigos NIS (oficinas) cargados en memoria: ${validNisSet.size}`);

  let records: TerminalRecord[];

  try {
    records = await fetchRemoteRecords(validNisSet);
  } catch (fetchError) {
    const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error(`[Sync] Error al obtener registros remotos: ${errorMsg}`);
    await writeSyncStatus("error", errorMsg);
    process.exit(1);
  }

  if (records.length === 0) {
    console.error("[Sync] No se obtuvieron registros de ninguna fuente.");
    await writeSyncStatus("error", "No se obtuvieron registros de la API remota.");
    process.exit(1);
  }

  const syncedAt = startTime.toISOString();
  let processed = 0;

  for (const record of records) {
    await upsertRecord(record, syncedAt);
    processed++;
  }

  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(2);
  console.log(
    `[Sync] Sincronización finalizada en ${elapsed}s. Procesados: ${processed}`,
  );

  await writeSyncStatus("success");
}

try {
  await syncLegacyInventory();
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error("[Sync] Error crítico:", errorMsg);
  await writeSyncStatus("error", errorMsg);
  process.exit(1);
}
