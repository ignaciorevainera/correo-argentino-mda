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

  async function openChangeRole(page: Page, userId: number): Promise<void> {
    await login(page.context(), adminCookie);
    await page.goto("/admin/usuarios");
    const btn = page.locator(
      `[data-action="change-role-btn"][data-user-id="${userId}"]`,
    );
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator("#modal-change-role")).toBeVisible();
  }

  async function pickHelpdesk(page: Page, mesaName: string): Promise<void> {
    const [m] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, mesaName));
    const select = page.locator("#change-role-helpdesk-select");
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

  async function submitChangeRole(page: Page): Promise<void> {
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/admin/usuarios") &&
          r.request().method() === "POST",
      ),
      page.locator("#modal-change-role button[type='submit']").click(),
    ]);
    expect(resp.ok()).toBeTruthy();
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

    await openChangeRole(page, userId);
    await pickHelpdesk(page, COORD);
    await page.locator("#change-role-select").selectOption("agent");
    await submitChangeRole(page);

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

    await openChangeRole(page, userId);
    await pickHelpdesk(page, MDA_TI);
    await page.locator("#change-role-select").selectOption("referent");
    await submitChangeRole(page);

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

    await openChangeRole(page, userId);
    await pickHelpdesk(page, MDA_TI);
    await page.locator("#change-role-select").selectOption("supervisor");
    await submitChangeRole(page);

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
});
