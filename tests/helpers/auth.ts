import "dotenv/config";
import { createHmac, randomUUID } from "crypto";
import { test } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

export function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

export interface TestUser {
  userId: number;
  sessionId: string;
  signedSessionId: string;
  username: string;
}

async function findOrCreateMesa(name: string): Promise<{ invgateId: number }> {
  let [mesa] = await db
    .select({ invgateId: mesas.invgateId })
    .from(mesas)
    .where(eq(mesas.name, name));
  if (!mesa) {
    await db
      .insert(mesas)
      .values({
        invgateId: 910001,
        name,
        active: true,
        assignable: true,
        lastSyncedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    [mesa] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, name));
  }
  return mesa;
}

export interface TestUserOptions {
  helpdeskName?: string;
}

export async function createTestUserAndSession(
  role: string,
  opts: TestUserOptions = {},
): Promise<TestUser> {
  const suffix = randomUUID();
  const username = `test_${role}_${suffix}`;
  const sessionId = `session_${suffix}`;
  const signedSessionId = signSessionId(sessionId);

  const mesa = opts.helpdeskName
    ? await findOrCreateMesa(opts.helpdeskName)
    : null;

  let newUserId: number | undefined;

  try {
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        password: "hashed_fake_password",
        role,
        helpdeskId: mesa?.invgateId ?? null,
        helpdeskName: mesa ? opts.helpdeskName : null,
      })
      .returning({ id: users.id });
    newUserId = newUser.id;

    await db.insert(sessions).values({
      id: sessionId,
      userId: newUser.id,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24,
    });

    return { userId: newUser.id, sessionId, signedSessionId, username };
  } catch (error) {
    if (newUserId !== undefined) {
      try {
        await db.delete(sessions).where(eq(sessions.userId, newUserId));
        await db.delete(users).where(eq(users.id, newUserId));
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Failed to clean up partial test user",
        );
      }
    }
    throw error;
  }
}

export async function cleanupTestUser(
  userId: number,
  sessionId?: string,
): Promise<void> {
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  } else {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
  await db.delete(users).where(eq(users.id, userId));
}

function resolveCookieDomain(): string {
  try {
    const baseURL = test.info().project.use.baseURL;
    if (baseURL) return new URL(baseURL).hostname;
  } catch {
    // test.info() unavailable outside a test runtime
  }
  const envUrl = process.env.PLAYWRIGHT_BASE_URL;
  if (envUrl) {
    try {
      return new URL(envUrl).hostname;
    } catch {
      // ignore
    }
  }
  return "localhost";
}

export async function setSessionCookie(
  context: any,
  signedSessionId: string,
  domain?: string,
): Promise<void> {
  const targetDomain = domain ?? resolveCookieDomain();
  await context.addCookies([
    {
      name: "session_id",
      value: signedSessionId,
      domain: targetDomain,
      path: "/",
    },
  ]);
}
