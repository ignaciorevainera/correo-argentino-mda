// scripts/backfill-participaciones.cjs
// Pone las 4 participaciones en 1 para TODOS los agentes existentes.
// Comportamiento previo a la feature: todos figuraban en todo lado.
const Database = require("better-sqlite3");
const db = new Database("database/mda.db");

const cols = ["en_cronograma", "asignable_cubic", "incluido_calidad", "asignable_ags"];
const existing = db.prepare("PRAGMA table_info(agents)").all().map((c) => c.name);

let added = 0;
for (const col of cols) {
  if (!existing.includes(col)) {
    db.exec(`ALTER TABLE agents ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    added++;
  }
}

const res = db
  .prepare(
    `UPDATE agents SET en_cronograma = 1, asignable_cubic = 1, incluido_calidad = 1, asignable_ags = 1`,
  )
  .run();

const totalAgents = db.prepare("SELECT COUNT(*) c FROM agents").get().c;
const allOn = db
  .prepare(
    `SELECT COUNT(*) c FROM agents WHERE en_cronograma = 1 AND asignable_cubic = 1 AND incluido_calidad = 1 AND asignable_ags = 1`,
  )
  .get().c;

console.log(
  `Backfill OK: ${added} columnas agregadas, ${res.changes} agentes marcados ON.`,
);
console.log(`Verificacion: ${allOn}`);

if (allOn !== totalAgents) {
  console.error(
    `ERROR: ${allOn}/${totalAgents} agentes tienen las 4 participaciones ON. Cronograma quedaria vacio.`,
  );
  process.exit(1);
}
