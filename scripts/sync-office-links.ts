import "dotenv/config";
import { syncOfficeInvgateLinks } from "../src/lib/invgate/officeLinkSync";

async function main(): Promise<void> {
  console.log(`[sync-office-links] Iniciando sincronización programada: ${new Date().toISOString()}`);

  try {
    const result = await syncOfficeInvgateLinks();

    if (!result.ok) {
      console.error(`[sync-office-links] Error: ${result.error}`);
      process.exit(1);
    }

    console.log(
      `[sync-office-links] Sincronización completada. ` +
      `Matched: ${result.matched}, Duplicados: ${result.duplicatesFound}`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[sync-office-links] Error: ${msg}`);
    process.exit(1);
  }
}

main();
