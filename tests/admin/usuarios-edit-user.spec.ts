// tests/admin/usuarios-edit-user.spec.ts
// Feature: modal unificado "Editar usuario" en /admin/usuarios.
// Cubre: self-heal de la fila agents (usuarios sin fila vinculada), edicion
// simultanea de username + nombre visible + participaciones, NO propagacion a
// schedules, chips indicadores por flag activo y forzado de enCronograma=false
// para supervisores. El toast de exito debe sobrevivir el reload via
// ?toast_msg&toast_type.
import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents, schedules } from "../../src/db/schema";
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

interface Flags {
  enCronograma: boolean;
  asignableCubic: boolean;
  incluidoCalidad: boolean;
  asignableAgs: boolean;
}

const NO_FLAGS: Flags = {
  enCronograma: false,
  asignableCubic: false,
  incluidoCalidad: false,
  asignableAgs: false,
};

test.describe("Modal unificado Editar usuario", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;
  let mdaTiInvgateId: number;
  let coordInvgateId: number;
  const createdUserIds: number[] = [];
  const createdAgentUsernames: string[] = [];
  const createdScheduleIds: number[] = [];

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
            lastSyncedAt: new Date().toISOString(),
          })
          .onConflictDoNothing();
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
    adminSession = `sess_edituser_${ts}`;
    const [u] = await db
      .insert(users)
      .values({
        username: `admin_edituser_${ts}`,
        password: "x",
        role: "admin",
      })
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
    if (createdScheduleIds.length > 0) {
      await db.delete(schedules).where(inArray(schedules.id, createdScheduleIds));
    }
    if (createdAgentUsernames.length > 0) {
      await db
        .delete(agents)
        .where(inArray(agents.username, createdAgentUsernames));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function seedUser(
    username: string,
    role: string,
    helpdeskName: string | null,
    opts: { agentName?: string; flags?: Flags; withAgent?: boolean } = {},
  ): Promise<number> {
    const [m] = helpdeskName
      ? await db
          .select({ invgateId: mesas.invgateId })
          .from(mesas)
          .where(eq(mesas.name, helpdeskName))
      : [undefined];
    const [u] = await db
      .insert(users)
      .values({
        username,
        password: "x",
        role,
        helpdeskId: m?.invgateId ?? null,
        helpdeskName,
      })
      .returning({ id: users.id });
    createdUserIds.push(u.id);
    if (opts.withAgent !== false) {
      await db.insert(agents).values({
        name: opts.agentName ?? username.toUpperCase(),
        username,
        ...(opts.flags ?? NO_FLAGS),
      });
      createdAgentUsernames.push(username);
    }
    return u.id;
  }

  async function loginAndGoToUsers(page: Page): Promise<void> {
    await setSessionCookie(page.context(), adminCookie);
    await page.goto("/admin/usuarios");
  }

  test("modal prefill: rol admin se preserva y lista 5 roles; sin-mesa no degrada", async ({
    page,
  }) => {
    const uname = `edit_rolepref_${Date.now()}`;
    const uid = await seedUser(uname, "admin", MDA_TI);
    await loginAndGoToUsers(page);
    await expect(
      page.locator(`article[data-sort-username="${uname}"]`).first(),
    ).toBeVisible();
    await page.locator(`button[aria-label="Editar usuario ${uname}"]`).click();

    const modal = page.locator(`#modal-edit-user-${uid}`);
    await expect(modal).toBeVisible();
    const roleSelect = modal.locator(`#edit-user-role-${uid}`);
    await expect(roleSelect).toHaveValue("admin");
    expect(
      (await roleSelect.locator("option").allTextContents()).map((t) =>
        t.trim(),
      ),
    ).toEqual([
      "Agente",
      "Referente",
      "Team Leader",
      "Supervisor",
      "Administrador",
    ]);

    await modal.locator(`#edit-user-helpdesk-${uid}`).selectOption("");
    await expect(roleSelect).toHaveValue("admin");
  });

  test("usuario MDA TI sin fila agents: el modal edita y crea la fila (self-heal)", async ({
    page,
  }) => {
    const uname = `edit_norow_${Date.now()}`;
    const uid = await seedUser(uname, "agent", MDA_TI, { withAgent: false });

    await loginAndGoToUsers(page);
    await expect(
      page.locator(`article[data-sort-username="${uname}"]`).first(),
    ).toBeVisible();

    // Sin fila agents el CTA debe existir igual (bug original: no habia boton).
    const editBtn = page.locator(`button[aria-label="Editar usuario ${uname}"]`);
    await expect(editBtn).toHaveCount(1);
    await editBtn.click();

    const modal = page.locator(`#modal-edit-user-${uid}`);
    await expect(modal).toBeVisible();

    const newName = `Nombre Editado ${uname}`;
    await modal.locator('input[name="username"]').fill(uname);
    await modal.locator('input[name="name"]').fill(newName);
    await modal.locator('input[name="enCronograma"]').check();
    await modal.locator('input[name="incluidoCalidad"]').check();

    const navigated = page.waitForEvent("framenavigated", { timeout: 15000 });
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
      ),
      modal.locator('button[type="submit"]').click(),
    ]);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.redirectUrl).toContain("toast_msg=");
    expect(body.redirectUrl).toContain("toast_type=success");

    // Toast post-reload (no solo el optimista pre-reload).
    await navigated;
    await expect(page.locator("#global-toast-container")).toContainText(
      "Usuario actualizado con éxito.",
      { timeout: 10000 },
    );

    // Self-heal: se crea la fila agents con nombre y flags enviados.
    await expect
      .poll(
        async () => {
          const [a] = await db
            .select({
              name: agents.name,
              enCronograma: agents.enCronograma,
              asignableCubic: agents.asignableCubic,
              incluidoCalidad: agents.incluidoCalidad,
              asignableAgs: agents.asignableAgs,
            })
            .from(agents)
            .where(eq(agents.username, uname));
          return a ?? null;
        },
        { timeout: 10000 },
      )
      .toEqual({
        name: newName,
        enCronograma: true,
        asignableCubic: false,
        incluidoCalidad: true,
        asignableAgs: false,
      });
    createdAgentUsernames.push(uname);
  });

  test("usuario MDA TI con fila: un submit actualiza username, nombre, flags y NO toca schedules", async ({
    page,
  }) => {
    const ts = Date.now();
    const oldUname = `edit_row_${ts}`;
    const newUname = `edit_row_new_${ts}`;
    const oldName = `Nombre Viejo ${ts}`;
    const newName = `Nombre Nuevo ${ts}`;
    const uid = await seedUser(oldUname, "agent", MDA_TI, {
      agentName: oldName,
      flags: { ...NO_FLAGS, enCronograma: true, asignableCubic: true },
    });

    const [sched] = await db
      .insert(schedules)
      .values({ agentName: oldName, date: "2099-01-01", status: "normal" })
      .returning({ id: schedules.id });
    createdScheduleIds.push(sched.id);

    await loginAndGoToUsers(page);
    await expect(
      page.locator(`article[data-sort-username="${oldUname}"]`).first(),
    ).toBeVisible();
    await page.locator(`button[aria-label="Editar usuario ${oldUname}"]`).click();

    const modal = page.locator(`#modal-edit-user-${uid}`);
    await expect(modal).toBeVisible();
    await modal.locator('input[name="username"]').fill(newUname);
    await modal.locator('input[name="name"]').fill(newName);
    await modal.locator('input[name="asignableCubic"]').uncheck();
    await modal.locator('input[name="incluidoCalidad"]').check();

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
      ),
      modal.locator('button[type="submit"]').click(),
    ]);
    expect(resp.status()).toBe(200);
    expect((await resp.json()).success).toBe(true);

    await expect
      .poll(
        async () =>
          (
            await db
              .select({ username: users.username })
              .from(users)
              .where(eq(users.id, uid))
          )[0]?.username,
        { timeout: 10000 },
      )
      .toBe(newUname);

    const [agentRow] = await db
      .select()
      .from(agents)
      .where(eq(agents.username, newUname));
    expect(agentRow).toBeTruthy();
    expect(agentRow.name).toBe(newName);
    expect(agentRow.enCronograma).toBe(true);
    expect(agentRow.asignableCubic).toBe(false);
    expect(agentRow.incluidoCalidad).toBe(true);
    expect(agentRow.asignableAgs).toBe(false);

    // La fila de schedules conserva el nombre viejo: el rename ya no
    // propaga a schedules (los lectores vinculan por agentId). La fila
    // sembrada no tiene agentId, así que este test no cubre lectura; solo
    // fija que el rename NO toca la tabla.
    const [schedRow] = await db
      .select({ agentName: schedules.agentName })
      .from(schedules)
      .where(eq(schedules.id, sched.id));
    expect(schedRow.agentName).toBe(oldName);

    createdAgentUsernames.push(oldUname, newUname);
  });

  test("chips de participacion: MDA TI muestra flags activos, Coordinacion no muestra", async ({
    page,
  }) => {
    const ts = Date.now();
    const activeUname = `chip_active_${ts}`;
    await seedUser(activeUname, "agent", MDA_TI, {
      flags: {
        ...NO_FLAGS,
        enCronograma: true,
        incluidoCalidad: true,
      },
    });
    const coordUname = `chip_coord_${ts}`;
    await seedUser(coordUname, "agent", COORD, {
      flags: {
        ...NO_FLAGS,
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      },
    });

    await loginAndGoToUsers(page);
    const activeRow = page.locator(
      `article[data-sort-username="${activeUname}"]`,
    );
    await expect(activeRow.first()).toBeVisible();
    await expect(activeRow.locator('[data-chip="cronograma"]')).toHaveCount(1);
    await expect(activeRow.locator('[data-chip="calidad"]')).toHaveCount(1);
    await expect(activeRow.locator('[data-chip="cubics"]')).toHaveCount(0);
    await expect(activeRow.locator('[data-chip="ags"]')).toHaveCount(0);

    const coordRow = page.locator(`article[data-sort-username="${coordUname}"]`);
    await expect(coordRow.first()).toBeVisible();
    await expect(coordRow.locator("[data-chip]")).toHaveCount(0);
  });

  test("modal: mesa participativa renderiza los 4 switches; mesa no participativa ninguno + texto", async ({
    page,
  }) => {
    const ts = Date.now();
    const mdaUname = `sw_mda_${ts}`;
    const coordUname = `sw_coord_${ts}`;
    const mdaUid = await seedUser(mdaUname, "agent", MDA_TI);
    const coordUid = await seedUser(coordUname, "agent", COORD);

    await loginAndGoToUsers(page);

    // MDA TI: los 4 switches existen (enabled) dentro del modal.
    await page.locator(`button[aria-label="Editar usuario ${mdaUname}"]`).click();
    const mdaModal = page.locator(
      `#modal-edit-user-${mdaUid} [data-testid="participaciones-block"]`,
    );
    await expect(mdaModal).toBeVisible();
    for (const name of [
      "enCronograma",
      "asignableCubic",
      "incluidoCalidad",
      "asignableAgs",
    ]) {
      await expect(mdaModal.locator(`input[name="${name}"]`)).toBeEnabled();
    }
    await page.keyboard.press("Escape");

    // Coordinación: no se renderiza ningún switch, sí el texto informativo.
    await page.locator(`button[aria-label="Editar usuario ${coordUname}"]`).click();
    const coordModal = page.locator(
      `#modal-edit-user-${coordUid} [data-testid="participaciones-block"]`,
    );
    await expect(coordModal).toBeVisible();
    await expect(coordModal.locator("input[type='checkbox']")).toHaveCount(0);
    await expect(coordModal).toContainText(/no tiene secciones con participaciones/i);
    await page.keyboard.press("Escape");
  });

  test("supervisor MDA TI: cronograma deshabilitado y guardado fuerza enCronograma=false", async ({
    page,
    context,
  }) => {
    const uname = `edit_sup_${Date.now()}`;
    const agentName = `Sup Editado ${uname}`;
    const uid = await seedUser(uname, "supervisor", MDA_TI, {
      agentName,
      flags: { ...NO_FLAGS, enCronograma: true, asignableCubic: true },
    });

    await loginAndGoToUsers(page);
    await expect(
      page.locator(`article[data-sort-username="${uname}"]`).first(),
    ).toBeVisible();
    await page.locator(`button[aria-label="Editar usuario ${uname}"]`).click();

    const modal = page.locator(`#modal-edit-user-${uid}`);
    await expect(modal).toBeVisible();
    const cronoToggle = modal.locator("input[name='enCronograma']");
    await expect(cronoToggle).toBeDisabled();

    // Guardar desde el modal (el toggle disabled no viaja en el FormData).
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
      ),
      modal.locator('button[type="submit"]').click(),
    ]);
    expect(resp.status()).toBe(200);
    expect((await resp.json()).success).toBe(true);

    await expect
      .poll(
        async () =>
          (
            await db
              .select({ enCronograma: agents.enCronograma })
              .from(agents)
              .where(eq(agents.username, uname))
          )[0]?.enCronograma,
        { timeout: 10000 },
      )
      .toBe(false);

    // Aun enviando enCronograma=on por API, el server lo fuerza a false.
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "update-user",
          userId: String(uid),
          username: uname,
          name: agentName,
          newRole: "supervisor",
          helpdesk: `${mdaTiInvgateId}|${MDA_TI}`,
          enCronograma: "on",
          asignableCubic: "on",
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    const [after] = await db
      .select({ enCronograma: agents.enCronograma })
      .from(agents)
      .where(eq(agents.username, uname));
    expect(after.enCronograma).toBe(false);
  });

  test("autoedicion: update-user sobre el propio admin es rechazado", async ({
    context,
  }) => {
    await setSessionCookie(context, adminCookie);
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const [before] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, adminId));

    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "update-user",
          userId: String(adminId),
          username: before.username,
          name: "Auto Editado",
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(400);
    expect(String((await res.json()).error)).toContain(
      "No podés editar tu propio usuario",
    );

    const [after] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, adminId));
    expect(after.username).toBe(before.username);
  });

  test("username duplicado en update-user muestra error especifico", async ({
    context,
  }) => {
    await setSessionCookie(context, adminCookie);
    const unameA = `edit_dup_a_${Date.now()}`;
    const unameB = `edit_dup_b_${Date.now()}`;
    const uidA = await seedUser(unameA, "agent", MDA_TI);
    await seedUser(unameB, "agent", MDA_TI);

    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "update-user",
          userId: String(uidA),
          username: unameB,
          name: `Dup Target ${Date.now()}`,
          newRole: "agent",
          helpdesk: `${mdaTiInvgateId}|${MDA_TI}`,
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(400);
    expect(String((await res.json()).error)).toContain(
      "nombre de usuario ya existe",
    );

    // El username original no cambió.
    const [after] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, uidA));
    expect(after.username).toBe(unameA);
  });
});
