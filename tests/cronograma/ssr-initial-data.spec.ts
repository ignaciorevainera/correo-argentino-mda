// tests/cronograma/ssr-initial-data.spec.ts
//
// #267: el primer render del cronograma no debe pedir el payload por API.
// El servidor lo embebe en `window.__CRONOGRAMA_INITIAL_DATA__` y el cliente
// lo consume (y lo borra) durante su init.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";
import { ignoreSsrInitialData } from "../helpers/cronograma";

function monthOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("datos iniciales por SSR", () => {
  test("el primer render no pide /api/cronograma y consume el dato inicial", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, user.signedSessionId);

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#monthly-view tbody tr").first()).toBeVisible({
      timeout: 20000,
    });

    const apiCalls = requests.filter(
      (u) => new URL(u).pathname === "/api/cronograma",
    );
    expect(apiCalls).toHaveLength(0);

    // Hardening: ni siquiera un GET tardío debe aparecer.
    await page.waitForLoadState("networkidle");
    expect(
      requests.filter((u) => new URL(u).pathname === "/api/cronograma"),
    ).toHaveLength(0);

    // El canal SSR se consumió: el cliente hace delete del global al usarlo.
    expect(
      await page.evaluate(() =>
        Boolean(
          (window as unknown as Record<string, unknown>)
            .__CRONOGRAMA_INITIAL_DATA__,
        ),
      ),
    ).toBe(false);
  });

  test("sin payload SSR, el cliente cae al GET y la tabla se renderiza", async ({
    context,
    page,
  }) => {
    // Equivale al caso `initialData = null` (payload SSR fallido): el cliente
    // debe caer al GET normal y renderizar igual.
    const current = monthOffset(0);
    await setSessionCookie(context, user.signedSessionId);
    await ignoreSsrInitialData(page);
    await page.route("**/api/cronograma", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        json: {
          operators: [
            {
              id: 1,
              nombre: "Fallback Op",
              horario: "09:00-18:00",
              location: "Monte Grande",
              asistencia: { [`${current}-10`]: "Trabajando" },
            },
          ],
          weekendOvertimeConfigs: [],
          availableMonths: [current],
          activeMonth: current,
        },
      });
    });

    let apiCalls = 0;
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/api/cronograma") apiCalls++;
    });

    await page.goto("/supervision/cronograma");
    await expect(page.locator("#monthly-view tbody tr").first()).toBeVisible({
      timeout: 20000,
    });
    expect(apiCalls).toBeGreaterThan(0);
  });
});
