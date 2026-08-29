/**
 * Read-only pre-check for FK constraint migration.
 * Reports rows that would violate the new FKs:
 *  - users.helpdeskId -> mesas.invgateId (set null)
 *  - hidden_helpdesks.invgateId -> mesas.invgateId (cascade)
 * Does NOT modify data.
 */
import Database from "better-sqlite3";

const db = new Database("./database/mda.db", { readonly: true });

const orphanUsers = db
  .prepare(
    `SELECT id, username, helpdesk_id FROM users
     WHERE helpdesk_id IS NOT NULL
       AND helpdesk_id NOT IN (SELECT invgate_id FROM mesas)`,
  )
  .all();

const orphanHidden = db
  .prepare(
    `SELECT id, invgate_id, hidden_by FROM hidden_helpdesks
     WHERE invgate_id NOT IN (SELECT invgate_id FROM mesas)`,
  )
  .all();

console.log("=== FK pre-check (read-only) ===");
console.log(
  `users with orphan helpdeskId: ${orphanUsers.length}`,
);
if (orphanUsers.length) console.table(orphanUsers);
console.log(
  `hidden_helpdesks orphan rows: ${orphanHidden.length}`,
);
if (orphanHidden.length) console.table(orphanHidden);

const pragma = db.pragma("foreign_keys", { simple: true });
console.log(`pragma foreign_keys = ${pragma}`);
db.close();
