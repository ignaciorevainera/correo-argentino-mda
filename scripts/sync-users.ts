import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/db/index";
import { employees } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { chromium } from "playwright";
import "dotenv/config";

const MIDPOINT_URL = "https://cdc.correoargentino.com.ar";
const LOGIN_URL = `${MIDPOINT_URL}/midpoint/login`;
const USERS_TABLE_URL = `${MIDPOINT_URL}/midpoint/admin/users`;

const MIDPOINT_USER = process.env.MIDPOINT_USER || "helpdesk";
const MIDPOINT_PASS = process.env.MIDPOINT_PASS || "";

const STATUS_PATH = resolve("src/data/last-sync-users-status.json");

async function writeSyncStatus(status: "success" | "error", errorDetail: string | null = null): Promise<void> {
  const data = {
    lastExecution: new Date().toISOString(),
    status,
    error: errorDetail,
  };
  try {
    await writeFile(STATUS_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[SyncUsers] Error al escribir el archivo de estado:", err);
  }
}

async function syncUsers(): Promise<void> {
  const startTime = new Date();
  console.log(`[SyncUsers] Sincronización iniciada: ${startTime.toISOString()}`);

  // Load already-processed usernames from SQLite for resumability
  const existingUsers = await db
    .select({ username: employees.username })
    .from(employees);
  const processedUsernames = new Set(existingUsers.map((u) => u.username));
  console.log(`[SyncUsers] Usuarios existentes en BD: ${processedUsernames.size}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login to MidPoint
    console.log("[SyncUsers] Navegando a la página de login...");
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

    await page.fill('input[name="username"]', MIDPOINT_USER);
    await page.fill('input[name="password"]', MIDPOINT_PASS);
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 30000 });
    console.log("[SyncUsers] Login completado.");

    // Navigate to users table
    console.log("[SyncUsers] Navegando a la tabla de usuarios...");
    await page.goto(USERS_TABLE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("td.name-min-width", { timeout: 30000 });
    console.log("[SyncUsers] Tabla de usuarios detectada.");

    let totalProcessed = 0;
    let totalDeleted = 0;
    let pageNum = 1;

    while (true) {
      console.log(`[SyncUsers] --- Procesando página ${pageNum} ---`);

      const rows = page.locator("tbody tr");
      const rowCount = await rows.count();
      console.log(`[SyncUsers] Filas encontradas en página ${pageNum}: ${rowCount}`);

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);

        // Check if user is disabled
        const disabledIcon = row.locator(
          'td.composited-icon [title*="deshabilitado"], td.composited-icon i.fa-ban.red'
        );
        const isDisabled = (await disabledIcon.count()) > 0;

        const linkEl = row.locator("td.name-min-width a");
        const linkCount = await linkEl.count();

        if (linkCount === 0) continue;

        const username = (await linkEl.innerText()).trim();

        if (isDisabled) {
          // Delete disabled user from SQLite
          await db.delete(employees)
            .where(eq(employees.username, username));
          totalDeleted++;
          console.log(`[SyncUsers] Eliminado (inhabilitado): ${username}`);
          continue;
        }

        // Skip if already processed (resumability)
        if (processedUsernames.has(username)) continue;

        // Visit user profile page
        const href = await linkEl.getAttribute("href");
        if (!href) continue;
        const profileUrl = new URL(href, page.url()).toString();

        const profilePage = await context.newPage();
        try {
          await profilePage.goto(profileUrl, { waitUntil: "domcontentloaded" });

          const data = await profilePage.evaluate(() => {
            const result: { doc: string | null; fullName: string | null } = {
              doc: null,
              fullName: null,
            };
            const rows = document.querySelectorAll(".prism-property");
            for (const row of rows) {
              const label = row.querySelector(".prism-property-label");
              if (!label) continue;
              const text = (label as HTMLElement).innerText;
              const val = row.querySelector(".prism-property-value");
              const valText = val ? (val as HTMLElement).innerText.trim() : null;

              if (text.includes("Número de documento")) {
                result.doc = valText;
              } else if (text.includes("Nombre completo")) {
                result.fullName = valText;
              }
            }
            return result;
          });

          const docNumber = data.doc ? data.doc.replace(/\s+/g, "") : null;
          const fullName = data.fullName || "Desconocido";

          if (docNumber) {
            await db
              .insert(employees)
              .values({
                dni: docNumber,
                username,
                fullname: fullName,
              })
              .onConflictDoUpdate({
                target: employees.dni,
                set: {
                  username,
                  fullname: fullName,
                  updatedAt: sql`(CURRENT_TIMESTAMP)`,
                },
              });

            processedUsernames.add(username);
            totalProcessed++;
            console.log(`[SyncUsers] Guardado: ${username} -> ${fullName}`);
          } else {
            console.log(`[SyncUsers] Sin documento para: ${username}`);
          }
        } finally {
          await profilePage.close();
        }

        // Small delay between profiles
        await new Promise((r) => setTimeout(r, 300));
      }

      // Check for next page
      const nextBtn = page.locator("xpath=//a[contains(@class, 'page-link') and normalize-space()='>']");
      const nextBtnCount = await nextBtn.count();

      if (nextBtnCount === 0) {
        console.log("[SyncUsers] No hay botón siguiente. Fin.");
        break;
      }

      const isDisabled = await nextBtn.evaluate(
        (node) => node.parentElement?.classList.contains("disabled") ?? false
      );

      if (isDisabled) {
        console.log("[SyncUsers] Última página alcanzada. Fin.");
        break;
      }

      await nextBtn.click();
      await new Promise((r) => setTimeout(r, 3500));
      pageNum++;
    }

    const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(2);
    console.log(
      `[SyncUsers] Sincronización finalizada en ${elapsed}s. ` +
      `Procesados: ${totalProcessed}, Eliminados: ${totalDeleted}`
    );

    await writeSyncStatus("success");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[SyncUsers] Error crítico:", errorMsg);
    await writeSyncStatus("error", errorMsg);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

try {
  await syncUsers();
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error("[SyncUsers] Error crítico (top-level):", errorMsg);
  await writeSyncStatus("error", errorMsg);
  process.exit(1);
}
