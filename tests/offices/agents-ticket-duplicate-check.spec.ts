// tests/offices/agents-ticket-duplicate-check.spec.ts
// Regresion del timeout al crear un ticket por agentes desde /oficinas, y del
// atajo "Crear sin verificar" del mismo modal.
//
// El endpoint /api/offices/check-agents-ticket antes escaneaba los ~3800
// tickets abiertos de TODA la organizacion (incidents.by.status ignora
// location_id), con requests incidents?ids[]=500 que chocan contra el abort
// de 15s de invgateClient -> ~32s y 502 "No se pudieron obtener los detalles
// de los tickets.". Ahora acota por nodos de helpdesk (incidents.by.helpdesk).
//
// El modal ofrece dos caminos: "Verificar y crear" (consulta InvGate) y
// "Crear sin verificar" (el agente ya sabe que no hay ninguno activo y va
// directo al modal de confirmacion, sin pegarle a la API).
//
// Fallos que este spec tiene que detectar:
//   1. el chequeo vuelve a tardar (o 502)   -> budget de tiempo + status 200
//   2. el camino acotado deja de ver el duplicado -> exists === true
//   3. el camino acotado inventa duplicados -> exists === false en oficina limpia
//   4. el link al ticket duplicado queda mal armado -> href == .../id/<ticketId>
//   5. la cache de 60s no sirve la segunda consulta -> 2 GET pegados, 2da < 2s
//      (medido por API, no por UI: ver el bloque 5)
//   6. el test crea un ticket real -> cero POST a create-agents-ticket
//   7. "Crear sin verificar" vuelve a consultar InvGate -> cero requests a
//      check-agents-ticket durante ese flujo (no alcanza con que sea rapido:
//      la cache del servidor lo taparia)
//   8. el atajo se presenta como "limpio" cuando no verifico nada ->
//      #confirm-unverified-state visible y los otros dos estados ocultos, aun
//      en una oficina que SI tiene un ticket abierto (resuelta en runtime)
//   9. el loading del boton reserva un hueco en idle, o empuja al hermano
//      flex-1 (2º test)
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { offices, officeInvgateLinks } from "../../src/db/schema";
import { getOpenAgentsTicketsByLocation } from "../../src/lib/agentsTicketDuplicates";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

// Los duplicados cambian en InvGate: no hardcodear I1330/I1017. Se resuelven
// en runtime (oficinas TELEGRAFIA con link de InvGate + tickets abiertos de
// agentes por location) y, si no hay datos, el spec se skipea en vez de fallar
// por un dato externo.
interface OfficesUnderTest {
  withDuplicate: string;
  withoutDuplicate: string;
}

let officesUnderTestPromise: Promise<OfficesUnderTest | null> | null = null;

function resolveOfficesUnderTest(): Promise<OfficesUnderTest | null> {
  officesUnderTestPromise ??= (async () => {
    const links = await db
      .select({
        code: offices.code,
        locationId: officeInvgateLinks.invgateLocationId,
      })
      .from(officeInvgateLinks)
      .innerJoin(offices, eq(offices.id, officeInvgateLinks.officeId))
      .where(eq(offices.type, "TELEGRAFIA"));

    const byLocation = await getOpenAgentsTicketsByLocation();
    const hasTickets = (locationId: number) =>
      (byLocation.get(locationId)?.length ?? 0) > 0;

    const withDuplicate = links.find((l) => hasTickets(l.locationId));
    const withoutDuplicate = links.find((l) => !hasTickets(l.locationId));

    return withDuplicate && withoutDuplicate
      ? {
          withDuplicate: withDuplicate.code,
          withoutDuplicate: withoutDuplicate.code,
        }
      : null;
  })();

  return officesUnderTestPromise;
}

const CHECK_ENDPOINT = "/api/offices/check-agents-ticket";
const CREATE_ENDPOINT = "/api/offices/create-agents-ticket";

const COLD_BUDGET_MS = 20000;
// La segunda consulta la resuelve la cache de 60s del proceso: si el cache se
// rompe, vuelve a pagar el recorrido completo (>3s) y falla.
const WARM_BUDGET_MS = 2000;
// El atajo no hace fetch: el modal de confirmacion tiene que abrir al instante.
// Es una red de seguridad por si el handler colapsa en un await, no la prueba
// principal del atajo (esa es el conteo de requests a CHECK_ENDPOINT).
const SKIP_BUDGET_MS = 1500;

