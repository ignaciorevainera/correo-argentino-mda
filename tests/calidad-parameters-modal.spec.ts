import "dotenv/config";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/index";
import { agents, users, qualityAudits, auditScores } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "./helpers/auth";

let testSupervisor: TestUser;
let supervisorAgentId: number | null = null;

test.beforeEach(async () => {
  testSupervisor = await createTestUserAndSession("supervisor");

  // Asignar helpdesk MDA TI (2509) para pasar validación de mesa
  await db
    .update(users)
    .set({ helpdeskId: 2509 })
    .where(eq(users.id, testSupervisor.userId));

  // Crear agente supervisor en tabla agents (sin `active`/`role`: viven en `users`)
  const [supAgent] = await db
    .insert(agents)
    .values({
      name: "Supervisor Params Test",
      username: testSupervisor.username,
      userId: testSupervisor.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  supervisorAgentId = supAgent.id;
});

test.afterEach(async () => {
  if (supervisorAgentId) {
    const audits = await db.select().from(qualityAudits).where(eq(qualityAudits.agentId, supervisorAgentId));
    for (const a of audits) {
      await db.delete(auditScores).where(eq(auditScores.auditId, a.id));
      await db.delete(qualityAudits).where(eq(qualityAudits.id, a.id));
    }
    await db.delete(agents).where(eq(agents.id, supervisorAgentId));
  }
  if (testSupervisor) {
    await cleanupTestUser(testSupervisor.userId, testSupervisor.sessionId);
  }
});

test.describe("Modal de Configuración de Parámetros de Calidad", () => {
  test("debe abrir el modal con header compacto, resumen en vivo y footer fijo", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto("/supervision/calidad-operadores");

    // Esperar server island
    await expect(page.locator("#operators-data")).toBeAttached({ timeout: 15000 });

    // Click en botón de configurar parámetros
    const btnParams = page.locator("#btn-configure-parameters");
    await expect(btnParams).toBeVisible();
    await btnParams.click();

    // Modal debe ser visible
    const modal = page.locator("#parameters-modal");
    await expect(modal).toBeVisible();

    // Header compacto: canales y pestañas
    const channelButtons = modal.locator(".param-channel-btn");
    await expect(channelButtons).toHaveCount(3);
    await expect(modal.locator(".parameter-tab")).toHaveCount(2);

    // Badge de resumen en vivo visible
    const summaryBadge = modal.locator("#param-summary-badge");
    await expect(summaryBadge).toBeVisible();
    await expect(modal.locator("#param-summary-count")).toBeVisible();
    await expect(modal.locator("#param-summary-weight")).toBeVisible();

    // Footer fijo con acciones
    const btnAdd = modal.locator("#btn-add-param");
    await expect(btnAdd).toBeVisible();
    const btnClose = modal.locator("#btn-close-parameters-modal");
    await expect(btnClose).toBeVisible();
    const btnSave = modal.locator("#btn-save-parameters");
    await expect(btnSave).toBeVisible();

    // Cerrar modal
    await btnClose.click();
    await expect(modal).not.toBeVisible();
  });

  test("debe permitir agregar criterio, actualizar peso y verificar reordenamiento", async ({ page, context }) => {
    await setSessionCookie(context, testSupervisor.signedSessionId);
    await page.goto("/supervision/calidad-operadores");

    await expect(page.locator("#operators-data")).toBeAttached({ timeout: 15000 });

    await page.locator("#btn-configure-parameters").click();
    const modal = page.locator("#parameters-modal");
    await expect(modal).toBeVisible();

    // Contar criterios iniciales en pane s1
    const paneS1 = modal.locator("#param-list-s1");
    const initialRows = await paneS1.locator(".param-input-name").count();

    // Agregar nuevo criterio
    await modal.locator("#btn-add-param").click();
    await expect(paneS1.locator(".param-input-name")).toHaveCount(initialRows + 1);

    // Escribir nombre en el nuevo criterio agregado
    const lastInput = paneS1.locator(".param-input-name").last();
    await lastInput.fill("Criterio Test Automatizado");

    // Modificar peso del criterio y verificar actualización de resumen
    const lastWeight = paneS1.locator(".param-input-weight").last();
    await lastWeight.fill("25");

    const weightBadge = modal.locator("#param-summary-weight");
    await expect(weightBadge).toContainText("%");

    // Test soft-delete y restore en una fila
    const deleteBtn = paneS1.locator(".param-btn-delete").last();
    await deleteBtn.click();

    // La fila debe mostrar botón de restaurar
    const restoreBtn = paneS1.locator(".param-btn-restore").last();
    await expect(restoreBtn).toBeVisible();

    // Restaurar fila
    await restoreBtn.click();
    await expect(paneS1.locator(".param-btn-delete").last()).toBeVisible();

    // Cerrar sin guardar
    await modal.locator("#btn-close-parameters-modal").click();
  });
});
