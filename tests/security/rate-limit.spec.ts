import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { createTestUserAndSession, cleanupTestUser, setSessionCookie } from '../helpers/auth';

let user: Awaited<ReturnType<typeof createTestUserAndSession>>;

test.beforeAll(async () => {
  user = await createTestUserAndSession('admin');
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe('S1.4 Rate limiting', () => {
  test('API write: 20 pass, 21st returns 429', async ({ context, request }) => {
    await setSessionCookie(context, user.signedSessionId);
    const url = '/api/disponibilidad/lock';

    // Send 20 parallel POSTs (should all pass)
    const passResults = await Promise.all(
      Array.from({ length: 20 }, () => request.post(url))
    );
    for (const res of passResults) {
      expect([200, 201, 400, 401, 404, 409]).toContain(res.status());
    }

    // 21st should be rate-limited
    const blocked = await request.post(url);
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['retry-after']).toBeDefined();
  });

  test('API read: 60 pass, 61st returns 429', async ({ context, request }) => {
    await setSessionCookie(context, user.signedSessionId);
    const url = '/api/disponibilidad';

    // Send 60 parallel GETs (should all pass)
    const passResults = await Promise.all(
      Array.from({ length: 60 }, () => request.get(url))
    );
    for (const res of passResults) {
      expect([200, 304]).toContain(res.status());
    }

    // 61st should be rate-limited
    const blocked = await request.get(url);
    expect(blocked.status()).toBe(429);
    expect(blocked.headers()['retry-after']).toBeDefined();
  });
});