test.describe("Chequeo de duplicados al crear ticket por agentes", () => {
  let admin: TestUser;

  test.beforeAll(async () => {
    admin = await createTestUserAndSession("admin");
  });

  test.afterAll(async () => {
    if (admin) await cleanupTestUser(admin.userId, admin.sessionId);
  });

  test("detecta duplicado, no inventa, responde rápido y no crea nada", async ({
    page,
    context,
  }) => {
    // Dos consultas completas a InvGate + carga de agentes/origenes + el atajo.
    test.setTimeout(150000);

    const resolved = await resolveOfficesUnderTest();
    test.skip(
      !resolved,
      "No hay datos para el chequeo: se necesita una oficina TELEGRAFIA con link de InvGate que tenga un ticket de agentes abierto y otra que no.",
    );
    const { withDuplicate: OFFICE_WITH_DUPLICATE, withoutDuplicate: OFFICE_WITHOUT_DUPLICATE } =
      resolved!;

    const createRequests: string[] = [];
    let checkRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes(CREATE_ENDPOINT))
        createRequests.push(req.method());
      if (req.url().includes(CHECK_ENDPOINT)) checkRequests++;
    });

    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/oficinas");
    await page.waitForSelector("[data-sort-code]", { timeout: 20000 });
    // El listado es paginado con scroll infinito. Si la request de la pagina 2
    // sigue en vuelo cuando escribimos en el buscador, fetchOffices() corta con
    // `if (isLoading) return` y la busqueda se pierde sin aviso: el input queda
    // con el texto pero la tabla nunca se actualiza. Hay que esperar a que la
    // red se calme antes de filtrar.
    await page.waitForLoadState("networkidle");

    /** Busca la oficina, abre el modal y deja origen + agente resueltos. */
    async function openTicketModal(officeCode: string) {
      await page.locator("#office-search").fill(officeCode);

      const row = page.locator(`[data-sort-code="${officeCode}"]`);
      await expect(
        row,
        `${officeCode} tiene que aparecer en el listado`,
      ).toHaveCount(1, { timeout: 20000 });

      const trigger = row.locator("[data-agents-ticket-trigger]");
      await expect(
        trigger,
        `${officeCode} es TELEGRAFIA con link de InvGate: el boton tiene que existir para admin`,
      ).toHaveCount(1);
      await trigger.click();

      const modal = page.locator("#agents-ticket-modal");
      await expect(modal).toBeVisible();

      // El modal carga agentes + origenes en background; el click no avanza sin eso.
      const sourceSelect = page.locator("#ticket-source-select");
      await expect(sourceSelect).toHaveValue(/\d+/, { timeout: 20000 });

      const agentSelect = page.locator("#ticket-agent-select");
      await expect
        .poll(
          async () => await agentSelect.locator("option[data-name]").count(),
          { timeout: 20000 },
        )
        .toBeGreaterThan(0);
      await agentSelect.selectOption({ index: 1 });

      return { modal, confirmModal: page.locator("#agents-ticket-confirm-modal") };
    }

    /** Nunca se confirma la creacion en este spec. */
    async function closeBothModals(
      modal: ReturnType<typeof page.locator>,
      confirmModal: ReturnType<typeof page.locator>,
    ) {
      const confirmCancel = confirmModal
        .getByRole("button", { name: /cancelar/i })
        .first();
      await expect(confirmModal).toBeVisible();
      await expect(confirmCancel).toBeEnabled();
      await confirmCancel.click();
      await expect(confirmModal).toBeHidden();

      const cancel = modal.getByRole("button", { name: /cancelar/i }).first();
      await expect(modal).toBeVisible();
      await expect(cancel).toBeEnabled();
      await cancel.click();
      await expect(modal).toBeHidden();
    }

    async function runCheck(officeCode: string, expectDuplicate: boolean) {
      const { modal, confirmModal } = await openTicketModal(officeCode);

      const responsePromise = page.waitForResponse((r) =>
        r.url().includes(CHECK_ENDPOINT),
      );
      const t0 = Date.now();
      await page.locator("#confirm-agents-ticket-btn").click();

      // fetchMs = ida y vuelta al endpoint (contrato del server / cache).
      // uiMs = hasta que el modal de confirmacion queda pintado (suma el render
      // del browser, que en una laptop cargada llega a comer segundos y no
      // dice nada sobre la cache).
      const response = await responsePromise;
      const fetchMs = Date.now() - t0;

      await expect(confirmModal).toBeVisible({ timeout: COLD_BUDGET_MS });
      const uiMs = Date.now() - t0;

      const status = response.status();
      const body = await response.json().catch(() => null);

      // La respuesta tiene que estar cableada al modal de confirmacion.
      const duplicateState = confirmModal.locator("#confirm-duplicate-state");
      const defaultState = confirmModal.locator("#confirm-default-state");
      const unverifiedState = confirmModal.locator("#confirm-unverified-state");
      if (expectDuplicate) {
        await expect(duplicateState).toBeVisible();
        await expect(defaultState).toBeHidden();
        await expect(confirmModal.locator("#confirm-dup-link")).toHaveAttribute(
          "href",
          new RegExp(`/requests/show/index/id/${body?.ticketId}$`),
        );
      } else {
        await expect(defaultState).toBeVisible();
        await expect(duplicateState).toBeHidden();
      }
      // El camino verificado nunca puede caer en el estado "no verificado":
      // si el toggle de clases se mezclara, el agente veria un aviso de que no
      // se consulto InvGate cuando si se consulto.
      await expect(unverifiedState).toBeHidden();

      await closeBothModals(modal, confirmModal);

      return { fetchMs, uiMs, status, body, officeCode };
    }

    // --- 1 + 2 + 4: duplicado real, status 200, link bien armado, rápido ---
    const withDup = await runCheck(OFFICE_WITH_DUPLICATE, true);

    expect(
      withDup.status,
      "no debe responder 502 (modo de falla del abort de 15s)",
    ).toBe(200);
    expect(
      withDup.body.exists,
      `${OFFICE_WITH_DUPLICATE} tiene un ticket abierto`,
    ).toBe(true);
    expect(withDup.body.ticketId).toBeGreaterThan(0);
    expect(withDup.body.ticketUrl).toContain(
      `/requests/show/index/id/${withDup.body.ticketId}`,
    );
    expect(
      withDup.fetchMs,
      "regresion de timeout: el chequeo no puede volver a tardar ~32s",
    ).toBeLessThan(COLD_BUDGET_MS);

    // --- 3: sin falsos positivos ---
    const withoutDup = await runCheck(OFFICE_WITHOUT_DUPLICATE, false);

    expect(withoutDup.status).toBe(200);
    expect(
      withoutDup.body.exists,
      "una oficina sin ticket de agentes no debe reportar duplicado",
    ).toBe(false);
    expect(withoutDup.fetchMs).toBeLessThan(COLD_BUDGET_MS);

    // --- 5: la cache de 60s, medida en la API y no en la UI ---
    // Dos GET pegados, sin abrir el modal en el medio. Medir la cache por UI
    // hacia que el reloj incluyen el render del browser y deja una ventana en la
    // que el dev server puede invalidar el module graph (Vite/Astro reinicia el
    // estado a nivel modulo y la cache se pierde -> falso negativo). Con la
    // segunda peticion pegada a la primera no hay eventos de filesystem entre
    // medio, y el reloj mide solo el server.
    const warm1Url = `${CHECK_ENDPOINT}?officeCode=${OFFICE_WITH_DUPLICATE}`;
    const warm2Url = `${CHECK_ENDPOINT}?officeCode=${OFFICE_WITHOUT_DUPLICATE}`;

    const warmT0 = Date.now();
    const warm1 = await page.request.get(warm1Url);
    const warmMs1 = Date.now() - warmT0;

    const warmT1 = Date.now();
    const warm2 = await page.request.get(warm2Url);
    const warmMs2 = Date.now() - warmT1;

    expect(warm1.status(), `la 1ra consulta dio ${warm1.status()}`).toBe(200);
    expect(warm2.status(), `la 2da consulta dio ${warm2.status()}`).toBe(200);
    expect(
      warmMs2,
      `la segunda consulta debe pegarle a la cache y no repetir el recorrido a InvGate (1ra: ${warmMs1}ms, 2da: ${warmMs2}ms)`,
    ).toBeLessThan(WARM_BUDGET_MS);

    // --- 7 + 8: el atajo "Crear sin verificar" ---
    // Se prueba sobre la oficina que SI tiene un ticket abierto: si el atajo
    // reutilizara el resultado del camino verificado (o inventara uno) el
    // modal no puede mostrarse como limpio.
    const checksBefore = checkRequests;
    const { modal, confirmModal } = await openTicketModal(
      OFFICE_WITH_DUPLICATE,
    );

    const t0 = Date.now();
    await page.locator("#skip-verify-agents-ticket-btn").click();
    await expect(confirmModal).toBeVisible({ timeout: SKIP_BUDGET_MS });
    const skipUiMs = Date.now() - t0;

    await expect(confirmModal.locator("#confirm-unverified-state")).toBeVisible();
    await expect(confirmModal.locator("#confirm-default-state")).toBeHidden();
    await expect(confirmModal.locator("#confirm-duplicate-state")).toBeHidden();
    // El contexto (oficina / origen / agente) tiene que estar visible en los
    // tres estados: el alert de "no verificado" sin la oficina seria inutil.
    const officeLabel = confirmModal.locator("#confirm-office-label");
    const agentLabel = confirmModal.locator("#confirm-agent-label");
    await expect(officeLabel).toBeVisible();
    await expect(officeLabel).toContainText(OFFICE_WITH_DUPLICATE);
    await expect(agentLabel).toBeVisible();
    await expect(agentLabel).not.toHaveText("—");

    expect(
      checkRequests,
      "el atajo no puede consultar InvGate: la cache del servidor enmascara el error",
    ).toBe(checksBefore);
    expect(
      skipUiMs,
      "sin red, el modal de confirmacion tiene que abrir al instante",
    ).toBeLessThan(SKIP_BUDGET_MS);

    await closeBothModals(modal, confirmModal);

    // --- 6: nada de tickets reales ---
    console.log(
      `[timing] check ${OFFICE_WITH_DUPLICATE}: fetch ${withDup.fetchMs}ms / ui ${withDup.uiMs}ms` +
        ` | check ${OFFICE_WITHOUT_DUPLICATE}: fetch ${withoutDup.fetchMs}ms / ui ${withoutDup.uiMs}ms` +
        ` | cache API: ${warmMs1}ms -> ${warmMs2}ms` +
        ` | skip ${OFFICE_WITH_DUPLICATE}: ui ${skipUiMs}ms | requests a check: ${checkRequests}`,
    );
    expect(createRequests, "el spec no debe crear tickets en InvGate").toHaveLength(
      0,
    );
  });

  // El loading del boton de verificar se cruza por opacidad con el label dentro
  // de la misma celda de un grid: lo REEMPLAZA, no se suma al lado. Dos
  // propiedades, y el spec tiene que cubrir las dos:
  //   - sin salto de layout: el boton no cambia de ancho ni de alto durante la
  //     consulta. Antes el handler reemplazaba el innerHTML por
  //     "<spinner> Verificando...", y eso movia el boton (mas chico en desktop,
  //     2 lineas en movil) y empujaba al hermano flex-1.
  //   - sin hueco reservado: en idle el spinner tiene que ser transparente Y no
  //     ocupar ancho. Reservarlo siempre (slot con visibility) dejaba un hueco
  //     vacio al lado del label en el boton que no esta trabajando.
  test("el loading reemplaza el label sin mover el boton ni dejar hueco", async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);

    const resolved = await resolveOfficesUnderTest();
    test.skip(
      !resolved,
      "No hay una oficina TELEGRAFIA con link de InvGate y ticket de agentes abierto para probar el loading.",
    );
    const OFFICE_WITH_DUPLICATE = resolved!.withDuplicate;

    const createRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(CREATE_ENDPOINT)) createRequests.push(req.method());
    });

    // Estira la respuesta del endpoint para poder observar el boton busy.
    await page.route(`**${CHECK_ENDPOINT}*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await setSessionCookie(context, admin.signedSessionId);
    await page.goto("/oficinas");
    await page.waitForSelector("[data-sort-code]", { timeout: 20000 });
    // El listado es paginado con scroll infinito. Si la request de la pagina 2
    // sigue en vuelo cuando escribimos en el buscador, fetchOffices() corta con
    // `if (isLoading) return` y la busqueda se pierde sin aviso: el input queda
    // con el texto pero la tabla nunca se actualiza. Hay que esperar a que la
    // red se calme antes de filtrar.
    await page.waitForLoadState("networkidle");

    await page.locator("#office-search").fill(OFFICE_WITH_DUPLICATE);
    const row = page.locator(`[data-sort-code="${OFFICE_WITH_DUPLICATE}"]`);
    await expect(row).toHaveCount(1, { timeout: 20000 });
    await row.locator("[data-agents-ticket-trigger]").click();

    const modal = page.locator("#agents-ticket-modal");
    const confirmModal = page.locator("#agents-ticket-confirm-modal");
    await expect(modal).toBeVisible();

    const sourceSelect = page.locator("#ticket-source-select");
    await expect(sourceSelect).toHaveValue(/\d+/, { timeout: 20000 });
    const agentSelect = page.locator("#ticket-agent-select");
    await expect
      .poll(
        async () => await agentSelect.locator("option[data-name]").count(),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await agentSelect.selectOption({ index: 1 });

    const primary = page.locator("#confirm-agents-ticket-btn");
    const secondary = page.locator("#skip-verify-agents-ticket-btn");
    const content = primary.locator("[data-btn-content]");
    const label = primary.locator("[data-btn-label]");
    const spinner = primary.locator("[data-btn-spinner]");

    // --- idle: el spinner esta apagado y no ocupa ancho ---
    await expect(spinner).toHaveCSS("opacity", "0");
    await expect(label).toHaveCSS("opacity", "1");

    const idleContent = (await content.boundingBox())!;
    const idleLabel = (await label.boundingBox())!;
    expect(
      Math.abs(Math.round(idleContent.width) - Math.round(idleLabel.width)),
      `en idle el boton reserva ${Math.round(idleContent.width - idleLabel.width)}px para el spinner: tiene que ocupar la misma celda que el label, no sumsarse al lado`,
    ).toBeLessThanOrEqual(1);

    const before = {
      primary: await primary.boundingBox(),
      secondary: await secondary.boundingBox(),
    };
    expect(before.primary, "no se pudo medir el boton").not.toBeNull();
    expect(before.secondary).not.toBeNull();

    await primary.click();

    // Estado busy real: el endpoint esta estirado 3s, asi que hay tiempo de
    // mirar como quedo el boton mientras espera.
    await expect(primary).toHaveAttribute("aria-busy", "true", { timeout: 5000 });
    await expect(primary).toBeDisabled();
    await expect(spinner).toHaveCSS("opacity", "1");
    await expect(label).toHaveCSS("opacity", "0");
    await expect(secondary).toBeDisabled();

    const during = {
      primary: await primary.boundingBox(),
      secondary: await secondary.boundingBox(),
    };

    // Bilateral: el bug original encogia el boton (menos caracteres) y en
    // movil lo agrandaba (2 lineas). Cualquier cambio de caja es un salto de
    // layout, no solo el que crece. 1px de tolerancia por subpixel.
    for (const key of ["primary", "secondary"] as const) {
      const b = before[key]!;
      const d = during[key]!;
      expect(
        Math.abs(Math.round(d.width) - Math.round(b.width)),
        `el ancho del boton ${key} cambia al verificar (idle ${Math.round(b.width)}px -> busy ${Math.round(d.width)}px)`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(Math.round(d.height) - Math.round(b.height)),
        `el alto del boton ${key} cambia al verificar (idle ${Math.round(b.height)}px -> busy ${Math.round(d.height)}px): el label "Verificando..." no puede envolver a 2 lineas`,
      ).toBeLessThanOrEqual(1);
    }

    // El boton vuelve a su estado normal cuando llega la respuesta.
    await expect(confirmModal).toBeVisible({ timeout: COLD_BUDGET_MS });
    await expect(primary).toHaveAttribute("aria-busy", "false");
    await expect(primary).toBeEnabled();
    await expect(spinner).toHaveCSS("opacity", "0");
    await expect(label).toHaveCSS("opacity", "1");

    await confirmModal.getByRole("button", { name: /cancelar/i }).first().click();
    await expect(confirmModal).toBeHidden();
    await modal.getByRole("button", { name: /cancelar/i }).first().click();
    await expect(modal).toBeHidden();

    expect(createRequests, "el spec no debe crear tickets en InvGate").toHaveLength(
      0,
    );
  });
});
