import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
} from "../helpers/auth";

const ENDPOINT = "/api/usuarios/ad-groups-licenses";

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

test.describe("GET /api/usuarios/ad-groups-licenses authz", () => {
  let agentUser: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let adminUser: Awaited<ReturnType<typeof createTestUserAndSession>>;

  test.beforeAll(async () => {
    agentUser = await createTestUserAndSession("agent");
    adminUser = await createTestUserAndSession("admin");
  });

  test.afterAll(async () => {
    await cleanupTestUser(agentUser.userId, agentUser.sessionId);
    await cleanupTestUser(adminUser.userId, adminUser.sessionId);
  });

  test("sin sesión → 401", async ({ context }) => {
    const res = await context.request.get(ENDPOINT);
    expect(res.status()).toBe(401);
  });

  test("agent logueado → 403", async ({ context }) => {
    await login(context, agentUser.signedSessionId);
    const res = await context.request.get(ENDPOINT);
    expect(res.status()).toBe(403);
  });

  test("admin logueado → el guard deja pasar (no 401/403)", async ({
    context,
  }) => {
    await login(context, adminUser.signedSessionId);
    const res = await context.request.get(ENDPOINT);
    // Este test valida AUTORIZACIÓN, no la conexión LDAP. El handler chequea
    // LDAP_USER/LDAP_PASS y luego intenta bindear contra el servidor LDAP:
    // en el entorno de test faltan credenciales / el server no es alcanzable,
    // por eso el status real es 500. Lo que importa es que el guard de authz
    // deja pasar al admin (nunca 401/403).
    expect([200, 500]).toContain(res.status());
  });
});
