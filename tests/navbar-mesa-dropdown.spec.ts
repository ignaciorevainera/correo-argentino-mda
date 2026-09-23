import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../src/db/index";
import { users, sessions, mesas } from "../src/db/schema";
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

const stamp = Date.now();
const MESA_NAME = `TI_GSM_Test_Mesa_${stamp}`;
const mesaInvgateId = 991_000 + (stamp % 8_000);
const WITH_MESA_USERNAME = `nav_mesa_yes_${stamp}`;
const WITHOUT_MESA_USERNAME = `nav_mesa_no_${stamp}`;

let withMesaUserId = 0;
let withoutMesaUserId = 0;
let withMesaSession = "";
let withoutMesaSession = "";

test.beforeAll(async () => {
  await db.insert(mesas).values({
    invgateId: mesaInvgateId,
    name: MESA_NAME,
    active: true,
    lastSyncedAt: new Date().toISOString(),
  });

  const [withMesa] = await db
    .insert(users)
    .values({
      username: WITH_MESA_USERNAME,
      password: "hashed_fake_password",
      role: "agent",
      helpdeskId: mesaInvgateId,
      // Stale intencional: prueba que gana el nombre canonico del join (mesas.name).
      helpdeskName: `STALE_${stamp}`,
    })
    .returning({ id: users.id });
  withMesaUserId = withMesa.id;
  withMesaSession = `session-nav-mesa-yes-${stamp}`;
  await db.insert(sessions).values({
    id: withMesaSession,
    userId: withMesa.id,
    expiresAt: Date.now() + 1000 * 60 * 60,
  });

  const [withoutMesa] = await db
    .insert(users)
    .values({
      username: WITHOUT_MESA_USERNAME,
      password: "hashed_fake_password",
      role: "agent",
    })
    .returning({ id: users.id });
  withoutMesaUserId = withoutMesa.id;
  withoutMesaSession = `session-nav-mesa-no-${stamp}`;
  await db.insert(sessions).values({
    id: withoutMesaSession,
    userId: withoutMesa.id,
    expiresAt: Date.now() + 1000 * 60 * 60,
  });
});

test.afterAll(async () => {
  await db.delete(sessions).where(eq(sessions.id, withMesaSession));
  await db.delete(sessions).where(eq(sessions.id, withoutMesaSession));
  await db.delete(users).where(eq(users.id, withMesaUserId));
  await db.delete(users).where(eq(users.id, withoutMesaUserId));
  await db.delete(mesas).where(eq(mesas.invgateId, mesaInvgateId));
});

test.describe("Navbar dropdown mesa display", () => {
  test("dropdown shows raw mesa name below role when user has active mesa", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "session_id",
        value: signSessionId(withMesaSession),
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/");

    await page.locator("nav.navbar .dropdown [role='button']").first().click();

    const title = page.locator("nav.navbar .dropdown .menu-title").first();
    await expect(title).toBeVisible();

    const username = title.locator("span", { hasText: WITH_MESA_USERNAME });
    const role = title.locator("span", { hasText: "Agente" });
    const mesa = title.locator("[data-user-mesa]");

    await expect(username).toBeVisible();
    await expect(role).toHaveText("Agente");
    await expect(mesa).toHaveText(MESA_NAME);
    const mesaBox = await mesa.boundingBox();
    const roleBox = await role.boundingBox();
    expect(mesaBox).not.toBeNull();
    expect(roleBox).not.toBeNull();
    expect(mesaBox!.y).toBeGreaterThan(roleBox!.y);
  });

  test("dropdown shows Sin mesa below role when user has no mesa", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "session_id",
        value: signSessionId(withoutMesaSession),
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/");

    await page.locator("nav.navbar .dropdown [role='button']").first().click();

    const title = page.locator("nav.navbar .dropdown .menu-title").first();
    await expect(title).toBeVisible();

    const username = title.locator("span", { hasText: WITHOUT_MESA_USERNAME });
    const role = title.locator("span", { hasText: "Agente" });
    const mesa = title.locator("[data-user-mesa]");

    await expect(username).toBeVisible();
    await expect(role).toHaveText("Agente");
    await expect(mesa).toHaveText("Sin mesa");
    const mesaBox = await mesa.boundingBox();
    const roleBox = await role.boundingBox();
    expect(mesaBox).not.toBeNull();
    expect(roleBox).not.toBeNull();
    expect(mesaBox!.y).toBeGreaterThan(roleBox!.y);
  });
});
