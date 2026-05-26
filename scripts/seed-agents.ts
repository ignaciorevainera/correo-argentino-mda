import Database from "better-sqlite3";
import * as path from "path";

// Define the interface for parsed operator data
interface OperatorInput {
  rawName: string;
}

interface ParsedOperator {
  name: string;          // e.g., "Agustín Aguirre"
  username: string;      // e.g., "aaguirre"
  avatarInitials: string; // e.g., "AA"
  location: string;
  workplace: string;
  horarioDefault: string;
}

// 1. Raw list of operators provided
const rawOperatorsList: OperatorInput[] = [
  { rawName: "Aguirre, Agustín" },
  { rawName: "Altamirano, Dario" },
  { rawName: "Arce, Franco" },
  { rawName: "Bajko, Natalia Bruna" },
  { rawName: "Bezruk, María Alejandra" },
  { rawName: "Bustamante, Mauricio Gabriel" },
  { rawName: "Campos, Braian" },
  { rawName: "Cardenas, Tamara" },
  { rawName: "Chen, Matias" },
  { rawName: "Cuello, Camila Belen" },
  { rawName: "Diaz, Felix" },
  { rawName: "Escudero, Juan" },
  { rawName: "Fernandez, Carla" },
  { rawName: "González Franco" },
  { rawName: "Graneros, Agustina" },
  { rawName: "Gutierrez, Bruno" },
  { rawName: "Llamas, Carolina" },
  { rawName: "Lopez Rojas, Malena" },
  { rawName: "Lopez, Nicolas Fernando" },
  { rawName: "Martínez, Johanna" },
  { rawName: "Miranda Bazualdo, Jorge" },
  { rawName: "Paredes, Joel" },
  { rawName: "Revainera, Ignacio" },
  { rawName: "Rodriguez, David" },
  { rawName: "Rojas, Ramiro" },
  { rawName: "Ruiz Nieto, Gonzalo" },
  { rawName: "Soto, Alan" },
];

/**
 * Normalizes a string by converting it to lowercase, removing accents/diacritics, 
 * and stripping any characters that are not letters or numbers.
 */
function cleanString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD") // Split character from its accent/diacritic
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9]/g, ""); // Keep only lowercase alphanumeric chars
}

/**
 * Parses a raw name ("Last, First" or "Last First") into a structured object.
 */
function parseOperatorName(rawName: string): ParsedOperator {
  let firstName = "";
  let lastName = "";

  if (rawName.includes(",")) {
    const parts = rawName.split(",");
    lastName = parts[0].trim();
    firstName = parts[1].trim();
  } else {
    // Fallback for names without comma (e.g. "González Franco" -> Last: González, First: Franco)
    const parts = rawName.trim().split(/\s+/);
    if (parts.length >= 2) {
      lastName = parts[0];
      firstName = parts.slice(1).join(" ");
    } else {
      firstName = rawName;
      lastName = "";
    }
  }

  // Construct "First Last" display name
  const fullName = `${firstName} ${lastName}`.trim();

  // Generate username: first letter of first name + lastname (lowercase, no spaces, no accents)
  const firstLetter = cleanString(firstName.split(" ")[0])[0] || "";
  const cleanedLastName = cleanString(lastName);
  const username = `${firstLetter}${cleanedLastName}`;

  // Generate initials (First letter of first name + First letter of last name)
  const firstInitial = firstName.trim()[0] || "";
  const lastInitial = lastName.trim()[0] || "";
  const initials = `${firstInitial}${lastInitial}`.toUpperCase();

  return {
    name: fullName,
    username,
    avatarInitials: initials,
    location: "Monte Grande",
    workplace: "Monte Grande",
    horarioDefault: "08:00 - 17:00",
  };
}

// 2. Perform the database migration
function migrate() {
  const dbPath = path.resolve("./database/mda.db");
  console.log(`Connecting to database at: ${dbPath}`);
  
  const db = new Database(dbPath);

  try {
    // Parse operators
    const parsedOperators = rawOperatorsList.map(op => parseOperatorName(op.rawName));

    // Prepare insert query using parameterized statement to prevent SQL injection
    const insertStatement = db.prepare(`
      INSERT INTO agents (
        name,
        username,
        avatar_initials,
        location,
        workplace,
        horario_default
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        username = excluded.username,
        avatar_initials = excluded.avatar_initials
    `);

    // Run the migration inside a transaction to guarantee atomicity (all or nothing)
    const runTransaction = db.transaction((operators: ParsedOperator[]) => {
      let count = 0;
      for (const op of operators) {
        insertStatement.run(
          op.name,
          op.username,
          op.avatarInitials,
          op.location,
          op.workplace,
          op.horarioDefault
        );
        count++;
      }
      return count;
    });

    console.log("Starting database transaction...");
    const insertedCount = runTransaction(parsedOperators);
    console.log(`✅ Success: ${insertedCount} operators successfully synchronized/inserted.`);

  } catch (error: any) {
    console.error("❌ Migration failed! Rolling back transaction.", error.message);
    process.exit(1);
  } finally {
    db.close();
    console.log("Database connection closed.");
  }
}

// Execute migration
migrate();
