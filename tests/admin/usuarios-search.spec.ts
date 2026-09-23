import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, agents } from "../../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

test.describe("Búsqueda de usuarios", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;
  const createdUserIds: number[] = [];

  test.beforeAll(async () => {
    const ts = Date.now();
    adminSession = `sess_usersearch_${ts}`;
    const [u] = await db
      .insert(users)
      .values({
        username: `admin_usersearch_${ts}`,
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
    if (createdUserIds.length > 0) {
      // Agents primero (identidad por user_id), despues users.
      await db.delete(agents).where(inArray(agents.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function seedUser(
    username: string,
    role: string,
    helpdeskName: string | null,
    fullName?: string,
  ): Promise<void> {
    const [u] = await db
      .insert(users)
      .values({ username, password: "x", role, helpdeskName })
      .returning({ id: users.id });
    createdUserIds.push(u.id);
    if (fullName) {
      // Nombre visible vinculado por user_id (el listado hace join por userId).
      await db.insert(agents).values({ name: fullName, userId: u.id });
    }
  }

  async function login(page: Page, signed: string): Promise<void> {
    await page.context().addCookies([
      { name: "session_id", value: signed, domain: "localhost", path: "/" },
    ]);
  }

  test("filtra por nombre de red y mantiene la tabla visible", async ({
    page,
  }) => {
    const ts = Date.now();
    const alice = `0search_alice_${ts}`;
    const bob = `0search_bob_${ts}`;
    await seedUser(alice, "agent", null);
    await seedUser(bob, "agent", null);

    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    await expect(
      page.locator(`[data-sort-username="${alice}"]`).first(),
    ).toBeVisible();

    await page.fill("#admin-users-search", "alice");
    await expect(
      page.locator(`[data-sort-username="${alice}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`[data-sort-username="${bob}"]`).first(),
    ).toBeHidden();
    await expect(page.locator("#usuarios-table").first()).toBeVisible();
  });

  test("releva por mesa de ayuda y por rol", async ({ page }) => {
    const ts = Date.now();
    const coordUser = `0search_coord_${ts}`;
    const mdaUser = `0search_mda_${ts}`;
    await seedUser(coordUser, "agent", "TI_GSM_Mesa de Coord");
    await seedUser(mdaUser, "team_leader", "TI_GSM_MDA TI");

    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    await expect(
      page.locator(`[data-sort-username="${coordUser}"]`).first(),
    ).toBeVisible();

    await page.fill("#admin-users-search", "Mesa de Coord");
    await expect(
      page.locator(`[data-sort-username="${coordUser}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`[data-sort-username="${mdaUser}"]`).first(),
    ).toBeHidden();

    await page.fill("#admin-users-search", "team leader");
    await expect(
      page.locator(`[data-sort-username="${mdaUser}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator(`[data-sort-username="${coordUser}"]`).first(),
    ).toBeHidden();
  });

  test("destaca las coincidencias en usuario y mesa", async ({ page }) => {
    const ts = Date.now();
    const user = `0search_hl_${ts}`;
    await seedUser(user, "agent", "TI_GSM_Mesa de Coord");

    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    const row = page.locator(`[data-sort-username="${user}"]`).first();
    await expect(row).toBeVisible();

    await page.fill("#admin-users-search", "hl_");
    await expect(row.locator("mark")).toHaveText("hl_");

    await page.fill("#admin-users-search", "coord");
    await expect(row.locator("mark")).toHaveText(/coord/i);
  });

  test("filtra por nombre completo y muestra la columna Nombre", async ({
    page,
  }) => {
    const ts = Date.now();
    const gonzalez = `0search_nombre_${ts}`;
    const other = `0search_otronombre_${ts}`;
    await seedUser(gonzalez, "agent", null, `Gonzalez Ana ${ts}`);
    await seedUser(other, "agent", null, `Perez Luis ${ts}`);

    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    const row = page.locator(`[data-sort-username="${gonzalez}"]`).first();
    await expect(row).toBeVisible();

    await page.fill("#admin-users-search", "Gonzalez");
    await expect(row).toBeVisible();
    await expect(
      row.locator("[data-highlight-target]", { hasText: "Gonzalez" }),
    ).toBeVisible();
    await expect(
      page.locator(`[data-sort-username="${other}"]`).first(),
    ).toBeHidden();
  });

  test("destaca la coincidencia en la columna Nombre", async ({ page }) => {
    const ts = Date.now();
    const user = `0search_hlname_${ts}`;
    await seedUser(user, "agent", null, `Ramirez Coord ${ts}`);

    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    const row = page.locator(`[data-sort-username="${user}"]`).first();
    await expect(row).toBeVisible();

    await page.fill("#admin-users-search", "Ramirez");
    const nameCell = row.locator("[data-highlight-target]", {
      hasText: "Ramirez",
    });
    await expect(nameCell.locator("mark")).toHaveText("Ramirez");
  });

  test("la columna Nombre aparece entre Usuario y Rol", async ({ page }) => {
    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    const sortKeys = page.locator(
      "#usuarios-table [data-table-header] [data-table-sort-key]",
    );
    await expect(sortKeys.nth(0)).toHaveAttribute(
      "data-table-sort-key",
      "username",
    );
    await expect(sortKeys.nth(1)).toHaveAttribute(
      "data-table-sort-key",
      "name",
    );
    await expect(sortKeys.nth(2)).toHaveAttribute(
      "data-table-sort-key",
      "role",
    );
    await expect(sortKeys.nth(1)).toContainText(/nombre/i);
  });

  test("sin resultados muestra el empty state y permite limpiar", async ({
    page,
  }) => {
    const ts = Date.now();
    const user = `0search_empty_${ts}`;
    await seedUser(user, "agent", null);

    await login(page, adminCookie);
    await page.goto("/admin/usuarios");
    await expect(
      page.locator(`[data-sort-username="${user}"]`).first(),
    ).toBeVisible();

    await page.fill("#admin-users-search", "zzzsinresultados");
    const empty = page.locator("#usuarios-table-empty-state");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText("Sin usuarios que coincidan");
    await expect(empty).toContainText("No encontramos usuarios");

    await page.click("#admin-users-search-clear");
    await expect(
      page.locator(`[data-sort-username="${user}"]`).first(),
    ).toBeVisible();
  });

  test.describe("fallback sin JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("muestra el skeleton del buscador", async ({ page }) => {
      await login(page, adminCookie);
      await page.goto("/admin/usuarios");
      await expect(
        page.getByTestId("usuarios-search-skeleton"),
      ).toBeVisible();
    });
  });
});
