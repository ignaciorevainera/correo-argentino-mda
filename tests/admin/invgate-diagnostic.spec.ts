import 'dotenv/config';
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

let adminUser: TestUser;

test.beforeAll(async () => {
  const role = 'admin';
  const username = `admin_diag_test_${Date.now()}`;
  const rawSessionId = `test-admin-diag-session-${Date.now()}`;
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

  adminUser = {
    id: newUser.id,
    username,
    role,
    rawSessionId,
    signedSessionId,
  };
});

test.afterAll(async () => {
  if (adminUser) {
    await db.delete(sessions).where(eq(sessions.id, adminUser.rawSessionId));
    await db.delete(users).where(eq(users.id, adminUser.id));
  }
});

test.describe('Diagnóstico de InvGate - No Autenticado', () => {
  test('debe retornar 401 al acceder al endpoint de estado sin sesión', async ({ request }) => {
    const response = await request.get('/api/admin/invgate-status');
    expect(response.status()).toBe(401);
  });
});

test.describe('Diagnóstico de InvGate - Autenticado Admin', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{
      name: 'session_id',
      value: adminUser.signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);
  });

  test('debe retornar JSON con estado de conexión', async ({ request }) => {
    const response = await request.get('/api/admin/invgate-status', {
      headers: {
        'Cookie': `session_id=${adminUser.signedSessionId}`
      }
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('ok');
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('message');
  });

  test('debe renderizar la card de diagnóstico en la UI del panel admin', async ({ page }) => {
    await page.goto('/admin');
    const card = page.locator('#sync-dashboard');
    await expect(card).toBeVisible();
    
    const invgateTitle = page.locator('text=Integración InvGate');
    await expect(invgateTitle).toBeVisible();

    const refreshButton = page.locator('#invgate-refresh-btn');
    await expect(refreshButton).toBeVisible();
  });
});
