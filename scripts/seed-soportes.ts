import { db } from "../src/db/index.js";
import { supportGuides } from "../src/db/schema.js";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Iniciando sembrado de soportes...");
  
  const guiaCompletaPath = path.join(__dirname, "../src/data/guia_completa.json");
  const infoSoportesPath = path.join(__dirname, "../src/data/info_soportes.json");
  
  const guiaDataRaw = await fsPromises.readFile(guiaCompletaPath, "utf-8");
  const infoSoportesRaw = await fsPromises.readFile(infoSoportesPath, "utf-8");
  
  const guiaCompleta = JSON.parse(guiaDataRaw);
  const infoSoportes = JSON.parse(infoSoportesRaw);
  
  // Transformar claves de infoSoportes a minúsculas para un match más robusto
  const infoSoportesLower: Record<string, any> = {};
  for (const [key, value] of Object.entries(infoSoportes)) {
    infoSoportesLower[key.trim().toLowerCase()] = value;
  }
  
  const recordsToInsert = [];
  
  for (const item of guiaCompleta) {
    const helpDeskName = item.sm_groups && item.sm_groups.length > 0 ? item.sm_groups[0] : "Desconocido";
    const helpDeskNameClean = helpDeskName.trim().toLowerCase();
    
    let notes = null;
    if (infoSoportesLower[helpDeskNameClean]) {
      notes = infoSoportesLower[helpDeskNameClean].descripcion;
    }
    
    recordsToInsert.push({
      helpDeskName: "",
      legacyName: helpDeskName,
      invgateName: item.invgate || "",
      route: item.ruta || "",
      topics: item.temas ? JSON.stringify(item.temas) : "[]",
      contacts: "",
      referents: "",
      notes: notes || "",
    });
  }
  
  console.log(`Insertando ${recordsToInsert.length} registros...`);
  await db.insert(supportGuides).values(recordsToInsert);
  console.log("Sembrado completado exitosamente.");
}

main().catch((err) => {
  console.error("Error en sembrado:", err);
  process.exit(1);
});
