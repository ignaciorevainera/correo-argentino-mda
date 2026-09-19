// tests/admin/usuarios-banner-sin-mesa.spec.ts
// F3: reporte de usuarios SIN mesa de ayuda en /admin/usuarios.
// Los usuarios con users.helpdeskId NULL quedan fail-closed (solo páginas
// comunes) y deben aparecer en un banner visible para el admin.
import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents } from "../../src/db/schema";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

const MDA_TI = "TI_GSM_MDA TI";

async function login(context: BrowserContext, signedSessionId: string): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
  await context.addCookies([
    {
      name: "session_id",
      value: signedSessionId,
      domain: new URL(baseURL).hostname,
      path: "/",
    },
  ]);
}

test.describe("Banner de usuarios sin mesa de ayuda", () => {
  let adminSession: string;
  let adminId: number;
  let adminCookie: string;
  const createdUserIds: number[] = [];
  const createdUsernames: string[] = [];

  test.beforeAll(async () => {
    const [existing] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI));
    if (!existing) {
      await db
        .insert(mesas)
        .values({
          invgateId: 910001,
          name: MDA_TI,
          displayName: null,
          active: true,
          lastSyncedAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
    } else {
      await db.update(mesas).set({ active: true }).where(eq(mesas.name, MDA_TI));
    }

    const ts = Date.now();
    adminSession = `sess_sinmesa_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_sinmesa_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({
      id: adminSession,
      userId: adminId,
      expiresAt: Date.now() + 86400000,
    });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    for (const uname of createdUsernames) {
      await db.delete(agents).where(eq(agents.username, uname));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function seedUserSinMesa(username: string, role: string): Promise<number> {
    const [u] = await db
      .insert(users)
      .values({ username, password: "x", role, helpdeskId: null, helpdeskName: null })
      .returning({ id: users.id });
    // Fila de agente: hace significativo el guard de "sin participaciones".
    await db
      .insert(agents)
      .values({ name: username.toUpperCase(), username, enCronograma: true })
      .onConflictDoNothing();
    createdUserIds.push(u.id);
    createdUsernames.push(username);
    return u.id;
  }

  test("lista a los usuarios sin mesa en el banner", async ({ page }) => {
    const ts = Date.now();
    // Prefijo "0": el banner acota el listado a los primeros 20 por username;
    // estos nombres ordenan antes que los reales para ser deterministas.
    const unameA = `0sinmesa_a_${ts}`;
    const unameB = `0sinmesa_b_${ts}`;
    await seedUserSinMesa(unameA, "agent");
    await seedUserSinMesa(unameB, "agent");

    await login(page.context(), adminCookie);
    await page.goto("/admin/usuarios");

    const banner = page.getByTestId("banner-sin-mesa");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(unameA);
    await expect(banner).toContainText(unameB);
    await expect(banner).toContainText("sin mesa de ayuda asignada");

    // El conteo del banner debe reflejar la cantidad real de usuarios sin mesa.
    const sinMesa = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(isNull(users.helpdeskId));
    const shown = sinMesa.length > 20 ? 20 : sinMesa.length;
    await expect(banner).toContainText(String(sinMesa.length));
    if (shown < sinMesa.length) {
      await expect(banner).toContainText(`y ${sinMesa.length - shown} más`);
    }
  });

  test("usuario sin mesa no tiene sección de participaciones", async ({ page }) => {
    const uname = `0sinmesa_guard_${Date.now()}`;
    await seedUserSinMesa(uname, "agent");

    await login(page.context(), adminCookie);
    await page.goto("/admin/usuarios");
    await expect(page.locator(`[data-sort-username="${uname}"]`).first()).toBeVisible();
    await expect(
      page.locator(`button[aria-label="Participaciones de ${uname}"]`),
    ).toHaveCount(0);
  });

  test("asignar mesa lo saca del banner", async ({ page, context }) => {
    const ts = Date.now();
    const unameMove = `0sinmesa_move_${ts}`;
    const unameStay = `0sinmesa_stay_${ts}`;
    const userIdMove = await seedUserSinMesa(unameMove, "agent");
    await seedUserSinMesa(unameStay, "agent");

    await login(context, adminCookie);

    const [mesaTi] = await db
      .select({ invgateId: mesas.invgateId, name: mesas.name })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI));
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "change-role",
          userId: String(userIdMove),
          newRole: "agent",
          helpdesk: `${mesaTi.invgateId}|${mesaTi.name}`,
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);

    await page.goto("/admin/usuarios");
    const banner = page.getByTestId("banner-sin-mesa");
    // El que recibió mesa sale; el otro permanece listado.
    await expect(banner).toContainText(unameStay);
    await expect(banner).not.toContainText(unameMove);

    const [stillNull] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userIdMove), isNull(users.helpdeskId)));
    expect(stillNull).toBeUndefined();
  });
});
