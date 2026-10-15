// tests/cronograma/new-month-modal.spec.ts
//
// Alta de mes (#141). El modal deriva años/meses de los datos disponibles
// (no de literales), marca/deshabilita las combinaciones ya cargadas y
// deshabilita confirmar cuando la selección ya existe. El endpoint POST
// responde 409 para un mes existente SIN ejecutar la transacción destructiva
// (no borra/reinserta → no pierde overrides).
import "dotenv/config";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { db } from "../../src/db/index";
import { agents, saturdayRotationConfig, schedules } from "../../src/db/schema";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";
import { ignoreSsrInitialData } from "../helpers/cronograma";

const CURRENT_YEAR = new Date().getFullYear();

function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  );
}

function operatorWithDate(date: string) {
  return {
    id: 1,
    nombre: "New Month Op",
    horario: "09:00-18:00",
    location: "Monte Grande",
    asistencia: { [date]: "Trabajando" },
  };
}

async function stubCronogramaGet(
  page: Page,
  payload: Record<string, unknown>,
): Promise<void> {
  await ignoreSsrInitialData(page);
  await page.route("**/api/cronograma", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: payload });
  });
}

async function openModal(page: Page): Promise<void> {
  await page.goto("/supervision/cronograma");
  await page.waitForSelector("#monthly-table");
  await page.waitForFunction(
    () => {
      const el = document.getElementById(
        "date-input",
      ) as HTMLInputElement | null;
      return !!el && !!el.value;
    },
    null,
    { timeout: 20000 },
  );
  await page.click("#add-month-btn");
  await expect(page.locator("#new-month-modal")).toBeVisible();
}

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("alta de mes: opciones derivadas y guard 409", () => {
  test("deriva años del rango, marca los meses cargados y deshabilita confirmar", async ({
    context,
    page,
  }) => {
    const loadedYear = CURRENT_YEAR;
    const nextYear = CURRENT_YEAR + 1;
    const currentMonth = `${loadedYear}-${String(
      new Date().getMonth() + 1,
    ).padStart(2, "0")}`;

    await stubCronogramaGet(page, {
      operators: [operatorWithDate(`${currentMonth}-10`)],
      weekendOvertimeConfigs: [],
      // Año completo cargado + un mes del año siguiente (para probar el rango).
      availableMonths: [...monthsOfYear(loadedYear), `${nextYear}-01`],
      activeMonth: currentMonth,
    });
    await setSessionCookie(context, user.signedSessionId);

    await openModal(page);

    // Años derivados del rango real, con un año extra hacia adelante.
    const yearOptions = page.locator("#new-month-year option");
    await expect(yearOptions).toHaveCount(3);
    await expect(yearOptions.nth(0)).toHaveAttribute(
      "value",
      String(loadedYear),
    );
    await expect(yearOptions.nth(2)).toHaveAttribute(
      "value",
      String(nextYear + 1),
    );

    // Año completo cargado: todos los meses deshabilitados y confirmar off.
    await page.selectOption("#new-month-year", String(loadedYear));
    for (let i = 0; i < 12; i++) {
      await expect(
        page.locator(`#new-month-month option[value="${i}"]`),
      ).toBeDisabled();
    }
    await expect(page.locator("#confirm-new-month")).toBeDisabled();

    // Año con hueco: el mes cargado queda marcado, hay libres y confirmar on.
    await page.selectOption("#new-month-year", String(nextYear));
    const loadedOption = page.locator('#new-month-month option[value="0"]');
    await expect(loadedOption).toBeDisabled();
    await expect(loadedOption).toHaveText(/ya cargado/i);
    await expect(
      page.locator('#new-month-month option[value="1"]'),
    ).toBeEnabled();
    await expect(page.locator("#confirm-new-month")).toBeEnabled();
  });

  test("POST de un mes existente responde 409 y preserva los datos", async ({
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await setSessionCookie(context, user.signedSessionId);

    const year = 2098;
    const monthIndex = 2; // Marzo
    const prefix = `${year}-03`;

    const agentRows = await db
      .select({ id: agents.id })
      .from(agents)
      .limit(2);
    expect(agentRows.length).toBeGreaterThan(0);

    const inserted = await db
      .insert(schedules)
      .values(
        agentRows.map((a, i) => ({
          agentId: a.id,
          date: `${prefix}-1${i}`,
          status: "OverrideTest",
          comment: "no perder",
          isOverride: true,
        })),
      )
      .returning({ id: schedules.id });
    const insertedIds = inserted.map((r) => r.id);

    try {
      const before = await db
        .select()
        .from(schedules)
        .where(like(schedules.date, `${prefix}-%`));
      expect(before.length).toBe(agentRows.length);

      const res = await context.request.post(
        new URL("/api/cronograma/months", baseURL).href,
        {
          data: { year, month: monthIndex },
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(res.status()).toBe(409);

      const after = await db
        .select()
        .from(schedules)
        .where(like(schedules.date, `${prefix}-%`));
      expect(after.length).toBe(agentRows.length);
      expect(after.map((r) => r.status)).toEqual(
        agentRows.map(() => "OverrideTest"),
      );
      expect(after.every((r) => r.isOverride)).toBe(true);
    } finally {
      for (const id of insertedIds) {
        await db.delete(schedules).where(eq(schedules.id, id));
      }
    }
  });

  test("DELETE limpia la config de rotación (el guard 409 deja de bloquear)", async ({
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await setSessionCookie(context, user.signedSessionId);

    const year = 2098;
    const monthIndex = 3; // Abril
    const prefix = `${year}-04`;

    await db
      .insert(saturdayRotationConfig)
      .values({ month: prefix })
      .onConflictDoNothing();

    try {
      // Con solo la config de rotación ya alcanza para que el POST corte.
      const post = await context.request.post(
        new URL("/api/cronograma/months", baseURL).href,
        {
          data: { year, month: monthIndex },
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(post.status()).toBe(409);

      const del = await context.request.delete(
        new URL("/api/cronograma/months", baseURL).href,
        {
          data: { year, month: monthIndex },
          headers: { "Content-Type": "application/json" },
        },
      );
      expect(del.status()).toBe(200);

      const left = await db
        .select({ id: saturdayRotationConfig.id })
        .from(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, prefix));
      expect(left.length).toBe(0);
    } finally {
      await db
        .delete(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, prefix));
    }
  });
});
