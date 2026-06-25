import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, feedback, auditLogs } from "../../src/db/schema";
import { eq, desc } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

interface TestUser {
  id: number;
  username: string;
  role: string;
  rawSessionId: string;
  signedSessionId: string;
}

let adminUser: TestUser;
let agentUser: TestUser;

test.beforeAll(async () => {
  // 1. Crear usuario Administrador de prueba
  const adminUsername = `admin_feedback_test_${Date.now()}`;
  const adminSessionId = `session-admin-${Date.now()}`;
  const signedAdminSession = signSessionId(adminSessionId);

  const [newAdmin] = await db.insert(users).values({
    username: adminUsername,
    password: "hashed_fake_password",
    role: "admin",
  }).returning({ id: users.id });

  await db.insert(sessions).values({
    id: adminSessionId,
    userId: newAdmin.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  adminUser = {
    id: newAdmin.id,
    username: adminUsername,
    role: "admin",
    rawSessionId: adminSessionId,
    signedSessionId: signedAdminSession,
  };

  // 2. Crear usuario Agente de prueba
  const agentUsername = `agent_feedback_test_${Date.now()}`;
  const agentSessionId = `session-agent-${Date.now()}`;
  const signedAgentSession = signSessionId(agentSessionId);

  const [newAgent] = await db.insert(users).values({
    username: agentUsername,
    password: "hashed_fake_password",
    role: "agent",
  }).returning({ id: users.id });

  await db.insert(sessions).values({
    id: agentSessionId,
    userId: newAgent.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  agentUser = {
    id: newAgent.id,
    username: agentUsername,
    role: "agent",
    rawSessionId: agentSessionId,
    signedSessionId: signedAgentSession,
  };
});

test.afterAll(async () => {
  // Limpiar base de datos
  await db.delete(feedback).where(eq(feedback.userId, agentUser.id));
  await db.delete(feedback).where(eq(feedback.userId, adminUser.id));
  await db.delete(sessions).where(eq(sessions.id, adminUser.rawSessionId));
  await db.delete(sessions).where(eq(sessions.id, agentUser.rawSessionId));
  await db.delete(users).where(eq(users.id, adminUser.id));
  await db.delete(users).where(eq(users.id, agentUser.id));
});

test.describe("Feedback and Bug Reporting System", () => {
  test("Agent should be able to submit a suggestion and an admin should be able to view and manage it", async ({ page, context }) => {
    // 1. Iniciar sesión como Agente
    await context.addCookies([{
      name: "session_id",
      value: agentUser.signedSessionId,
      domain: "localhost",
      path: "/",
    }]);

    // 2. Cargar página principal
    await page.goto("/");
    
    // 3. Abrir el modal de feedback
    const openModalBtn = page.locator("[data-open-feedback-modal]").first();
    await expect(openModalBtn).toBeVisible();
    await openModalBtn.click();

    const modal = page.locator("#feedback_modal");
    await expect(modal).toBeVisible();

    // 4. Rellenar formulario de sugerencia
    await page.fill("#sug-asunto", "Sugerencia E2E de prueba");
    await page.selectOption("#sug-categoria", "oficinas");
    await page.fill("#sug-mensaje", "Propuesta de mejora para buscador de oficinas E2E.");

    // 5. Enviar el formulario
    const submitBtn = page.locator('#suggestion-form button[type="submit"]');
    await submitBtn.click();

    // 6. Verificar toast de éxito y que el modal se cierre
    const toast = page.locator("#global-toast-container");
    await expect(toast).toContainText("Sugerencia enviada correctamente");
    await expect(modal).not.toBeVisible();

    // 7. Cambiar sesión a Administrador
    await context.clearCookies();
    await context.addCookies([{
      name: "session_id",
      value: adminUser.signedSessionId,
      domain: "localhost",
      path: "/",
    }]);

    // 8. Ir a la página de feedback del admin
    await page.goto("/admin/feedback");
    await expect(page.locator("main h1")).toContainText("Sugerencias y Reportes");

    // 9. Verificar que aparezca la sugerencia enviada por el agente
    const firstRow = page.locator("[data-table-row]").first();
    await expect(firstRow).toContainText("Sugerencia E2E de prueba");
    await expect(firstRow).toContainText(agentUser.username);

    // 10. Abrir detalles y verificar contenido
    const detailsBtn = firstRow.locator('[data-action="view-details"]');
    await detailsBtn.click();

    const detailsModal = page.locator("#modal-details");
    await expect(detailsModal).toBeVisible();
    await expect(page.locator("#detail-subject")).toContainText("Sugerencia E2E de prueba");
    await expect(page.locator("#detail-description")).toContainText("Propuesta de mejora para buscador de oficinas E2E.");

    // 11. Cambiar estado a "En Revisión"
    const statusBtn = page.locator('[data-status-btn="en_revision"]');
    await statusBtn.click();
    
    // 12. Verificar actualización
    await expect(toast).toContainText("Estado actualizado con éxito");
    await expect(detailsModal).not.toBeVisible();

    // Verificar que el estado cambió en la tabla
    const updatedStatusBadge = page.locator("[data-table-row]").first().locator(".badge").nth(1);
    await expect(updatedStatusBadge).toContainText("En Revisión");
  });
});
