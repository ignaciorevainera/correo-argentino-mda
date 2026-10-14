import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { agentSaturdayGroups, saturdayRotationConfig } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "../helpers/auth";

const M_AGO = { year: 2034, month: 7, prefix: "2034-08" };
const M_SEP = { year: 2034, month: 8, prefix: "2034-09" };
const M_OCT = { year: 2034, month: 9, prefix: "2034-10" };

let user: TestUser;

async function cleanTestMonths(): Promise<void> {
  for (const m of [M_AGO, M_SEP, M_OCT]) {
    await db.delete(saturdayRotationConfig).where(eq(saturdayRotationConfig.month, m.prefix));
    await db.run(sql`DELETE FROM schedules WHERE date LIKE ${m.prefix + "-%"}`);
    await db.delete(agentSaturdayGroups).where(eq(agentSaturdayGroups.month, m.prefix));
  }
}

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
  await cleanTestMonths();
});

test.afterAll(async () => {
  await cleanTestMonths();
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("Cronograma nav + UI + a11y", () => {
  test("select y flechas comparten altura; la flecha mueve el mismo mes que el select (#140)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    for (const m of [M_AGO, M_SEP]) {
      const res = await page.request.post("/api/cronograma/months", { data: { year: m.year, month: m.month } });
      expect([200, 409]).toContain(res.status());
    }

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#month-selector")).toHaveValue(/^\d{4}-\d{2}-01$/);

    await page.evaluate((date) => {
      const input = document.getElementById("date-input") as HTMLInputElement;
      input.value = date;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, `${M_AGO.prefix}-15`);

    const selectBox = await page.locator("#month-selector").boundingBox();
    const prevBox = await page.locator("#prev-month-btn").boundingBox();
    expect(selectBox).not.toBeNull();
    expect(prevBox).not.toBeNull();
    expect(Math.abs(selectBox!.height - prevBox!.height)).toBeLessThanOrEqual(2);

    await page.click("#next-month-btn");
    await expect(page.locator("#date-input")).toHaveValue(`${M_SEP.prefix}-15`);
    await expect(page.locator("#month-selector")).toHaveValue(`${M_SEP.prefix}-01`);
  });

  test("el modal deshabilita el mes ya cargado; el backend responde 409 (#141)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const res = await page.request.post("/api/cronograma/months", { data: { year: M_OCT.year, month: M_OCT.month } });
    expect([200, 409]).toContain(res.status());

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#month-selector")).toHaveValue(/^\d{4}-\d{2}-01$/);

    await page.click("#add-month-btn");
    await page.waitForSelector("#new-month-modal[open]");
    await page.selectOption("#new-month-year", "2034");
    await expect(page.locator('#new-month-month option[value="9"]')).toBeDisabled();

    const dup = await page.request.post("/api/cronograma/months", { data: { year: 2034, month: 9 } });
    expect(dup.status()).toBe(409);
  });

  test("el menú de edición rápida se cierra con Escape y devuelve el foco (#268)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const res = await page.request.post("/api/cronograma/months", { data: { year: M_AGO.year, month: M_AGO.month } });
    expect([200, 409]).toContain(res.status());

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#month-selector")).toHaveValue(/^\d{4}-\d{2}-01$/);

    await page.evaluate((date) => {
      const input = document.getElementById("date-input") as HTMLInputElement;
      input.value = date;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, `${M_AGO.prefix}-15`);

    await page.click("#toggle-edit-mode-btn");

    const cell = page.locator("[data-monthly-detail]").first();
    await cell.waitFor({ state: "visible" });
    await cell.focus();

    await page.keyboard.press("Shift+F10");
    await expect(page.locator("#quick-edit-menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#quick-edit-menu")).toBeHidden();

    const focusedOnCell = await page.evaluate(
      () => document.activeElement?.hasAttribute("data-monthly-detail") ?? false,
    );
    expect(focusedOnCell).toBeTruthy();
  });
});
