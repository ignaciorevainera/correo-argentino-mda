import "dotenv/config";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { db } from "../../src/db/index";
import {
  users,
  sessions,
  resourceCategories,
  resourceLinks,
} from "../../src/db/schema";
import { eq } from "drizzle-orm";
import {
  createHmac,
  createCipheriv,
  randomBytes,
  createHash,
} from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

function encKey(): Buffer {
  return createHash("sha256")
    .update(process.env.ENCRYPTION_KEY as string)
    .digest();
}

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted}`;
}

const LINK_TITLE =
  "Enlace Credenciales E2E con un título largo que debe truncarse";
const LINK_SUBTITLE =
  "Subtítulo de credenciales E2E lo bastante largo como para truncarse";
const LONG_USERNAME = "usuario.mesa.ayuda.mda@correoargentino.com.ar";
const LONG_PASSWORD = "Sup3r-S3cret-P@ssw0rd-Larga!";

const rawSessionId = `session_creds_layout_${Date.now()}`;
const MOCK_SESSION_ID = signSessionId(rawSessionId);
let testUserId: number;
let categoryId: number;
let linkId: number;

test.beforeAll(async () => {
  const [newUser] = await db
    .insert(users)
    .values({
      username: `admin_creds_layout_${Date.now()}`,
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

  const [cat] = await db
    .insert(resourceCategories)
    .values({
      title: "Cat Creds Layout E2E",
      iconName: "boxicons:link",
      sortOrder: -9999,
    })
    .returning({ id: resourceCategories.id });
  categoryId = cat.id;

  const [link] = await db
    .insert(resourceLinks)
    .values({
      categoryId,
      title: LINK_TITLE,
      subtitle: LINK_SUBTITLE,
      url: "https://example.com/creds-layout",
      credentialUsername: LONG_USERNAME,
      credentialPassword: encrypt(LONG_PASSWORD),
    })
    .returning({ id: resourceLinks.id });
  linkId = link.id;
});

test.afterAll(async () => {
  if (linkId) await db.delete(resourceLinks).where(eq(resourceLinks.id, linkId));
  if (categoryId)
    await db
      .delete(resourceCategories)
      .where(eq(resourceCategories.id, categoryId));
  if (rawSessionId)
    await db.delete(sessions).where(eq(sessions.id, rawSessionId));
  if (testUserId) await db.delete(users).where(eq(users.id, testUserId));
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "session_id",
      value: MOCK_SESSION_ID,
      domain: "localhost",
      path: "/",
    },
  ]);
});

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

const hOverlap = (a: Rect, b: Rect): number =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left);
const vOverlap = (a: Rect, b: Rect): number =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

interface Layout {
  card: Rect;
  container: Rect | null;
  input: Rect | null;
  toggle: Rect | null;
  copies: Rect[];
  usernameCode: Rect | null;
  actions: Rect | null;
  title: Rect | null;
  subtitle: Rect | null;
}

async function measure(item: Locator): Promise<Layout> {
  return item.evaluate((root): Layout => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      card: rect(root)!,
      container: rect(root.querySelector("details .bg-base-200")),
      input: rect(root.querySelector("[data-password-input]")),
      toggle: rect(root.querySelector("[data-toggle-password]")),
      copies: Array.from(
        root.querySelectorAll("details [data-copy-control]"),
      ).map((el) => rect(el) as Rect),
      usernameCode: rect(root.querySelector("details code")),
      actions: rect(root.querySelector("[data-link-actions]")),
      title: rect(root.querySelector("[data-link-title]")),
      subtitle: rect(root.querySelector("[data-link-subtitle]")),
    };
  });
}

async function openCredentials(item: Locator, page: Page): Promise<void> {
  const details = item.locator("details");
  await expect(details).toHaveCount(1);
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await item.locator("summary").click();
  }
  await expect(details).toHaveAttribute("open", "");
  await page.waitForTimeout(150);
}

function assertNoOverlapOrOverflow(label: string, l: Layout): void {
  const group = [
    l.actions,
    l.title,
    l.subtitle,
    l.input,
    l.toggle,
    l.usernameCode,
    ...l.copies,
  ].filter((r): r is Rect => r !== null);

  // 1. Todo dentro de la tarjeta (sin desborde horizontal)
  for (const [i, r] of group.entries()) {
    expect(
      r.right,
      `${label}: elemento #${i} desborda la tarjeta (${r.right} > ${l.card.right})`,
    ).toBeLessThanOrEqual(l.card.right + 1);
    expect(
      r.left,
      `${label}: elemento #${i} se sale por la izquierda`,
    ).toBeGreaterThanOrEqual(l.card.left - 1);
  }

  // 2. Contenedor de credenciales dentro de la tarjeta
  if (l.container) {
    expect(
      l.container.right,
      `${label}: contenedor de credenciales desborda la tarjeta`,
    ).toBeLessThanOrEqual(l.card.right + 1);
  }

  // 3. El campo de contraseña debe ser usable: domina su fila, no queda
  // colapsado entre los botones de acción.
  if (l.input && l.toggle && l.copies[1]) {
    const widestControl = Math.max(l.toggle.width, l.copies[1].width);
    expect(
      l.input.width,
      `${label}: input de contraseña colapsado (${l.input.width}px vs control ${widestControl}px)`,
    ).toBeGreaterThan(widestControl);
  }

  // 4. Sin solape entre elementos interactivos de la misma fila
  const cmp: Array<[string, Rect, Rect]> = [
    ["input/toggle", l.input, l.toggle],
    ["input/copy", l.input, l.copies[1] ?? null],
    ["toggle/copy", l.toggle, l.copies[1] ?? null],
    ["username/copy", l.usernameCode, l.copies[0] ?? null],
    ["actions/title", l.actions, l.title],
    ["actions/subtitle", l.actions, l.subtitle],
  ].filter((e): e is [string, Rect, Rect] => e[1] !== null && e[2] !== null);

  for (const [name, a, b] of cmp) {
    const ox = hOverlap(a, b);
    const oy = vOverlap(a, b);
    expect(
      ox > 1 && oy > 1,
      `${label}: solape ${name} (${ox.toFixed(1)}x${oy.toFixed(1)})`,
    ).toBe(false);
  }
}

