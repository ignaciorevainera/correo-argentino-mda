import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import {
  createTestUserAndSession,
  cleanupTestUser,
} from "../helpers/auth";
import { db } from "../../src/db/index";
import { users, mesas } from "../../src/db/schema";
import { MDA_TI_HELPDESK } from "../../src/lib/helpdeskAccess";

// Los endpoints de reorder cuelgan de /admin/aplicativos|recursos|contactos
// (heredan /admin = team_leader+). El guard vive en src/lib/reorderHandler.ts:
// sin él cualquier usuario logueado (p.ej. agent) podía reordenar porque
// /api/admin está en la whitelist ALL_ROLES y la mesa MDA TI no lo bloquea.
const APLICATIVOS_REORDER = "/api/admin/aplicativos/reorder";
const CONTACTOS_REORDER = "/api/admin/contactos/reorder";

// Sin mesa, el middleware bloquea /api/admin (isSectionVisibleSync) con 401
// antes de llegar al guard. Para aislar el guard de reorder hay que asignar la
// mesa MDA TI (la única que habilita /api/admin para roles no-admin), que es
// justamente el escenario de I8: logueado no-admin con mesa MDA TI.
async function assignMdaTiMesa(userId: number): Promise<void> {
  const [mesa] = await db
    .select({ invgateId: mesas.invgateId })
    .from(mesas)
    .where(eq(mesas.name, MDA_TI_HELPDESK));
  await db
    .update(users)
    .set({ helpdeskId: mesa.invgateId })
    .where(eq(users.id, userId));
}

async function login(
  context: BrowserContext,
  signedSessionId: string,
): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
  await context.addCookies([
    {
      name: "session_id",
      value: signedSessionId,
      domain: new URL(baseURL).hostname,
      path: "/",
    },
  ]);
}

test.describe("Guards de rol: reorder admin (aplicativos/contactos)", () => {
  let canonicalAgent: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let legacyAgent: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let legacyTeamLeader: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let admin: Awaited<ReturnType<typeof createTestUserAndSession>>;

  test.beforeAll(async () => {
    canonicalAgent = await createTestUserAndSession("agent");
    legacyAgent = await createTestUserAndSession("Agent");
    legacyTeamLeader = await createTestUserAndSession("team leader");
    admin = await createTestUserAndSession("admin");

    await assignMdaTiMesa(canonicalAgent.userId);
    await assignMdaTiMesa(legacyAgent.userId);
    await assignMdaTiMesa(legacyTeamLeader.userId);
    await assignMdaTiMesa(admin.userId);
  });

  test.afterAll(async () => {
    await cleanupTestUser(canonicalAgent.userId, canonicalAgent.sessionId);
    await cleanupTestUser(legacyAgent.userId, legacyAgent.sessionId);
    await cleanupTestUser(legacyTeamLeader.userId, legacyTeamLeader.sessionId);
    await cleanupTestUser(admin.userId, admin.sessionId);
  });

  test("agent canónico → 403 Acceso denegado", async ({ context }) => {
    await login(context, canonicalAgent.signedSessionId);
    const res = await context.request.post(APLICATIVOS_REORDER, {
      data: { items: [] },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso denegado" });
  });

  test("rol legacy 'Agent' → 403 Acceso denegado", async ({ context }) => {
    await login(context, legacyAgent.signedSessionId);
    const res = await context.request.post(CONTACTOS_REORDER, {
      data: { items: [] },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Acceso denegado" });
  });

  test("rol legacy 'team leader' pasa el guard (no 403)", async ({
    context,
  }) => {
    await login(context, legacyTeamLeader.signedSessionId);
    const res = await context.request.post(APLICATIVOS_REORDER, {
      data: { items: [] },
    });
    expect(res.status()).not.toBe(403);
    expect(res.status()).toBe(200);
  });

  test("admin pasa el guard (no 403)", async ({ context }) => {
    await login(context, admin.signedSessionId);
    const res = await context.request.post(CONTACTOS_REORDER, {
      data: { items: [] },
    });
    expect(res.status()).not.toBe(403);
    expect(res.status()).toBe(200);
  });
});
