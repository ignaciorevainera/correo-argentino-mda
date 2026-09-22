// tests/admin/usuarios-change-role-flags.spec.ts
// Invariante: mover un usuario de mesa via change-role sanitiza los flags de
// participacion del agente (agents.enCronograma, asignableCubic,
// incluidoCalidad, asignableAgs) segun la politica de mesas participativas.
import "dotenv/config";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents } from "../../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
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

async function login(context: BrowserContext, signedSessionId: string): Promise<void> {
  // Host-agnostico: el baseURL del config temporal puede ser 4322 (4321 suele
  // estar ocupado por otro proyecto) o el default 4321.
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

test.describe("change-role sanitiza participaciones al mover de mesa", () => {
  let adminSession: string;
  let adminId: number;
  let adminCookie: string;
  const createdUserIds: number[] = [];
  const createdUsernames: string[] = [];

  test.beforeAll(async () => {
    // Asegurar mesas por NOMBRE (invgateId puede variar según el entorno).
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
      }
    }

    const ts = Date.now();
    adminSession = `sess_flagtest_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_flagtest_${ts}`, password: "x", role: "admin" })
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

  async function seedUserWithAgent(
    username: string,
    role: string,
    helpdeskName: string | null,
    flags: Flags,
  ): Promise<{ userId: number; agentId: number }> {
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
    const [a] = await db
      .insert(agents)
      .values({ name: username, username, ...flags })
      .returning({ id: agents.id });
    createdUserIds.push(u.id);
    createdUsernames.push(username);
    return { userId: u.id, agentId: a.id };
  }

  async function openEditUser(page: Page, userId: number): Promise<void> {
    await login(page.context(), adminCookie);
    await page.goto("/admin/usuarios");
    const btn = page.locator(
      `[data-edit-user-btn][data-user-id="${userId}"]`,
    );
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator(`#modal-edit-user-${userId}`)).toBeVisible();
  }

  async function pickHelpdesk(
    page: Page,
    userId: number,
    mesaName: string,
  ): Promise<void> {
    const [m] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, mesaName));
    const select = page.locator(`#edit-user-helpdesk-${userId}`);
    const value = `${m.invgateId}|${mesaName}`;
    const opt = select.locator(`option[value="${value}"]`);
    if ((await opt.count()) === 0) {
      // Fallback si InvGate no listó la mesa (el server valida contra `mesas`).
      await select.evaluate((el, v) => {
        const option = document.createElement("option");
        option.value = v;
        option.textContent = v.split("|")[1];
        el.appendChild(option);
      }, value);
    }
    await select.selectOption(value);
  }

  async function submitEditUser(page: Page, userId: number): Promise<void> {
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
      ),
      page.locator(`#modal-edit-user-${userId} button[type='submit']`).click(),
    ]);
    expect(resp.ok()).toBeTruthy();
    expect(resp.headers()["content-type"]).toContain("application/json");
    expect((await resp.json()).success).toBe(true);
    await page.waitForLoadState("load").catch(() => {});
  }

  async function readFlags(agentId: number): Promise<Flags> {
    const [a] = await db
      .select({
        enCronograma: agents.enCronograma,
        asignableCubic: agents.asignableCubic,
        incluidoCalidad: agents.incluidoCalidad,
        asignableAgs: agents.asignableAgs,
      })
      .from(agents)
      .where(eq(agents.id, agentId));
    return a;
  }

  test("mover de MDA TI a Coordinación resetea participaciones", async ({
    page,
  }) => {
    const uname = `flags_move_${Date.now()}`;
    const { userId, agentId } = await seedUserWithAgent(uname, "agent", MDA_TI, {
      enCronograma: true,
      asignableCubic: true,
      incluidoCalidad: true,
      asignableAgs: true,
    });

    await openEditUser(page, userId);
    await pickHelpdesk(page, userId, COORD);
    await page.locator(`#edit-user-role-${userId}`).selectOption("agent");
    await submitEditUser(page, userId);

    await expect
      .poll(
        async () => {
          const [u] = await db
            .select({ helpdeskName: users.helpdeskName })
            .from(users)
            .where(eq(users.id, userId));
          return u?.helpdeskName;
        },
        { timeout: 10000 },
      )
      .toBe(COORD);

    await expect
      .poll(async () => readFlags(agentId), { timeout: 10000 })
      .toEqual({
        enCronograma: false,
        asignableCubic: false,
        incluidoCalidad: false,
        asignableAgs: false,
      });
  });

  test("mover a MDA TI preserva participaciones", async ({ page }) => {
    const uname = `flags_keep_${Date.now()}`;
    const { userId, agentId } = await seedUserWithAgent(uname, "agent", MDA_TI, {
      enCronograma: true,
      asignableCubic: true,
      incluidoCalidad: true,
      asignableAgs: true,
    });

    await openEditUser(page, userId);
    await pickHelpdesk(page, userId, MDA_TI);
    await page.locator(`#edit-user-role-${userId}`).selectOption("referent");
    await submitEditUser(page, userId);

    await expect
      .poll(
        async () => {
          const [u] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, userId));
          return u?.role;
        },
        { timeout: 10000 },
      )
      .toBe("referent");

    expect(await readFlags(agentId)).toEqual({
      enCronograma: true,
      asignableCubic: true,
      incluidoCalidad: true,
      asignableAgs: true,
    });
  });

  test("asignar supervisor fuerza enCronograma=false", async ({ page }) => {
    const uname = `flags_sup_${Date.now()}`;
    const { userId, agentId } = await seedUserWithAgent(uname, "agent", MDA_TI, {
      enCronograma: true,
      asignableCubic: true,
      incluidoCalidad: true,
      asignableAgs: true,
    });

    await openEditUser(page, userId);
    await pickHelpdesk(page, userId, MDA_TI);
    await page.locator(`#edit-user-role-${userId}`).selectOption("supervisor");
    await submitEditUser(page, userId);

    await expect
      .poll(
        async () => {
          const [u] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, userId));
          return u?.role;
        },
        { timeout: 10000 },
      )
      .toBe("supervisor");

    await expect
      .poll(async () => readFlags(agentId), { timeout: 10000 })
      .toEqual({
        enCronograma: false,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      });
  });

  test("POST JSON update-user responde 200 success y aplica cambios", async ({
    context,
  }) => {
    const uname = `json_cr_${Date.now()}`;
    const { userId, agentId } = await seedUserWithAgent(
      uname,
      "agent",
      MDA_TI,
      {
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      },
    );
    const [coord] = await db
      .select({ invgateId: mesas.invgateId, name: mesas.name })
      .from(mesas)
      .where(eq(mesas.name, COORD));
    await login(context, adminCookie);

    // context.request comparte el cookie jar con el contexto (a diferencia del
    // fixture `request` suelto). Contrato unificado `update-user`: payload
    // completo (username/name se devuelven sin cambios, solo varia la mesa).
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
    const res = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "update-user",
          userId: String(userId),
          username: uname,
          name: uname,
          newRole: "agent",
          helpdesk: `${coord.invgateId}|${coord.name}`,
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(await readFlags(agentId)).toEqual({
      enCronograma: false,
      asignableCubic: false,
      incluidoCalidad: false,
      asignableAgs: false,
    });
    const [u] = await db
      .select({ helpdeskId: users.helpdeskId, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.id, userId));
    expect(u.helpdeskName).toBe(COORD);
  });

  test("dejar sin mesa resetea participaciones", async ({ page }) => {
    const uname = `flags_nomesa_${Date.now()}`;
    const { userId, agentId } = await seedUserWithAgent(
      uname,
      "agent",
      MDA_TI,
      {
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      },
    );

    await openEditUser(page, userId);
    await page.locator(`#edit-user-helpdesk-${userId}`).selectOption("");
    await page.locator(`#edit-user-role-${userId}`).selectOption("agent");
    await submitEditUser(page, userId);

    await expect
      .poll(
        async () => {
          const [u] = await db
            .select({
              helpdeskId: users.helpdeskId,
              helpdeskName: users.helpdeskName,
            })
            .from(users)
            .where(eq(users.id, userId));
          return { id: u?.helpdeskId, name: u?.helpdeskName };
        },
        { timeout: 10000 },
      )
      .toEqual({ id: null, name: null });

    await expect
      .poll(async () => readFlags(agentId), { timeout: 10000 })
      .toEqual({
        enCronograma: false,
        asignableCubic: false,
        incluidoCalidad: false,
        asignableAgs: false,
      });
  });
});
