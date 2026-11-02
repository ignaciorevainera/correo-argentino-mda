import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../src/db/index';
import { users, sessions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
} from '../helpers/auth';
import { generateCsrfToken } from '../../src/lib/csrf';
import { hashPassword } from '../../src/lib/security';

const CURRENT_PASSWORD = 'ClaveActual123';

let testUser: {
  userId: number;
  sessionId: string;
  signedSessionId: string;
  username: string;
};
let cachedHash: string;

test.beforeAll(async () => {
  testUser = await createTestUserAndSession('agent');
  cachedHash = await hashPassword(CURRENT_PASSWORD);
  await db
    .update(users)
    .set({ password: cachedHash })
    .where(eq(users.id, testUser.userId));
});

test.afterAll(async () => {
  if (testUser) {
    await db.delete(sessions).where(eq(sessions.userId, testUser.userId));
    await cleanupTestUser(testUser.userId, testUser.sessionId);
  }
});

async function getPasswordHash(userId: number): Promise<string> {
  const [row] = await db
    .select({ password: users.password })
    .from(users)
    .where(eq(users.id, userId));
  return row?.password ?? '';
}

test.describe('Self Password Change', () => {
  test.beforeEach(async ({ context }) => {
    // El cambio exitoso revoca todas las sesiones, incluida la de este test:
    // se recrea la fila para que cada caso arranque autenticado.
    await db.delete(sessions).where(eq(sessions.id, testUser.sessionId));
    await db.insert(sessions).values({
      id: testUser.sessionId,
      userId: testUser.userId,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24,
    });
    await setSessionCookie(context, testUser.signedSessionId);
    await db
      .update(users)
      .set({ password: cachedHash })
      .where(eq(users.id, testUser.userId));
  });

  test('muestra el boton blanque en el perfil', async ({ page }) => {
    await page.goto('/profile');
    await expect(
      page.locator('main').getByRole('button', { name: /blanqueo de contrase[ñn]a/i }),
    ).toBeVisible();
  });

  test('abre el modal al hacer clic en blanque', async ({ page }) => {
    await page.goto('/profile');
    await page
      .locator('main')
      .getByRole('button', { name: /blanqueo de contrase[ñn]a/i })
      .click();
    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Blanquear contraseña');
    await expect(dialog).toContainText('Último cambio');
  });

  test('cambia la contraseña con datos validos en UI y cierra la sesión', async ({ page }) => {
    await page.goto('/profile');
    await page
      .locator('main')
      .getByRole('button', { name: /blanqueo de contrase[ñn]a/i })
      .click();

    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();

    const currentInput = dialog.locator('#self-current-password');
    await expect(currentInput).toBeVisible();

    const hashBefore = await getPasswordHash(testUser.userId);

    await currentInput.fill(CURRENT_PASSWORD);
    const newPassword = 'NuevaClave123';
    await dialog.locator('#self-new-password').fill(newPassword);
    await dialog.locator('#self-new-password-repeat').fill(newPassword);
    await dialog.getByRole('button', { name: /guardar/i }).click();

    await page.waitForURL(/\/login/);
    await expect(page.locator('#global-toast-container')).toContainText(
      'Contraseña actualizada'
    );

    const hashAfter = await getPasswordHash(testUser.userId);
    expect(hashAfter).not.toBe(hashBefore);
    expect(hashAfter.startsWith('$2')).toBeTruthy();
  });

  test('bloquea contraseña debil con error inline sin tocar la BD', async ({ page }) => {
    const hashBefore = await getPasswordHash(testUser.userId);

    await page.goto('/profile');
    await page
      .locator('main')
      .getByRole('button', { name: /blanqueo de contrase[ñn]a/i })
      .click();

    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();

    await dialog.locator('#self-current-password').fill(CURRENT_PASSWORD);
    await dialog.locator('#self-new-password').fill('abc');
    await dialog.locator('#self-new-password-repeat').fill('abc');
    await dialog.getByRole('button', { name: /guardar/i }).click();

    const inlineError = dialog.locator('.pwd-error');
    await expect(inlineError).toBeVisible();
    await expect(inlineError).toContainText('al menos 8 caracteres');

    await expect(page.locator('#global-toast-container')).not.toContainText(
      'exitosamente'
    );
    expect(await getPasswordHash(testUser.userId)).toBe(hashBefore);
  });

  test('bloquea contraseñas que no coinciden', async ({ page }) => {
    await page.goto('/profile');
    await page
      .locator('main')
      .getByRole('button', { name: /blanqueo de contrase[ñn]a/i })
      .click();

    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();

    await dialog.locator('#self-current-password').fill(CURRENT_PASSWORD);
    await dialog.locator('#self-new-password').fill('ClaveValida123');
    await dialog.locator('#self-new-password-repeat').fill('OtraClave456');
    await dialog.getByRole('button', { name: /guardar/i }).click();

    const inlineError = dialog.locator('.pwd-error');
    await expect(inlineError).toBeVisible();
    await expect(inlineError).toContainText('no coinciden');
  });

  test('rechaza POST no autenticado al endpoint con 401', async ({ request }) => {
    const response = await request.post('/api/profile/change-password', {
      multipart: {
        newPassword: 'NoImporta123',
      },
    });

    expect(response.status()).toBe(401);
    const json = await response.json();
    expect(json.error).toBeTruthy();
  });

  test('rechaza cuando falta token CSRF con 403', async ({ context }) => {
    const res = await context.request.post('/api/profile/change-password', {
      multipart: {
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'NuevaClave123',
      },
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Token CSRF inválido o ausente');
  });

  test('rechaza cuando el token CSRF es invalido con 403', async ({ context }) => {
    const res = await context.request.post('/api/profile/change-password', {
      headers: {
        'X-CSRF-Token': 'invalido',
      },
      multipart: {
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'NuevaClave123',
      },
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Token CSRF inválido o ausente');
  });

  test('acepta token CSRF enviado via multipart formData sin header X-CSRF-Token', async ({ context }) => {
    const csrfToken = generateCsrfToken(testUser.sessionId);
    const res = await context.request.post('/api/profile/change-password', {
      multipart: {
        csrf_token: csrfToken,
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'NuevaClaveValida999',
      },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const newHash = await getPasswordHash(testUser.userId);
    expect(await bcrypt.compare('NuevaClaveValida999', newHash)).toBe(true);
  });

  test('rechaza cuando falta la contraseña actual con 400', async ({ context }) => {
    const csrfToken = generateCsrfToken(testUser.sessionId);
    const res = await context.request.post('/api/profile/change-password', {
      headers: {
        'X-CSRF-Token': csrfToken,
      },
      multipart: {
        newPassword: 'NuevaClave123',
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('La contraseña actual es requerida');
  });

  test('rechaza cuando la contraseña actual es incorrecta con 400', async ({ context }) => {
    const csrfToken = generateCsrfToken(testUser.sessionId);
    const res = await context.request.post('/api/profile/change-password', {
      headers: {
        'X-CSRF-Token': csrfToken,
      },
      multipart: {
        currentPassword: 'ClaveIncorrecta999',
        newPassword: 'NuevaClave123',
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('La contraseña actual es incorrecta');
  });

  test('rechaza cuando la nueva contraseña es debil o invalida con 400', async ({ context }) => {
    const csrfToken = generateCsrfToken(testUser.sessionId);
    const res = await context.request.post('/api/profile/change-password', {
      headers: {
        'X-CSRF-Token': csrfToken,
      },
      multipart: {
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'corta',
      },
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('al menos 8 caracteres');
  });

  test('actualiza el hash y revoca todas las sesiones con datos validos', async ({ context }) => {
    const secondarySessionId = `session_secondary_${randomUUID()}`;
    await db.insert(sessions).values({
      id: secondarySessionId,
      userId: testUser.userId,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24,
    });

    const csrfToken = generateCsrfToken(testUser.sessionId);
    const res = await context.request.post('/api/profile/change-password', {
      headers: {
        'X-CSRF-Token': csrfToken,
      },
      multipart: {
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'NuevaClave456',
      },
    });

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const remainingSecondary = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, secondarySessionId));
    expect(remainingSecondary).toHaveLength(0);

    const currentSession = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, testUser.sessionId));
    expect(currentSession).toHaveLength(0);

    const newHash = await getPasswordHash(testUser.userId);
    expect(await bcrypt.compare('NuevaClave456', newHash)).toBe(true);

    await db
      .update(users)
      .set({ password: cachedHash })
      .where(eq(users.id, testUser.userId));
  });
});
