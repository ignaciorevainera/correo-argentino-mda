import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { agentSaturdayGroups, saturdayRotationConfig } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "../helpers/auth";

const M31 = { year: 2034, month: 0, prefix: "2034-01" };
const M30 = { year: 2034, month: 3, prefix: "2034-04" };

let user: TestUser;

async function cleanTestMonths(): Promise<void> {
  for (const m of [M31, M30]) {
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

test.describe("Cronograma month logic", () => {
  test("navegar 31→30→volver restaura el día 31 (#275)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    for (const m of [M31, M30]) {
      const res = await page.request.post("/api/cronograma/months", { data: { year: m.year, month: m.month } });
      expect(res.ok()).toBeTruthy();
    }

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#date-input")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

    await page.evaluate((date) => {
      const input = document.getElementById("date-input") as HTMLInputElement;
      input.value = date;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, `${M31.prefix}-31`);

    await page.click("#next-month-btn");
    await expect(page.locator("#date-input")).toHaveValue(`${M30.prefix}-30`);

    await page.click("#prev-month-btn");
    await expect(page.locator("#date-input")).toHaveValue(`${M31.prefix}-31`);
  });

  test("la vista abre en un mes <= hoy, nunca en el más futuro (#139)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const res = await page.request.post("/api/cronograma/months", { data: { year: M31.year, month: M31.month } });
    expect([200, 409]).toContain(res.status());

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#date-input")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

    const value = await page.locator("#date-input").inputValue();
    const ym = value.slice(0, 7);
    const now = new Date();
    const todayYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(ym <= todayYm).toBeTruthy();
  });
});
