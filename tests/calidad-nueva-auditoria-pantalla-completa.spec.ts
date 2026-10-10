import "dotenv/config";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/index";
import { agents, users, qualityAudits, auditScores } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "./helpers/auth";

let testSupervisor: TestUser;
let testOperatorUser: TestUser;
let operatorAgentId: number | null = null;
let supervisorAgentId: number | null = null;

test.beforeEach(async () => {
  testSupervisor = await createTestUserAndSession("supervisor");
  testOperatorUser = await createTestUserAndSession("agent");

  // Asignar helpdesk MDA TI (2509)
  await db
    .update(users)
    .set({ helpdeskId: 2509 })
    .where(eq(users.id, testSupervisor.userId));
  await db
    .update(users)
    .set({ helpdeskId: 2509 })
    .where(eq(users.id, testOperatorUser.userId));

  // Crear agente operador. `agents` no tiene `active` ni `role`: la actividad vive
  // en `users.active` (ver activeAgentCondition) y el rol en `users.role`.
  const [op] = await db
    .insert(agents)
    .values({
      name: "Agente Full Screen Test",
      username: testOperatorUser.username,
      userId: testOperatorUser.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  operatorAgentId = op.id;

  // Crear agente supervisor
  const [sup] = await db
    .insert(agents)
    .values({
      name: "Supervisor Full Screen Test",
      username: testSupervisor.username,
      userId: testSupervisor.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  supervisorAgentId = sup.id;
});

test.afterEach(async () => {
  for (const id of [operatorAgentId, supervisorAgentId]) {
    if (id) {
      const audits = await db.select().from(qualityAudits).where(eq(qualityAudits.agentId, id));
      for (const a of audits) {
        await db.delete(auditScores).where(eq(auditScores.auditId, a.id));
      }
      await db.delete(qualityAudits).where(eq(qualityAudits.agentId, id));
      await db.delete(agents).where(eq(agents.id, id));
    }
  }
  if (testSupervisor) {
    await cleanupTestUser(testSupervisor.userId, testSupervisor.sessionId);
  }
  if (testOperatorUser) {
    await cleanupTestUser(testOperatorUser.userId, testOperatorUser.sessionId);
  }
});

test.describe("Nueva Auditoría de Calidad - Pantalla Completa UI/UX", () => {
  test("Verificar estructura completa: Header compacto, Barra de Configuración, 2 Columnas y Footer Sticky", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);

    // 1. Header Superior Compacto
    const topHeader = page.locator("#audit-top-header");
    await expect(topHeader).toBeVisible();
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría de Calidad/i);
    await expect(topHeader.locator("#btn-back-evaluations")).toBeVisible();
    await expect(topHeader.locator("#btn-header-save")).toBeVisible();

    // 2. Barra de Configuración Principal
    const configBar = page.locator("#audit-config-bar");
    await expect(configBar).toBeVisible();
    const agentSelect = configBar.locator("#form-agent-id");
    await expect(agentSelect).toBeVisible();
    await expect(agentSelect).toHaveValue(String(operatorAgentId));

    // Verificar segmented control de canal
    const channelButtons = configBar.locator(".channel-btn");
    await expect(channelButtons).toHaveCount(3);
    const activeChannel = configBar.locator(".channel-btn.btn-active");
    await expect(activeChannel).toContainText(/Llamada Wise/i);

    // Contexto de configuración aplicada
    await expect(configBar.locator("#config-summary-text")).toContainText(/criterios/i);

    // 3. Layout de dos columnas
    const leftCol = page.locator("#audit-col-left");
    const rightCol = page.locator("#audit-col-right");
    await expect(leftCol).toBeVisible();
    await expect(rightCol).toBeVisible();

    // 4. Datos de la atención (barra de configuración) y Contexto del Ticket (columna derecha)
    await expect(configBar.locator("#card-attention-data")).toBeVisible();
    await expect(configBar.locator("#form-call-id")).toBeVisible();
    await expect(configBar.locator("#form-ticket-id")).toBeVisible();
    await expect(configBar.locator("#form-date")).toBeVisible();
    await expect(rightCol.locator("#card-ticket-context")).toBeVisible();
    await expect(rightCol.locator("#ticket-context-badge")).toBeVisible();

    // 5. Columna derecha: Score en tiempo real. Columna izquierda: navegación y criterios.
    const scoreCard = rightCol.locator("#card-realtime-score");
    await expect(scoreCard).toBeVisible();
    await expect(scoreCard.locator("#preview-total")).toContainText(/%/);

    // Tabs de navegación de secciones en la columna izquierda
    const sectionTabs = leftCol.locator("#audit-section-tabs");
    await expect(sectionTabs).toBeVisible();

    // Criterios con notas inline expandibles
    const firstChecklist = leftCol.locator(".checklist-item").first();
    await expect(firstChecklist).toBeVisible();

    // El selector de 3 estados debe contener visualmente todos sus botones sin desborde
    const stateJoin = firstChecklist.locator(".criteria-state-join");
    const naBtn = stateJoin.locator('.state-btn[data-state="na"]');
    await expect(stateJoin).toBeVisible();
    await expect(naBtn).toBeVisible();
    const joinBox = await stateJoin.boundingBox();
    const naBox = await naBtn.boundingBox();
    expect(joinBox).not.toBeNull();
    expect(naBox).not.toBeNull();
    expect(naBox!.x + naBox!.width).toBeLessThanOrEqual(joinBox!.x + joinBox!.width + 1);

    const noteBtn = firstChecklist.locator('[data-action="toggle-obs"]');
    await expect(noteBtn).toBeVisible();
    await noteBtn.click();
    const noteTextarea = firstChecklist.locator(".criteria-obs-wrapper");
    await expect(noteTextarea).toBeVisible();

    // 6. Header como única acción de guardado (sin footer redundante)
    await expect(page.locator("#audit-sticky-footer")).toHaveCount(0);
    const saveBtn = page.locator("#btn-header-save");
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toContainText(/Guardar auditoría/i);
  });

  test("Búsqueda de metadatos: consume fetch-metadata y no una ruta inexistente", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    const requested: string[] = [];

    await page.route("**/api/calidad/**", async (route) => {
      const url = route.request().url();
      requested.push(url);
      if (url.includes("fetch-metadata")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              caseNumber: "534787",
              operator: "PEREZ, JUAN",
              date: "2026-10-07",
              duration: "03:20",
              ringTime: "00:30",
              recordingUrl: "https://example.invalid/audio.mp3",
              detectedChannel: "wise_call",
              rawDetails: { incidentId: 776655 },
            },
          }),
        });
      }
      return route.fulfill({ status: 200, contentType: "audio/mpeg", body: "" });
    });

    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);

    await page.locator("#form-call-id").fill("534787");
    await page.locator("#btn-fetch-wise-api").click();
    await expect(page.locator("#global-toast-container .alert")).toContainText(/534787/);

    // La ruta real existe; las inventadas devuelven el 404 HTML de Astro.
    expect(requested.some((u) => u.includes("/api/calidad/fetch-metadata"))).toBe(true);
    expect(requested.some((u) => u.includes("search-wise"))).toBe(false);

    // Autocompletado a partir de la respuesta
    await expect(page.locator("#form-duration")).toHaveValue("03:20");
    await expect(page.locator("#form-date")).toHaveValue("2026-10-07");
    await expect(page.locator("#form-ticket-id")).toHaveValue("776655");
    // El audio pasa por el proxy real, no por la ruta inexistente stream-recording.
    expect(requested.some((u) => u.includes("/api/calidad/download-audio"))).toBe(true);

    // El error de búsqueda es accionable, no un error crudo de parser de JS.
    await page.unroute("**/api/calidad/**");
    await page.route("**/api/calidad/fetch-metadata**", (route) =>
      route.fulfill({ status: 404, contentType: "text/html", body: "<!DOCTYPE html><html>404</html>" }),
    );
    await page.locator("#form-call-id").fill("999999");
    await page.locator("#btn-fetch-wise-api").click();
    const alert = page.locator("#global-toast-container .alert").last();
    await expect(alert).toBeVisible();
    const alertText = (await alert.textContent()) ?? "";
    expect(alertText).not.toMatch(/Unexpected token|JSON|DOCTYPE/);
    expect(alertText).toMatch(/HTTP 404/);

    // Desaparece automáticamente después de un tiempo (auto-dismiss)
    await expect(alert).toBeHidden({ timeout: 7000 });
  });

  test("Mail Wise: el modo Reclamo/Novedad existe y pone la sección 2 en 100%", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);

    await page.locator('.channel-btn[data-channel="wise_email"]').click();

    // El selector de origen del ticket debe existir también en Mail Wise
    const modeJoin = page.locator("#email-ticket-mode-join");
    await expect(modeJoin).toBeVisible();
    const reclamoBtn = modeJoin.locator('button[data-mode="reclamo"]');
    await expect(reclamoBtn).toBeVisible();

    // Con un criterio en No cumple la sección 2 baja...
    // Un criterio de la sección 2 (registro en MDA), no de la sección 1.
    const mdaItem = page.locator("#wise-email-ticket-block .checklist-item").first();
    await expect(mdaItem).toBeVisible();
    await mdaItem.locator('.state-btn[data-state="nocumple"]').click();
    await expect(mdaItem.locator(".criteria-status-badge")).toHaveText("No cumple");
    await expect(page.locator("#preview-s2")).not.toHaveText("100%");

    // ...y volver a Reclamo la deja completa sin penalización.
    await reclamoBtn.click();
    await expect(page.locator("#preview-s2")).toHaveText("100%");
    await expect(page.locator("#wise-email-reclamo-card")).toBeVisible();
    await expect(page.locator("#form-is-reclamo-novedad")).toHaveValue("true");

    // La API que CalidadContent usa al reabrir una auditoría debe estar expuesta.
    expect(await page.evaluate(() => typeof (window as any).setAuditEmailTicketMode)).toBe("function");
    expect(await page.evaluate(() => typeof (window as any).setAuditTicketMode)).toBe("function");
  });

  test("Sticky: sin costura entre header y pestañas, y la columna derecha acompaña el scroll", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);
    await page.evaluate(() => document.querySelector("main")?.scrollTo(0, 700));
    await page.waitForTimeout(350);

    const geo = await page.evaluate(() => {
      const main = document.querySelector("main")?.getBoundingClientRect();
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
      };
      return {
        main,
        header: rect("#audit-top-header"),
        tabs: rect("#audit-section-tabs"),
        aside: rect("#audit-col-right"),
        scrollTop: document.querySelector("main")?.scrollTop,
      };
    });

    expect(geo.header).not.toBeNull();
    expect(geo.tabs).not.toBeNull();
    expect(geo.aside).not.toBeNull();
    // Sin hueco superior: el header pegajoso cubre el tope exacto del scroller al hacer scroll
    expect(Math.abs(geo.header!.top - geo.main!.top)).toBeLessThanOrEqual(1);
    // La columna derecha queda fijada debajo de la cabecera pegajosa
    expect(geo.aside!.top).toBeGreaterThanOrEqual(geo.header!.bottom - 1);
  });

  test("Clicks en audit-section-tabs: desplaza la sección sin desfasar la navbar ni provocar huecos en el layout", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);

    const navbar = page.locator(".navbar");
    await expect(navbar).toBeVisible();

    // Click en la pestaña de sección 2
    const tab2 = page.locator('#audit-section-tabs [data-section-tab="2"]');
    await tab2.click();
    await page.waitForTimeout(500);

    // 1. La navbar sigue visible y en el tope
    await expect(navbar).toBeVisible();
    const navbarBox = await navbar.boundingBox();
    expect(navbarBox?.y).toBe(0);

    // 2. Window y drawer-content no se desfasaron
    const scrollState = await page.evaluate(() => {
      const drawer = document.querySelector(".drawer-content");
      return {
        windowY: window.scrollY,
        drawerTop: drawer ? drawer.scrollTop : 0,
        mainTop: document.querySelector("main")?.scrollTop || 0,
      };
    });
    expect(scrollState.windowY).toBe(0);
    expect(scrollState.drawerTop).toBe(0);
    expect(scrollState.mainTop).toBeGreaterThan(0);
  });

  test("Flujo completo: Interacción con score, notas inline, modo Reclamo/Novedad y guardado de auditoría", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);

    // Completar datos de la atención
    await page.locator("#form-call-id").fill("998877");
    await page.locator("#form-ticket-id").fill("776655");
    await page.locator("#form-date").fill("2026-10-08");
    await page.locator("#form-duration").fill("03:20");

    // Verificar cálculo inicial 100%
    const previewTotal = page.locator("#preview-total");
    await expect(previewTotal).toHaveText("100%");

    // Marcar un criterio de la Sección 1 como "No cumple" desde su control de estado.
    // El checkbox oculto es solo el espejo para el backend: la acción real es el botón.
    const firstItem = page.locator("#channel-checklist-wise_call .checklist-item").first();
    await firstItem.locator('.state-btn[data-state="nocumple"]').click();

    // El badge del criterio debe pasar a "No cumple"
    await expect(firstItem.locator(".criteria-status-badge")).toHaveText("No cumple");
    await expect(firstItem).toHaveAttribute("data-criterion-state", "nocumple");

    // El checkbox espejo debe quedar sin marcar para que el backend no cuente el punto
    await expect(firstItem.locator(".audit-checkbox")).not.toBeChecked();

    // El score debe haber bajado
    await expect(previewTotal).not.toHaveText("100%");

    // Marcar "No cumple" es una evaluación válida: no debe pedir completar el criterio
    await expect(
      page.locator("#score-criteria-progress [data-progress-text]"),
    ).toContainText(/sin cumplir/i);

    // Un N/A no penaliza el score
    const totalBeforeNa = await previewTotal.textContent();
    const naItem = page.locator("#channel-checklist-wise_call .checklist-item").nth(1);
    await naItem.locator('.state-btn[data-state="na"]').click();
    await expect(naItem.locator(".criteria-status-badge")).toHaveText("N/A");
    await expect(previewTotal).toHaveText(totalBeforeNa!);

    // Abrir nota del criterio y escribir observación
    const noteBtn = page.locator("#channel-checklist-wise_call .checklist-item [data-action='toggle-obs']").first();
    await noteBtn.click();
    const noteTextarea = page.locator("#channel-checklist-wise_call .checklist-item .criteria-obs-wrapper textarea").first();
    await expect(noteTextarea).toBeVisible();
    await noteTextarea.fill("Falta saludo estándar al iniciar la llamada");

    // Probar modo Reclamo / Novedad en Sección 2
    const reclamoBtn = page.locator("#ticket-mode-join button[data-mode='reclamo']");
    await reclamoBtn.click();
    await expect(page.locator("#wise-call-reclamo-card")).toBeVisible();

    // Agregar notas generales
    await page.locator("#form-notes").fill("Auditoría de prueba pantalla completa exitosa.");

    // Guardar auditoría con el botón principal del header
    await page.locator("#btn-header-save").click();

    // Redirección exitosa a /supervision/calidad-operadores
    await expect(page).toHaveURL(new RegExp("/supervision/calidad-operadores"));

    // Verificar en la base de datos que la auditoría fue creada
    const createdAudits = await db
      .select()
      .from(qualityAudits)
      .where(eq(qualityAudits.agentId, operatorAgentId!));
    expect(createdAudits.length).toBeGreaterThan(0);
    const lastAudit = createdAudits[0];
    expect(lastAudit.callId).toBe("998877");
    expect(lastAudit.ticketId).toBe("776655");
    expect(lastAudit.isReclamoNovedad).toBe(true);
  });

  test("Detalle técnico crudo: los inspectores InvGate y Wise CX permanecen deshabilitados", async ({
    page,
    context,
  }) => {
    /*
     * El detalle técnico crudo (fetch-metadata?raw=1) está en pausa por decisión de
     * producto. Este test fija ese estado: ambos botones arrancan y quedan
     * deshabilitados, y cargar el caso NO los habilita. Si alguna vez se decide
     * rehabilitarlos, este test es el que hay que cambiar, junto con los comentarios
     * en NewAuditForm.astro que explican cómo hacerlo.
     */
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?agentId=${operatorAgentId}`);

    const btnInspectInvgate = page.locator("#btn-inspect-invgate-detail");
    const btnInspectWise = page.locator("#btn-inspect-wise-detail");

    // 1. Arrancan deshabilitados
    for (const btn of [btnInspectInvgate, btnInspectWise]) {
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveClass(/pointer-events-none/);
      await expect(btn).toHaveClass(/opacity-40/);
    }

    // Mock de metadatos: responde bien para que la carga de datos tenga éxito
    await page.route("**/api/calidad/fetch-metadata*", async (route) => {
      const url = new URL(route.request().url());
      const source = url.searchParams.get("source") || "";

      if (source.startsWith("invgate")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              caseNumber: "776655",
              title: "Consulta sobre clave de red",
              category: "Soporte TI",
              status: "Cerrado",
              priority: "Media",
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              caseNumber: "998877",
              duration: "02:15",
              ringTime: "00:05",
              recordingUrl: "https://wise.example.com/audio/998877.mp3",
            },
          }),
        });
      }
    });

    // 2. Ticket InvGate cargado correctamente: el visor se puebla, el inspector no se habilita
    await page.locator("#form-ticket-id").fill("776655");
    await page.locator("#btn-fetch-invgate-api").click();
    await expect(page.locator("#ticket-context-badge")).toHaveText("Ticket cargado");
    await expect(page.locator("#tv-title")).not.toHaveText("-");
    await expect(btnInspectInvgate).toBeDisabled();

    // 3. Llamada Wise CX cargada: el audio se monta, el inspector tampoco se habilita
    await page.locator("#form-call-id").fill("998877");
    await page.locator("#btn-fetch-wise-api").click();
    await expect(page.locator("#tv-audio-container")).toBeVisible();
    await expect(page.locator("#form-duration")).toHaveValue("02:15");
    await expect(btnInspectWise).toBeDisabled();

    // 4. Ninguno de los dos puede abrir el modal de detalle técnico
    const modal = page.locator("#modal-case-detail");
    await expect(modal).toBeHidden();
    await expect(btnInspectInvgate).toHaveAttribute("disabled", "");
    await expect(btnInspectWise).toHaveAttribute("disabled", "");
  });
});
