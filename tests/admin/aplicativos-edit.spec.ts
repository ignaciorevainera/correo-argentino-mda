import { test, expect } from '@playwright/test';
import { db } from '../../src/db/index';
import { users, sessions, applications, applicationCategories } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

let MOCK_SESSION_ID = `test-admin-session-${Date.now()}`;
let testUserId: number;
let testCategoryId: string = `cat-test-${Date.now()}`;
let testAppId: number;

test.beforeAll(async () => {
  // 1. Create a fake admin user
  const [newUser] = await db.insert(users).values({
    username: `admin_test_e2e_${Date.now()}`,
    password: 'hashed_fake_password',
    role: 'admin',
  }).returning({ id: users.id });
  testUserId = newUser.id;

  // 2. Create a fake session
  await db.insert(sessions).values({
    id: MOCK_SESSION_ID,
    userId: testUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 1 day
  });

  // 3. Create a mock category
  await db.insert(applicationCategories).values({
    id: testCategoryId,
    title: 'Categoría de Prueba E2E',
  }).onConflictDoNothing();

  // 4. Create a mock application
  const [newApp] = await db.insert(applications).values({
    title: 'App Prueba E2E',
    categoryId: testCategoryId,
    description: 'Descripción original',
    version: '1.0.0',
    filePath: 'http://example.com/file.zip',
  }).returning({ id: applications.id });
  testAppId = newApp.id;
});

test.beforeEach(async ({ context }) => {
  // Simular sesión inyectando cookie
  await context.addCookies([{
    name: 'session_id',
    value: MOCK_SESSION_ID,
    domain: 'localhost',
    path: '/',
  }]);
});

test.afterAll(async () => {
  // Limpieza en orden inverso (Teardown)
  if (testAppId) {
    await db.delete(applications).where(eq(applications.id, testAppId));
  }
  if (testCategoryId) {
    await db.delete(applicationCategories).where(eq(applicationCategories.id, testCategoryId));
  }
  if (MOCK_SESSION_ID) {
    await db.delete(sessions).where(eq(sessions.id, MOCK_SESSION_ID));
  }
  if (testUserId) {
    await db.delete(users).where(eq(users.id, testUserId));
  }
});

test.describe('Vistas de edición de aplicativos', () => {
  test('Debería renderizar los campos existentes correctamente', async ({ page }) => {
    await page.goto(`/admin/aplicativos/${testAppId}`);
    
    // Aserciones sobre el renderizado
    await expect(page.getByRole('heading', { name: 'Editar aplicativo' })).toBeVisible();
    await expect(page.locator('input[name="title"]')).toHaveValue('App Prueba E2E');
    await expect(page.locator('select[name="categoryId"]')).toHaveValue(testCategoryId);
    await expect(page.locator('input[name="version"]')).toHaveValue('1.0.0');
    await expect(page.locator('textarea[name="description"]')).toHaveValue('Descripción original');
    
    // Origen de archivo: externo
    const externalRadio = page.locator('input[name="uploadType"][value="external"]');
    await expect(externalRadio).toBeChecked();
    await expect(page.locator('input[name="externalUrl"]')).toHaveValue('http://example.com/file.zip');
  });

  test('Debería actualizar los valores y redirigir al listado', async ({ page }) => {
    await page.goto(`/admin/aplicativos/${testAppId}`);
    
    // Inyección de nuevos valores
    await page.fill('input[name="title"]', 'App Prueba E2E Modificada');
    await page.fill('input[name="version"]', '1.1.0');
    await page.fill('textarea[name="description"]', 'Nueva descripción modificada');
    
    // Enviar el formulario
    await page.click('button[type="submit"]');
    
    // Validar la redirección (esperando a que la URL cambie al listado de aplicativos)
    await page.waitForURL('**/admin/aplicativos');
    
    // Validar en la BD que se actualizó el registro
    const [updatedApp] = await db.select().from(applications).where(eq(applications.id, testAppId));
    expect(updatedApp.title).toBe('App Prueba E2E Modificada');
    expect(updatedApp.version).toBe('1.1.0');
    expect(updatedApp.description).toBe('Nueva descripción modificada');
  });
});
