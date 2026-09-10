import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { db } from '../../src/db/index';
import { users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
} from '../helpers/auth';

let testUser: {
  userId: number;
  sessionId: string;
  signedSessionId: string;
  username: string;
};

test.beforeAll(async () => {
  testUser = await createTestUserAndSession('agent');
});

test.afterAll(async () => {
  if (testUser) {
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
    await setSessionCookie(context, testUser.signedSessionId);
  });

  test('muestra el boton blanque en el perfil', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('button', { name: /blanque/i })).toBeVisible();
  });

  test('abre el modal al hacer clic en blanque', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: /blanque/i }).click();
    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Blanquear contraseña');
  });

  test('cambia la contraseña con datos validos y muestra toast de exito', async ({ page }) => {
    const hashBefore = await getPasswordHash(testUser.userId);

    await page.goto('/profile');
    await page.getByRole('button', { name: /blanque/i }).click();

    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();

    const newPassword = 'NuevaClave123';
    await dialog.locator('#self-new-password').fill(newPassword);
    await dialog.locator('#self-new-password-repeat').fill(newPassword);
    await dialog.getByRole('button', { name: /guardar/i }).click();

    await expect(page.locator('#global-toast-container')).toContainText(
      'Contraseña actualizada exitosamente'
    );

    // El modal se cierra tras el exito (evento async-form:success)
    await expect(dialog).not.toBeVisible();

    // El hash en DB cambio y parece bcrypt
    const hashAfter = await getPasswordHash(testUser.userId);
    expect(hashAfter).not.toBe(hashBefore);
    expect(hashAfter.startsWith('$2')).toBeTruthy();
  });

  test('bloquea contraseña debil con error inline sin tocar la BD', async ({ page }) => {
    const hashBefore = await getPasswordHash(testUser.userId);

    await page.goto('/profile');
    await page.getByRole('button', { name: /blanque/i }).click();

    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();

    // Solo 3 caracteres: falla largo, mayuscula y numero
    await dialog.locator('#self-new-password').fill('abc');
    await dialog.locator('#self-new-password-repeat').fill('abc');
    await dialog.getByRole('button', { name: /guardar/i }).click();

    // PasswordField valida client-side y muestra alerta inline
    const inlineError = dialog.locator('.pwd-error');
    await expect(inlineError).toBeVisible();
    await expect(inlineError).toContainText('al menos 8 caracteres');

    // No hay toast de exito y el hash no cambio
    await expect(page.locator('#global-toast-container')).not.toContainText(
      'exitosamente'
    );
    expect(await getPasswordHash(testUser.userId)).toBe(hashBefore);
  });

  test('bloquea contraseñas que no coinciden', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: /blanque/i }).click();

    const dialog = page.locator('#modal-self-password');
    await expect(dialog).toBeVisible();

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
});
