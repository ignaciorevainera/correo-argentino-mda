import { readFileSync } from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import Database from "better-sqlite3";

const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  "BUENOS AIRES": "B",
  "CAPITAL FEDERAL": "C",
  "CATAMARCA": "K",
  "CHACO": "H",
  "CHUBUT": "U",
  "CORDOBA": "X",
  "CORRIENTES": "W",
  "ENTRE RIOS": "E",
  "FORMOSA": "P",
  "JUJUY": "Y",
  "LA PAMPA": "L",
  "LA RIOJA": "F",
  "MENDOZA": "M",
  "MISIONES": "N",
  "NEUQUEN": "Q",
  "RIO NEGRO": "R",
  "SALTA": "A",
  "SAN JUAN": "J",
  "SAN LUIS": "D",
  "SANTA CRUZ": "Z",
  "SANTA FE": "S",
  "SANTIAGO DEL ESTERO": "G",
  "TIERRA DEL FUEGO": "V",
  "TUCUMAN": "T",
};

function parseBooleanFlag(value: string | undefined): number {
  if (!value) return 0;
  return value.toUpperCase().includes("X") ? 1 : 0;
}

function trimOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function main() {
  const csvPath = path.resolve("src/data/baseSAS-28-5.csv");
  const dbPath = path.resolve("./database/mda.db");

  console.log(`Reading CSV from: ${csvPath}`);
  console.log(`Connecting to DB: ${dbPath}`);

  const csvContent = readFileSync(csvPath, "utf-8");

  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  console.log(`Parsed ${records.length} rows from CSV`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const existingProvinces = db
    .prepare("SELECT code FROM provinces")
    .all() as { code: string }[];
  const validCodes = new Set(existingProvinces.map((p) => p.code));

  const upsertStmt = db.prepare(`
    INSERT INTO offices (
      code, name, type, provinceCode, address,
      street, number, locality, county, zone,
      officeType, categoryClass, rubric, parentNis, phone,
      manager, regionId, enRed, paqarAdmision, paqarEntrega
    ) VALUES (
      @code, @name, @type, @provinceCode, @address,
      @street, @number, @locality, @county, @zone,
      @officeType, @categoryClass, @rubric, @parentNis, @phone,
      @manager, @regionId, @enRed, @paqarAdmision, @paqarEntrega
    )
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      provinceCode = excluded.provinceCode,
      address = excluded.address,
      street = excluded.street,
      number = excluded.number,
      locality = excluded.locality,
      county = excluded.county,
      zone = excluded.zone,
      officeType = excluded.officeType,
      categoryClass = excluded.categoryClass,
      rubric = excluded.rubric,
      parentNis = excluded.parentNis,
      phone = excluded.phone,
      manager = excluded.manager,
      regionId = excluded.regionId,
      enRed = excluded.enRed,
      paqarAdmision = excluded.paqarAdmision,
      paqarEntrega = excluded.paqarEntrega
  `);

  let inserted = 0;
  let skipped = 0;

  const runTransaction = db.transaction(() => {
    for (const row of records) {
      const code = trimOrNull(row["NIS"]);
      if (!code) {
        skipped++;
        continue;
      }

      const provinceName = (row["PROVINCIA"] || "").trim();
      const provinceCode = PROVINCE_NAME_TO_CODE[provinceName];

      if (!provinceCode || !validCodes.has(provinceCode)) {
        console.warn(
          `⚠️  Province not found for "${provinceName}" (NIS: ${code}). Skipping.`
        );
        skipped++;
        continue;
      }

      const name = trimOrNull(row["DENOMINACION"]) || code;
      const type = trimOrNull(row["CATEGORIA"]) || "Sucursal";
      const street = trimOrNull(row["CALLE"]);
      const number =
        row["NUMERO"]?.trim() !== "0" ? trimOrNull(row["NUMERO"]) : null;
      const address = [street, number].filter(Boolean).join(" ") || null;

      upsertStmt.run({
        code,
        name,
        type,
        provinceCode,
        address,
        street,
        number,
        locality: trimOrNull(row["LOCALIDAD"]),
        county: trimOrNull(row["PARTIDO"]),
        zone: trimOrNull(row["ZONA"]),
        officeType: trimOrNull(row["TIPO"]),
        categoryClass: trimOrNull(row["CATEGORIA DE SUCURSAL"]),
        rubric: trimOrNull(row["RUBRO"]),
        parentNis: trimOrNull(row["NIS DEPENDENCIA"]),
        phone: trimOrNull(row["TELEFONO1"]),
        manager: trimOrNull(row["TITULAR"]),
        regionId: trimOrNull(row["REGION"]),
        enRed: parseBooleanFlag(row["EN RED"]),
        paqarAdmision: parseBooleanFlag(row["PAQAR_ADMISION"]),
        paqarEntrega: parseBooleanFlag(row["PAQAR_ENTREGA"]),
      });

      inserted++;
    }
  });

  console.log("Running upsert transaction...");
  runTransaction();

  db.close();

  console.log("\n=== RESULT ===");
  console.log(`✅ Inserted/Updated: ${inserted}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📊 Total CSV rows: ${records.length}`);
}

main();
