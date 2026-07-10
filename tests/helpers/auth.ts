import { createHmac } from 'crypto';
import { db } from '../../src/db/index';
import { users, sessions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

export function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

export interface TestUser {
  userId: number;
  sessionId: string;
  signedSessionId: string;
  username: string;
}

export async function createTestUserAndSession(role: string): Promise<TestUser> {
  const username = `test_${role}_${Date.now()}`;
  const sessionId = `session_${Date.now()}`;
  const signedSessionId = signSessionId(sessionId);

  const [newUser] = await db.insert(users).values({
    username,
    password: 'hashed_fake_password',
    role,
  }).returning({ id: users.id });

  await db.insert(sessions).values({
    id: sessionId,
    userId: newUser.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });

  return { userId: newUser.id, sessionId, signedSessionId, username };
}

export async function cleanupTestUser(userId: number, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await db.delete(users).where(eq(users.id, userId));
}

export async function setSessionCookie(context: any, signedSessionId: string): Promise<void> {
  await context.addCookies([{
    name: 'session_id',
    value: signedSessionId,
    domain: '127.0.0.1',
    path: '/',
  }]);
}
