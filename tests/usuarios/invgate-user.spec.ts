import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, employees } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

const suffix = Date.now();
let testUserId: number;
let rawSessionId = `session_invgate_user_${suffix}`;
let signedSessionId: string;

const seededUsername = `test_not_invgate_${suffix}`;
const seededDni = `dni${suffix}`;

test.beforeAll(async () => {
  signedSessionId = signSessionId(rawSessionId);

  const [newUser] = await db
    .insert(users)
    .values({
      username: `test_invgate_user_${suffix}`,
      password: "hashed_fake_password",
      role: "admin",
    })
    .returning({ id: users.id });
  testUserId = newUser.id;

  await db.insert(sessions).values({
    id: rawSessionId,
    userId: testUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  await db.insert(employees).values({
    dni: seededDni,
    username: seededUsername,
    fullname: `Test No InvGate ${suffix}`,
    invgateExists: false,
  });
});

test.afterAll(async () => {
  await db.delete(employees).where(eq(employees.dni, seededDni));
  await db.delete(sessions).where(eq(sessions.id, rawSessionId));
  await db.delete(users).where(eq(users.id, testUserId));
});

test.describe("GET /api/usuarios/invgate-user", () => {
  test("400 cuando falta username", async ({ request }) => {
    const res = await request.get("/api/usuarios/invgate-user");
    expect(res.status()).toBe(400);
  });

  test("400 cuando username tiene formato inválido", async ({ request }) => {
    const res = await request.get(
      "/api/usuarios/invgate-user?username=usuario%20invalido",
    );
    expect(res.status()).toBe(400);
  });

  test("200 inInvGate false reason not_found para empleado inexistente", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/usuarios/invgate-user?username=zzz_nadie_${suffix}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.inInvGate).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  test("200 inInvGate false reason not_in_invgate para empleado sin cuenta InvGate", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/usuarios/invgate-user?username=${seededUsername}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.inInvGate).toBe(false);
    expect(body.reason).toBe("not_in_invgate");
  });

  test("200 happy path para empleado sincronizado en InvGate", async ({
    request,
  }) => {
    const [synced] = await db
      .select({ username: employees.username })
      .from(employees)
      .where(eq(employees.invgateExists, true))
      .limit(1);
    test.skip(!synced, "No hay empleados sincronizados en InvGate en esta BD");

    const username = synced.username.split("@")[0].toLowerCase();
    const res = await request.get(
      `/api/usuarios/invgate-user?username=${encodeURIComponent(username)}`,
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.inInvGate).toBe(true);
    expect(typeof body.user.id).toBe("number");
    expect(typeof body.user.email).toBe("string");
    expect(Array.isArray(body.org.groups)).toBe(true);
    expect(Array.isArray(body.org.helpdesks)).toBe(true);
    expect(Array.isArray(body.org.locations)).toBe(true);
    expect(Array.isArray(body.org.companies)).toBe(true);
    expect(typeof body.openTickets).toBe("number");
    expect(Array.isArray(body.tickets)).toBe(true);
    for (const t of body.tickets) {
      expect(typeof t.pretty_id).toBe("string");
      expect(typeof t.status_name).toBe("string");
      expect(typeof t.role).toBe("string");
    }
    expect(body.user.fullname).toBeTruthy();
  });

  test("tab InvGate visible para empleado sincronizado en InvGate", async ({
    context,
    page,
  }) => {
    const [synced] = await db
      .select({ username: employees.username })
      .from(employees)
      .where(eq(employees.invgateExists, true))
      .limit(1);
    test.skip(!synced, "No hay empleados sincronizados en InvGate en esta BD");

    const username = synced.username.split("@")[0].toLowerCase();

    await context.addCookies([
      {
        name: "session_id",
        value: signedSessionId,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/buscador-usuarios");
    await page.fill("#search-input", username);
    await expect(
      page.locator(".card:not(.skeleton-debounced)").first(),
    ).toBeVisible({ timeout: 15000 });

    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const card = page.locator(".card").filter({
      has: page.locator(".user-card-username-btn", {
        hasText: new RegExp(`^\\s*${escaped}\\s*$`, "i"),
      }),
    });
    await card.locator("[data-net-user-btn]").click();
    await expect(page.locator("#terminal-modal")).toBeVisible();
    await expect(page.locator("#tab-invgate-btn")).toBeVisible();

    await page.locator("#tab-invgate-btn").click();
    await expect(page.locator("#view-invgate")).toBeVisible();
    await expect(page.locator("#invgate-email")).not.toHaveText("-", {
      timeout: 15000,
    });
  });

  test("tab InvGate oculto para empleado sin cuenta InvGate", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: "session_id",
        value: signedSessionId,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/buscador-usuarios");
    await page.fill("#search-input", seededUsername);
    await expect(
      page.locator(".card:not(.skeleton-debounced)").first(),
    ).toBeVisible({ timeout: 15000 });

    const card = page.locator(".card").filter({
      has: page.locator(".user-card-username-btn", { hasText: seededUsername }),
    });
    await card.locator("[data-net-user-btn]").click();
    await expect(page.locator("#terminal-modal")).toBeVisible();
    await expect(page.locator("#tab-invgate-btn")).toBeHidden();
  });

  test("tab InvGate se oculta al reabrir modal con empleado sin cuenta InvGate", async ({
    context,
    page,
  }) => {
    const [synced] = await db
      .select({ username: employees.username })
      .from(employees)
      .where(eq(employees.invgateExists, true))
      .limit(1);
    test.skip(!synced, "No hay empleados sincronizados en InvGate en esta BD");

    const syncedUser = synced.username.split("@")[0].toLowerCase();
    const escaped = syncedUser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    await context.addCookies([
      {
        name: "session_id",
        value: signedSessionId,
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/buscador-usuarios");

    await page.fill("#search-input", syncedUser);
    await expect(
      page.locator(".card:not(.skeleton-debounced)").first(),
    ).toBeVisible({ timeout: 15000 });
    const syncedCard = page.locator(".card").filter({
      has: page.locator(".user-card-username-btn", {
        hasText: new RegExp(`^\\s*${escaped}\\s*$`, "i"),
      }),
    });
    await syncedCard.locator("[data-net-user-btn]").click();
    await expect(page.locator("#tab-invgate-btn")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#terminal-modal")).toBeHidden();

    await page.fill("#search-input", seededUsername);
    await expect(
      page.locator(".card:not(.skeleton-debounced)").first(),
    ).toBeVisible({ timeout: 15000 });
    const plainCard = page.locator(".card").filter({
      has: page.locator(".user-card-username-btn", { hasText: seededUsername }),
    });
    await plainCard.locator("[data-net-user-btn]").click();
    await expect(page.locator("#terminal-modal")).toBeVisible();
    await expect(page.locator("#tab-invgate-btn")).toBeHidden();
  });
});
