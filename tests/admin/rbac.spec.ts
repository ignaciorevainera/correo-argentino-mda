import { test, expect } from '@playwright/test';
import { db } from '../../src/db/index';
import { users, sessions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';

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

const testUsers: Record<string, TestUser> = {};

test.beforeAll(async () => {
  const roles = ['agent', 'referent', 'team_leader', 'supervisor', 'admin'];
  for (const role of roles) {
    const username = `${role}_test_e2e_${Date.now()}`;
    const rawSessionId = `test-${role}-session-${Date.now()}`;
    const signedSessionId = signSessionId(rawSessionId);

    const [newUser] = await db.insert(users).values({
      username,
      password: 'hashed_fake_password',
      role,
    }).returning({ id: users.id });

    await db.insert(sessions).values({
      id: rawSessionId,
      userId: newUser.id,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24,
    });

    testUsers[role] = {
      id: newUser.id,
      username,
      role,
      rawSessionId,
      signedSessionId,
    };
  }
});

test.afterAll(async () => {
  for (const role of Object.keys(testUsers)) {
    const user = testUsers[role];
    await db.delete(sessions).where(eq(sessions.id, user.rawSessionId));
    await db.delete(users).where(eq(users.id, user.id));
  }
});

test.describe('Controles de Acceso (RBAC) - Agente', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: 'session_id',
      value: testUsers['agent'].signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);
  });

  test('Agente no deberia poder acceder a /supervision/asignacion-autogestiones', async ({ page }) => {
    await page.goto('/supervision/asignacion-autogestiones');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Agente no deberia poder acceder a /supervision/calidad-operadores', async ({ page }) => {
    await page.goto('/supervision/calidad-operadores');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Agente no deberia poder acceder a /supervision/asistencia', async ({ page }) => {
    await page.goto('/supervision/asistencia');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Agente no deberia poder acceder a /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });
});

test.describe('Controles de Acceso (RBAC) - Referente', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: 'session_id',
      value: testUsers['referent'].signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);
  });

  test('Referente deberia poder acceder a /supervision/asignacion-autogestiones', async ({ page }) => {
    await page.goto('/supervision/asignacion-autogestiones');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });

  test('Referente no deberia poder acceder a /supervision/cronograma', async ({ page }) => {
    await page.goto('/supervision/cronograma');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Referente no deberia poder acceder a /supervision/asistencia', async ({ page }) => {
    await page.goto('/supervision/asistencia');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });
});

test.describe('Controles de Acceso (RBAC) - Supervisor', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: 'session_id',
      value: testUsers['supervisor'].signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);
  });

  test('Supervisor no deberia poder acceder a /admin/usuarios', async ({ page }) => {
    await page.goto('/admin/usuarios');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Supervisor no deberia poder acceder a /admin/Usuarios', async ({ page }) => {
    await page.goto('/admin/Usuarios');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Supervisor no deberia poder acceder a /admin/auditoria', async ({ page }) => {
    await page.goto('/admin/auditoria');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Supervisor deberia poder acceder a /supervision/cronograma', async ({ page }) => {
    await page.goto('/supervision/cronograma');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });

  test('Supervisor deberia poder acceder a /supervision/asistencia', async ({ page }) => {
    await page.goto('/supervision/asistencia');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });
});

test.describe('Controles de Acceso (RBAC) - Team Leader', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: 'session_id',
      value: testUsers['team_leader'].signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);
  });

  test('Team Leader no deberia poder acceder a /admin/usuarios', async ({ page }) => {
    await page.goto('/admin/usuarios');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Team Leader no deberia poder acceder a /admin/auditoria', async ({ page }) => {
    await page.goto('/admin/auditoria');
    await expect(page).toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).toContainText('Acceso no autorizado');
  });

  test('Team Leader deberia poder acceder a /supervision/cronograma', async ({ page }) => {
    await page.goto('/supervision/cronograma');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });

  test('Team Leader deberia poder acceder a /supervision/asistencia', async ({ page }) => {
    await page.goto('/supervision/asistencia');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });

  test('Team Leader deberia poder acceder a /supervision/asignacion-autogestiones', async ({ page }) => {
    await page.goto('/supervision/asignacion-autogestiones');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });
});

test.describe('Controles de Acceso (RBAC) - Administrador', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: 'session_id',
      value: testUsers['admin'].signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);
  });

  test('Administrador deberia poder acceder a /admin/auditoria', async ({ page }) => {
    await page.goto('/admin/auditoria');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });

  test('Administrador deberia poder acceder a /supervision/asistencia', async ({ page }) => {
    await page.goto('/supervision/asistencia');
    await expect(page).not.toHaveURL('http://localhost:4321/');
    await expect(page.locator('#global-toast-container')).not.toContainText('Acceso no autorizado');
  });
});
