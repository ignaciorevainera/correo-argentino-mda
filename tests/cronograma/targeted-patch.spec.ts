// tests/cronograma/targeted-patch.spec.ts
//
// #265 — patcheo dirigido de la vista mensual. Una edición de celda (quick-edit
// o pincel) reemplaza solo las celdas afectadas + stats + cobertura del día;
// NO reemplaza las filas. Técnica del sentinela por identidad de nodo: antes de
// la interacción se guarda la referencia al <tr> en window; si el render
// reconstruyó las filas (innerHTML=), el nodo viejo queda desconectado.
//
// El cambio elegido cruza el umbral de violación (minPWeek) pero NO el de
// cobertura: antes del fix ese caso disparaba el rebuild completo, así que el
// <tr> sentinela no sobrevivía. El caso que cruza cobertura se conserva como
// rebuild documentado (test 4).
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

type SentinelKey =
  | "__tbodyRow"
  | "__tfootRow"
  | "__hiddenTbodyRow";

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

// op1: Franco antes del primer lunes; lunes/martes P; miércoles a domingo HO.
// Cada semana queda con 7 días activos y 2 presenciales (sin violación); el
// primer lunes siempre cae en una semana completa (todo mes tiene >= 28 días).
// Editar ese lunes a Franco deja la semana con 6 activos y 1 presencial → cruza
// minPWeek (default 2) sin bajar la cobertura del umbral (sigue activo).
function violationCrossingPayload(ym: string) {
  const dates = datesOfMonth(ym);
  const first = firstMonday(ym);
  const target: Record<string, string> = {};
  const other: Record<string, string> = {};
  dates.forEach((d) => {
    const day = dayOfWeek(d);
    if (d < first) target[d] = "Franco";
    else if (day === 1 || day === 2) target[d] = P;
    else target[d] = HO;
    other[d] = P;
  });
  return {
    firstMonday: first,
    payload: {
      operators: [
        operator(1, "Target Op", target),
        operator(2, "Otro Op A", other),
        operator(3, "Otro Op B", other),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [ym],
      activeMonth: ym,
    },
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

/** Guarda la referencia viva a las filas que el rebuild reemplazaría. */
async function markRows(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const targetRow = document
      .querySelector(
        '#monthly-tbody button[data-monthly-detail][data-operator="Target Op"]',
      )
      ?.closest("tr");
    w.__tbodyRow = targetRow ?? null;
    w.__tfootRow = document.querySelector("#monthly-tfoot tr") ?? null;
    w.__hiddenTbodyRow = document.querySelector("#operators-table-body tr") ?? null;
  });
}

async function sentinelAlive(page: Page, key: SentinelKey): Promise<boolean> {
  return page.evaluate((k) => {
    const node = (window as unknown as Record<string, unknown>)[k];
    return node instanceof Node && node.isConnected;
  }, key);
}

async function fillerRowHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>("#monthly-filler-row tr");
    return row ? parseFloat(row.style.height || "0") : -1;
  });
}

