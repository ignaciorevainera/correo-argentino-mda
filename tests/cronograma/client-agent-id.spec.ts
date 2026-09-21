// tests/cronograma/client-agent-id.spec.ts
//
// Plan B2: el cliente del cronograma debe mandar agentId en los edits del
// POST /api/cronograma (B1 ya lo prioriza en el backend). Antes el payload
// solo llevaba agentName. Este test maneja la UI real (modo edición +
// quick-edit) e intercepta el POST para verificar el body.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, schedules, mesas } from "../../src/db/schema";

const SECRET =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const sign = (id: string) =>
  `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

test.describe("el cliente manda agentId", () => {
  let adminCookie = "";
  let agentId = 0;
  let agentName = "";
  const createdUserIds: number[] = [];
  const createdAgentIds: number[] = [];

  test.beforeAll(async () => {
    await db
      .insert(mesas)
      .values({
        invgateId: 910011,
        name: MDA,
        displayName: null,
        active: true,
        lastSyncedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    const [mda] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA));

    const ts = Date.now();
    const [admin] = await db
      .insert(users)
      .values({
        username: `cl_admin_${ts}`,
        password: "x",
        role: "admin",
        helpdeskId: mda.invgateId,
        helpdeskName: MDA,
      })
      .returning({ id: users.id });
    createdUserIds.push(admin.id);
    const sess = `sess_cl_admin_${ts}`;
    await db
      .insert(sessions)
      .values({ id: sess, userId: admin.id, expiresAt: Date.now() + 3600000 });
    adminCookie = sign(sess);

    const [agent] = await db
      .insert(agents)
      .values({
        name: `Cliente Agent ${ts}`,
        username: `cl_agent_${ts}`,
        enCronograma: true,
      })
      .returning({ id: agents.id, name: agents.name });
    agentId = agent.id;
    agentName = agent.name;
    createdAgentIds.push(agentId);
  });

  test.afterAll(async () => {
    if (createdAgentIds.length)
      await db
        .delete(schedules)
        .where(inArray(schedules.agentId, createdAgentIds));
    if (createdAgentIds.length)
      await db.delete(agents).where(inArray(agents.id, createdAgentIds));
    if (createdUserIds.length)
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    if (createdUserIds.length)
      await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  test("guardar un edit del dashboard incluye agentId numérico y agentName", async ({
    context,
    page,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const host = new URL(baseURL).hostname;
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: host, path: "/" },
      {
        name: "session_id",
        value: adminCookie,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);

    let capturedBody: any = null;
    await page.route("**/api/cronograma", async (route) => {
      if (route.request().method() === "POST") {
        capturedBody = route.request().postDataJSON();
      }
      await route.continue();
    });

    await page.goto("/supervision/cronograma");
    await page.waitForSelector("#monthly-table");

    // Aislar la fila del agente sembrado.
    await page.locator("#monthly-search").fill(agentName);
    const cell = page
      .locator(`button[data-monthly-detail][data-operator="${agentName}"]`)
      .first();
    await cell.waitFor({ state: "visible", timeout: 20000 });
    const date = await cell.getAttribute("data-date");
    expect(date).toBeTruthy();

    // Edición real por UI: modo edición -> quick-edit (click derecho) -> estado.
    await page.click("#toggle-edit-mode-btn");
    await page.waitForTimeout(300);
    await cell.click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Licencia"]')
      .click();

    await expect(page.locator("#save-edits-btn")).toBeEnabled();
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/cronograma") && r.request().method() === "POST",
    );
    await page.locator("#save-edits-btn").click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    expect(capturedBody).toBeTruthy();
    expect(Array.isArray(capturedBody.edits)).toBeTruthy();
    const edit = capturedBody.edits.find((e: any) => e.date === date);
    expect(edit).toBeDefined();
    expect(edit.agentName).toBe(agentName);
    expect(edit.agentId).toBe(agentId);
    expect(typeof edit.agentId).toBe("number");
  });
});
