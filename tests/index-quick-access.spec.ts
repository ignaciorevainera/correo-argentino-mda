// tests/index-quick-access.spec.ts
//
// El panel del index debe mostrar SOLO accesos permitidos (rol + mesa) y
// ocultarlos (no deshabilitarlos) cuando no hay acceso.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import { users, sessions, mesas, agents } from "../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";

function sign(id: string): string {
  return `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;
}

async function login(context: any, sessionId: string): Promise<void> {
  const base = test.info().project.use.baseURL ?? "http://localhost:4321";
  await context.addCookies([
    { name: "session_id", value: sign(sessionId), domain: new URL(base).hostname, path: "/" },
  ]);
}

// Tarjetas del panel principal (excluye links del sidebar): usan "Abrir <title>".
const card = (page: any, title: RegExp) => page.getByRole("link", { name: title });

test.describe("Index: accesos visibles segun rol y mesa", () => {
  let adminId = 0;
  let adminSess = "";
  const createdUserIds: number[] = [];
  const createdSessions: string[] = [];
  const createdUsernames: string[] = [];

  test.beforeAll(async () => {
    await db
      .insert(mesas)
      .values([
        { invgateId: 910010, name: MDA, displayName: null, active: true, lastSyncedAt: new Date().toISOString() },
        { invgateId: 910011, name: COORD, displayName: null, active: true, lastSyncedAt: new Date().toISOString() },
      ])
      .onConflictDoNothing();

    const ts = Date.now();
    const [admin] = await db
      .insert(users)
      .values({ username: `idx_admin_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = admin.id;
    adminSess = `sess_idx_admin_${ts}`;
    await db.insert(sessions).values({ id: adminSess, userId: adminId, expiresAt: Date.now() + 86400000 });
    createdSessions.push(adminSess);
  });

  test.afterAll(async () => {
    for (const s of createdSessions) await db.delete(sessions).where(eq(sessions.id, s));
    for (const uname of createdUsernames) await db.delete(agents).where(eq(agents.username, uname));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function seedUser(role: string, helpdeskName: string | null): Promise<{ sess: string; uname: string }> {
    const uname = `idx_${role}_${Date.now()}`;
    const [m] = helpdeskName
      ? await db.select({ invgateId: mesas.invgateId }).from(mesas).where(eq(mesas.name, helpdeskName))
      : [undefined];
    const [u] = await db
      .insert(users)
      .values({ username: uname, password: "x", role, helpdeskId: m?.invgateId ?? null, helpdeskName })
      .returning({ id: users.id });
    const sess = `sess_${uname}`;
    await db.insert(sessions).values({ id: sess, userId: u.id, expiresAt: Date.now() + 86400000 });
    createdUserIds.push(u.id);
    createdSessions.push(sess);
    createdUsernames.push(uname);
    return { sess, uname };
  }

  test("Coordinacion/agent NO ve accesos no permitidos por rol/mesa (Inventario/App admin)", async ({ context, page }) => {
    const { sess } = await seedUser("agent", COORD);
    await login(context, sess);
    await page.goto("/");

    await expect(page.locator('[aria-label$="(Restringido)"]')).toHaveCount(0);
    // Tarjeta de Cronograma del panel (aria-label "Abrir Cronograma") ausente.
    await expect(card(page, /^Abrir Cronograma$/i)).toHaveCount(0);
    await expect(card(page, /^Abrir Calidad$/i)).toHaveCount(0);
    // Inventario de terminales: agent de Coordinación no tiene acceso a cubics;
    // el card NO debe figurar (ni bloqueado).
    await expect(card(page, /^Abrir Inventario de terminales$/i)).toHaveCount(0);
    // Comunes permitidos.
    await expect(card(page, /^Abrir Títulos$/i)).toBeVisible();
    await expect(card(page, /^Abrir Contactos$/i)).toBeVisible();
  });

  test("MDA TI/team_leader ve Supervisión (tarjeta Cronograma) y sin restringidos", async ({ context, page }) => {
    const { sess } = await seedUser("team_leader", MDA);
    await login(context, sess);
    await page.goto("/");
    await expect(card(page, /^Abrir Cronograma$/i)).toBeVisible();
    await expect(page.locator('[aria-label$="(Restringido)"]')).toHaveCount(0);
  });

  test("admin ve accesos comunes sin restringidos visibles", async ({ context, page }) => {
    await login(context, adminSess);
    await page.goto("/");
    await expect(page.locator('[aria-label$="(Restringido)"]')).toHaveCount(0);
    await expect(card(page, /^Abrir Títulos$/i)).toBeVisible();
  });
});
