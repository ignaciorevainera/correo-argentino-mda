import "dotenv/config";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/index";
import { agents, users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";

/**
 * Sorter de la grilla de operadores de Calidad.
 *
 * El ordenamiento reusa `clientTableSort` (src/lib/clientTableSort.ts): el root
 * declara un orden por defecto y cada `.operator-card` lleva `data-sort-*`.
 * Estos tests fijan el comportamiento observable, no la implementación.
 */

let sup: TestUser;
let opUser: TestUser;
const seeded: number[] = [];

const MONTH = (() => {
  const now = new Date();
  return `${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getFullYear()}`;
})();

// Nombres y puntajes designed para que el orden alfa y el de puntaje difieran.
const FIXTURES = [
  { name: "Zulma Brillante", score: 95 },
  { name: "Alba troubling", score: 40 },
  { name: "Mauro Medio", score: 70 },
];

test.beforeAll(async () => {
  sup = await createTestUserAndSession("supervisor");
  opUser = await createTestUserAndSession("agent");
  await db.update(users).set({ helpdeskId: 2509 }).where(eq(users.id, sup.userId));
  await db.update(users).set({ helpdeskId: 2509 }).where(eq(users.id, opUser.userId));

  for (const f of FIXTURES) {
    const [a] = await db
      .insert(agents)
      .values({
        name: `ZZSORTER ${f.name}`,
        username: `sorter_${f.name.replace(/\W/g, "_").toLowerCase()}_${Date.now()}`,
        incluidoCalidad: true,
      })
      .returning({ id: agents.id });
    seeded.push(a.id);
  }
});

test.afterAll(async () => {
  for (const id of seeded) await db.delete(agents).where(eq(agents.id, id));
  if (sup) await cleanupTestUser(sup.userId, sup.sessionId);
  if (opUser) await cleanupTestUser(opUser.userId, opUser.sessionId);
});

const nombres = (page: any) =>
  page.locator(".operator-card .font-bold.truncate").allTextContents();

test("Sorter: la barra existe y ordena por nombre, puntaje y auditorías", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, sup.signedSessionId);
  await page.goto(`/supervision/calidad-operadores?month=${MONTH}`);
  await expect(page.locator("#operators-data")).toBeAttached({ timeout: 20000 });

  const root = page.locator("#operators-sort-root");
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("data-table-sort-root", "");

  // Barra con los 3 criterios
  for (const key of ["nombre", "puntaje", "auditorias"]) {
    await expect(root.locator(`[data-table-sort-key="${key}"]`)).toBeVisible();
  }

  // Orden por defecto: nombre ascendente
  const asc = await nombres(page);
  expect(asc.length).toBeGreaterThan(0);
  const expectedAsc = [...asc].sort((a, b) => a.localeCompare(b, "es"));
  expect(asc).toEqual(expectedAsc);

  // Click en Puntaje -> ordena por el valor data-sort-puntaje
  await root.locator('[data-table-sort-key="puntaje"]').click();
  const porPuntaje = await page
    .locator(".operator-card")
    .evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).getAttribute("data-sort-puntaje"))),
    );
  const esperado = [...porPuntaje].sort((a, b) => a - b);
  expect(porPuntaje).toEqual(esperado);

  // Segundo click -> descendente
  await root.locator('[data-table-sort-key="puntaje"]').click();
  const desc = await page
    .locator(".operator-card")
    .evaluateAll((els) =>
      els.map((e) => Number((e as HTMLElement).getAttribute("data-sort-puntaje"))),
    );
  expect(desc).toEqual([...esperado].reverse());

  // Volver a Nombre restaura el orden alfabetico
  await root.locator('[data-table-sort-key="nombre"]').click();
  const deNuevo = await nombres(page);
  const esperadoNombre = [...deNuevo].sort((a, b) => a.localeCompare(b, "es"));
  expect(deNuevo).toEqual(esperadoNombre);
});

test("Sorter: convive con el buscador sin romper el empty state", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, sup.signedSessionId);
  await page.goto(`/supervision/calidad-operadores?month=${MONTH}`);
  await expect(page.locator("#operators-data")).toBeAttached({ timeout: 20000 });

  // Ordenar primero
  await page.locator('[data-table-sort-key="puntaje"]').click();

  // Filtrar a un solo operador: debe quedar visible y el empty state oculto
  await page.locator("#operator-search").fill("Mauro");
  const visibles = page.locator(".operator-card:not(.hidden)");
  await expect(visibles).toHaveCount(1);
  await expect(page.locator("#calidad-empty-state")).toBeHidden();

  // Filtrar sin resultados: empty state visible, ninguna card
  await page.locator("#operator-search").fill("zzzz-no-existe-zzzz");
  await expect(page.locator("#calidad-empty-state")).toBeVisible();
  await expect(page.locator(".operator-card:not(.hidden)")).toHaveCount(0);

  // Limpiar restaura todas
  await page.locator("#operator-search").fill("");
  await expect(page.locator("#calidad-empty-state")).toBeHidden();
  expect((await nombres(page)).length).toBeGreaterThan(0);
});
