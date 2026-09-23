// tests/lifecycle/coord-mesa-lifecycle.spec.ts
//
// Ciclo de vida de un usuario de MESA DE COORDINACION (mesa NO participativa):
//   A. persiste el alta (fila en users, vinculo agents.userId, visible en /admin/usuarios),
//   B. no se le pueden asignar participaciones (gating UI + fail-closed server-side),
//   C. el cambio de mesa Coord <-> MDA TI conserva usuario y vinculo agents.userId
//      (los flags se habilitan al volver a MDA TI y se resetean al volver a Coord).
//
// La supervivencia de `schedules` ante el cambio de mesa ya esta cubierta por
// tests/lifecycle/agent-schedule-lifecycle.spec.ts: no se duplica aca.
import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, mesas } from "../../src/db/schema";
import {
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
} from "../../src/lib/helpdeskAccess";
import { setSessionCookie } from "../helpers/auth";

const BASE = "http://localhost:4321";
const SECRET =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const PASSWORD = "CambiarEst0!Clave";

function sign(sessionId: string): string {
  return `${sessionId}.${createHmac("sha256", SECRET)
    .update(sessionId)
    .digest("base64url")}`;
}

function cookieHeader(sessionId: string): string {
  return `session_id=${sign(sessionId)}`;
}

async function adminForm(
  cookie: string,
  form: Record<string, string>,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}/admin/usuarios`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* redirect o body no JSON */
  }
  return { status: res.status, json };
}

interface AgentFlags {
  enCronograma: boolean;
  asignableCubic: boolean;
  incluidoCalidad: boolean;
  asignableAgs: boolean;
}

async function readUser(userId: number) {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      helpdeskId: users.helpdeskId,
      helpdeskName: users.helpdeskName,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

async function readAgent(userId: number) {
  const [row] = await db
    .select({
      id: agents.id,
      name: agents.name,
      userId: agents.userId,
      enCronograma: agents.enCronograma,
      asignableCubic: agents.asignableCubic,
      incluidoCalidad: agents.incluidoCalidad,
      asignableAgs: agents.asignableAgs,
    })
    .from(agents)
    .where(eq(agents.userId, userId));
  expect(row, "fila agents").toBeTruthy();
  return row;
}

const uniq = () =>
  `e2e_coord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const FLAGS_OFF: AgentFlags = {
  enCronograma: false,
  asignableCubic: false,
  incluidoCalidad: false,
  asignableAgs: false,
};
const FLAGS_ON: AgentFlags = {
  enCronograma: true,
  asignableCubic: true,
  incluidoCalidad: true,
  asignableAgs: true,
};

