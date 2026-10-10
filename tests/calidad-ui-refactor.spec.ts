import "dotenv/config";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/index";
import { agents, users, qualityAudits, auditScores } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "./helpers/auth";

let testSupervisor: TestUser;
let testAgentUser: TestUser;
let supervisorAgentId: number | null = null;
let operatorAgentId: number | null = null;

test.beforeEach(async () => {
  testSupervisor = await createTestUserAndSession("supervisor");
  testAgentUser = await createTestUserAndSession("agent");

  // Asignar helpdesk MDA TI (2509) para pasar validación de mesa
  await db
    .update(users)
    .set({ helpdeskId: 2509 })
    .where(eq(users.id, testSupervisor.userId));
  await db
    .update(users)
    .set({ helpdeskId: 2509 })
    .where(eq(users.id, testAgentUser.userId));

  // Create operator agent for testing. `agents` has no `active`/`role` columns:
  // activity lives in `users.active` and the role in `users.role`.
  const [opAgent] = await db
    .insert(agents)
    .values({
      name: "Operador UI Refactor",
      username: testAgentUser.username,
      userId: testAgentUser.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  operatorAgentId = opAgent.id;

  // Create another agent for supervisor
  const [supAgent] = await db
    .insert(agents)
    .values({
      name: "Supervisor Test UI",
      username: testSupervisor.username,
      userId: testSupervisor.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  supervisorAgentId = supAgent.id;
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
  if (testAgentUser) {
    await cleanupTestUser(testAgentUser.userId, testAgentUser.sessionId);
  }
});

test.describe("Calidad UI Refactor - Supervisor & Agent Flows", () => {
  test("Supervisor: Barra superior, grilla interactiva, modal de detalle y navegación a nueva auditoría", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto("/supervision/calidad-operadores");

    // Wait for server island content to stream in
    await expect(page.locator("#operators-data")).toBeAttached({ timeout: 15000 });

    // 1. Barra superior unificada
    const searchInput = page.locator("#operator-search");
    await expect(searchInput).toBeVisible();

    const monthSelector = page.locator("#month-selector");
    await expect(monthSelector).toBeVisible();

    const paramsBtn = page.locator("#btn-configure-parameters");
    await expect(paramsBtn).toBeVisible();

    const topNewAuditBtn = page.locator("#btn-top-new-audit");
    await expect(topNewAuditBtn).toBeVisible();

    // 2. Grilla de operadores
    const grid = page.locator("#operators-grid");
    await expect(grid).toBeVisible();

    const operatorCard = page.locator(`.operator-card[data-operator-id="${operatorAgentId}"]`);
    await expect(operatorCard).toBeVisible();
    await expect(operatorCard).toContainText("Operador UI Refactor");

    // 3. Filtrado en tiempo real en la grilla
    await searchInput.fill("Refactor");
    await expect(operatorCard).toBeVisible();

    await searchInput.fill("InexistenteXYZ12345");
    await expect(operatorCard).toBeHidden();
    await expect(page.locator("#calidad-empty-state")).toBeVisible();

    await searchInput.clear();
    await expect(operatorCard).toBeVisible();

    // 4. Clic en operador abre modal de detalle
    await operatorCard.click();
    const detailsModal = page.locator("#operator-details-modal");
    await expect(detailsModal).toBeVisible();

    const detailName = detailsModal.locator("#detail-name");
    await expect(detailName).toContainText("Operador UI Refactor");
    await expect(detailsModal.locator("#operator-channel-tabs")).toBeVisible();

    // 5. Clic en "Nueva Auditoría" dentro del modal redirige a sección /nueva preseleccionando el operador
    const modalNewAuditBtn = detailsModal.locator("#btn-new-audit");
    await expect(modalNewAuditBtn).toBeVisible();
    await modalNewAuditBtn.click();

    await expect(page).toHaveURL(new RegExp(`/supervision/calidad-operadores/nueva.*agentId=${operatorAgentId}`));
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría/i);

    // Verificar que el operador está preseleccionado en el formulario
    const agentSelect = page.locator("#form-agent-id");
    await expect(agentSelect).toBeVisible();
    await expect(agentSelect).toHaveValue(String(operatorAgentId));
  });

  test("Supervisor: Navegación desde barra superior a nueva auditoría", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto("/supervision/calidad-operadores");

    await expect(page.locator("#operators-data")).toBeAttached({ timeout: 15000 });

    const topNewAuditBtn = page.locator("#btn-top-new-audit");
    await expect(topNewAuditBtn).toBeVisible();
    await topNewAuditBtn.click();

    await expect(page).toHaveURL(new RegExp("/supervision/calidad-operadores/nueva"));
    await expect(page.locator("h1")).toContainText(/Nueva Auditoría/i);
    await expect(page.locator("button[type='submit']:has-text('Guardar')")).toBeVisible();
  });

  test("Agent: Vista directa en pantalla completa sin modal ni grilla", async ({ page, context }) => {
    await setSessionCookie(context, testAgentUser.signedSessionId);
    await page.goto("/supervision/calidad-operadores");

    await expect(page.locator("#operators-data")).toBeAttached({ timeout: 15000 });

    // No debe mostrar la grilla ni el modal
    await expect(page.locator("#operators-grid")).toBeHidden();
    await expect(page.locator("#operator-details-modal")).toBeHidden();

    // Debe mostrar directamente el panel de detalles con su información
    const panel = page.locator("#operator-details-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("#detail-name")).toContainText("Operador UI Refactor");

    // Botones de supervisor deben estar ocultos para agente
    await expect(page.locator("#btn-new-audit")).toBeHidden();
    await expect(page.locator("#btn-top-new-audit")).toBeHidden();
    await expect(page.locator("#btn-configure-parameters")).toBeHidden();
  });
});
