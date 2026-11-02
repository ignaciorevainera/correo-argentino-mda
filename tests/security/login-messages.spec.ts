import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { sessions, users } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

let testUserId: number;
const knownUsername = `test_loginmsg_${Date.now()}`;
const knownPassword = "TestPass1234";

// Pre-computed bcrypt hash for test user
let hashedPassword: string;

test.beforeAll(async () => {
  hashedPassword = await bcrypt.hash(knownPassword, 4);

  const [newUser] = await db
    .insert(users)
    .values({
      username: knownUsername,
      password: hashedPassword,
      role: "agent",
    })
    .returning({ id: users.id });
  testUserId = newUser.id;
});

test.afterAll(async () => {
  // El login correcto crea una sesión: sin borrarla el FK impide borrar el user.
  await db.delete(sessions).where(eq(sessions.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));
});

test.describe("Login shell", () => {
  test("no renderiza sidebar ni header autenticado", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("nav.navbar")).toHaveCount(0);
    await expect(page.locator("#main-drawer")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Portal MDA" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
    await expect(page.locator("#login-username")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("img[data-brand-logo]")
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
  });

  test("el botón de ingreso muestra el estado de envío", async ({ page }) => {
    await page.goto("/login");

    // El POST se resuelve sin navegar para poder observar el estado del botón.
    await page.route("**/login", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({ status: 204 });
    });

    await page.locator("#login-username").fill("estado_envio_test");
    await page.locator("#login-password").fill("Cualquiera123");

    const submit = page.locator("[data-login-submit]");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText(/Ingresando/);
  });

  test("océano ASCII: se renderiza y reacciona al puntero", async ({ page }) => {
    await page.goto("/login");

    const canvas = page.locator("canvas[data-ascii-ocean]");
    await expect(canvas).toHaveAttribute("aria-hidden", "true");
    // `data-ascii-ready` lo setea el script cuando terminó el primer render.
    await expect
      .poll(() => canvas.getAttribute("data-ascii-ready"))
      .toBe("true");

    const size = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);

    // El puntero sobre el panel genera perturbaciones.
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, {
      steps: 8,
    });
    await expect
      .poll(async () => Number((await canvas.getAttribute("data-ripples")) ?? 0))
      .toBeGreaterThan(0);

    // La superficie se anima de forma continua (cambia entre frames).
    const sample = () =>
      canvas.evaluate((el: HTMLCanvasElement) => {
        const context = el.getContext("2d");
        if (!context) return 0;
        const { data } = context.getImageData(
          0,
          0,
          el.width,
          Math.min(300, el.height),
        );
        let sum = 0;
        for (let i = 3; i < data.length; i += 4) sum += data[i];
        return sum;
      });
    const first = await sample();
    await page.waitForTimeout(400);
    const second = await sample();
    expect(second).not.toBe(first);
  });

  test("océano ASCII: estático con prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");

    const canvas = page.locator("canvas[data-ascii-ocean]");
    await expect
      .poll(() => canvas.getAttribute("data-ascii-static"))
      .toBe("true");
  });
});

test.describe("Generador de firmas público", () => {
  test("usa chrome mínimo sin sidebar ni búsqueda", async ({ page }) => {
    await page.goto("/generador-firmas");

    await expect(page.locator("#main-drawer")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /búsqueda maestra/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /iniciar sesión/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Generador de firmas" }),
    ).toBeVisible();
  });
});

test.describe("S3.2 Login message enumeration", () => {
  test("wrong password returns generic message", async ({ request }) => {
    const response = await request.post("/login", {
      form: { username: knownUsername, password: "WrongPassword!" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    const location = response.headers()["location"] || "";
    expect(location).toContain("toast_msg=");
    expect(location).toContain(encodeURIComponent("Credenciales inválidas"));
    expect(location).not.toContain("Contraseña");
  });

  test("non-existent user returns same generic message", async ({
    request,
  }) => {
    const response = await request.post("/login", {
      form: { username: `nonexistent_${Date.now()}`, password: "AnyPass123!" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    const location = response.headers()["location"] || "";
    // Mismo mensaje genérico que el caso anterior.
    expect(location).toContain(encodeURIComponent("Credenciales inválidas"));
  });

  test("correct password returns success redirect", async ({ request }) => {
    const response = await request.post("/login", {
      form: { username: knownUsername, password: knownPassword },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    const location = response.headers()["location"] || "";
    // Successful login redirects to / (cleanBase) without toast_msg
    expect(location).not.toContain("toast_msg");
  });
});
