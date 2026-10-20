import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
} from "./helpers/auth";

let adminUser: Awaited<ReturnType<typeof createTestUserAndSession>>;

test.beforeAll(async () => {
  adminUser = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(adminUser.userId, adminUser.sessionId);
});

test.describe("InvGate ping endpoint", () => {
  test("should return 401 when not authenticated", async ({ request }) => {
    const response = await request.get("/api/invgate/ping");
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Sesión no iniciada");
  });

  test("should return 200 when authenticated", async ({ context }) => {
    await setSessionCookie(context, adminUser.signedSessionId);

    const response = await context.request.get("/api/invgate/ping");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(typeof body.elapsed).toBe("number");
  });

  test("incidents endpoint also returns 401 when not authenticated", async ({
    request,
  }) => {
    const response = await request.get("/api/invgate/incidents");
    expect(response.status()).toBe(401);
  });
});
