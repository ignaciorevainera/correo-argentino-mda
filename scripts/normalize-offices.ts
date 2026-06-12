import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { offices } from "../src/db/schema";

const SUB_MAP: Record<string, string> = {
  // Order of insertion is critical to avoid partial matches on substrings:
  "DESPE\uFFFDADEROS": "DESPEÑADEROS",
  "CHA\uFFFDARITOS": "CHAÑARITOS",
  "RODR\uFFFDIGUEZ": "RODRÍGUEZ",
  "FERRETER\uFFFDA": "FERRETERÍA",
  "ARRIBE\uFFFDO": "ARRIBEÑO",
  "NORTE\uFFFDA": "NORTEÑA",
  "ASCENSI\uFFFDN": "ASCENSIÓN",
  "A\uFFFDATUYA": "AÑATUYA",
  "A\uFFFDELO": "AÑELO",
  "BAH\uFFFDA": "BAHÍA",
  "NOM\uFFFDS": "NOMÁS",
  "BA\uFFFDADO": "BAÑADO",
  "CARCARA\uFFFDA": "CARCARAÑÁ",
  "PA\uFFFDALERA": "PAÑALERA",
  "CA\uFFFDADA": "CAÑADA",
  "CA\uFFFDADON": "CAÑADÓN",
  "CA\uFFFDUELAS": "CAÑUELAS",
  "CHA\uFFFDAR": "CHAÑAR",
  "ESP\uFFFDIN": "ESPÍN",
  "JER\uFFFDNIMO": "JERÓNIMO",
  "LIBRER\uFFFDA": "LIBRERÍA",
  "ARG\uFFFDUELLO": "ARGÜELLO",
  "CUTRAL C\uFFFDO": "CUTRAL CÓ",
  "ARA\uFFFDADO": "ARAÑADO",
  "MERCEDE\uFFFDO": "MERCEDEÑO",
  "IVAN\uFFFDS": "IVAN'S",
  "PEQUE\uFFFDA": "PEQUEÑA",
  "CA\uFFFDAS": "CAÑAS",
  "FERN\uFFFDANDEZ": "FERNÁNDEZ",
  "KO\uFFFDU": "KOÑU",
  "NI\uFFFDA": "NIÑA",
  "BENDICI\uFFFDON": "BENDICIÓN",
  "BRE\uFFFDAS": "BREÑAS",
  "PE\uFFFDAS": "PEÑAS",
  "LUJ\uFFFDAN": "LUJÁN",
  "VILLAFA\uFFFDE": "VILLAFAÑE",
  "MAIP\uFFFDU": "MAIPÚ",
  "N\uFFFDMADE": "NÓMADE",
  "MALAGUE\uFFFDO": "MALAGUEÑO",
  "MART\uFFFDIN": "MARTÍN",
  "MALARG\uFFFDE": "MALARGÜE",
  "MOREN\uFFFDAS": "MORENA'S",
  "LE\uFFFDA": "LEÑA",
  "MARSI\uFFFDAC": "MARSIÑAC",
  "NU\uFFFDEZ": "NUÑEZ",
  "DO\uFFFDA": "DOÑA",
  "MU\uFFFDIZ": "MUÑIZ",
  "M\uFFFDDANOS": "MÉDANOS",
  "NOGOL\uFFFDI": "NOGOLÍ",
  "ORDO\uFFFDEZ": "ORDOÑEZ",
  "SAENZ PE\uFFFDA": "SAENZ PEÑA",
  "PIGU\uFFFDE": "PIGÜÉ",
  "PI\uFFFDEYRO": "PIÑEYRO",
  "RODRIGUEZ PE\uFFFDA": "RODRIGUEZ PEÑA",
  "PORTE\uFFFDA": "PORTEÑA",
  "PU\uFFFDAN": "PUÁN",
  "QUIMIL\uFFFDI": "QUIMILÍ",
  "REALIC\uFFFDO": "REALICÓ",
  "ORO\uFFFDO": "OROÑO",
  "CLIP\uFFFDS": "CLIP'S",
  "TROTAMUNDO\uFFFDS": "TROTAMUNDO'S",
  "ESPA\uFFFDA": "ESPAÑA",
  "CASTA\uFFFDARES": "CASTAÑARES",
  "D\uFFFDELEITE": "DÉLEITE",
  "DISE\uFFFDOS": "DISEÑOS",
  "DISE\uFFFDO": "DISEÑO",
  "GRY\uFFFDS": "GRY'S",
  "SE\uFFFDALES": "SEÑALES",
  "MADRILE\uFFFDA": "MADRILEÑA",
  "TR\uFFFDANSITO": "TRÁNSITO",
  "CHASIC\uFFFDO": "CHASICÓ",
  "CUCULL\uFFFDO": "CUCULLÓ",
  "ESTACI\uFFFDN": "ESTACIÓN",
  "L\uFFFDOPEZ": "LÓPEZ",
  "JOS\uFFFDE": "JOSÉ",
  "V\uFFFDA": "VÍA",
  "VICU\uFFFDA": "VICUÑA",
  "MAR\uFFFDA": "MARÍA",
  "VINAR\uFFFDA": "VINARÁ",
  "VI\uFFFDA": "VIÑA",
  "\uFFFDORQUINCO": "ÑORQUINCO",
  "SE\uFFFDORA": "SEÑORA",
  "SE\uFFFDO": "SEÑO",
  "MU\uFFFDECO": "MUÑECO",
  
  // Specific Nº mappings
  "N\uFFFD 1": "Nº 1",
  "UP N\uFFFD2": "UP Nº 2",
  "N\uFFFD2": "Nº 2",
  "N\uFFFD ": "Nº ",
  "N\uFFFD": "Nº",

  // Specific U+FFFD overrides to resolve remaining cases
  "D\uFFFDCASA": "DÉCASA",
  "O\uFFFDBRIEN": "O'BRIEN",
  "ICA\uFFFD": "ICAÑ",
  "BENDICI\uFFFDN": "BENDICIÓN",
  "LUJ\uFFFDN": "LUJÁN",
  "MAIP\uFFFD": "MAIPÚ",
  "MART\uFFFDN": "MARTÍN",
  "NOGOL\uFFFD": "NOGOLÍ",
  "OBER\uFFFD": "OBERÁ",
  "PE\uFFFD": "PEÑ",
  "PIGU\uFFFD": "PIGÜÉ",
  "PU\uFFFDN": "PUÁN",
  "QUIMIL\uFFFD": "QUIMILÍ",
  "REALIC\uFFFD": "REALICÓ",
  "D\uFFFDLEITE": "DÉLEITE",
  "TR\uFFFDNSITO": "TRÁNSITO",
  "CHASIC\uFFFD": "CHASICÓ",
  "CUCULL\uFFFD": "CUCULLÓ",
  "L\uFFFDPEZ": "LÓPEZ",
  "JOS\uFFFD": "JOSÉ",
  "VINAR\uFFFD": "VINARÁ",
  
  // Add final missing rules
  "ESP\uFFFDN": "ESPÍN",
  "ARG\uFFFDELLO": "ARGÜELLO",
  "C\uFFFD-": "CÓ-",
  "GUAMIN\uFFFD": "GUAMINÍ",
  "FERN\uFFFDNDEZ": "FERNÁNDEZ",
  "MOREN\uFFFDS": "MORENA'S",
};

