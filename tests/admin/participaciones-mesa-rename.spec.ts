// tests/admin/participaciones-mesa-rename.spec.ts
// I1: el gating de participaciones (UI y accion POST) debe usar la mesa
// canonica via join users.helpdeskId -> mesas.invgateId -> mesas.name.
// users.helpdeskName puede quedar stale cuando mesaSync renombra una mesa:
// la sesion ya usa el join, pero estas dos capas usaban el denormalizado.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents } from "../../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createHmac } from "crypto";
import { setSessionCookie } from "../helpers/auth";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

const MDA_TI = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";
// Simula el nombre denormalizado que quedo viejo tras un rename de la mesa.
const STALE_MDA_TI = "TI_GSM_MDA TI (viejo)";

test.describe("Gating de participaciones con mesa renombrada (join canonico)", () => {
  let adminSession: string;
  let adminId: number;
  let adminCookie: string;
  const createdMesaInvgateIds: number[] = [];
  const createdUserIds: number[] = [];

  let mdaTiInvgateId: number;
  let coordInvgateId: number;

  test.beforeAll(async () => {
    // Asegurar mesas por NOMBRE (invgateId puede variar segun el entorno).
    const desired = [
      { name: MDA_TI, fallbackId: 910001 },
      { name: COORD, fallbackId: 910002 },
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
            assignable: true,
            lastSyncedAt: new Date().toISOString(),
          })
          .onConflictDoNothing();
        createdMesaInvgateIds.push(d.fallbackId);
      }
    }

    const [mda] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI));
    const [coord] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, COORD));
    expect(mda, `mesa ${MDA_TI} disponible`).toBeTruthy();
    expect(coord, `mesa ${COORD} disponible`).toBeTruthy();
    mdaTiInvgateId = mda.invgateId;
    coordInvgateId = coord.invgateId;

    const ts = Date.now();
    adminSession = `sess_rename_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_rename_${ts}`, password: "x", role: "admin" })
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
    if (createdUserIds.length > 0) {
      // Agents primero (identidad por user_id), despues users.
      await db.delete(agents).where(inArray(agents.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db.delete(users).where(eq(users.id, adminId));
    // Solo borrar mesas que este spec creo (nunca mesas reales existentes).
    if (createdMesaInvgateIds.length > 0) {
      await db
        .delete(mesas)
        .where(inArray(mesas.invgateId, createdMesaInvgateIds));
    }
  });

  async function seedUser(
    username: string,
    helpdeskId: number,
    helpdeskName: string,
  ): Promise<number> {
    const [u] = await db
      .insert(users)
      .values({
        username,
        password: "x",
        role: "agent",
        helpdeskId,
        helpdeskName,
      })
      .returning({ id: users.id });
    // Fila de agente vinculada (los chips y el gating de participaciones la usan).
    await db
      .insert(agents)
      .values({ name: username.toUpperCase(), userId: u.id, enCronograma: true })
      .onConflictDoNothing();
    createdUserIds.push(u.id);
    return u.id;
  }

  test("helpdeskName stale + mesa canonica MDA TI: modal con participaciones habilitadas", async ({
    page,
    context,
  }) => {
    const uname = `stale_btn_${Date.now()}`;
    const uid = await seedUser(uname, mdaTiInvgateId, STALE_MDA_TI);

    await setSessionCookie(context, adminCookie);
    await page.goto("/admin/usuarios");
    await expect(
      page.locator(`[data-sort-username="${uname}"]`).first(),
    ).toBeVisible();
    // El join debe resolver la mesa canonica participativa pese al stale name:
    // los toggles del modal unificado quedan habilitados.
    await page.locator(`button[aria-label="Editar usuario ${uname}"]`).click();
    await expect(
      page.locator(`#modal-edit-user-${uid} input[name='enCronograma']`),
    ).toBeEnabled();
  });

  test("POST update-user con helpdeskName stale responde 200", async ({
    context,
  }) => {
    const uname = `stale_post_${Date.now()}`;
    const userId = await seedUser(uname, mdaTiInvgateId, STALE_MDA_TI);
    await setSessionCookie(context, adminCookie);

    // Payload completo del contrato unificado: username/name/rol actuales se
    // devuelven sin cambios (solo varian los flags); la mesa se envia por
    // invgateId y el server resuelve el nombre canonico.
    const [u] = await db
      .select({ username: users.username, role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    const [a] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.userId, userId));
    const baseURL =
      test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "update-user",
          userId: String(userId),
          username: u.username,
          name: a.name,
          newRole: u.role,
          helpdesk: `${mdaTiInvgateId}|${MDA_TI}`,
          enCronograma: "on",
          asignableCubic: "on",
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("helpdeskName participativo pero mesa canonica Coord: sin participaciones editables", async ({
    page,
    context,
  }) => {
    const uname = `fake_part_${Date.now()}`;
    // Denormalizado PARECE participativo, pero helpdeskId apunta a Coord.
    const uid = await seedUser(uname, coordInvgateId, MDA_TI);

    await setSessionCookie(context, adminCookie);
    await page.goto("/admin/usuarios");
    await expect(
      page.locator(`[data-sort-username="${uname}"]`).first(),
    ).toBeVisible();
    await page.locator(`button[aria-label="Editar usuario ${uname}"]`).click();
    // El modal unificado no renderiza switches para mesas sin secciones:
    // el invariante es el bloque informativo y cero checkboxes.
    const block = page.locator(
      `#modal-edit-user-${uid} [data-testid="participaciones-block"]`,
    );
    await expect(block).toBeVisible();
    await expect(block.locator("input[type='checkbox']")).toHaveCount(0);
    await expect(block).toContainText(/no tiene secciones con participaciones/i);
  });

  test("POST update-user con mesa canonica Coord fuerza flags a false", async ({
    context,
  }) => {
    const uname = `fake_post_${Date.now()}`;
    const userId = await seedUser(uname, coordInvgateId, MDA_TI);
    await setSessionCookie(context, adminCookie);

    // El contrato unificado ya no deniega con 400: fuerza los flags a false
    // segun la mesa canonica (join users.helpdeskId -> mesas). El invariante
    // de negocio se preserva: el nombre denormalizado participativo no otorga
    // participaciones cuando la mesa canonica es Coord.
    const [u] = await db
      .select({ username: users.username, role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    const [a] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.userId, userId));
    const baseURL =
      test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "update-user",
          userId: String(userId),
          username: u.username,
          name: a.name,
          newRole: u.role,
          helpdesk: `${coordInvgateId}|${COORD}`,
          enCronograma: "on",
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const [after] = await db
      .select({ enCronograma: agents.enCronograma })
      .from(agents)
      .where(eq(agents.userId, userId));
    expect(after.enCronograma).toBe(false);
  });
});
