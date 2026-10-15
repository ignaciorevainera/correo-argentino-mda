// tests/cronograma/notes-readonly.spec.ts
//
// #264 — el GET /api/cronograma/notes no debe tener efectos de escritura.
// Antes, pedir notas de un agente inexistente lo creaba en la DB. Ahora el GET
// es de solo lectura y devuelve notes vacío; la creación queda solo en el POST.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db } from "../../src/db/index";
import { agents } from "../../src/db/schema";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

async function countAgents(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(agents);
  return Number(row.n);
}

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("GET de notas de solo lectura", () => {
  test("pedir notas de un agente inexistente no crea el agente", async ({
    context,
  }) => {
    await setSessionCookie(context, user.signedSessionId);
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const ghost = `NoExiste ${Date.now()}`;

    const before = await countAgents();
    const res = await context.request.get(
      new URL(`/api/cronograma/notes?agentName=${encodeURIComponent(ghost)}`, baseURL).href,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("");
    const after = await countAgents();

    expect(after).toBe(before);
  });
});
