import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents } from "../../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

test.describe("Participaciones por mesa", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;
  const createdUserIds: number[] = [];
  const createdUsernames: string[] = [];

  test.beforeAll(async () => {
    // Asegurar mesas por NOMBRE (invgateId puede variar según el entorno).
    const desired = [
      { name: "TI_GSM_MDA TI", fallbackId: 910001 },
      { name: "TI_GSM_Mesa de Coord", fallbackId: 910002 },
    ];
    for (const d of desired) {
      const [existing] = await db
        .select({ invgateId: mesas.invgateId })
        .from(mesas)
        .where(eq(mesas.name, d.name));
      if (!existing) {
        await db
          .insert(mesas)
          .values({
            invgateId: d.fallbackId,
            name: d.name,
            displayName: null,
            active: true,
            lastSyncedAt: new Date().toISOString(),
          })
          .onConflictDoNothing();
      }
    }

    const ts = Date.now();
    const adminUsername = `admin_partest_${ts}`;
    adminSession = `sess_partest_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({ id: adminSession, userId: adminId, expiresAt: Date.now() + 86400000 });
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

  async function cookieDomain(): Promise<string> {
    // Host-agnostico: deriva el dominio del baseURL del proyecto.
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    return new URL(baseURL).hostname;
  }

  async function baseURL(): Promise<string> {
    return test.info().project.use.baseURL ?? "http://localhost:4321";
  }

  async function seedUser(username: string, role: string, helpdeskName: string | null): Promise<number> {
    const [m] = helpdeskName
      ? await db.select({ invgateId: mesas.invgateId }).from(mesas).where(eq(mesas.name, helpdeskName))
      : [undefined];
    const [u] = await db
      .insert(users)
      .values({ username, password: "x", role, helpdeskId: m?.invgateId ?? null, helpdeskName })
      .returning({ id: users.id });
    // Fila de agente vinculada (los chips y el gating de participaciones la usan).
    await db
      .insert(agents)
      .values({ name: username.toUpperCase(), username, enCronograma: true })
      .onConflictDoNothing();
    createdUserIds.push(u.id);
    createdUsernames.push(username);
    return u.id;
  }

  test("usuario de mesa sin secciones de participación no tiene participaciones editables", async ({ page }) => {
    const uname = `coord_p_${Date.now()}`;
    const uid = await seedUser(uname, "agent", "TI_GSM_Mesa de Coord");
    await page.context().addCookies([
      { name: "session_id", value: adminCookie, domain: await cookieDomain(), path: "/" },
    ]);
    await page.goto(`${await baseURL()}/admin/usuarios`);
    // Esperar contenido del island server:defer (la fila del usuario).
    await expect(page.locator(`[data-sort-username="${uname}"]`).first()).toBeVisible();
    await page.locator(`button[aria-label="Editar usuario ${uname}"]`).click();
    // El modal unificado no renderiza switches para mesas sin secciones:
    // el invariante es el bloque informativo y cero checkboxes.
    const block = page.locator(`#modal-edit-user-${uid} [data-testid="participaciones-block"]`);
    await expect(block).toBeVisible();
    await expect(block.locator("input[type='checkbox']")).toHaveCount(0);
    await expect(block).toContainText(/no tiene secciones con participaciones/i);
  });

  test("supervisor de MDA TI tiene enCronograma deshabilitado en el modal", async ({ page }) => {
    const uname = `sup_p_${Date.now()}`;
    const uid = await seedUser(uname, "supervisor", "TI_GSM_MDA TI");
    await page.context().addCookies([
      { name: "session_id", value: adminCookie, domain: await cookieDomain(), path: "/" },
    ]);
    await page.goto(`${await baseURL()}/admin/usuarios`);
    await expect(page.locator(`[data-sort-username="${uname}"]`).first()).toBeVisible();
    await page.locator(`button[aria-label="Editar usuario ${uname}"]`).click();
    await expect(page.locator(`#modal-edit-user-${uid} input[name='enCronograma']`)).toBeDisabled();
  });

  test("rol supervisor legacy ('Supervisor ') no figura en cronograma al guardar", async ({
    context,
  }) => {
    const uname = `sup_legacy_${Date.now()}`;
    const uid = await seedUser(uname, "Supervisor ", "TI_GSM_MDA TI");
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: await cookieDomain(), path: "/" },
    ]);
    // Contrato unificado `update-user`: payload completo con los valores
    // actuales (rol normalizado a supervisor, username/nombre/mesa de DB) y
    // enCronograma=on para probar el forzado server-side a false.
    const [u] = await db
      .select({ helpdeskId: users.helpdeskId, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.id, uid));
    const [a] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.username, uname));
    const res = await context.request.post(
      `${await baseURL()}/admin/usuarios`,
      {
        form: {
          action: "update-user",
          userId: String(uid),
          username: uname,
          name: a.name,
          newRole: "supervisor",
          helpdesk: `${u.helpdeskId}|${u.helpdeskName}`,
          enCronograma: "on",
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    const [row] = await db
      .select({ enCronograma: agents.enCronograma })
      .from(agents)
      .where(eq(agents.username, uname));
    expect(row.enCronograma).toBe(false);
  });
});
