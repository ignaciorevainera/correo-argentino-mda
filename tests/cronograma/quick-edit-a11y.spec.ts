// tests/cronograma/quick-edit-a11y.spec.ts
//
// #268 — el menú de edición rápida debe abrirse y navegarse por teclado.
// Shift+F10/ContextMenu abre el menú sobre la celda enfocada, mueve el foco
// dentro, las flechas/Home/End recorren los ítems y Escape cierra devolviendo
// el foco a la celda.
import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";
import { ignoreSsrInitialData } from "../helpers/cronograma";

const P = "Presencial Monte Grande";

function currentMonth(): string {
  const d = new Date();
  d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function firstMonday(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const date = `${ym}-${pad(day)}`;
    if (new Date(date + "T12:00:00").getDay() === 1) return date;
  }
  throw new Error(`El mes ${ym} no tiene lunes`);
}

function weekdayPayload(date: string) {
  const [y, m] = date.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const asistencia: Record<string, string> = {};
  for (let day = 1; day <= days; day++) {
    asistencia[`${date.slice(0, 7)}-${pad(day)}`] = P;
  }
  const ym = date.slice(0, 7);
  return {
    operators: [
      {
        id: 1,
        nombre: "A11y Op",
        horario: "09:00 - 18:00",
        location: "Monte Grande",
        asistencia,
      },
    ],
    weekendOvertimeConfigs: [],
    availableMonths: [ym],
    activeMonth: ym,
  };
}

async function stubCronograma(page: Page, payload: unknown): Promise<void> {
  await ignoreSsrInitialData(page);
  await page.route("**/api/cronograma**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname !== "/api/cronograma") return route.continue();
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: payload });
  });
}

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("menú de edición rápida accesible", () => {
  test("Shift+F10 abre el menú, el teclado navega y Escape restaura el foco", async ({
    context,
    page,
  }) => {
    const date = firstMonday(currentMonth());
    await setSessionCookie(context, user.signedSessionId);
    await stubCronograma(page, weekdayPayload(date));

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

    const cell = page.locator(
      `#monthly-tbody button[data-monthly-detail][data-operator="A11y Op"][data-date="${date}"]`,
    );
    await expect(cell).toBeVisible();
    await expect(cell).toHaveAttribute("aria-haspopup", "menu");
    await expect(cell).toHaveAttribute("aria-controls", "quick-edit-menu");

    const menu = page.locator("#quick-edit-menu");
    const items = page.locator('#quick-edit-options [role="menuitem"]');

    await cell.focus();
    await expect(cell).toBeFocused();

    await page.keyboard.press("Shift+F10");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(items.first()).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();

    await page.keyboard.press("End");
    await expect(items.last()).toBeFocused();

    await page.keyboard.press("Home");
    await expect(items.first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(cell).toBeFocused();

    await page.keyboard.press("ContextMenu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(cell).toBeFocused();
  });
});
