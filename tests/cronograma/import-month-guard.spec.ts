// tests/cronograma/import-month-guard.spec.ts
//
// #261 — el POST /api/cronograma/import debe validar el mes en el servidor.
// Antes el cliente mandaba solo `file` y el servidor aceptaba cualquier mes;
// el filtrado por mes era 100% cliente (silencioso). Ahora el servidor exige
// `month` (YYYY-MM) y rechaza el archivo si trae fechas fuera de ese mes.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { agents } from "../../src/db/schema";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

function csv(header: string, row: string): Buffer {
  return Buffer.from(`${header}\n${row}\n`, "utf-8");
}

let user: TestUser;
let agentName: string;
let agentId: number;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
  agentName = `Import Guard Test ${Date.now()}`;
  const [agent] = await db
    .insert(agents)
    .values({ name: agentName, enCronograma: true })
    .returning({ id: agents.id });
  agentId = agent.id;
});

test.afterAll(async () => {
  await db.delete(agents).where(eq(agents.id, agentId));
  await cleanupTestUser(user.userId, user.sessionId);
});

async function postImport(
  context: any,
  file: Buffer,
  month: string | undefined,
): Promise<import("@playwright/test").APIResponse> {
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
  const multipart: Record<string, any> = {
    file: { name: "cronograma.csv", mimeType: "text/csv", buffer: file },
  };
  if (month !== undefined) multipart.month = month;
  return context.request.post(new URL("/api/cronograma/import", baseURL).href, {
    multipart,
  });
}

test.describe("guard de mes del import en el servidor", () => {
  test("rechaza con 400 si el archivo trae fechas fuera del mes", async ({
    context,
  }) => {
    await setSessionCookie(context, user.signedSessionId);
    // 2026-10-05 (lunes) dentro del mes; 2026-11-03 (martes) fuera.
    const file = csv(
      "Nombre,2026-10-05,2026-11-03",
      `${agentName},Home Office,Home Office`,
    );
    const res = await postImport(context, file, "2026-10");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("acepta con 200 si todas las fechas pertenecen al mes", async ({
    context,
  }) => {
    await setSessionCookie(context, user.signedSessionId);
    const file = csv(
      "Nombre,2026-10-05,2026-10-06",
      `${agentName},Home Office,Home Office`,
    );
    const res = await postImport(context, file, "2026-10");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.edits)).toBe(true);
    expect(body.edits.length).toBeGreaterThan(0);
    expect(
      body.edits.every((e: any) => e.date.startsWith("2026-10")),
    ).toBe(true);
  });
});
