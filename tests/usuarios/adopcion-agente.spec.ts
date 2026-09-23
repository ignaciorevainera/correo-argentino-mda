// tests/usuarios/adopcion-agente.spec.ts
// Task 4 (Plan B): el alta en el ABM adopta un shell huérfano de `agents`
// (sin user_id) cuando el nombre visible coincide case-insensitive, en vez de
// insertar una fila nueva. La fila conserva su id, por lo que el historial
// (schedules vinculados por agentId) sobrevive a la adopción.
import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, agents, schedules, mesas } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { setSessionCookie, signSessionId } from "../helpers/auth";
import { randomUUID } from "crypto";

const MDA_TI_MESA = "TI_GSM_MDA TI";
const VALID_PASSWORD = "CambiarEst0!Clave";
const SHELL_NAME = "ADOPTED SHELL"; // shell huérfano sembrado en DB
const FORM_NAME = "Adopted Shell"; // case-variant cargado en el form de alta

interface AdminTestContext {
  adminSessionId: string;
  adminUserId: number;
}

async function setupAdmin(context: BrowserContext): Promise<AdminTestContext> {
  const suffix = randomUUID();
  const adminSessionId = `e2e_adopt_session_${suffix}`;

  const [admin] = await db
    .insert(users)
    .values({
      username: `e2e_adopt_admin_${suffix}`,
      password: "hashed_fake_password",
      role: "admin",
      helpdeskName: MDA_TI_MESA,
    })
    .returning({ id: users.id });

  await db.insert(sessions).values({
    id: adminSessionId,
    userId: admin.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  await setSessionCookie(context, signSessionId(adminSessionId));

  return { adminSessionId, adminUserId: admin.id };
}

async function cleanupAdmin(ctx: AdminTestContext): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, ctx.adminSessionId));
  await db.delete(users).where(eq(users.id, ctx.adminUserId));
}

test.describe("Adopción de shell huérfano en el alta", () => {
  let adminCtx: AdminTestContext;
  let shellId = 0;
  let scheduleId = 0;
  let createdUsername = "";

  test.beforeAll(async () => {
    const [existing] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI_MESA));
    if (!existing) {
      await db
        .insert(mesas)
        .values({
          invgateId: 910001,
          name: MDA_TI_MESA,
          displayName: null,
          active: true,
          assignable: true,
          lastSyncedAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
    }
  });

  test.beforeEach(async ({ context }) => {
    adminCtx = await setupAdmin(context);
    shellId = 0;
    scheduleId = 0;
    createdUsername = "";
  });

  test.afterEach(async () => {
    if (scheduleId) {
      await db.delete(schedules).where(eq(schedules.id, scheduleId));
    }
    // Modo falla: si la adopción rompe e inserta una fila NUEVA con
    // userId = usuario creado, borrar solo shellId + usuario la dejaría
    // huérfana (FK ON DELETE SET NULL) y chocaría el UNIQUE de agents.name
    // en la próxima corrida. Resolver el id del usuario primero y borrar
    // TODAS sus filas agents antes de borrar el usuario (patrón cleanupUser
    // de tests/admin/usuarios-create-modal.spec.ts).
    if (createdUsername) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, createdUsername));
      if (u) {
        await db.delete(agents).where(eq(agents.userId, u.id));
        await db.delete(users).where(eq(users.id, u.id));
      }
    }
    if (shellId) {
      await db.delete(agents).where(eq(agents.id, shellId));
    }
    await cleanupAdmin(adminCtx);
  });

  test("alta adopta shell huérfano por nombre y preserva historial", async ({
    page,
  }) => {
    // Setup: shell huérfano (sin userId, enCronograma false) + fila de
    // historial por agentId. El false sembrado prueba que el flag del form
    // se propaga via el spread de adopción (no que el shell ya lo traía).
    const [shell] = await db
      .insert(agents)
      .values({ name: SHELL_NAME, enCronograma: false })
      .returning({ id: agents.id });
    shellId = shell.id;

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [sched] = await db
      .insert(schedules)
      .values({ agentId: shell.id, date: `${month}-15`, status: "Trabajo" })
      .returning({ id: schedules.id });
    scheduleId = sched.id;

    const countBefore = (
      await db.select({ c: sql<number>`COUNT(*)` }).from(agents)
    )[0].c;

    // Action: alta por el ABM con el nombre en variante de mayúsculas.
    const username = `adopt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdUsername = username;

    await page.goto("/admin/usuarios");
    await page.click("#btn-nuevo-usuario");
    await page.waitForSelector("#nuevo-usuario-form");

    await page.fill("#admin-username", username);
    await page.fill("#admin-password", VALID_PASSWORD);
    await page.fill("#admin-fullname", FORM_NAME);
    await page.selectOption("#admin-role", "agent");
    await page.selectOption("#admin-helpdesk", { label: MDA_TI_MESA });
    await page
      .locator('#nuevo-usuario-form input[name="enCronograma"]')
      .check();

    const submitPromise = page
      .waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
        { timeout: 15000 },
      )
      .catch(() => null);
    await page.evaluate(() => {
      const form = document.getElementById("nuevo-usuario-form");
      if (form) HTMLFormElement.prototype.submit.call(form);
    });
    const response = await submitPromise;
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
    await page.waitForLoadState("networkidle");

    // Assert 1: no se creó una fila nueva de agente.
    const countAfter = (
      await db.select({ c: sql<number>`COUNT(*)` }).from(agents)
    )[0].c;
    expect(countAfter).toBe(countBefore);

    // Assert 2: el shell quedó vinculado al usuario nuevo (mismo id).
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    expect(user).toBeTruthy();
    const [adopted] = await db
      .select({
        id: agents.id,
        name: agents.name,
        userId: agents.userId,
        enCronograma: agents.enCronograma,
      })
      .from(agents)
      .where(eq(agents.id, shellId));
    expect(adopted.userId).toBe(user.id);
    // El .set({ name }) de la adopción aplica el case-variant del form.
    expect(adopted.name).toBe(FORM_NAME);
    // Flag del form (checkbox on) propagado: el shell sembró en false.
    expect(adopted.enCronograma).toBe(true);

    // Assert 3: el historial sigue apuntando al mismo agents.id.
    const [schedRow] = await db
      .select({ agentId: schedules.agentId })
      .from(schedules)
      .where(eq(schedules.id, scheduleId));
    expect(schedRow.agentId).toBe(shellId);

    // Assert 4: figura en el payload del cronograma con el username nuevo
    // (el display viene del join users por user_id).
    const res = await page.request.get(`/api/cronograma?month=${month}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const op = body.operators.find((o: any) => o.id === shellId);
    expect(op).toBeTruthy();
    expect(op.username).toBe(username);
  });
});