const DIRECT_MAP: Record<number, string> = {
  1057: "PIÑEYRO MILLA SUR LOGISTICA",
  3058: "UP Nº 2 - EMBAJADOR MARTINI"
};

export function normalizeName(id: number, name: string): string {
  if (DIRECT_MAP[id]) {
    return DIRECT_MAP[id];
  }
  let normalized = name;
  for (const [mojibake, correct] of Object.entries(SUB_MAP)) {
    normalized = normalized.replaceAll(mojibake, correct);
  }
  return normalized;
}

export function normalizeField(id: number, val: string | null | undefined): string | null {
  if (!val) return null;
  const clean = normalizeName(id, val);
  return clean.toUpperCase();
}

// Simple internal assertions to verify correctness
function selfTest() {
  const testCases = [
    { id: 911, input: "ADROGUE EL MU\uFFFDECO LOCO", expected: "ADROGUE EL MUÑECO LOCO" },
    { id: 2786, input: "LA ESCONDIDA - LO DE KO\uFFFDU", expected: "LA ESCONDIDA - LO DE KOÑU" },
    { id: 1057, input: "P\uFFFDeYRO MILLA SUR LOGISTICA", expected: "PIÑEYRO MILLA SUR LOGISTICA" },
    { id: 5969, input: "CORDOBA N\uFFFD 21", expected: "CORDOBA Nº 21" }
  ];

  for (const { id, input, expected } of testCases) {
    const output = normalizeName(id, input);
    if (output !== expected) {
      throw new Error(`Self-test failed for ID ${id}: ${input}. Expected "${expected}", got "${output}"`);
    }
  }
  console.log("[✓] Self-test validation passed successfully.");
}

async function run() {
  selfTest();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`[Script] Starting normalization. Mode: ${dryRun ? "DRY-RUN (no database writes)" : "WRITE (updates DB)"}`);

  const allOffices = await db.select({
    id: offices.id,
    name: offices.name,
    address: offices.address,
    street: offices.street,
    locality: offices.locality,
    county: offices.county,
    zone: offices.zone
  }).from(offices);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const office of allOffices) {
    const nextName = normalizeField(office.id, office.name) ?? "";
    const nextAddress = normalizeField(office.id, office.address);
    const nextStreet = normalizeField(office.id, office.street);
    const nextLocality = normalizeField(office.id, office.locality);
    const nextCounty = normalizeField(office.id, office.county);
    const nextZone = normalizeField(office.id, office.zone);

    const hasChanges = 
      office.name !== nextName ||
      office.address !== nextAddress ||
      office.street !== nextStreet ||
      office.locality !== nextLocality ||
      office.county !== nextCounty ||
      office.zone !== nextZone;

    if (hasChanges) {
      updatedCount++;
      const changeLog: string[] = [];
      if (office.name !== nextName) changeLog.push(`name: "${office.name}" -> "${nextName}"`);
      if (office.address !== nextAddress) changeLog.push(`address: "${office.address}" -> "${nextAddress}"`);
      if (office.street !== nextStreet) changeLog.push(`street: "${office.street}" -> "${nextStreet}"`);
      if (office.locality !== nextLocality) changeLog.push(`locality: "${office.locality}" -> "${nextLocality}"`);
      if (office.county !== nextCounty) changeLog.push(`county: "${office.county}" -> "${nextCounty}"`);
      if (office.zone !== nextZone) changeLog.push(`zone: "${office.zone}" -> "${nextZone}"`);

      console.log(`[ID: ${office.id}] Changes:\n  ${changeLog.join("\n  ")}`);

      if (!dryRun) {
        await db.update(offices)
          .set({
            name: nextName,
            address: nextAddress,
            street: nextStreet,
            locality: nextLocality,
            county: nextCounty,
            zone: nextZone
          })
          .where(eq(offices.id, office.id));
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`[Script] Finished. Total processed: ${allOffices.length}. Updated/To Update: ${updatedCount}. Skipped: ${skippedCount}.`);
}

run().catch((err) => {
  console.error("Critical error in normalization script:", err);
  process.exit(1);
});
