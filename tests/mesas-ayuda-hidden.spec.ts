import "dotenv/config";
import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type Route,
} from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";
import { db } from "../src/db/index";
import { hiddenHelpdesks } from "../src/db/schema";
import { eq } from "drizzle-orm";

let adminUser: TestUser;
let agentUser: TestUser;

async function getFirstVisibleCardId(page: Page): Promise<number> {
  await page.goto("/mesas-de-ayuda");
  const card = page
    .locator('[data-card-for]:not([data-hidden="true"])')
    .first();
  await expect(card).toBeVisible();
  const id = Number(await card.getAttribute("data-card-for"));
  expect(Number.isInteger(id) && id > 0).toBeTruthy();
  return id;
}

async function unHideByDb(invgateId: number): Promise<void> {
  await db
    .delete(hiddenHelpdesks)
    .where(eq(hiddenHelpdesks.invgateId, invgateId));
}

async function blockMembersApi(target: Page | BrowserContext): Promise<void> {
  await target.route("**/api/invgate/helpdesk-members*", (route: Route) =>
    route.abort(),
  );
}

test.beforeAll(async () => {
  adminUser = await createTestUserAndSession("admin");
  agentUser = await createTestUserAndSession("agent");
});

test.afterAll(async () => {
  await cleanupTestUser(adminUser.userId, adminUser.sessionId);
  await cleanupTestUser(agentUser.userId, agentUser.sessionId);
});

test.beforeEach(async ({ context }) => {
  await setSessionCookie(context, adminUser.signedSessionId);
  await blockMembersApi(context);
});

test("Admin oculta y muestra una mesa por API (persistencia)", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, adminUser.signedSessionId);
  const id = await getFirstVisibleCardId(page);

  const hideResp = await page.request.post("/api/soportes/helpdesks/hide", {
    data: { invgate_id: id },
  });
  expect(hideResp.status()).toBe(200);
  expect(await hideResp.json()).toEqual({ ok: true });

  const rows = await db
    .select()
    .from(hiddenHelpdesks)
    .where(eq(hiddenHelpdesks.invgateId, id));
  expect(rows).toHaveLength(1);

  const showResp = await page.request.post("/api/soportes/helpdesks/show", {
    data: { invgate_id: id },
  });
  expect(showResp.status()).toBe(200);

  const after = await db
    .select()
    .from(hiddenHelpdesks)
    .where(eq(hiddenHelpdesks.invgateId, id));
  expect(after).toHaveLength(0);
});

test("Agente no puede ocultar ni mostrar mesas", async ({ page, context }) => {
  await setSessionCookie(context, agentUser.signedSessionId);
  const id = await getFirstVisibleCardId(page);

  const hideResp = await page.request.post("/api/soportes/helpdesks/hide", {
    data: { invgate_id: id },
  });
  expect(hideResp.status()).toBe(403);

  const showResp = await page.request.post("/api/soportes/helpdesks/show", {
    data: { invgate_id: id },
  });
  expect(showResp.status()).toBe(403);
});

test("Admin oculta una mesa desde la UI y la ve en el menu de ocultas", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, adminUser.signedSessionId);
  const id = await getFirstVisibleCardId(page);

  const card = page.locator(`[data-card-for="${id}"]`);
  await expect(card).toBeVisible();

  await card.locator("[data-hide-helpdesk]").click();
  await expect(page.locator(`[data-card-for="${id}"]`)).toHaveCount(0);

  const toggle = page.locator("#toggle-hidden");
  await expect(toggle).toBeVisible();
  await toggle.click();

  const hiddenCard = page.locator(
    `[data-card-for="${id}"][data-hidden="true"]`,
  );
  await expect(hiddenCard).toBeVisible();
  await expect(hiddenCard.getByText("Oculta")).toBeVisible();
  await expect(hiddenCard.locator("[data-show-helpdesk]")).toBeVisible();

  await hiddenCard.locator("[data-show-helpdesk]").click();
  await expect(
    page.locator(`[data-card-for="${id}"]:not([data-hidden="true"])`),
  ).toBeVisible();

  await unHideByDb(id);
});

test("Agente no ve mesas ocultas ni el menu de ocultas", async ({
  page,
  context,
  browser,
}) => {
  const adminReq = await test.request.newContext({
    baseURL: "http://127.0.0.1:4321",
    extraHTTPHeaders: { Cookie: `session_id=${adminUser.signedSessionId}` },
  });
  const agentCtx = await browser.newContext({
    baseURL: "http://127.0.0.1:4321",
  });
  await setSessionCookie(agentCtx, agentUser.signedSessionId);
  await blockMembersApi(agentCtx);

  await setSessionCookie(context, adminUser.signedSessionId);
  const id = await getFirstVisibleCardId(page);

  const hideResp = await adminReq.post("/api/soportes/helpdesks/hide", {
    data: { invgate_id: id },
  });
  expect(hideResp.status()).toBe(200);

  const agentPage = await agentCtx.newPage();
  await agentPage.goto("/mesas-de-ayuda");

  await expect(agentPage.locator(`[data-card-for="${id}"]`)).toHaveCount(0);
  await expect(agentPage.locator("#toggle-hidden")).toHaveCount(0);

  await agentCtx.close();
  await adminReq.dispose();
  await unHideByDb(id);
});
