import "dotenv/config";
import { createHmac } from "crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
} from "../helpers/auth";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

// src/lib/csrf.ts cannot be imported from Playwright: it pulls SECRET_KEY from
// import.meta.env (Astro/Vite-only), undefined in the Node test runner. Mirrors
// generateCsrfToken exactly so the server accepts the signature, using the same
// process.env.SESSION_SECRET the dev server loads from .env.
function generateCsrfToken(sessionId: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", SECRET_KEY)
    .update(`${sessionId}.${timestamp}`)
    .digest("hex");
  return `${sessionId}.${timestamp}.${signature}`;
}

async function login(
  context: BrowserContext,
  signedSessionId: string,
): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4321";
  await context.addCookies([
    {
      name: "session_id",
      value: signedSessionId,
      domain: new URL(baseURL).hostname,
      path: "/",
    },
  ]);
}

const ASSIGN_URL = "/api/support-guides/assign";
const HIDE_URL = "/api/soportes/helpdesks/hide";

test.describe("Guards de rol: variantes legacy no deben saltar el chequeo", () => {
  let legacyTeamLeader: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let legacyAgent: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let canonicalAgent: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let supervisor: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let admin: Awaited<ReturnType<typeof createTestUserAndSession>>;

  test.beforeAll(async () => {
    legacyTeamLeader = await createTestUserAndSession("team leader");
    legacyAgent = await createTestUserAndSession("Agent");
    canonicalAgent = await createTestUserAndSession("agent");
    supervisor = await createTestUserAndSession("supervisor");
    admin = await createTestUserAndSession("admin");
  });

  test.afterAll(async () => {
    await cleanupTestUser(legacyTeamLeader.userId, legacyTeamLeader.sessionId);
    await cleanupTestUser(legacyAgent.userId, legacyAgent.sessionId);
    await cleanupTestUser(canonicalAgent.userId, canonicalAgent.sessionId);
    await cleanupTestUser(supervisor.userId, supervisor.sessionId);
    await cleanupTestUser(admin.userId, admin.sessionId);
  });

  test("assign: rol legacy 'team leader' → 403 Acceso denegado", async ({
    context,
  }) => {
    await login(context, legacyTeamLeader.signedSessionId);
    const res = await context.request.post(ASSIGN_URL, {
      headers: {
        "X-CSRF-Token": generateCsrfToken(legacyTeamLeader.sessionId),
      },
      data: {},
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso denegado" });
  });

  test("hide: rol legacy 'Agent' → 403 Acceso denegado", async ({
    context,
  }) => {
    await login(context, legacyAgent.signedSessionId);
    const res = await context.request.post(HIDE_URL, {
      headers: {
        "X-CSRF-Token": generateCsrfToken(legacyAgent.sessionId),
      },
      data: {},
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso denegado" });
  });

  test("assign: rol canónico 'agent' → 403 Acceso denegado", async ({
    context,
  }) => {
    await login(context, canonicalAgent.signedSessionId);
    const res = await context.request.post(ASSIGN_URL, {
      headers: {
        "X-CSRF-Token": generateCsrfToken(canonicalAgent.sessionId),
      },
      data: {},
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso denegado" });
  });

  test("hide: rol canónico 'agent' → 403 Acceso denegado", async ({
    context,
  }) => {
    await login(context, canonicalAgent.signedSessionId);
    const res = await context.request.post(HIDE_URL, {
      headers: {
        "X-CSRF-Token": generateCsrfToken(canonicalAgent.sessionId),
      },
      data: {},
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso denegado" });
  });

  test("assign: 'supervisor' pasa el guard y falla por payload → 400", async ({
    context,
  }) => {
    await login(context, supervisor.signedSessionId);
    const res = await context.request.post(ASSIGN_URL, {
      headers: {
        "X-CSRF-Token": generateCsrfToken(supervisor.sessionId),
      },
      data: {},
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("recordId");
  });

  test("hide: 'admin' pasa el guard y falla por payload → 400", async ({
    context,
  }) => {
    await login(context, admin.signedSessionId);
    const res = await context.request.post(HIDE_URL, {
      headers: {
        "X-CSRF-Token": generateCsrfToken(admin.sessionId),
      },
      data: {},
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("invgate_id");
  });
});
