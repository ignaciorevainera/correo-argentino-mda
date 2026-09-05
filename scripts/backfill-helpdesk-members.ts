// scripts/backfill-helpdesk-members.ts
//
// Asigna users.helpdesk_name + users.helpdesk_id desde InvGate usando el
// username del portal (== username InvGate). Los subniveles de una mesa se
// aplanan a la mesa raiz.
//
// Requisito previo: mesas sincronizadas desde InvGate (tab Mesas -> Sincronizar),
// porque users.helpdesk_id referencia mesas.invgate_id.
//
// Uso:
//   npx tsx scripts/backfill-helpdesk-members.ts              (solo usuarios sin mesa)
//   npx tsx scripts/backfill-helpdesk-members.ts --dry-run     (reporte sin aplicar)
//   npx tsx scripts/backfill-helpdesk-members.ts --refresh     (re-resolver todos)
import { db } from "../src/db/index";
import { users } from "../src/db/schema";
import { eq, isNull, isNotNull } from "drizzle-orm";
import "dotenv/config";
import { resolveUserRootHelpdesk } from "../src/lib/invgateHelpdesk";

const dryRun = process.argv.includes("--dry-run");
const refresh = process.argv.includes("--refresh");

async function main() {
  const where = refresh
    ? isNotNull(users.helpdeskId)
    : isNull(users.helpdeskId);

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      helpdeskName: users.helpdeskName,
      helpdeskId: users.helpdeskId,
    })
    .from(users)
    .where(where);

  if (rows.length === 0) {
    console.log(
      refresh
        ? "No hay usuarios con mesa para refrescar."
        : "No hay usuarios sin mesa que backfillear.",
    );
    return;
  }

  let updated = 0;
  const unmatched: string[] = [];
  for (const row of rows) {
    const root = await resolveUserRootHelpdesk(row.username);
    if (!root) {
      unmatched.push(`${row.username}`);
      continue;
    }
    if (!dryRun) {
      await db
        .update(users)
        .set({ helpdeskName: root.name, helpdeskId: root.invgateId })
        .where(eq(users.id, row.id));
    }
    console.log(
      `${dryRun ? "[dry-run] " : ""}${row.username} -> "${root.name}" (invgate_id=${root.invgateId})`,
    );
    updated++;
  }

  console.log(
    `\n${dryRun ? "[DRY-RUN] " : ""}Actualizados: ${updated} de ${rows.length}`,
  );
  if (unmatched.length > 0) {
    console.log(`\nSin match en InvGate (${unmatched.length}):`);
    unmatched.forEach((u) => console.log(`  - ${u}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
  });
