import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, routeAccess, permissionAuditBatches } from "../../src/db/schema";
import { eq, and } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

const HOST = "http://localhost:4321";

test.describe("Admin Permisos y Accesos", () => {
  let adminCookie: string;
  let agentCookie: string;
  let adminUsername: string;
  let agentUsername: string;
  let adminSession: string;
  let agentSession: string;
  let adminId: number;
  let agentId: number;
  let testMesaId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    adminUsername = `admin_perm_test_${ts}`;
    agentUsername = `agent_perm_test_${ts}`;
    adminSession = `perm-admin-${ts}`;
    agentSession = `perm-agent-${ts}`;

    const [au] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
      .returning({ id: users.id });
    const [gu] = await db
      .insert(users)
      .values({ username: agentUsername, password: "x", role: "agent" })
      .returning({ id: users.id });
    adminId = au.id;
    agentId = gu.id;

    await db.insert(sessions).values({ id: adminSession, userId: adminId, expiresAt: Date.now() + 86400000 });
    await db.insert(sessions).values({ id: agentSession, userId: agentId, expiresAt: Date.now() + 86400000 });
    adminCookie = sign(adminSession);
    agentCookie = sign(agentSession);

    const [m] = await db
      .insert(mesas)
      .values({
        invgateId: 990000 + (ts % 1000),
        name: `PERM_TEST_MESA_${ts}`,
        active: true,
        lastSyncedAt: new Date().toISOString(),
      })
      .returning({ id: mesas.id });
    testMesaId = m.id;
  });

  test.afterAll(async () => {
    await db.delete(routeAccess).where(eq(routeAccess.mesaId, testMesaId));
    await db.delete(permissionAuditBatches).where(eq(permissionAuditBatches.adminUsername, adminUsername));
    await db.delete(mesas).where(eq(mesas.id, testMesaId));
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    await db.delete(sessions).where(eq(sessions.id, agentSession));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, agentId));
  });

  test("admin puede acceder a /admin/permisos", async ({ page, context }) => {
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto(`${HOST}/admin/permisos`);
    await expect(page).not.toHaveURL(`${HOST}/`);
    await expect(page.locator("#global-toast-container")).not.toContainText("Acceso no autorizado");
  });

  test("agente es redirigido desde /admin/permisos", async ({ page, context }) => {
    await context.addCookies([
      { name: "session_id", value: agentCookie, domain: "localhost", path: "/" },
    ]);
    await page.goto(`${HOST}/admin/permisos`);
    await expect(page).toHaveURL(`${HOST}/`);
    await expect(page.locator("#global-toast-container")).toContainText("Acceso no autorizado");
  });

  test("GET /api/admin/permisos/data requiere admin", async ({ request }) => {
    const denied = await request.get(`${HOST}/api/admin/permisos/data`, {
      headers: { cookie: `session_id=${agentCookie}` },
    });
    expect(denied.status()).toBe(403);

    const allowed = await request.get(`${HOST}/api/admin/permisos/data`, {
      headers: { cookie: `session_id=${adminCookie}` },
    });
    expect(allowed.status()).toBe(200);
    const json = await allowed.json();
    expect(Array.isArray(json.routes)).toBe(true);
    expect(Array.isArray(json.modules)).toBe(true);
    expect(Array.isArray(json.mesas)).toBe(true);
  });

  test("admin guarda cambio de ruta via API y escribe auditoria", async ({ request }) => {
    const res = await request.post(`${HOST}/api/admin/permisos/routes`, {
      headers: { cookie: `session_id=${adminCookie}`, "Content-Type": "application/json" },
      data: {
        changes: [{ routeId: 1, role: "supervisor", mesaId: testMesaId, allowed: false }],
      },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.changedCells).toBe(1);

    const [row] = await db
      .select()
      .from(routeAccess)
      .where(
        and(
          eq(routeAccess.routeId, 1),
          eq(routeAccess.role, "supervisor"),
          eq(routeAccess.mesaId, testMesaId),
        ),
      );
    expect(row).toBeTruthy();
    expect(row!.allowed).toBe(false);

    const batches = await db
      .select()
      .from(permissionAuditBatches)
      .where(eq(permissionAuditBatches.adminUsername, adminUsername));
    expect(batches.length).toBeGreaterThan(0);
    const last = batches[batches.length - 1];
    const summary = JSON.parse(last.summary);
    expect(Array.isArray(summary)).toBe(true);
    expect(summary[0]).toHaveProperty("type", "route");
  });
});
