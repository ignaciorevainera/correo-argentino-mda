import Database from "better-sqlite3";

async function runMigration() {
  console.log("🚀 Iniciando migración de auditorías de calidad a parámetros dinámicos...");
  
  const db = new Database("./database/mda.db");

  try {
    // 1. Crear tabla audit_parameters
    console.log("1. Creando tabla 'audit_parameters' si no existe...");
    db.prepare(`
      CREATE TABLE IF NOT EXISTS \`audit_parameters\` (
        \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        \`code\` text NOT NULL UNIQUE,
        \`name\` text NOT NULL,
        \`weight\` real NOT NULL DEFAULT 1.0,
        \`category\` text NOT NULL
      )
    `).run();

    // 2. Crear tabla audit_scores
    console.log("2. Creando tabla 'audit_scores' si no existe...");
    db.prepare(`
      CREATE TABLE IF NOT EXISTS \`audit_scores\` (
        \`audit_id\` integer NOT NULL,
        \`parameter_id\` integer NOT NULL,
        PRIMARY KEY(\`audit_id\`, \`parameter_id\`),
        FOREIGN KEY(\`audit_id\`) REFERENCES \`quality_audits\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY(\`parameter_id\`) REFERENCES \`audit_parameters\`(\`id\`) ON DELETE CASCADE
      )
    `).run();

    // Comprobar si la columna score existe en audit_scores (si no, la agregamos)
    const auditScoresInfo = db.pragma("table_info(audit_scores)") as any[];
    const auditScoresCols = auditScoresInfo.map(c => c.name);
    if (!auditScoresCols.includes("score")) {
      console.log("Añadiendo columna 'score' a 'audit_scores'...");
      db.prepare("ALTER TABLE audit_scores ADD COLUMN score integer NOT NULL DEFAULT 0").run();
    }

    // 3. Añadir columnas notes, month_summary y is_critical_failure a quality_audits
    console.log("3. Comprobando y añadiendo columnas adicionales a 'quality_audits'...");
    const qaInfo = db.pragma("table_info(quality_audits)") as any[];
    const qaCols = qaInfo.map(c => c.name);

    if (!qaCols.includes("notes")) {
      console.log("Añadiendo columna 'notes' a 'quality_audits'...");
      db.prepare("ALTER TABLE quality_audits ADD COLUMN notes text").run();
    }
    if (!qaCols.includes("month_summary")) {
      console.log("Añadiendo columna 'month_summary' a 'quality_audits'...");
      db.prepare("ALTER TABLE quality_audits ADD COLUMN month_summary text").run();
    }
    if (!qaCols.includes("is_critical_failure")) {
      console.log("Añadiendo columna 'is_critical_failure' a 'quality_audits'...");
      db.prepare("ALTER TABLE quality_audits ADD COLUMN is_critical_failure integer NOT NULL DEFAULT 0").run();
    }

    // 4. Insertar los 19 parámetros estándar en audit_parameters
    console.log("4. Inicializando parámetros de auditoría estándar...");
    const defaultParams = [
      // Sección 1: Interacción con Usuario
      { code: "cordialidad", name: "Cordialidad y cortesía", weight: 1.0, category: "Interacción con Usuario" },
      { code: "saludo", name: "Uso del saludo estándar", weight: 1.0, category: "Interacción con Usuario" },
      { code: "interes", name: "Demuestra interés en resolver", weight: 1.0, category: "Interacción con Usuario" },
      { code: "sondeo", name: "Sondeo adecuado", weight: 1.0, category: "Interacción con Usuario" },
      { code: "escucha", name: "Escucha activa y atenta", weight: 1.0, category: "Interacción con Usuario" },
      { code: "control", name: "Control de la conversación", weight: 1.0, category: "Interacción con Usuario" },
      { code: "contencion", name: "Contención en la espera", weight: 1.0, category: "Interacción con Usuario" },
      { code: "despedida", name: "Se despide cordialmente", weight: 1.0, category: "Interacción con Usuario" },
      { code: "solicitud", name: "Solicitud de conformidad", weight: 1.0, category: "Interacción con Usuario" },
      { code: "lenguaje", name: "Lenguaje apropiado", weight: 1.0, category: "Interacción con Usuario" },
      
      // Sección 2: Gestión del Ticket
      { code: "origen", name: "Origen de la solicitud", weight: 1.0, category: "Gestión del Ticket" },
      { code: "tipo", name: "Tipo de solicitud", weight: 1.0, category: "Gestión del Ticket" },
      { code: "categorizacion", name: "Categorización correcta", weight: 1.0, category: "Gestión del Ticket" },
      { code: "ortografia", name: "Buena ortografía", weight: 1.0, category: "Gestión del Ticket" },
      { code: "prioridad", name: "Prioridad correcta", weight: 1.0, category: "Gestión del Ticket" },
      { code: "titulo", name: "Título descriptivo", weight: 1.0, category: "Gestión del Ticket" },
      { code: "cierre", name: "Criterio de cierre", weight: 1.0, category: "Gestión del Ticket" },
      { code: "descripcion", name: "Descripción y evidencia", weight: 1.0, category: "Gestión del Ticket" },
      { code: "exactitud", name: "Exactitud en ingreso", weight: 1.0, category: "Gestión del Ticket" }
    ];

    const insertParam = db.prepare(`
      INSERT INTO audit_parameters (code, name, weight, category)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(code) DO NOTHING
    `);

    for (const p of defaultParams) {
      insertParam.run(p.code, p.name, p.weight, p.category);
    }

    // Obtener los ids y códigos asignados
    const params = db.prepare("SELECT id, code FROM audit_parameters").all() as { id: number, code: string }[];
    const paramMap = new Map<string, number>();
    for (const p of params) {
      paramMap.set(p.code, p.id);
    }

    // 5. Migrar puntuaciones de las auditorías existentes
    console.log("5. Evaluando migración de puntuaciones...");
    
    // Obtener cuántas puntuaciones ya existen
    const scoreCount = (db.prepare("SELECT COUNT(*) as count FROM audit_scores").get() as any).count;
    if (scoreCount > 0) {
      console.log("⚠️ Ya existen registros en 'audit_scores'. Se omitirá la migración de datos para evitar duplicados.");
    } else {
      // Buscar si las columnas viejas existen en la tabla quality_audits física
      const oldColumns = ["cordialidad", "saludo", "interes", "sondeo", "escucha", "control", "contencion", "despedida", "solicitud", "lenguaje", "origen", "tipo", "categorizacion", "ortografia", "prioridad", "titulo", "cierre", "descripcion", "exactitud"];
      const hasOldCols = oldColumns.every(col => qaCols.includes(col));

      if (hasOldCols) {
        const audits = db.prepare("SELECT * FROM quality_audits").all() as any[];
        console.log(`Migrando puntuaciones de ${audits.length} auditorías encontradas...`);

        const insertScore = db.prepare(`
          INSERT INTO audit_scores (audit_id, parameter_id, score)
          VALUES (?, ?, ?)
          ON CONFLICT(audit_id, parameter_id) DO UPDATE SET score=excluded.score
        `);

        let migratedAuditsCount = 0;
        let migratedScoresCount = 0;

        db.transaction(() => {
          for (const audit of audits) {
            for (const [code, paramId] of paramMap.entries()) {
              if (code in audit) {
                const val = audit[code];
                // El valor en SQLite puede ser un booleano (0 o 1)
                const scoreVal = val ? 1 : 0;
                insertScore.run(audit.id, paramId, scoreVal);
                migratedScoresCount++;
              }
            }
            migratedAuditsCount++;
          }
        })();

        console.log(`✅ Migración finalizada con éxito. Se migraron ${migratedScoresCount} puntuaciones para ${migratedAuditsCount} auditorías.`);
      } else {
        console.log("⚠️ No se encontraron las 19 columnas booleanas antiguas en la tabla 'quality_audits'. Es posible que ya hayan sido eliminadas.");
      }
    }

  } catch (error) {
    console.error("❌ Error durante la migración de la base de datos:", error);
    throw error;
  } finally {
    db.close();
  }
}

runMigration();
