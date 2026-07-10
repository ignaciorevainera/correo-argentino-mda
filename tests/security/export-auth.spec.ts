import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { createTestUserAndSession, cleanupTestUser, setSessionCookie } from '../helpers/auth';

let adminUser: Awaited<ReturnType<typeof createTestUserAndSession>>;

test.beforeAll(async () => {
  adminUser = await createTestUserAndSession('admin');
});

test.afterAll(async () => {
  await cleanupTestUser(adminUser.userId, adminUser.sessionId);
});

test.describe('S3.4 Export endpoints auth', () => {
  test('offices: returns 401 without session', async ({ request }) => {
    const response = await request.get('/api/export/offices');
    expect(response.status()).toBe(401);
  });

  test('terminals: returns 401 without session', async ({ request }) => {
    const response = await request.get('/api/export/terminals');
    expect(response.status()).toBe(401);
  });

  test('offices: returns 200 with admin session', async ({ context, request }) => {
    await setSessionCookie(context, adminUser.signedSessionId);
    const response = await request.get('/api/export/offices');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
  });

  test('terminals: returns 200 with admin session', async ({ context, request }) => {
    await setSessionCookie(context, adminUser.signedSessionId);
    const response = await request.get('/api/export/terminals');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
  });
});
