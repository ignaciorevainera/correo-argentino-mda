// tests/cronograma/save-button-state.spec.ts
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
const HO = "Home Office";

function monthOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function datesOfMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`);
}

function dayOfWeek(date: string): number {
  return new Date(date + "T12:00:00").getDay();
}

function firstMonday(ym: string): string {
  const date = datesOfMonth(ym).find((d) => dayOfWeek(d) === 1);
  if (!date) throw new Error(`El mes ${ym} no tiene lunes`);
  return date;
}

function operator(
  id: number,
  nombre: string,
  asistencia: Record<string, string>,
) {
  return {
    id,
    nombre,
    horario: "09:00 - 18:00",
    location: "Monte Grande",
    asistencia,
  };
}

function samplePayload(ym: string) {
  const dates = datesOfMonth(ym);
  const target: Record<string, string> = {};
  dates.forEach((d) => {
    target[d] = P;
  });
  return {
    operators: [
      operator(1, "Target Op", target),
      operator(2, "Otro Op A", target),
    ],
    weekendOvertimeConfigs: [],
    availableMonths: [ym],
    activeMonth: ym,
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

test.describe("Botón Guardar en edición de cronograma", () => {
  test("al pintar una celda con el pincel, el botón Guardar se habilita (sin btn-disabled)", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const payload = samplePayload(ym);
    const d = firstMonday(ym);

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    const saveBtn = page.locator("#save-edits-btn");
    const discardBtn = page.locator("#discard-edits-btn");
    const countEl = page.locator("#pending-edits-count");

    // Activar modo edición
    await page.click("#toggle-edit-mode-btn");
    await expect(saveBtn).toBeDisabled();
    await expect(discardBtn).toBeDisabled();
    await expect(countEl).toHaveText("0 cambios");

    // Seleccionar pincel Franco y pintar celda
    await page.click('button[data-brush="Franco"]');
    const cell = page.locator(
      `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d}"] button[data-monthly-detail]`,
    );
    await cell.click();

    // El contador sube a 1 cambio
    await expect(countEl).toHaveText("1 cambios");

    // El botón Guardar y Descartar deben quedar habilitados y clickeables
    await expect(saveBtn).toBeEnabled();
    await expect(saveBtn).not.toHaveClass(/btn-disabled/);
    await expect(discardBtn).toBeEnabled();
    await expect(discardBtn).not.toHaveClass(/btn-disabled/);
  });

  test("al editar una celda con clic derecho, el botón Guardar se habilita (sin btn-disabled)", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const payload = samplePayload(ym);
    const d = firstMonday(ym);

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    const saveBtn = page.locator("#save-edits-btn");
    const discardBtn = page.locator("#discard-edits-btn");
    const countEl = page.locator("#pending-edits-count");

    // Clic derecho con modo edición apagado
    const cell = page.locator(
      `#monthly-tbody button[data-monthly-detail][data-operator="Target Op"][data-date="${d}"]`,
    );
    await cell.click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Franco"]')
      .click();

    // Debe aparecer el indicador de cambios pendientes flotante
    const saveIndicator = page.locator("#save-indicator");
    await expect(saveIndicator).toBeVisible();

    // Activar modo edición desde el banner
    await page.click("#reactivate-edit-mode-btn");

    // El contador debe mostrar 1 cambios
    await expect(countEl).toHaveText("1 cambios");

    // El botón Guardar y Descartar deben estar habilitados y sin btn-disabled
    await expect(saveBtn).toBeEnabled();
    await expect(saveBtn).not.toHaveClass(/btn-disabled/);
    await expect(discardBtn).toBeEnabled();
    await expect(discardBtn).not.toHaveClass(/btn-disabled/);
  });

  test("al arrastrar el pincel sobre múltiples celdas, se pintan de forma fluida", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const payload = samplePayload(ym);
    const d1 = firstMonday(ym);
    const [y, m, dayNum] = d1.split("-").map(Number);
    const d2 = `${y}-${pad(m)}-${pad(dayNum + 1)}`;

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    const saveBtn = page.locator("#save-edits-btn");
    await page.click("#toggle-edit-mode-btn");
    await expect(saveBtn).toBeDisabled();

    await page.click('button[data-brush="Franco"]');

    const cell1 = page.locator(
      `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d1}"] button[data-monthly-detail]`,
    );
    const cell2 = page.locator(
      `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d2}"] button[data-monthly-detail]`,
    );

    await cell1.hover();
    await page.mouse.down();
    await cell2.hover();
    await page.mouse.up();

    await expect(cell1).toHaveAttribute("data-status", "Franco");
    await expect(cell2).toHaveAttribute("data-status", "Franco");

    const countEl = page.locator("#pending-edits-count");
    await expect(countEl).toHaveText("2 cambios");
  });
});
