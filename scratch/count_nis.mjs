import fs from "fs";
import path from "path";

const csvPath =
  "s:\\Dev\\!Proyectos\\correo-argentino-mda\\src\\data\\Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Definitivo) Contactos.csv";

function parseCsv() {
  const content = fs.readFileSync(csvPath, "latin1");
  const lines = content.split("\n");

  const nisSet = new Set();
  const offices = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("Total")) continue;

    const parts = line.split(";");
    if (parts.length < 1) continue;

    const nis = parts[0].trim();
    if (nis) {
      nisSet.add(nis);
      offices.push({
        nis,
        provincia: parts[1],
        tipo: parts[2],
        departamento: parts[3],
        direccion: parts[4],
      });
    }
  }

  console.log("Total lines (excluding header/empty/total):", offices.length);
  console.log("Total distinct NIS:", nisSet.size);
  console.log("List of NIS (first 10):", Array.from(nisSet).slice(0, 10));

  if (nisSet.size === 287) {
    console.log("Success: Found exactly 287 distinct NIS.");
  } else {
    console.log(`Notice: Found ${nisSet.size} distinct NIS.`);
  }
}

parseCsv();
