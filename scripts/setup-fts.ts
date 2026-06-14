import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve("./database/mda.db");
const db = new Database(dbPath);

console.log("Setting up FTS5 Virtual Tables and Triggers...");

const ftsTables = [
  { fts: "offices_fts", source: "offices", column: "searchable_text" },
  { fts: "terminals_fts", source: "terminals", column: "searchable_text" },
  { fts: "support_guides_fts", source: "support_guides", column: "searchable_text" }
];

db.transaction(() => {
  for (const { fts, source, column } of ftsTables) {
    console.log(`Setting up ${fts} for ${source}...`);
    
    // Create virtual table with unicode61 tokenizer removing diacritics
    db.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${fts} 
      USING fts5(${column}, content='${source}', content_rowid='id', tokenize="unicode61 remove_diacritics 1");
    `).run();

    // Create Triggers to sync inserting, deleting, and updating
    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS ${source}_fts_insert AFTER INSERT ON ${source} BEGIN
        INSERT INTO ${fts}(rowid, ${column}) VALUES (new.id, new.${column});
      END;
    `).run();

    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS ${source}_fts_delete AFTER DELETE ON ${source} BEGIN
        INSERT INTO ${fts}(${fts}, rowid, ${column}) VALUES('delete', old.id, old.${column});
      END;
    `).run();

    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS ${source}_fts_update AFTER UPDATE ON ${source} BEGIN
        INSERT INTO ${fts}(${fts}, rowid, ${column}) VALUES('delete', old.id, old.${column});
        INSERT INTO ${fts}(rowid, ${column}) VALUES (new.id, new.${column});
      END;
    `).run();

    // Rebuild index for existing data
    db.prepare(`INSERT INTO ${fts}(${fts}) VALUES('rebuild');`).run();
  }
})();

console.log("FTS5 setup completed successfully.");
