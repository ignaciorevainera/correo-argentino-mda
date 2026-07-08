import "dotenv/config";

function getEnv(key: string): string {
  return process.env[key] || "";
}

async function main(): Promise<void> {
  const internalKey = getEnv("SYNC_INTERNAL_KEY");
  const appBaseUrl = "http://localhost:4321";

  if (!internalKey) {
    console.error("[sync-office-links] SYNC_INTERNAL_KEY no configurada.");
    process.exit(1);
  }

  console.log(`[sync-office-links] Iniciando sincronización programada: ${new Date().toISOString()}`);

  try {
    const response = await fetch(
      `${appBaseUrl}/mda/api/admin/invgate/locations/sync`,
      {
        method: "GET",
        headers: {
          "X-Internal-Key": internalKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error(`[sync-office-links] Error HTTP ${response.status}: ${body}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log(
      `[sync-office-links] Sincronización completada. ` +
      `Matched: ${result.matched}, Duplicados: ${result.duplicatesFound}`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[sync-office-links] Error de red: ${msg}`);
    process.exit(1);
  }
}

main();
