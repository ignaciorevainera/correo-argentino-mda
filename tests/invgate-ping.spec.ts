import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { db } from '../src/db/index';
import { users, sessions } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

let testUserId: number;
let rawSessionId: string;
let signedSessionId: string;

test.beforeAll(async () => {
  const username = `test_invgate_${Date.now()}`;
  rawSessionId = `session_invgate_${Date.now()}`;
  signedSessionId = signSessionId(rawSessionId);

  const [newUser] = await db.insert(users).values({
    username,
    password: 'hashed_fake_password',
    role: 'admin',
  }).returning({ id: users.id });
  testUserId = newUser.id;

  await db.insert(sessions).values({
    id: rawSessionId,
    userId: testUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
});

test.afterAll(async () => {
  await db.delete(sessions).where(eq(sessions.id, rawSessionId));
  await db.delete(users).where(eq(users.id, testUserId));
});

test.describe('InvGate ping endpoint', () => {
  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/invgate/ping');
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.error).toBe('No autorizado');
  });

  test('should return 200 when authenticated', async ({ context, request }) => {
    await context.addCookies([{
      name: 'session_id',
      value: signedSessionId,
      domain: 'localhost',
      path: '/',
    }]);

    const response = await request.get('/api/invgate/ping');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(typeof body.elapsed).toBe('number');
  });

  test('incidents endpoint also returns 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/api/invgate/incidents');
    expect(response.status()).toBe(401);
  });
});
