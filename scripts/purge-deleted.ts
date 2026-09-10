import { purgeExpiredDeletedRecords } from "../src/lib/deletedRecords";

const RETENTION_DAYS = 90;

async function main() {
  const result = purgeExpiredDeletedRecords(RETENTION_DAYS);
  console.log(`[purge] Registros marcados como purgados: ${result.marked}`);
  console.log(`[purge] Filas eliminadas físicamente: ${result.deleted}`);
  console.log(`[purge] Retención aplicada: ${RETENTION_DAYS} días`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[purge] Error:", err);
  process.exit(1);
});
