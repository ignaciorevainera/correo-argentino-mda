import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { agents, saturdayRotationConfig } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { createTestUserAndSession, cleanupTestUser, setSessionCookie, type TestUser } from "../helpers/auth";

const TEST_MONTH = { year: 2034, month: 10, prefix: "2034-11" };

let user: TestUser;

async function cleanTestMonth(): Promise<void> {
  await db.delete(saturdayRotationConfig).where(eq(saturdayRotationConfig.month, TEST_MONTH.prefix));
  await db.run(sql`DELETE FROM schedules WHERE date LIKE ${TEST_MONTH.prefix + "-%"}`);
  await db.run(sql`DELETE FROM agent_saturday_groups WHERE month = ${TEST_MONTH.prefix}`);
}

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
  await cleanTestMonth();
});

test.afterAll(async () => {
  await cleanTestMonth();
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("Cronograma months API", () => {
  test("DELETE rechaza month fuera de rango o no numérico con 400 (#272)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const outOfRange = await page.request.delete("/api/cronograma/months", { data: { year: 2034, month: 15 } });
    expect(outOfRange.status()).toBe(400);
    const notNumeric = await page.request.delete("/api/cronograma/months", { data: { year: 2034, month: "abc" } });
    expect(notNumeric.status()).toBe(400);
  });

  test("POST del mismo mes devuelve 409 y no borra datos (#141/#274)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const first = await page.request.post("/api/cronograma/months", { data: { year: TEST_MONTH.year, month: TEST_MONTH.month } });
    expect(first.ok()).toBeTruthy();
    const second = await page.request.post("/api/cronograma/months", { data: { year: TEST_MONTH.year, month: TEST_MONTH.month } });
    expect(second.status()).toBe(409);
  });

  test("GET notes con agente inexistente no crea agentes (#264)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const before = await db.select({ c: sql<number>`count(*)` }).from(agents);
    const res = await page.request.get("/api/cronograma/notes?agentName=zzz_agente_inexistente_12345");
    expect(res.ok()).toBeTruthy();
    const after = await db.select({ c: sql<number>`count(*)` }).from(agents);
    expect(after[0].c).toBe(before[0].c);
  });

  test("import rechaza fechas fuera del mes con 400 (#261)", async ({ context, page }) => {
    await setSessionCookie(context, user.signedSessionId);
    const [{ name: agentName }] = await db
      .select({ name: agents.name })
      .from(agents)
      .limit(1);
    expect(agentName).toBeTruthy();
    const csv = `Operador,2026-06-01,2026-06-02\n${agentName},Presencial Monte Grande,Presencial Monte Grande\n`;
    const res = await page.request.post("/api/cronograma/import", {
      multipart: {
        month: "2026-07",
        file: { name: "import.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
      },
    });
    expect(res.status()).toBe(400);
  });
});
