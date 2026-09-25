import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import { mesas, sessions, users } from "../src/db/schema";

const SECRET =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";
const createdUserIds: number[] = [];
const createdSessionIds: string[] = [];

function sign(id: string): string {
  return `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;
}

async function login(context: any, sessionId: string): Promise<void> {
  const base = test.info().project.use.baseURL ?? "http://localhost:4321";
  await context.addCookies([
    {
      name: "session_id",
      value: sign(sessionId),
      domain: new URL(base).hostname,
      path: "/",
    },
  ]);
}

async function seedUser(
  role: "agent" | "supervisor" | "admin",
  helpdeskName: string | null,
): Promise<string> {
  const [mesa] = helpdeskName
    ? await db
        .select({ invgateId: mesas.invgateId })
        .from(mesas)
        .where(eq(mesas.name, helpdeskName))
    : [undefined];
  const username = `access_${role}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({
      username,
      password: "x",
      role,
      helpdeskId: mesa?.invgateId ?? null,
      helpdeskName,
    })
    .returning({ id: users.id });
  const sessionId = `access_session_${username}`;
  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt: Date.now() + 86400000,
  });
  createdUserIds.push(user.id);
  createdSessionIds.push(sessionId);
  return sessionId;
}

test.beforeAll(async () => {
  await db
    .insert(mesas)
    .values([
      {
        invgateId: 910020,
        name: MDA,
        displayName: null,
        active: true,
        assignable: true,
        lastSyncedAt: new Date().toISOString(),
      },
      {
        invgateId: 910021,
        name: COORD,
        displayName: null,
        active: true,
        assignable: true,
        lastSyncedAt: new Date().toISOString(),
      },
    ])
    .onConflictDoNothing();
});

test.afterAll(async () => {
  for (const sessionId of createdSessionIds) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
});

test.describe("Acceso público de inventario y catálogo", () => {
  test("anónimo accede a inventario y aplicativos, pero no a cubics", async ({
    page,
  }) => {
    let response = await page.goto("/inventario-terminales");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/inventario-terminales");
    await expect(page.getByRole("radio", { name: "Cúbics" })).toHaveCount(0);
    await expect(
      page.locator("#inventory-view-switcher [data-view-switcher]"),
    ).toHaveClass(/grid-cols-3/);

    response = await page.goto("/inventario-terminales?inventory_tabs=cubics");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/inventario-terminales");
    await expect(page.getByRole("radio", { name: "Terminales" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Cúbics" })).toHaveCount(0);

    response = await page.goto("/recursos/aplicativos");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/recursos/aplicativos");

    await page.goto("/inventario-terminales/cubics/create");
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("Coordinación accede a bases públicas, pero no a cubics", async ({
    context,
    page,
  }) => {
    await login(context, await seedUser("agent", COORD));

    let response = await page.goto("/inventario-terminales");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/inventario-terminales");
    await expect(page.getByRole("radio", { name: "Cúbics" })).toHaveCount(0);

    response = await page.goto("/inventario-terminales?inventory_tabs=cubics");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/inventario-terminales");
    await expect(page.getByRole("radio", { name: "Terminales" })).toBeChecked();

    response = await page.goto("/recursos/aplicativos");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/recursos/aplicativos");

    await page.goto("/inventario-terminales/cubics/create");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("MDA TI ve el tab y listado de cubics", async ({ context, page }) => {
    await login(context, await seedUser("supervisor", MDA));

    const response = await page.goto("/inventario-terminales");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/inventario-terminales");
    await expect(page.getByRole("radio", { name: "Cúbics" })).toBeVisible();
    await expect(
      page.locator("#inventory-view-switcher [data-view-switcher]"),
    ).toHaveClass(/grid-cols-4/);

    await page.goto("/inventario-terminales?inventory_tabs=cubics");
    await expect(page.getByRole("radio", { name: "Cúbics" })).toBeChecked();
    await expect(page.locator("#view-cubics")).toBeVisible();
  });

  test("admin conserva acceso a cubics sin mesa MDA TI", async ({
    context,
    page,
  }) => {
    await login(context, await seedUser("admin", null));

    const response = await page.goto("/inventario-terminales");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/inventario-terminales");
    await expect(page.getByRole("radio", { name: "Cúbics" })).toBeVisible();
  });
});
