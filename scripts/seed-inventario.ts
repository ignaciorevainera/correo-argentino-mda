import { readFileSync } from "fs";
import * as path from "path";
import Database from "better-sqlite3";

interface RawTerminal {
  Hostname: string;
  Mac: string;
  "Ip-Dir": string;
  "Sist. Ope.": string;
  "OS. Tipo": string;
  Ram: string;
  Serial: string;
  manufacturer: string;
  Modelo: string;
  Sucursal: string;
  Provincia: string;
  "Región": string;
  NIS: string;
  NIS2: string;
  "Last-Contact": string;
}

function trimOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function main() {
  const jsonPath = path.resolve("src/data/inventario_terminales.json");
  const dbPath = path.resolve("./database/mda.db");

  console.log(`📂 Reading JSON from: ${jsonPath}`);
  console.log(`🔌 Connecting to DB: ${dbPath}`);

  const rawContent = readFileSync(jsonPath, "utf-8");
  const rawRecords: RawTerminal[] = JSON.parse(rawContent);

  console.log(`📊 Total raw records in JSON: ${rawRecords.length}`);

  // Deduplicar por hostname + NIS
  const seen = new Set<string>();
  const uniqueRecords: RawTerminal[] = [];

  for (const record of rawRecords) {
    const key = `${(record.Hostname || "").trim()}|${(record.NIS || "").trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRecords.push(record);
    }
  }

  console.log(`🔍 Unique records after deduplication: ${uniqueRecords.length}`);

  // Registros inventados con NIS reales que existen en offices
  const inventedRecords: RawTerminal[] = [
    {
      Hostname: "L0072G101",
      Mac: "A4:BB:6D:10:22:F3",
      "Ip-Dir": "10.150.30.101",
      "Sist. Ope.": "Microsoft Windows 10 Pro",
      "OS. Tipo": "64",
      Ram: "8.00 GB",
      Serial: "AR020000551001",
      manufacturer: "Lenovo",
      Modelo: "ThinkCentre M720",
      Sucursal: "",
      Provincia: "",
      "Región": "",
      NIS: "L0072",
      NIS2: "",
      "Last-Contact": "2025-08-09 14:32:10",
    },
    {
      Hostname: "Q3261E101",
      Mac: "D8:CB:8A:4E:91:B2",
      "Ip-Dir": "10.175.88.201",
      "Sist. Ope.": "Microsoft Windows 11 Pro",
      "OS. Tipo": "64",
      Ram: "16.00 GB",
      Serial: "PF3KQX72",
      manufacturer: "HP",
      Modelo: "ProDesk 400 G7",
      Sucursal: "",
      Provincia: "",
      "Región": "",
      NIS: "Q3261",
      NIS2: "",
      "Last-Contact": "2025-08-11 09:15:44",
    },
    {
      Hostname: "C0053I201",
      Mac: "00:1A:2B:3C:4D:5E",
      "Ip-Dir": "10.10.5.150",
      "Sist. Ope.": "Ubuntu 22.04 LTS",
      "OS. Tipo": "64",
      Ram: "4.00 GB",
      Serial: "DELL-SVC-90281",
      manufacturer: "Dell Inc.",
      Modelo: "OptiPlex 3080",
      Sucursal: "",
      Provincia: "",
      "Región": "",
      NIS: "C0053",
      NIS2: "",
      "Last-Contact": "2025-08-10 22:05:33",
    },
    {
      Hostname: "B3413G201",
      Mac: "F0:DE:F1:AB:CD:EF",
      "Ip-Dir": "10.22.146.101",
      "Sist. Ope.": "Microsoft Windows 10 Pro for Workstations",
      "OS. Tipo": "64",
      Ram: "8.00 GB",
      Serial: "AR020000548900",
      manufacturer: "Gigabyte Technology Co., Ltd.",
      Modelo: "CROSS B02",
      Sucursal: "",
      Provincia: "",
      "Región": "",
      NIS: "B3413",
      NIS2: "",
      "Last-Contact": "2025-08-11 11:20:00",
    },
  ];

  const allRecords = [...uniqueRecords, ...inventedRecords];
  console.log(`📦 Total records to insert: ${allRecords.length}`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Verificar que la tabla terminals existe
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='terminals'"
    )
    .get();

  if (!tableExists) {
    console.error(
      "❌ Table 'terminals' does not exist. Run 'npm run db:push' first."
    );
    db.close();
    process.exit(1);
  }

  // Limpiar tabla antes de insertar
  db.prepare("DELETE FROM terminals").run();
  console.log("🧹 Cleared existing terminals data");

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO terminals (
      hostname, mac_address, ip_address, operating_system,
      os_architecture, ram, serial_number, manufacturer,
      model, nis, nis2, last_contact
    ) VALUES (
      @hostname, @macAddress, @ipAddress, @operatingSystem,
      @osArchitecture, @ram, @serialNumber, @manufacturer,
      @model, @nis, @nis2, @lastContact
    )
  `);

  let inserted = 0;
  let skipped = 0;

  const runTransaction = db.transaction(() => {
    for (const row of allRecords) {
      const hostname = (row.Hostname || "").trim();
      if (!hostname) {
        skipped++;
        continue;
      }

      const osType = (row["OS. Tipo"] || "").trim();
      const architecture = osType ? `${osType}` : null;

      insertStmt.run({
        hostname,
        macAddress: trimOrNull(row.Mac),
        ipAddress: trimOrNull(row["Ip-Dir"]),
        operatingSystem: trimOrNull(row["Sist. Ope."]),
        osArchitecture: architecture,
        ram: trimOrNull(row.Ram),
        serialNumber: trimOrNull(row.Serial),
        manufacturer: trimOrNull(row.manufacturer),
        model: trimOrNull(row.Modelo),
        nis: trimOrNull(row.NIS),
        nis2: trimOrNull(row.NIS2),
        lastContact: trimOrNull(row["Last-Contact"]),
      });

      inserted++;
    }
  });

  console.log("💾 Running insert transaction...");
  runTransaction();

  db.close();

  console.log("\n=== RESULT ===");
  console.log(`✅ Inserted: ${inserted}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📊 Total processed: ${allRecords.length}`);
}

main();
