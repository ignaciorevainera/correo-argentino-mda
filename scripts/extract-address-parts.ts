import Database from "better-sqlite3";
import * as path from "path";

const ADDRESS_REGEX = /^(.*?)\s+(\d+|S\/?N\.?)$/i;

function main() {
  const dbPath = path.resolve("./database/mda.db");
  console.log(`Connecting to DB: ${dbPath}`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  try {
    const rows = db
      .prepare(
        "SELECT id, address FROM offices WHERE address IS NOT NULL AND (street IS NULL OR street = '')"
      )
      .all() as { id: number; address: string }[];

    console.log(`Found ${rows.length} offices to process.`);

    const updateStmt = db.prepare(
      "UPDATE offices SET street = @street, number = @number WHERE id = @id"
    );

    let updated = 0;

    const runTransaction = db.transaction(() => {
      for (const row of rows) {
        const address = row.address.trim();
        const match = ADDRESS_REGEX.exec(address);

        let street: string;
        let number: string | null;

        if (match) {
          street = match[1].trim().toUpperCase();
          number = match[2].trim().toUpperCase();
        } else {
          street = address.toUpperCase();
          number = null;
        }

        updateStmt.run({ id: row.id, street, number });
        updated++;
      }
    });

    runTransaction();

    console.log(`\n✅ ${updated} offices updated with extracted street/number.`);
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    db.close();
    console.log("Database connection closed.");
  }
}

main();
