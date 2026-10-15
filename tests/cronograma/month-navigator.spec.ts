// tests/cronograma/month-navigator.spec.ts
//
// Navegador de mes único (#140). Un solo componente (select + flechas) para
// Mensual/Grupos/Pasiva: flechas de la misma altura que el select, `disabled`
// nativo, flechas no inertes cuando el mes seleccionado está fuera de la lista,
// y selección preservada al crear un mes.
//
// El payload del endpoint se controla vía route para que el caso sea
// determinista (la DB real ya tiene datos del mes en curso).
import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
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

function operatorWithDate(date: string) {
  return {
    id: 1,
    nombre: "Month Navigator Op",
    horario: "09:00-18:00",
    location: "Monte Grande",
    asistencia: { [date]: "Trabajando" },
  };
}

async function stubCronogramaGet(
  page: Page,
  getPayload: () => Record<string, unknown>,
): Promise<void> {
  await ignoreSsrInitialData(page);
  await page.route("**/api/cronograma**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname !== "/api/cronograma") return route.continue();
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: getPayload() });
  });
}

async function gotoAndWait(page: Page): Promise<void> {
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
}

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("navegador de mes único", () => {
  test("las flechas y el select miden lo mismo (misma altura)", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const next = monthOffset(1);
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => ({
      operators: [operatorWithDate(`${current}-10`)],
      weekendOvertimeConfigs: [],
      availableMonths: [current, next],
      activeMonth: current,
    }));
    await gotoAndWait(page);

    const selectBox = await page.locator("#month-selector").boundingBox();
    const prevBox = await page.locator("#month-selector-prev").boundingBox();
    const nextBox = await page.locator("#month-selector-next").boundingBox();

    expect(selectBox).not.toBeNull();
    expect(prevBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(Math.abs(selectBox!.height - prevBox!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(selectBox!.height - nextBox!.height)).toBeLessThanOrEqual(1);
  });

  test("la flecha cambia el mismo mes que muestran el select y date-input", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const next = monthOffset(1);
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => ({
      operators: [operatorWithDate(`${current}-10`)],
      weekendOvertimeConfigs: [],
      availableMonths: [current, next],
      activeMonth: current,
    }));
    await gotoAndWait(page);

    await expect(page.locator("#month-selector")).toHaveValue(`${current}-01`);
    await expect(page.locator("#date-input")).toHaveValue(`${current}-10`);

    await page.click("#month-selector-next");

    await page.waitForFunction(
      (ym) =>
        (
          document.getElementById("date-input") as HTMLInputElement
        )?.value.startsWith(ym),
      next,
      { timeout: 20000 },
    );

    await expect(page.locator("#month-selector")).toHaveValue(`${next}-01`);
    expect(await page.locator("#date-input").inputValue()).toContain(next);
  });

  test("con el mes seleccionado fuera de la lista, las flechas siguen respondiendo", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const next = monthOffset(1);
    const outside = monthOffset(-6);

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => ({
      operators: [operatorWithDate(`${current}-10`)],
      weekendOvertimeConfigs: [],
      availableMonths: [current, next],
      activeMonth: current,
    }));
    await gotoAndWait(page);

    // Forzar el date-input a un mes que no existe en la lista de disponibles.
    await page.evaluate((ym) => {
      const el = document.getElementById("date-input") as HTMLInputElement;
      el.value = `${ym}-01`;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, outside);

    const nextDisabled = await page
      .locator("#month-selector-next")
      .isDisabled();
    const prevDisabled = await page
      .locator("#month-selector-prev")
      .isDisabled();
    expect(nextDisabled && prevDisabled).toBe(false);

    const arrow = nextDisabled
      ? "#month-selector-prev"
      : "#month-selector-next";
    await page.click(arrow);

    await page.waitForFunction(
      (ym) => {
        const el = document.getElementById(
          "date-input",
        ) as HTMLInputElement | null;
        return !!el && !el.value.startsWith(ym);
      },
      outside,
      { timeout: 20000 },
    );

    const month = (await page.locator("#date-input").inputValue()).slice(0, 7);
    expect([current, next]).toContain(month);
  });

  test("cada flecha se deshabilita según la disponibilidad en su dirección", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const next = monthOffset(1);
    const before = monthOffset(-6);
    const after = monthOffset(6);

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => ({
      operators: [operatorWithDate(`${current}-10`)],
      weekendOvertimeConfigs: [],
      availableMonths: [current, next],
      activeMonth: current,
    }));
    await gotoAndWait(page);

    const setDate = (ym: string) =>
      page.evaluate((value) => {
        const el = document.getElementById("date-input") as HTMLInputElement;
        el.value = `${value}-01`;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, ym);

    // Mes anterior a todos los disponibles: no hay "anterior" → prev disabled.
    await setDate(before);
    await expect(page.locator("#month-selector-prev")).toBeDisabled();
    await expect(page.locator("#month-selector-next")).toBeEnabled();

    // Mes posterior a todos los disponibles: no hay "siguiente" → next disabled.
    await setDate(after);
    await expect(page.locator("#month-selector-prev")).toBeEnabled();
    await expect(page.locator("#month-selector-next")).toBeDisabled();
  });

  test("tras crear un mes, el select queda en el mes creado", async ({
    context,
    page,
  }) => {
    const current = monthOffset(0);
    const future = monthOffset(2);
    const months = { list: [current, monthOffset(1)] };

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => ({
      operators: [operatorWithDate(`${current}-10`)],
      weekendOvertimeConfigs: [],
      availableMonths: months.list,
      activeMonth: current,
    }));

    const [futureYear, futureMonth] = future.split("-").map(Number);
    await page.route("**/api/cronograma/months", async (route) => {
      if (route.request().method() === "POST") {
        months.list = [...months.list, future].sort();
        return route.fulfill({ status: 200, json: { ok: true } });
      }
      return route.continue();
    });

    await gotoAndWait(page);

    await page.click("#add-month-btn");
    await page.selectOption("#new-month-year", String(futureYear));
    await page.selectOption("#new-month-month", String(futureMonth - 1));
    await page.click("#confirm-new-month");

    await page.waitForFunction(
      (ym) =>
        (document.getElementById("month-selector") as HTMLSelectElement)
          ?.value === `${ym}-01`,
      future,
      { timeout: 20000 },
    );

    expect(await page.locator("#month-selector").inputValue()).toBe(
      `${future}-01`,
    );
  });
});