async function gotoCards(
  page: Page,
  columns: number,
  viewport: { width: number; height: number },
): Promise<Locator> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ["enlacesViewColumns", String(columns)] as [string, string],
  );
  await page.setViewportSize(viewport);
  await page.goto("/recursos", { waitUntil: "load" });

  const item = page
    .locator("li[data-link-item]", { hasText: LINK_TITLE })
    .first();
  await expect(item).toBeVisible();
  return item;
}

test.describe("Layout de credenciales en /recursos", () => {
  test("4 columnas: credenciales no se superponen ni desbordan", async ({
    page,
  }) => {
    const item = await gotoCards(page, 4, { width: 1600, height: 900 });

    await expect(page.locator("html")).toHaveAttribute(
      "data-view-columns",
      "4",
    );

    await openCredentials(item, page);
    assertNoOverlapOrOverflow("4 columnas", await measure(item));
  });

  test("1/2/3 columnas siguen viéndose correctamente", async ({ page }) => {
    for (const columns of [1, 2, 3]) {
      const item = await gotoCards(page, columns, {
        width: 1600,
        height: 900,
      });
      await openCredentials(item, page);
      assertNoOverlapOrOverflow(`${columns} columnas`, await measure(item));
    }
  });

  test("viewport angosto (móvil) sin desborde", async ({ page }) => {
    const item = await gotoCards(page, 4, { width: 375, height: 800 });

    // En móvil el responsive acota a 1 columna efectiva
    await expect(page.locator("html")).toHaveAttribute(
      "data-view-columns",
      "1",
    );

    await openCredentials(item, page);
    assertNoOverlapOrOverflow("móvil", await measure(item));
  });
});