test.describe("Ciclo de vida usuario mesa Coordinacion (no participativa)", () => {
  let adminCookie = "";
  let adminUserId = 0;
  let adminSessionId = "";
  let mdaId = 0;
  let coordId = 0;

  const createdUserIds: number[] = [];

  function register(id: number): void {
    createdUserIds.push(id);
  }

  // Alta via POST real. Devuelve el id persistido (o lanza si falla).
  async function createViaApi(
    username: string,
    name: string,
    helpdesk: { id: number; name: string },
    flags: Partial<Record<keyof AgentFlags, string>> = {},
  ): Promise<number> {
    const res = await adminForm(adminCookie, {
      action: "create",
      name,
      username,
      password: PASSWORD,
      role: "agent",
      helpdesk: `${helpdesk.id}|${helpdesk.name}`,
      ...flags,
    });
    expect(
      res.status,
      `alta ${username} debe ser 200 (body: ${JSON.stringify(res.json)})`,
    ).toBe(200);
    expect(res.json?.success, `alta ${username}`).toBe(true);
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    expect(row, `usuario ${username} persistido`).toBeTruthy();
    register(row.id);
    return row.id;
  }

  async function updateViaApi(
    userId: number,
    username: string,
    name: string,
    helpdesk: { id: number; name: string },
    flags: Partial<Record<keyof AgentFlags, string>> = {},
  ): Promise<{ status: number; json: any }> {
    return adminForm(adminCookie, {
      action: "update-user",
      userId: String(userId),
      username,
      name,
      newRole: "agent",
      helpdesk: `${helpdesk.id}|${helpdesk.name}`,
      ...flags,
    });
  }

  test.beforeAll(async () => {
    const [mda] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI_HELPDESK));
    const [coord] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, COORD_HELPDESK));
    expect(mda?.id, "mesa MDA TI debe existir").toBeTruthy();
    expect(coord?.id, "mesa Coord debe existir").toBeTruthy();
    mdaId = mda.id;
    coordId = coord.id;

    const adminUsername = uniq();
    const [admin] = await db
      .insert(users)
      .values({
        username: adminUsername,
        password: "x",
        role: "admin",
        helpdeskId: mdaId,
        helpdeskName: MDA_TI_HELPDESK,
      })
      .returning({ id: users.id });
    adminUserId = admin.id;
    register(admin.id);
    adminSessionId = `sess_coord_${Date.now()}`;
    await db.insert(sessions).values({
      id: adminSessionId,
      userId: admin.id,
      expiresAt: Date.now() + 1000 * 60 * 60,
    });
    adminCookie = cookieHeader(adminSessionId);
  });

  test.afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    }
    if (adminSessionId) {
      await db.delete(sessions).where(eq(sessions.id, adminSessionId));
    }
    if (createdUserIds.length > 0) {
      await db.delete(agents).where(inArray(agents.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  async function authenticate(context: BrowserContext): Promise<void> {
    await setSessionCookie(context, sign(adminSessionId));
  }

  // -------------------------------------------------------------------------
  // A. Persistencia del alta Coord
  // -------------------------------------------------------------------------
  test("A. persiste: alta Coord persiste en users, agents.userId y /admin/usuarios", async ({
    page,
    context,
  }) => {
    const username = uniq();
    const name = `Coord Life ${username}`;
    const userId = await createViaApi(
      username,
      name,
      { id: coordId, name: COORD_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );

    // users: mesa Coord canonica.
    const userRow = await readUser(userId);
    expect(userRow).toBeTruthy();
    expect(userRow.helpdeskId).toBe(coordId);
    expect(userRow.helpdeskName).toBe(COORD_HELPDESK);

    // agents: fila vinculada por id y flags sanitizados (mesa no participativa).
    const agentRow = await readAgent(userId);
    expect(agentRow, "fila agents creada").toBeTruthy();
    expect(agentRow.enCronograma).toBe(false);
    expect(agentRow.asignableCubic).toBe(false);
    expect(agentRow.incluidoCalidad).toBe(false);
    expect(agentRow.asignableAgs).toBe(false);

    // Visible en /admin/usuarios.
    await authenticate(context);
    await page.goto("/admin/usuarios");
    await page.waitForSelector("#btn-nuevo-usuario", { timeout: 15000 });
    await expect(
      page.locator(`article[data-sort-username="${username}"]`),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // B1. Gating UI en el modal de alta
  // -------------------------------------------------------------------------
  test("B1. alta: mesa Coord oculta #participaciones-fields; MDA TI las muestra", async ({
    page,
    context,
  }) => {
    await authenticate(context);
    await page.goto("/admin/usuarios");
    await page.waitForSelector("#btn-nuevo-usuario", { timeout: 15000 });

    await page.locator("#btn-nuevo-usuario").click();
    const modal = page.locator("#modal-create-user");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#nuevo-usuario-form")).toBeVisible();

    const fields = page.locator("#participaciones-fields");

    await modal
      .locator("#admin-helpdesk")
      .selectOption({ label: COORD_HELPDESK });
    await expect(
      fields,
      "mesa Coord oculta el bloque de participaciones",
    ).toBeHidden();

    await modal
      .locator("#admin-helpdesk")
      .selectOption({ label: MDA_TI_HELPDESK });
    await expect(
      fields,
      "mesa MDA TI muestra el bloque de participaciones",
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // B2. Gating UI en el modal de edicion
  // -------------------------------------------------------------------------
  test("B2. edicion: usuario Coord muestra alerta en vez de toggles", async ({
    page,
    context,
  }) => {
    const username = uniq();
    const name = `Coord Edit ${username}`;
    const userId = await createViaApi(username, name, {
      id: coordId,
      name: COORD_HELPDESK,
    });

    await authenticate(context);
    await page.goto("/admin/usuarios");
    await page.waitForSelector("#btn-nuevo-usuario", { timeout: 15000 });

    const row = page.locator(`article[data-sort-username="${username}"]`);
    await row.waitFor({ state: "visible", timeout: 10000 });
    await row
      .locator(`button[aria-label="Editar usuario ${username}"]`)
      .click();

    const dialog = page.locator(`#modal-edit-user-${userId}`);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Esta mesa no tiene secciones con participaciones."),
    ).toBeVisible();
    await expect(
      dialog.locator('input[name="enCronograma"]'),
      "usuario Coord no expone toggles de participaciones",
    ).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // B3. Fail-closed server-side: POST create
  // -------------------------------------------------------------------------
  test("B3. fail-closed: POST create Coord con flags forzados guarda false", async () => {
    const username = uniq();
    const name = `Coord Force ${username}`;
    const userId = await createViaApi(
      username,
      name,
      { id: coordId, name: COORD_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );

    const agentRow = await readAgent(userId);
    expect(agentRow.enCronograma).toBe(false);
    expect(agentRow.asignableCubic).toBe(false);
    expect(agentRow.incluidoCalidad).toBe(false);
    expect(agentRow.asignableAgs).toBe(false);
  });

  // -------------------------------------------------------------------------
  // B4. Fail-closed server-side: POST update-user
  // -------------------------------------------------------------------------
  test("B4. fail-closed: POST update-user a Coord con flags forzados guarda false", async () => {
    const username = uniq();
    const name = `Coord Force Edit ${username}`;
    // Base MDA TI participativa con flags encendidos.
    const userId = await createViaApi(
      username,
      name,
      { id: mdaId, name: MDA_TI_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );
    const before = await readAgent(userId);
    expect(before.enCronograma).toBe(true);
    expect(before.asignableCubic).toBe(true);

    // Forzar mesa Coord reenviando todos los flags en "on".
    const res = await updateViaApi(
      userId,
      username,
      name,
      { id: coordId, name: COORD_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);

    const userRow = await readUser(userId);
    expect(userRow.helpdeskName).toBe(COORD_HELPDESK);
    const after = await readAgent(userId);
    expect(after.enCronograma).toBe(false);
    expect(after.asignableCubic).toBe(false);
    expect(after.incluidoCalidad).toBe(false);
    expect(after.asignableAgs).toBe(false);
  });

  // -------------------------------------------------------------------------
  // C. Cambio de mesa Coord -> MDA TI -> Coord
  // -------------------------------------------------------------------------
  test("C. cambio de mesa Coord -> MDA TI -> Coord conserva usuario y agents.userId", async () => {
    const username = uniq();
    const name = `Coord Switch ${username}`;
    const userId = await createViaApi(
      username,
      name,
      { id: coordId, name: COORD_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );

    const start = await readAgent(userId);
    expect(start.enCronograma).toBe(false);
    expect(start.asignableCubic).toBe(false);

    // Coord -> MDA TI: los flags vuelven a permitirse.
    let res = await updateViaApi(
      userId,
      username,
      name,
      { id: mdaId, name: MDA_TI_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    const onMdaUser = await readUser(userId);
    expect(onMdaUser).toBeTruthy();
    expect(onMdaUser.helpdeskName).toBe(MDA_TI_HELPDESK);
    const onMdaAgent = await readAgent(userId);
    expect(onMdaAgent.enCronograma).toBe(true);
    expect(onMdaAgent.asignableCubic).toBe(true);
    expect(onMdaAgent.incluidoCalidad).toBe(true);
    expect(onMdaAgent.asignableAgs).toBe(true);

    // MDA TI -> Coord: los flags vuelven a false y el usuario sigue existiendo.
    res = await updateViaApi(
      userId,
      username,
      name,
      { id: coordId, name: COORD_HELPDESK },
      { enCronograma: "on", asignableCubic: "on", incluidoCalidad: "on", asignableAgs: "on" },
    );
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    const backUser = await readUser(userId);
    expect(backUser, "usuario persiste tras volver a Coord").toBeTruthy();
    expect(backUser.helpdeskName).toBe(COORD_HELPDESK);
    const backAgent = await readAgent(userId);
    expect(backAgent.enCronograma).toBe(false);
    expect(backAgent.asignableCubic).toBe(false);
    expect(backAgent.incluidoCalidad).toBe(false);
    expect(backAgent.asignableAgs).toBe(false);
  });
});
