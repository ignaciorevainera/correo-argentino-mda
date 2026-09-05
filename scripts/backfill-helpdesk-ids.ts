// scripts/backfill-helpdesk-ids.ts
//
// Completa users.helpdesk_id a partir de users.helpdesk_name, matcheando el
// nombre contra mesas.name. users.helpdesk_id referencia mesas.invgate_id.
//
// Requisito previo: mesas sincronizadas desde InvGate (tab Mesas ->
// "Sincronizar desde InvGate"), porque el match es por nombre.
//
// Uso:
//   npx tsx scripts/backfill-helpdesk-ids.ts             (aplica cambios)
//   npx tsx scripts/backfill-helpdesk-ids.ts --dry-run   (solo reporta)
import { db } from "../src/db/index";
import { users, mesas } from "../src/db/schema";
import { eq, isNull, and, isNotNull } from "drizzle-orm";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      helpdeskName: users.helpdeskName,
    })
    .from(users)
    .where(and(isNull(users.helpdeskId), isNotNull(users.helpdeskName)));

  if (rows.length === 0) {
    console.log("Nada para backfill: no hay usuarios con helpdesk_name sin helpdesk_id.");
    return;
  }

  const mesaByName = new Map(
    (
      await db
        .select({ invgateId: mesas.invgateId, name: mesas.name })
        .from(mesas)
    ).map((m) => [m.name, m.invgateId]),
  );

  let updated = 0;
  const unmatched: string[] = [];
  for (const row of rows) {
    const invgateId = mesaByName.get(row.helpdeskName ?? "");
    if (invgateId == null) {
      unmatched.push(`${row.username} -> "${row.helpdeskName}"`);
      continue;
    }
    if (!dryRun) {
      await db
        .update(users)
        .set({ helpdeskId: invgateId })
        .where(eq(users.id, row.id));
    }
    console.log(
      `${dryRun ? "[dry-run] " : ""}users.id=${row.id} (${row.username}) -> "${row.helpdeskName}" (invgate_id=${invgateId})`,
    );
    updated++;
  }

  console.log(
    `\n${dryRun ? "[DRY-RUN] " : ""}Actualizados: ${updated} de ${rows.length}`,
  );
  if (unmatched.length > 0) {
    console.log(
      `\nSin match en mesas (${unmatched.length}) — sincronizá mesas y volvé a correr:`,
    );
    unmatched.forEach((u) => console.log(`  - ${u}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
  });
