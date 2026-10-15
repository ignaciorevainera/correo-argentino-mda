// tests/cronograma/initial-month.spec.ts
//
// Regla única de mes inicial (#139). El cliente ya no elige el día por el
// orden ascendente de uniqueDates (que sesgaba al mes más futuro): prioriza
// el mes en curso, luego el cargado más cercano hacia atrás, luego el más
// cercano hacia adelante. Se controla el payload del endpoint vía route para
// que el caso sea determinista (la DB real ya tiene datos del mes en curso).
import "dotenv/config";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions } from "../../src/db/schema";
import { ignoreSsrInitialData } from "../helpers/cronograma";

const SECRET =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const sign = (id: string) =>
  `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

function monthOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function operatorWithDate(date: string) {
  return {
    id: 1,
    nombre: "Initial Month Op",
    horario: "09:00-18:00",
    location: "Monte Grande",
    asistencia: { [date]: "Trabajando" },
  };
}

async function loginAsAdmin(
  context: BrowserContext,
  adminCookie: string,
): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
  const host = new URL(baseURL).hostname;
  await context.addCookies([
    { name: "session_id", value: adminCookie, domain: host, path: "/" },
    { name: "session_id", value: adminCookie, domain: "127.0.0.1", path: "/" },
  ]);
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

async function readInitialMonth(page: Page): Promise<string> {
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
  const value = await page.locator("#date-input").inputValue();
  return value.slice(0, 7);
}

test.describe("regla única de mes inicial", () => {
  let adminUserId = 0;
  let adminCookie = "";

  test.beforeAll(async () => {
    const ts = Date.now();
    const [admin] = await db
      .insert(users)
      .values({ username: `init_month_admin_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminUserId = admin.id;
    const sess = `sess_init_month_${ts}`;
    await db
      .insert(sessions)
      .values({ id: sess, userId: admin.id, expiresAt: Date.now() + 3600000 });
    adminCookie = sign(sess);
  });

  test.afterAll(async () => {
    if (adminUserId) {
      await db.delete(sessions).where(eq(sessions.userId, adminUserId));
      await db.delete(users).where(eq(users.id, adminUserId));
    }
  });

  test("con datos del mes en curso, abre el mes actual", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const prev = monthOffset(-2);
    const future = monthOffset(3);

    await stubCronogramaGet(page, {
      operators: [
        operatorWithDate(`${current}-15`),
        operatorWithDate(`${future}-15`),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [prev, current, future],
      activeMonth: future,
    });
    await loginAsAdmin(context, adminCookie);

    expect(await readInitialMonth(page)).toBe(current);
  });

  test("sin datos del mes actual, nunca abre el mes más futuro", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const prev = monthOffset(-2);
    const future = monthOffset(3);
    const future2 = monthOffset(5);

    await stubCronogramaGet(page, {
      operators: [
        operatorWithDate(`${prev}-10`),
        operatorWithDate(`${future}-10`),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [prev, future, future2],
      activeMonth: future2,
    });
    await loginAsAdmin(context, adminCookie);

    const month = await readInitialMonth(page);
    expect(month).toBe(prev);
    expect(month).not.toBe(future);
    expect(month).not.toBe(future2);
    expect(month <= current).toBe(true);
  });

  test("al navegar de mes, min/max cubren el mes navegado", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const future = monthOffset(3);

    await stubCronogramaGet(page, {
      operators: [
        operatorWithDate(`${current}-15`),
        operatorWithDate(`${future}-15`),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [current, future],
      activeMonth: current,
    });
    await loginAsAdmin(context, adminCookie);

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

    await page.selectOption("#month-selector", `${future}-01`);
    await page.waitForFunction(
      (fm) =>
        (
          document.getElementById("date-input") as HTMLInputElement
        )?.value.startsWith(fm),
      future,
      { timeout: 20000 },
    );

    const max = await page.locator("#date-input").getAttribute("max");
    const [y, m] = future.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    expect(max).toBe(`${future}-${String(lastDay).padStart(2, "0")}`);
  });

  test("con el mes resuelto sin schedules, min/max salen del mes resuelto", async ({
    context,
    page,
  }) => {
    // El mes en curso está en la lista pero ningún operador tiene asistencia
    // en él: min/max debe derivarse del mes resuelto, no quedar vacío ni salir
    // de uniqueDates (que no tiene fechas de ese mes).
    const current = monthOffset(0);
    const prev = monthOffset(-2);

    await stubCronogramaGet(page, {
      operators: [operatorWithDate(`${prev}-10`)],
      weekendOvertimeConfigs: [],
      availableMonths: [prev, current],
      activeMonth: prev,
    });
    await loginAsAdmin(context, adminCookie);

    expect(await readInitialMonth(page)).toBe(current);

    const value = await page.locator("#date-input").inputValue();
    expect(value).toBe(`${current}-01`);

    const [y, m] = current.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    expect(await page.locator("#date-input").getAttribute("min")).toBe(
      `${current}-01`,
    );
    expect(await page.locator("#date-input").getAttribute("max")).toBe(
      `${current}-${String(lastDay).padStart(2, "0")}`,
    );
  });
});
