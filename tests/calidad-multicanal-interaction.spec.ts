import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../src/db/index";
import {
  agents,
  auditParameters,
  auditScores,
  mesas,
  qualityAudits,
  sessions,
  users,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

let testUserId: number;
let testRawSessionId: string;
let testSignedSessionId: string;
let seededAgentId: number | null = null;

test.beforeAll(async () => {
  const mesaName = "TI_GSM_MDA TI";
  let [mesa] = await db
    .select({ invgateId: mesas.invgateId })
    .from(mesas)
    .where(eq(mesas.name, mesaName));
  if (!mesa) {
    await db
      .insert(mesas)
      .values({
        invgateId: 910002,
        name: mesaName,
        displayName: null,
        active: true,
        assignable: true,
        lastSyncedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    [mesa] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, mesaName));
  }

  const username = `sup_calidad_test_${Date.now()}`;
  testRawSessionId = `test-calidad-session-${Date.now()}`;
  testSignedSessionId = signSessionId(testRawSessionId);

  const [newUser] = await db
    .insert(users)
    .values({
      username,
      password: "hashed_fake_password",
      role: "supervisor",
      helpdeskId: mesa?.invgateId ?? null,
      helpdeskName: mesa ? mesaName : null,
    })
    .returning({ id: users.id });

  testUserId = newUser.id;

  await db.insert(sessions).values({
    id: testRawSessionId,
    userId: testUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
});

test.afterAll(async () => {
  if (seededAgentId) {
    const audits = await db
      .select()
      .from(qualityAudits)
      .where(eq(qualityAudits.agentId, seededAgentId));
    for (const a of audits) {
      await db.delete(auditScores).where(eq(auditScores.auditId, a.id));
    }
    await db.delete(qualityAudits).where(eq(qualityAudits.agentId, seededAgentId));
    await db.delete(agents).where(eq(agents.id, seededAgentId));
  }
  if (testRawSessionId) {
    await db.delete(sessions).where(eq(sessions.id, testRawSessionId));
  }
  if (testUserId) {
    await db.delete(users).where(eq(users.id, testUserId));
  }
});

test.describe("Interacción Calidad Operadores - Selección y Modal", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "session_id",
        value: testSignedSessionId,
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test("Debe permitir seleccionar operador, mostrar panel de detalle y abrir modal de auditoría", async ({
    page,
  }) => {
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("BROWSER ERROR:", err));

    await page.goto("/supervision/calidad-operadores");

    const operatorItems = page.locator(".operator-card");
    await expect(operatorItems.first()).toBeVisible({ timeout: 10000 });

    const detailsModal = page.locator("#operator-details-modal");
    await expect(detailsModal).toBeHidden();

    const firstOperator = operatorItems.first();
    await firstOperator.click();

    await expect(detailsModal).toBeVisible();

    const detailName = detailsModal.locator("#detail-name");
    await expect(detailName).toBeVisible();

    const btnNewAudit = detailsModal.locator("#btn-new-audit");
    await expect(btnNewAudit).toBeVisible();
    await btnNewAudit.click();

    await expect(page).toHaveURL(/\/supervision\/calidad-operadores\/nueva/);
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría/i);
  });

  test("Debe soportar buscador dual, visor de ticket en vivo y auto-evaluación asistida de títulos", async ({
    page,
  }) => {
    await page.goto("/supervision/calidad-operadores/nueva");
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría/i);

    // Verificar que los botones de búsqueda tienen SVG con path renderizado (is:inline)
    const wiseSvgPath = page.locator("#btn-fetch-wise-api svg path");
    await expect(wiseSvgPath).toBeVisible();

    // 1. Los campos de búsqueda están unificados en "Datos de la atención"
    // (no existe la tarjeta #unified-search-card ni sus tabs duplicados)
    await expect(page.locator("#unified-search-card")).not.toBeAttached();
    await expect(page.locator("#tab-search-wise")).not.toBeAttached();
    await expect(page.locator("#tab-search-invgate")).not.toBeAttached();

    const callIdInput = page.locator("#form-call-id");
    const ticketIdInput = page.locator("#form-ticket-id");
    const btnFetchWise = page.locator("#btn-fetch-wise-api");
    const btnFetchInvgate = page.locator("#btn-fetch-invgate-api");

    await expect(callIdInput).toBeVisible();
    await expect(ticketIdInput).toBeVisible();
    await expect(btnFetchWise).toBeVisible();
    await expect(btnFetchInvgate).toBeVisible();
    await expect(page.locator("#btn-fetch-invgate-label")).toHaveText("Buscar");

    // 2. Ambos botones siguen disponibles en Autogestión (ya no hay tabs que oculten)
    const agBtn = page.locator('.channel-btn[data-channel="invgate_ticket"]');
    await agBtn.click();
    await expect(btnFetchWise).toBeVisible();
    await expect(btnFetchInvgate).toBeVisible();

    // Volver a canal Llamada Wise
    const callBtn = page.locator('.channel-btn[data-channel="wise_call"]');
    await callBtn.click();
    await expect(btnFetchWise).toBeVisible();

    // 2b. El deep-link a InvGate arranca deshabilitado sin ticket cargado
    const btnOpenInvgate = page.locator("#btn-open-invgate-ticket");
    await expect(btnOpenInvgate).toHaveClass(/pointer-events-none/);

    // 3. Probar que al buscar en Wise CX NO se llena el Detalle del Ticket y el audio es independiente
    await page.route("**/api/calidad/fetch-metadata*source=wise*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            caseNumber: "534787",
            operator: "Juan Pérez",
            duration: "03:45",
            date: "2026-10-02",
            recordingUrl: "https://example.com/recordings/call-534787.mp3",
          },
        }),
      });
    });

    await callIdInput.fill("534787");
    await btnFetchWise.click();

    // Detalle del Ticket NO debe haberse cargado desde Wise
    const tvTitlePre = page.locator("#tv-title");
    await expect(tvTitlePre).toHaveText("-");
    await expect(page.locator("#tv-category")).toHaveText("-");
    await expect(page.locator("#ticket-context-badge")).toHaveText("Sin ticket cargado");

    // Pero el reproductor de audio independiente sí debe mostrarse
    const audioContainer = page.locator("#tv-audio-container");
    await expect(audioContainer).toBeVisible();
    await expect(page.locator("#tv-audio-download")).toHaveAttribute("href", /api\/calidad\/download-audio.*call-534787\.mp3/);

    // 4. El visor de ticket arranca colapsado y se despliega al cargar el ticket
    const tvContent = page.locator("#ticket-viewer-content");
    await expect(tvContent).toHaveClass(/hidden/);
    await expect(page.locator("#ticket-empty-state")).toBeVisible();

    // 5. Verificar que Falla Crítica de Proceso no existe en el modal
    await expect(page.locator("#form-is-critical-failure")).not.toBeAttached();

    // 6. Mockear respuesta de InvGate con HTML en descripción y título homologado
    let mockTitle = "Aforadora- Consulta";
    let mockSource = "Teléfono";
    await page.route("**/api/calidad/fetch-metadata*source=invgate*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            caseNumber: "88442",
            title: mockTitle,
            category: "Hardware",
            priority: "Alta",
            status: "En curso",
            creator: "Juan Pérez",
            createdBy: "Ramiro Rojas",
            helpdesk: "Mesa de Ayuda TI",
            source: mockSource,
            description: "<p>Falla en equipo aforadora <strong>sucursal</strong>.<br>No imprime comprobante.</p>",
            date: "2026-10-01",
          },
        }),
      });
    });

    // Buscar en InvGate desde el campo #form-ticket-id
    await ticketIdInput.fill("88442");
    await btnFetchInvgate.click();

    // 6. Verificar que el visor de ticket se actualizó y la descripción no tiene tags HTML
    const tvTitle = page.locator("#tv-title");
    await expect(tvTitle).toHaveText("Aforadora- Consulta");
    await expect(page.locator("#tv-category")).toHaveText("Hardware");
    await expect(page.locator("#tv-category")).toBeVisible();
    await expect(page.locator("#tv-priority")).toHaveText("Alta");
    await expect(page.locator("#tv-creator")).toHaveText("Juan Pérez");
    await expect(page.locator("#tv-creator")).toBeVisible();
    await expect(page.locator("#tv-created-by")).toHaveText("Ramiro Rojas");
    await expect(page.locator("#tv-created-by")).toBeVisible();
    await expect(page.locator("#tv-helpdesk")).toHaveText("Mesa de Ayuda TI");
    await expect(page.locator("#tv-helpdesk")).toBeVisible();
    await expect(page.locator("#tv-source")).toHaveText("Teléfono");
    await expect(page.locator("#tv-source")).toBeVisible();

    const tvDescription = page.locator("#tv-description");
    await expect(tvDescription).toBeVisible();
    await expect(tvDescription).toContainText("Falla en equipo aforadora sucursal.");
    await expect(tvDescription).not.toContainText("<p>");
    await expect(tvDescription).not.toContainText("<strong>");
    await expect(tvDescription).not.toContainText("<br>");

    // 7. Verificar auto-evaluación asistida del parámetro Título y Origen (Ambos válidos)
    const tvTitleBadge = page.locator("#tv-title-match-badge");
    await expect(tvTitleBadge).toContainText("Título homologado");

    const titleCheckbox = page.locator('input[name="call_ticket_titulo"]');
    await expect(titleCheckbox).toBeChecked();

    const titleRuleBadge = page.locator('.rule-auto-badge[data-rule-badge="call_ticket_titulo"]');
    await expect(titleRuleBadge).toHaveClass(/hidden/);

    const sourceCheckbox = page.locator('input[name="call_ticket_origen"]');
    await expect(sourceCheckbox).toBeChecked();

    const sourceRuleBadge = page.locator('.rule-auto-badge[data-rule-badge="call_ticket_origen"]');
    await expect(sourceRuleBadge).toHaveClass(/hidden/);

    // 8. Probar búsqueda con Título No Homologado y Origen No Válido (ej: Correo en llamada wise)
    mockTitle = "Titulo Inexistente No Homologado 999";
    mockSource = "Correo";
    await ticketIdInput.fill("88443");
    await btnFetchInvgate.click();

    // Verificar que badge dice "No Homologado" sin símbolo ⚠
    await expect(tvTitleBadge).toHaveText("Título no homologado");
    await expect(tvTitleBadge).not.toContainText("⚠");

    // Verificar que el checkbox de título se desmarca y aparece el badge de "Desactivado por regla"
    await expect(titleCheckbox).not.toBeChecked();
    await expect(titleRuleBadge).not.toHaveClass(/hidden/);
    await expect(titleRuleBadge).toHaveText("Desactivado por regla");

    // Verificar que el checkbox de origen se desmarca y muestra advertencia de regla
    await expect(sourceCheckbox).not.toBeChecked();
    await expect(sourceRuleBadge).not.toHaveClass(/hidden/);
    await expect(sourceRuleBadge).toHaveText("Origen incorrecto");

    // 9. Si el supervisor revierte manualmente el estado, el badge de regla se oculta.
    // El checkbox es `sr-only`: se acciona por el control de estado de la fila.
    const titleItem = titleCheckbox.locator("xpath=ancestor::div[contains(@class,'checklist-item')]");
    await titleItem.locator('.state-btn[data-state="cumple"]').click();
    await expect(titleCheckbox).toBeChecked();
    await expect(titleRuleBadge).toHaveClass(/hidden/);

    const sourceItem = sourceCheckbox.locator("xpath=ancestor::div[contains(@class,'checklist-item')]");
    await sourceItem.locator('.state-btn[data-state="cumple"]').click();
    await expect(sourceCheckbox).toBeChecked();
    await expect(sourceRuleBadge).toHaveClass(/hidden/);

    // 10. Verificar que el número de ticket se asignó en el formulario
    await expect(page.locator("#form-ticket-id")).toHaveValue("88442");

    // 10b. El badge no debe desbordar su caja al cambiar de estado (regresión: el JS
    // pisaba el className completo y el texto se salía del badge)
    const viewerBadge = page.locator("#ticket-context-badge");
    await expect(viewerBadge).toContainText("Ticket cargado");
    await expect(viewerBadge).not.toHaveClass(/truncate.*hidden/);
    const badgeBox = await viewerBadge.boundingBox();
    if (badgeBox) {
      // El texto debe caber dentro del ancho del badge
      const textWidth = await viewerBadge.evaluate((el) => el.scrollWidth);
      expect(textWidth).toBeLessThanOrEqual(Math.ceil(badgeBox.width) + 1);
    }

    // 11. El deep-link a InvGate apunta al ticket cargado y abre en pestaña nueva
    await expect(btnOpenInvgate).not.toHaveClass(/pointer-events-none/);
    await expect(btnOpenInvgate).toHaveAttribute("target", "_blank");
    await expect(btnOpenInvgate).toHaveAttribute("rel", /noopener/);
    await expect(btnOpenInvgate).toHaveAttribute(
      "href",
      /\/requests\/show\/index\/id\/88442$/,
    );

    // 12. Enter en el campo dispara la búsqueda (mismo resultado que el botón).
    // El mock responde con caseNumber fijo "88442", así que el input se
    // resincroniza a ese valor y el deep-link debe reflejarlo.
    mockTitle = "Titulo Cargado Mediante Enter";
    mockSource = "Teléfono";
    await ticketIdInput.fill("88450");
    await ticketIdInput.press("Enter");
    await expect(tvTitle).toHaveText("Titulo Cargado Mediante Enter");
    await expect(ticketIdInput).toHaveValue("88442");
    await expect(btnOpenInvgate).toHaveAttribute(
      "href",
      /\/requests\/show\/index\/id\/88442$/,
    );

      });

  test("Debe soportar toggle de ticket en Llamadas y Mails con recálculo dinámico proporcional", async ({
    page,
  }) => {
    await page.goto("/supervision/calidad-operadores/nueva");
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría/i);

    // --- A. Canal Llamadas Wise: Selector de modo Ticket Nuevo vs Reclamo / Novedad ---
    const btnNuevo = page.locator('.ticket-mode-btn[data-mode="nuevo"]');
    const btnReclamo = page.locator('.ticket-mode-btn[data-mode="reclamo"]');
    await expect(btnNuevo).toBeVisible();
    await expect(btnReclamo).toBeVisible();

    const callTicketBlock = page.locator("#wise-call-ticket-block");
    const reclamoCard = page.locator("#wise-call-reclamo-card");
    await expect(callTicketBlock).toBeVisible();
    await expect(reclamoCard).toHaveClass(/hidden/);

    // Verificar lista canónica de parámetros en llamada
    await expect(page.locator('input[name="call_solicitud"]')).not.toBeAttached();
    await expect(page.locator('input[name="call_ticket_reclamo_novedad"]')).not.toBeAttached();

    // Scores iniciales (100% en todo)
    const previewS1 = page.locator("#preview-s1");
    const previewS2 = page.locator("#preview-s2");
    const previewTotal = page.locator("#preview-total");

    await expect(previewS1).toHaveText("100%");
    await expect(previewS2).toHaveText("100%");
    await expect(previewTotal).toHaveText("100%");

    // Activar modo Reclamo / Novedad: Sección 2 debe otorgar 100% automático y mostrar tarjeta
    await btnReclamo.click();
    await expect(callTicketBlock).toHaveClass(/hidden/);
    await expect(reclamoCard).not.toHaveClass(/hidden/);
    await expect(previewS2).toHaveText("100%");
    await expect(previewTotal).toHaveText("100%");

    // Desmarcar un ítem de sección 1: Cumplimiento de procedimiento (-10%)
    // Base 45: 35/45 = 78% en S1, S2 sigue aportando 55 pts -> Total 90%
    const procItem = page
      .locator("#channel-checklist-wise_call .checklist-item")
      .filter({ has: page.locator('input[name="call_procedimiento"]') });
    await procItem.locator('.state-btn[data-state="nocumple"]').click();
    await expect(procItem.locator(".criteria-status-badge")).toHaveText("No cumple");
    await expect(procItem.locator('input[name="call_procedimiento"]')).not.toBeChecked();
    await expect(previewS1).toHaveText("78%");
    await expect(previewS2).toHaveText("100%");
    await expect(previewTotal).toHaveText("90%");

    // Volver a modo Ticket Nuevo
    await btnNuevo.click();
    await expect(callTicketBlock).not.toHaveClass(/hidden/);
    await expect(reclamoCard).toHaveClass(/hidden/);
    await expect(previewS1).toHaveText("78%");
    await expect(previewS2).toHaveText("100%");
    await expect(previewTotal).toHaveText("90%");

    // --- B. Canal Mails Wise ---
    const wiseEmailBtn = page.locator('.channel-btn[data-channel="wise_email"]');
    await wiseEmailBtn.click();

    // Verificar selector de modo en mails (Ticket nuevo vs Reclamo / Novedad)
    const emailNuevoBtn = page.locator('.email-ticket-mode-btn[data-mode="nuevo"]');
    const emailReclamoBtn = page.locator('.email-ticket-mode-btn[data-mode="reclamo"]');
    await expect(emailNuevoBtn).toBeVisible();
    await expect(emailReclamoBtn).toBeVisible();

    // Verificar que no existe reclamo/novedad en mails
    await expect(page.locator('input[name="email_mda_reclamo_novedad"]')).not.toBeAttached();
  });

  /**
   * Numeración 1..N por canal + orden manual persistente. El arrastre HTML5 no
   * se simula (Playwright no dispara la secuencia dragstart/dragover/drop de
   * forma confiable); lo que se verifica es el contrato observable: el orden
   * sale de `sort_order` al renderizar, los badges numeran por canal, y el
   * endpoint de reorder persiste el nuevo orden para la próxima carga.
   */
  test("Orden manual de auditorías: numeración por canal y persistencia", async ({
    page,
  }) => {
    const now = new Date();
    const currentMonth = `${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getFullYear()}`;

    const [opAgent] = await db
      .insert(agents)
      .values({
        name: "Operador Orden Manual",
        username: `op_orden_${Date.now()}`,
        incluidoCalidad: true,
      })
      .returning({ id: agents.id });
    seededAgentId = opAgent.id;

    // Se insertan invertidas a propósito: la segunda tiene MENOR sort_order.
    const [second] = await db
      .insert(qualityAudits)
      .values({
        agentId: opAgent.id,
        month: currentMonth,
        channelType: "wise_call",
        callId: "ORDEN-B",
        ticketId: "",
        duration: "01:00",
        date: "2026-10-01",
        totalScore: 80,
        section1Score: 80,
        section2Score: 80,
        sortOrder: 10,
      })
      .returning({ id: qualityAudits.id });

    const [first] = await db
      .insert(qualityAudits)
      .values({
        agentId: opAgent.id,
        month: currentMonth,
        channelType: "wise_call",
        callId: "ORDEN-A",
        ticketId: "",
        duration: "01:00",
        date: "2026-10-02",
        totalScore: 80,
        section1Score: 80,
        section2Score: 80,
        sortOrder: 20,
      })
      .returning({ id: qualityAudits.id });

    await page.goto(`/supervision/calidad-operadores?month=${currentMonth}`);
    await page.locator(`.operator-card[data-operator-id="${opAgent.id}"]`).click();

    const cards = page.locator("#detail-calls-container .call-card-container");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // sort_order manda sobre la fecha de inserción.
    await expect(cards.nth(0)).toContainText("ORDEN-B");
    await expect(cards.nth(1)).toContainText("ORDEN-A");

    // En "Todas" no hay numeración: es por canal.
    await expect(cards.first().locator("[data-audit-slot]")).toHaveCount(0);
    await expect(cards.first().locator(".audit-drag-handle")).toHaveCount(0);

    // Dentro del canal aparece el N° y el asa arrastrable.
    await page.locator('.operator-channel-tab[data-channel="wise_call"]').click({ force: true });
    await expect(cards.nth(0).locator("[data-audit-slot]")).toHaveText("1");
    await expect(cards.nth(1).locator("[data-audit-slot]")).toHaveText("2");
    await expect(cards.first().locator(".audit-drag-handle")).toHaveAttribute(
      "draggable",
      "true",
    );

    // Arrastre real (eventos HTML5 disparados a mano: Playwright no genera la
    // secuencia). Se toma la 2ª card y se la suelta antes de la 1ª.
    const reorderResponse = page.waitForResponse((r) =>
      r.url().includes("/api/calidad/reorder-audits"),
    );
    const dragged = await page.evaluate(() => {
      const handles = Array.from(
        document.querySelectorAll<HTMLElement>(
          "#detail-calls-container .audit-drag-handle",
        ),
      );
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          "#detail-calls-container .call-card-container",
        ),
      );
      if (handles.length < 2) return "faltan asas";

      const dt = new DataTransfer();
      handles[1].dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }),
      );
      const target = cards[0];
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientY: target.getBoundingClientRect().top - 10,
        }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        }),
      );
      handles[1].dispatchEvent(
        new DragEvent("dragend", { bubbles: true, dataTransfer: dt }),
      );
      return "ok";
    });
    expect(dragged).toBe("ok");
    expect((await reorderResponse).ok()).toBeTruthy();

    // El DOM quedó invertido y la DB guardó el nuevo orden.
    await expect(cards.nth(0)).toContainText("ORDEN-A");
    await expect(cards.nth(0).locator("[data-audit-slot]")).toHaveText("1");

    const rows = await db
      .select({ id: qualityAudits.id, sortOrder: qualityAudits.sortOrder })
      .from(qualityAudits)
      .where(eq(qualityAudits.agentId, opAgent.id));
    expect(rows.find((r) => r.id === first.id)?.sortOrder).toBe(10);
    expect(rows.find((r) => r.id === second.id)?.sortOrder).toBe(20);

    // Cerrar y reabrir el modal SIN recargar: el orden tiene que persistir.
    await page.locator("#operator-details-modal").evaluate((el: any) => el.close());
    await page.locator(`.operator-card[data-operator-id="${opAgent.id}"]`).click();
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await expect(cards.nth(0)).toContainText("ORDEN-A");
    await expect(cards.nth(1)).toContainText("ORDEN-B");

    await page.reload();
    await page.locator(`.operator-card[data-operator-id="${opAgent.id}"]`).click();
    const afterReload = page.locator("#detail-calls-container .call-card-container");
    await expect(afterReload.first()).toBeVisible({ timeout: 10000 });
    await expect(afterReload.nth(0)).toContainText("ORDEN-A");
    await expect(afterReload.nth(1)).toContainText("ORDEN-B");
  });

  /**
   * Regla de Ortografía (#291): al cargar el ticket, el parámetro de ortografía
   * del canal se auto-evalúa y el badge muestra el primer hallazgo. El
   * supervisor puede sobrescribir el estado con un clic (y el badge se oculta).
   */
  test("Regla de ortografía: auto-evalúa el criterio y permite override manual", async ({
    page,
  }) => {
    let description = "El cliente nesesita revisar la configuracion del equipo.";
    await page.route("**/api/calidad/fetch-metadata*source=invgate*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            caseNumber: "88444",
            title: "Falla de impressora",
            category: "Hardware",
            priority: "Media",
            status: "En curso",
            creator: "Juan Pérez",
            helpdesk: "Mesa de Ayuda TI",
            source: "Teléfono",
            description,
            date: "2026-10-01",
          },
        }),
      });
    });

    await page.goto("/supervision/calidad-operadores/nueva");
    await page.locator("#form-ticket-id").fill("88444");
    await page.locator("#btn-fetch-invgate-api").click();

    const ortoCheckbox = page.locator('input[name="call_ticket_ortografia"]');
    const ortoBadge = page.locator('.rule-auto-badge[data-rule-badge="call_ticket_ortografia"]');

    // Erratas + falta de tilde -> No cumple con el primer hallazgo en el badge.
    await expect(ortoCheckbox).not.toBeChecked();
    await expect(ortoBadge).not.toHaveClass(/hidden/);
    await expect(ortoBadge).toHaveText(/Ortografía: (nesecita|configuracion)/);

    // Override manual: el estado del supervisor manda y el badge desaparece.
    const ortoItem = ortoCheckbox.locator(
      "xpath=ancestor::div[contains(@class,'checklist-item')]",
    );
    await ortoItem.locator('.state-btn[data-state="cumple"]').click();
    await expect(ortoCheckbox).toBeChecked();
    await expect(ortoBadge).toHaveClass(/hidden/);

    // Texte limpio (sin jerga MDA ni siglas) -> Cumple sin badge.
    description = "El cliente necesita revisar la configuración del equipo.";
    await page.locator("#form-ticket-id").fill("88445");
    await page.locator("#btn-fetch-invgate-api").click();
    await expect(ortoCheckbox).toBeChecked();
    await expect(ortoBadge).toHaveClass(/hidden/);
  });

  test("Debe mostrar scores consistentes entre la card de auditoría guardada y el modal de edición", async ({
    page,
  }) => {
    /*
     * Este test siembra su propia auditoría en el mes en curso. Antes depended de
     * datos preexistentes (09-2026) y todo el bloque estaba detrás de
     * `if (callCard.isVisible())`: en el mes por defecto no había cards, la rama
     * se saltaba y el test pasaba en verde sin verificar nada.
     */
    const now = new Date();
    const currentMonth = `${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getFullYear()}`;

    const params = await db
      .select({ id: auditParameters.id, section: auditParameters.section })
      .from(auditParameters)
      .where(eq(auditParameters.active, true));
    test.skip(params.length === 0, "Requiere audit_parameters activos para crear la auditoría");
    // La card renderiza las dos secciones: sembramos al menos un score de cada una.
    const s1Param = params.find((p) => p.section === "items") ?? params[0];
    const s2Param = params.find((p) => p.section !== "items");

    const [opAgent] = await db
      .insert(agents)
      .values({
        name: "Operador Paridad Scores",
        username: `op_paridad_${Date.now()}`,
        incluidoCalidad: true,
      })
      .returning({ id: agents.id });
    seededAgentId = opAgent.id;

    const [audit] = await db
      .insert(qualityAudits)
      .values({
        agentId: opAgent.id,
        month: currentMonth,
        channelType: "wise_call",
        callId: "PARIDAD01",
        ticketId: "",
        duration: "02:30",
        date: now.toISOString().slice(0, 10),
        totalScore: 90,
        section1Score: 90,
        section2Score: 90,
        notes: "Auditoría sembrada para el test de paridad",
      })
      .returning({ id: qualityAudits.id });
    await db.insert(auditScores).values([
      {
        auditId: audit.id,
        parameterId: s1Param.id,
        score: true,
        comment: "Observación sembrada",
      },
      ...(s2Param
        ? [{ auditId: audit.id, parameterId: s2Param.id, score: true, comment: null }]
        : []),
    ]);

    await page.goto(`/supervision/calidad-operadores?month=${currentMonth}`);

    const targetOp = page.locator(`.operator-card[data-operator-id="${opAgent.id}"]`);
    // Aserción estricta: si no aparece, el test falla en vez de salta��se.
    await expect(targetOp).toBeVisible({ timeout: 10000 });
    await targetOp.click();

    // Acotar a la card del operador sembrado: hay cards de todos los operadores del mes.
    const callCard = page
      .locator(`.call-card-container:has-text("PARIDAD01")`)
      .first();
    await expect(callCard).toBeVisible({ timeout: 10000 });

    // Expandir la card
    const expandBtn = callCard.locator('button[title="Expandir / Minimizar detalles"]');
    // La card vive dentro de #operator-details-modal (un <dialog> modal): sin
    // force, el overlay del propio dialog intercepta el pointer.
    await expandBtn.click({ force: true });

    const details = callCard.locator(".call-card-details");
    await expect(details).toBeVisible();

    // Card scores
    const s1Text = await details.locator("span.text-xl").first().innerText();
    const s2Text = await details.locator("span.text-xl").nth(1).innerText();
    const totalScoreText = await callCard.locator("span.font-mono").first().innerText();
    expect(s1Text).toMatch(/\d/);
    expect(s2Text).toMatch(/\d/);
    expect(totalScoreText).toMatch(/\d/);

    // Ambas secciones listan sus criterios. El selector `div.p-6` quedó obsoleto:
    // el markup de la card usa `p-4 sm:p-5` (CalidadContent.astro:1172,1189).
    const detailSections = details.locator("ul");
    await expect(detailSections).toHaveCount(2);
    const s1Count = await detailSections.nth(0).locator("li").count();
    const s2Count = await detailSections.nth(1).locator("li").count();
    expect(s1Count, "la sección 1 debe listar sus criterios").toBeGreaterThan(0);
    expect(s2Count, "la sección 2 debe listar sus criterios").toBeGreaterThan(0);

    // Abrir edición en pantalla completa (NewAuditForm)
    const editBtn = callCard.locator(".edit-audit-btn");
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await page.waitForURL(/\/supervision\/calidad-operadores\/nueva\?auditId=/);
    await expect(page.locator("h1")).toContainText(/Editar Auditoría/i);

    // La auditoría sembrada debe estar precargada en el formulario
    await expect(page.locator("#form-call-id")).toHaveValue("PARIDAD01");
    await expect(page.locator("#form-notes")).toHaveValue("Auditoría sembrada para el test de paridad");

    const previewTotal = await page.locator("#preview-total").innerText();
    expect(previewTotal).toMatch(/\d/);

    // Verificar que el botón de volver incluye el agentId para reapertura directa del modal
    const backBtn = page.locator("#btn-back-evaluations");
    await expect(backBtn).toHaveAttribute("href", /agentId=\d+/);

    /*
     * Abrir una auditoría para editar no puede dejar el formulario "sucio":
     * la hidratación dispara setItemState() -> markAsInProgress(), y eso hacía
     * que "Volver" pidiera confirmación sin que el supervisor tocara nada.
     * Cualquier diálogo en este punto es el bug, no un paso esperado.
     */
    let unexpectedDialog = "";
    page.on("dialog", async (d) => {
      unexpectedDialog = `${d.type()}: ${d.message()}`;
      await d.dismiss();
    });

    await backBtn.click();
    await page.waitForURL(/\/supervision\/calidad-operadores(?!\/nueva)/);
    expect(unexpectedDialog, "Volver no debe pedir confirmación al abrir una auditoría").toBe("");

    // El modal de detalles del operador debe reabrirse automáticamente
    const operatorModal = page.locator("#operator-details-modal");
    await expect(operatorModal).toHaveAttribute("open", "", { timeout: 10000 });
    await expect(page.locator("#detail-calls-container")).toContainText("PARIDAD01");
  });

  test("Debe presentar la pantalla en 2 columnas con notas bajo demanda y score N/A para ticket excluido", async ({ page }) => {
    await page.goto("/supervision/calidad-operadores/nueva");
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría/i);

    // 1. Layout de 2 columnas
    const gridContainer = page.locator("#audit-workspace-grid");
    const colContext = page.locator("#audit-col-left");
    const colEvaluation = page.locator("#audit-col-right");
    await expect(gridContainer).toBeVisible();
    await expect(colContext).toBeVisible();
    await expect(colEvaluation).toBeVisible();

    // 2. Revelado progresivo de notas de observación
    const firstCheckItem = page.locator("#channel-checklist-wise_call .checklist-item").first();
    await expect(firstCheckItem).toBeVisible();

    const obsWrapper = firstCheckItem.locator(".criteria-obs-wrapper");
    // Por defecto debe estar oculto
    await expect(obsWrapper).toHaveClass(/hidden/);

    // El checkbox es un espejo oculto para el backend (`sr-only`): la acción real
    // es el control de estado, y el que revela la nota es su botón Observación.
    const checkbox = firstCheckItem.locator('input.audit-checkbox');
    await expect(checkbox).toBeChecked();
    await firstCheckItem.locator('.state-btn[data-state="nocumple"]').click();
    await expect(firstCheckItem).toHaveAttribute('data-criterion-state', 'nocumple');
    await expect(checkbox).not.toBeChecked();

    // Volver a Cumple reactiva el espejo.
    await firstCheckItem.locator('.state-btn[data-state="cumple"]').click();
    await expect(checkbox).toBeChecked();
    await expect(obsWrapper).toHaveClass(/hidden/);

    const toggleObsBtn = firstCheckItem.locator('[data-action="toggle-obs"]');
    await expect(toggleObsBtn).toBeVisible();
    await expect(toggleObsBtn).toHaveAttribute('aria-expanded', 'false');
    await toggleObsBtn.click();
    await expect(obsWrapper).not.toHaveClass(/hidden/);
    await expect(toggleObsBtn).toHaveAttribute('aria-expanded', 'true');

    // 3. Modo Reclamo / Novedad otorga 100% automático
    const btnReclamo = page.locator('.ticket-mode-btn[data-mode="reclamo"]');
    await btnReclamo.click();

    const previewS2 = page.locator("#preview-s2");
    await expect(previewS2).toHaveText("100%");

    const previewTotal = page.locator("#preview-total");
    await expect(previewTotal).toHaveText("100%");
  });
});

