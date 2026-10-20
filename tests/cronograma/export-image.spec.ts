import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { sessions } from "../../src/db/schema";
import { computeFingerprint } from "../../src/lib/sessionFingerprint";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie } from "../helpers/auth";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function readClipboardPngStats(page: Page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((i) => i.types.includes("image/png"));
    if (!item) return { ok: false as const, types: items.flatMap((i) => i.types) };

    const blob = await item.getType("image/png");
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false as const, types: ["no-2d-context"] };

    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bg = { r: data[0], g: data[1], b: data[2] };
    let content = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const differs =
          data[i + 3] > 0 &&
          (Math.abs(data[i] - bg.r) > 12 ||
            Math.abs(data[i + 1] - bg.g) > 12 ||
            Math.abs(data[i + 2] - bg.b) > 12);
        if (differs) {
          content++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      ok: true as const,
      width: canvas.width,
      height: canvas.height,
      contentPixels: content,
      ratio: content / (canvas.width * canvas.height),
      bbox: maxX < 0 ? null : { minX, minY, maxX, maxY },
      dataUrl,
    };
  });
}

test.describe("cronograma — export PNG server-side", () => {
  let userId: number;
  let sessionId: string;

  test.beforeEach(async ({ context }) => {
    const user = await createTestUserAndSession("admin");
    userId = user.userId;
    sessionId = user.sessionId;
    await setSessionCookie(context, user.signedSessionId);
  });

  test.afterEach(async () => {
    await cleanupTestUser(userId, sessionId);
  });

  test("el endpoint devuelve un PNG válido para un mes con formato correcto", async ({ page }) => {
    const res = await page.request.get("/api/cronograma/export.png?month=2026-09");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const body = await res.body();
    expect(body.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(body.readUInt32BE(16)).toBe(2904);
    expect(body.readUInt32BE(20)).toBeGreaterThan(0);
  });

  test("rechaza un mes inválido con 400", async ({ page }) => {
    const res = await page.request.get("/api/cronograma/export.png?month=2026-13");
    expect(res.status()).toBe(400);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("sin sesión no devuelve la imagen", async ({ request }) => {
    const res = await request.get("/api/cronograma/export.png?month=2026-09");
    expect([302, 401]).toContain(res.status());
  });

  test.fixme("el botón Exportar Imagen (PNG) descarga un archivo PNG", async ({ page }) => {
    await page.goto("/supervision/cronograma");
    await page.waitForSelector("#monthly-table");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#export-image-btn");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^cronograma.*\.png$/);
    const filePath = await download.path();
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(filePath);
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  test("copiar la tabla de guardia no muta el card visible durante la captura", async ({ context, page }) => {
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base.replace("localhost", "127.0.0.1")).origin });
    await page.goto("/supervision/cronograma");
    await page.waitForSelector("#monthly-table");
    await page.click("#switch-to-groups-btn");
    await page.waitForSelector("#saturday-rotation-card");
    await page.evaluate(() => {
      const card = document.getElementById("saturday-rotation-card");
      (window as unknown as { __cardClassChanges: string[] }).__cardClassChanges = [];
      if (!card) return;
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "attributes" && m.attributeName === "class") {
            (window as unknown as { __cardClassChanges: string[] }).__cardClassChanges.push(`${m.oldValue ?? ""}=>${card.getAttribute("class") ?? ""}`);
          }
        }
      }).observe(card, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    });
    await page.click("#copy-rotation-image-btn");
    await expect(page.locator("#copy-rotation-image-btn")).toHaveClass(/btn-success/, { timeout: 5000 });
    await page.waitForTimeout(1500);
    const changes = await page.evaluate(() => (window as unknown as { __cardClassChanges: string[] }).__cardClassChanges);
    expect(changes.some((c) => c.includes("exporting-image"))).toBe(false);
    await expect(page.locator("#copy-rotation-image-btn")).toBeVisible();
  });

  test("copiar guardia y horas extras produce imágenes con contenido (no en blanco)", async ({ context, page }) => {
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base.replace("localhost", "127.0.0.1")).origin });
    await page.goto("/supervision/cronograma");
    await page.waitForSelector("#monthly-table");

    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("test-results", { recursive: true });

    const check = async (label: string, button: string, switchTo: string, card: string) => {
      await page.click(switchTo);
      await page.waitForSelector(card);
      await page.click(button);
      await expect(page.locator(button)).toHaveClass(/btn-success/, { timeout: 5000 });
      const stats = await readClipboardPngStats(page);
      if (stats.ok) {
        writeFileSync(
          `test-results/copied-${label}.png`,
          Buffer.from(stats.dataUrl.split(",")[1] ?? "", "base64"),
        );
      }
      console.log(
        `clipboard ${label}:`,
        JSON.stringify(
          stats.ok
            ? { width: stats.width, height: stats.height, ratio: stats.ratio, bbox: stats.bbox }
            : stats,
        ),
      );
      expect(stats.ok).toBe(true);
      if (!stats.ok) return;
      expect(stats.width).toBeGreaterThan(0);
      expect(stats.height).toBeGreaterThan(0);
      expect(stats.ratio).toBeGreaterThan(0.01);
      expect(stats.bbox).not.toBeNull();
      if (!stats.bbox) return;
      expect(stats.bbox.maxX).toBeLessThanOrEqual(stats.width - 1);
      expect(stats.bbox.maxY).toBeLessThanOrEqual(stats.height - 1);
      expect(stats.bbox.minX).toBeLessThan(stats.width * 0.5);
    };

    await check("guardia", "#copy-rotation-image-btn", "#switch-to-groups-btn", "#saturday-rotation-card");
    await check("horas-extras", "#copy-overtime-image-btn", "#switch-to-overtime-btn", "#overtime-card");
  });

  test("exportar la imagen no invalida la sesión con fingerprint de User-Agent", async ({ page }) => {
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await db
      .update(sessions)
      .set({ fingerprint: computeFingerprint(userAgent) })
      .where(eq(sessions.id, sessionId));

    await page.goto("/supervision/cronograma");
    await page.waitForSelector("#monthly-table");

    const downloadPromise = page.waitForEvent("download");
    await page.click("#export-image-btn");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^cronograma.*\.png$/);

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#monthly-table")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/supervision/cronograma");
  });
});
