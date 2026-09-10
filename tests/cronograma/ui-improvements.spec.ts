import "dotenv/config";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

let adminUserId: number;
let adminSessionId: string;

async function loginAsAdmin(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: "session_id",
      value: signSessionId(adminSessionId),
      domain: "127.0.0.1",
      path: "/",
    },
    {
      name: "session_id",
      value: signSessionId(adminSessionId),
      domain: "localhost",
      path: "/",
    },
  ]);
}

async function gotoCronograma(page: Page): Promise<void> {
  await page.goto("/supervision/cronograma");
  await page.waitForSelector("#monthly-table");
}

test.beforeAll(async () => {
  const username = `ui_improvements_admin_${Date.now()}`;
  adminSessionId = `ui_improvements_session_${Date.now()}`;

  const [{ id }] = await db
    .insert(users)
    .values({
      username,
      password: "hashed_fake_password",
      role: "admin",
    })
    .returning({ id: users.id });
  adminUserId = id;

  await db.insert(sessions).values({
    id: adminSessionId,
    userId: adminUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
});

test.afterAll(async () => {
  await db.delete(sessions).where(eq(sessions.id, adminSessionId));
  await db.delete(users).where(eq(users.id, adminUserId));
});

test.describe("Cronograma UI improvements", () => {
  test("tab switching does not move the view-switcher", async ({
    context,
    page,
  }) => {
    await loginAsAdmin(context);
    await gotoCronograma(page);

    const switcher = page.locator("#view-switcher");
    const before = await switcher.boundingBox();
    expect(before).not.toBeNull();

    await page.click("#switch-to-daily-btn");
    await page.waitForTimeout(700);
    const afterDaily = await switcher.boundingBox();

    await page.click("#switch-to-monthly-btn");
    await page.waitForTimeout(700);
    const afterMonthly = await switcher.boundingBox();

    expect(afterDaily).not.toBeNull();
    expect(afterMonthly).not.toBeNull();
    expect(Math.abs(afterDaily!.x - before!.x)).toBeLessThan(3);
    expect(Math.abs(afterDaily!.y - before!.y)).toBeLessThan(3);
    expect(Math.abs(afterMonthly!.x - before!.x)).toBeLessThan(3);
    expect(Math.abs(afterMonthly!.y - before!.y)).toBeLessThan(3);
  });

  test("coverage summary tfoot stays pinned to card bottom when filter empties rows", async ({
    context,
    page,
  }) => {
    await loginAsAdmin(context);
    await gotoCronograma(page);

    // SearchBar renders <input id="monthly-search"> directly
    const search = page.locator("#monthly-search");
    await search.fill("zzzzz-sin-resultados");
    await page.waitForTimeout(500);

    const tfoot = page.locator("#monthly-tfoot");
    const scrollArea = page
      .locator("#monthly-view .overflow-y-auto")
      .first();
    const tf = await tfoot.boundingBox();
    const sa = await scrollArea.boundingBox();
    expect(tf).not.toBeNull();
    expect(sa).not.toBeNull();

    // tfoot bottom edge should be near scroll-area bottom (within 60px), not right after last row
    expect(sa!.y + sa!.height - (tf!.y + tf!.height)).toBeLessThan(60);

    await search.fill("");
  });

  test("overtime bar hours are non-selectable", async ({ context, page }) => {
    await loginAsAdmin(context);
    await gotoCronograma(page);

    await page.click("#switch-to-overtime-btn");
    await page.waitForSelector("#overtime-timeline-wrapper");

    const bar = page.locator(".overtime-timeline-bar span").first();
    try {
      await bar.waitFor({ state: "visible", timeout: 5000 });
    } catch {
      test.skip(true, "No overtime shifts in DB to render bars");
      return;
    }

    const userSelect = await bar.evaluate(
      (el) => getComputedStyle(el).userSelect,
    );
    expect(userSelect).toBe("none");
  });

  test("both copy buttons share btn-secondary ActionButton style", async ({
    context,
    page,
  }) => {
    await loginAsAdmin(context);
    await gotoCronograma(page);

    // Rotation copy button lives in Grupos view (saturday-rotation-card)
    await page.click("#switch-to-groups-btn");
    await page.waitForSelector("#saturday-rotation-card");
    await expect(page.locator("#copy-rotation-image-btn")).toHaveClass(
      /btn-secondary/,
    );

    // Overtime copy button lives in Extras view
    await page.click("#switch-to-overtime-btn");
    await page.waitForSelector("#overtime-view:not(.hidden)");
    await expect(page.locator("#copy-overtime-image-btn")).toHaveClass(
      /btn-secondary/,
    );
  });
});