/** Orden de las filas visibles (por nombre normalizado). */
async function rowOperatorOrder(page: Page): Promise<string[]> {
  return page.$$eval("#monthly-tbody tr[data-op-name]", (trs) =>
    trs.map((tr) => tr.getAttribute("data-op-name") || ""),
  );
}

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("patcheo dirigido de la vista mensual", () => {
  test("quick-edit de una celda conserva las filas y actualiza celda, stats y cobertura", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const { firstMonday: d, payload } = violationCrossingPayload(ym);
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    await expect(
      page.locator(
        `#monthly-tbody tr:has(td[data-cell-op="1"]) span[title="Faltan días presenciales esta semana"]`,
      ),
    ).toHaveCount(0);

    const targetRow = page.locator(
      `#monthly-tbody tr:has(button[data-operator="Target Op"])`,
    );
    const beforeP = Number(await targetRow.locator("td").nth(1).innerText());
    expect(beforeP).toBeGreaterThan(0);

    const fillerBefore = await fillerRowHeight(page);
    expect(fillerBefore).toBeGreaterThan(0);

    await markRows(page);

    const cell = page.locator(
      `#monthly-tbody button[data-monthly-detail][data-operator="Target Op"][data-date="${d}"]`,
    );
    await cell.click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Franco"]')
      .click();

    // (a) el rebuild de filas no ocurrió (sentinela del <tr> vivo)
    expect(await sentinelAlive(page, "__tbodyRow")).toBe(true);

    // (b) la celda cambió (y conserva los marcadores patcheables)
    await expect(
      page.locator(
        `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d}"] button[data-monthly-detail]`,
      ),
    ).toHaveAttribute("data-status", "Franco");

    // (c) badge de violaciones del operador actualizado
    await expect(
      page.locator(
        `#monthly-tbody tr:has(td[data-cell-op="1"]) span[title="Faltan días presenciales esta semana"]`,
      ),
    ).toBeVisible();

    // (d) stats de la fila y cobertura del día recalculadas in situ
    expect(await sentinelAlive(page, "__tfootRow")).toBe(true);
    const afterP = Number(await targetRow.locator("td").nth(1).innerText());
    expect(afterP).toBe(beforeP - 1);
    await expect(
      page.locator(`#monthly-tfoot td[data-coverage-date="${d}"]`),
    ).toContainText("2");

    // (e) el badge de violación agrandó la fila → el filler se resincroniza
    const fillerAfter = await fillerRowHeight(page);
    expect(fillerAfter).toBeGreaterThanOrEqual(0);
    expect(fillerAfter).toBeLessThan(fillerBefore);
  });

  test("el pincel sobre una celda también patchea sin reconstruir las filas", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const { firstMonday: d, payload } = violationCrossingPayload(ym);
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    await page.click("#toggle-edit-mode-btn");
    await page.click('button[data-brush="Franco"]');
    await markRows(page);

    await page
      .locator(
        `#monthly-tbody button[data-monthly-detail][data-operator="Target Op"][data-date="${d}"]`,
      )
      .click();

    expect(await sentinelAlive(page, "__tbodyRow")).toBe(true);
    expect(await sentinelAlive(page, "__tfootRow")).toBe(true);
    await expect(
      page.locator(
        `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d}"] button[data-monthly-detail]`,
      ),
    ).toHaveAttribute("data-status", "Franco");
  });

  test("buscar filtra la vista visible sin re-renderizar la oculta", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const { payload } = violationCrossingPayload(ym);
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    // La vista diaria queda renderizada pero oculta (mensual es la default).
    await expect(page.locator("#daily-view")).toHaveClass(/hidden/);
    await markRows(page);
    expect(await sentinelAlive(page, "__hiddenTbodyRow")).toBe(true);

    await page.locator("#monthly-search").fill("Target Op");
    await expect(page.locator("#monthly-tbody tr")).toHaveCount(1);

    // La tabla oculta no se tocó.
    expect(await sentinelAlive(page, "__hiddenTbodyRow")).toBe(true);
  });

  test("con filtro Licencia activo, editar la única licencia no deja la fila stale", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const dates = datesOfMonth(ym);
    const firstIdx = dates.indexOf(firstMonday(ym));
    const mon = dates[firstIdx];
    const tue = dates[firstIdx + 1];
    const wed = dates[firstIdx + 2];
    const thu = dates[firstIdx + 3];
    const fri = dates[firstIdx + 4];

    // HO,HO,Licencia,HO,HO con maxConsecutiveHO=2: el Franco del medio corta
    // la racha (sin violación). Editarla a Franco la fusiona (5 > 2) y la
    // cobertura no cruza umbral: el caso del review.
    const target: Record<string, string> = {};
    dates.forEach((d) => (target[d] = "Franco"));
    target[mon] = HO;
    target[tue] = HO;
    target[wed] = "Licencia";
    target[thu] = HO;
    target[fri] = HO;
    const other: Record<string, string> = {};
    dates.forEach((d) => (other[d] = P));
    const payload = {
      operators: [
        {
          ...operator(1, "Filtro Target", target),
          maxConsecutiveHO: 2,
        },
        operator(2, "Otro Op A", other),
        operator(3, "Otro Op B", other),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [ym],
      activeMonth: ym,
    };

    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    await page.click("#filter-monthly-status-licencia");
    const filteredRow = page.locator(
      `#monthly-tbody tr:has(button[data-operator="Filtro Target"])`,
    );
    await expect(filteredRow).toHaveCount(1);

    await page
      .locator(
        `#monthly-tbody button[data-monthly-detail][data-operator="Filtro Target"][data-date="${wed}"]`,
      )
      .click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Franco"]')
      .click();

    // Sin la única Licencia, el operador deja de matchear el filtro activo:
    // la fila no puede quedar stale.
    await expect(filteredRow).toHaveCount(0);
    await expect(page.locator("#monthly-tbody")).toContainText("Sin resultados");
  });

  test("documentado: si el cambio cruza el umbral de cobertura, cae al rebuild completo", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const dates = datesOfMonth(ym);
    const d = firstMonday(ym);
    const full: Record<string, string> = {};
    dates.forEach((date) => {
      full[date] = P;
    });
    const payload = {
      operators: [
        operator(1, "Target Op", { ...full }),
        operator(
          2,
          "Otro Op A",
          Object.fromEntries(dates.map((x) => [x, "Franco"])),
        ),
        operator(3, "Otro Op B", { ...full }),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [ym],
      activeMonth: ym,
    };
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    await markRows(page);
    expect(await sentinelAlive(page, "__tbodyRow")).toBe(true);

    await page
      .locator(
        `#monthly-tbody button[data-monthly-detail][data-operator="Target Op"][data-date="${d}"]`,
      )
      .click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Licencia"]')
      .click();

    // Con 1/3 activos (< 40%) el día pasa a crítico: no se puede reproducir el
    // th crítico con un parche de celdas, así que se reconstruye todo.
    expect(await sentinelAlive(page, "__tbodyRow")).toBe(false);
    await expect(
      page.locator(
        `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d}"] button[data-monthly-detail]`,
      ),
    ).toHaveAttribute("data-status", "Licencia");
    await expect(
      page.locator(`#monthly-tfoot td[data-coverage-date="${d}"]`),
    ).toContainText("1");
    await expect(
      page.locator(`#monthly-thead button[data-click-day="${d}"] .bg-error`),
    ).toHaveCount(1);
  });

  test("con orden entrada activo, editar la celda de referencia reordena las filas", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const dates = datesOfMonth(ym);
    // referenceDate de sortOperators en la vista mensual es hoy (mismo mes).
    const ref = `${ym}-${pad(new Date().getDate())}`;
    const all: Record<string, string> = {};
    dates.forEach((x) => (all[x] = P));
    const payload = {
      operators: [
        { ...operator(1, "Alfa", all), horario: "08:00 - 17:00" },
        { ...operator(2, "Zeta", all), horario: "10:00 - 19:00" },
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [ym],
      activeMonth: ym,
    };
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    // Modo editar: habilita el quick-edit aunque la celda de referencia caiga
    // en fin de semana.
    await page.click("#toggle-edit-mode-btn");

    // Orden por entrada: Alfa (08:00) antes que Zeta (10:00).
    await page.locator("#monthly-sort-container summary").click();
    await page
      .locator(
        '#monthly-sort-container [data-sort-option][data-value="entry-time"]',
      )
      .click();
    expect(await rowOperatorOrder(page)).toEqual(["alfa", "zeta"]);

    // La celda de referencia pasa a Franco: la clave de orden de Alfa se vuelve
    // 9999 y debe caer detrás de Zeta (rebuild, no fila stale).
    await page
      .locator(
        `#monthly-tbody button[data-monthly-detail][data-operator="Alfa"][data-date="${ref}"]`,
      )
      .click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Franco"]')
      .click();

    expect(await rowOperatorOrder(page)).toEqual(["zeta", "alfa"]);
  });

  test("un edit que no cambia membresía ni violación sigue patcheando", async ({
    context,
    page,
  }) => {
    const ym = monthOffset(0);
    const dates = datesOfMonth(ym);
    const d = firstMonday(ym);
    const all: Record<string, string> = {};
    dates.forEach((x) => (all[x] = P));
    const payload = {
      operators: [
        operator(1, "Target Op", { ...all }),
        operator(2, "Otro Op A", { ...all }),
        operator(3, "Otro Op B", { ...all }),
      ],
      weekendOvertimeConfigs: [],
      availableMonths: [ym],
      activeMonth: ym,
    };
    await setSessionCookie(context, user.signedSessionId);
    await stubCronogramaGet(page, () => payload);
    await gotoAndWait(page);

    await markRows(page);
    expect(await sentinelAlive(page, "__tbodyRow")).toBe(true);

    // P → HO: la cobertura activa no cambia y no cruza violación, así que la
    // fila se patchea (el sentinela sobrevive).
    await page
      .locator(
        `#monthly-tbody button[data-monthly-detail][data-operator="Target Op"][data-date="${d}"]`,
      )
      .click({ button: "right" });
    await expect(page.locator("#quick-edit-menu")).toBeVisible();
    await page
      .locator('#quick-edit-options button[data-status="Home Office"]')
      .click();

    expect(await sentinelAlive(page, "__tbodyRow")).toBe(true);
    await expect(
      page.locator(
        `#monthly-tbody td[data-cell-op="1"][data-cell-date="${d}"] button[data-monthly-detail]`,
      ),
    ).toHaveAttribute("data-status", "Home Office");
  });
});
