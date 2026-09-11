import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
} from "../helpers/auth";
import { db } from "../../src/db/index";
import { employees } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const TEST_DNI = "99999999";
const TEST_NAME = `Authz Test ${Date.now()}`;

async function seedEmployee(): Promise<void> {
  await db
    .insert(employees)
    .values({
      dni: TEST_DNI,
      username: "authz_test",
      fullname: TEST_NAME,
      interno: "0000",
      telefono: "",
      sucursal: "",
    })
    .onConflictDoUpdate({
      target: employees.dni,
      set: {
        fullname: TEST_NAME,
        interno: "0000",
        telefono: "",
        sucursal: "",
      },
    });
}

test.describe("PATCH /api/usuarios/[dni] authz", () => {
  let agentUser: Awaited<ReturnType<typeof createTestUserAndSession>>;
  let adminUser: Awaited<ReturnType<typeof createTestUserAndSession>>;

  test.beforeAll(async () => {
    await seedEmployee();
    agentUser = await createTestUserAndSession("agent");
    adminUser = await createTestUserAndSession("admin");
  });

  test.afterAll(async () => {
    await db.delete(employees).where(eq(employees.dni, TEST_DNI));
    await cleanupTestUser(agentUser.userId, agentUser.sessionId);
    await cleanupTestUser(adminUser.userId, adminUser.sessionId);
  });

  test("sin sesión → 401 y no modifica", async ({ context }) => {
    const res = await context.request.patch(`/api/usuarios/${TEST_DNI}`, {
      data: { interno: "HACK" },
    });
    expect(res.status()).toBe(401);
    const [row] = await db
      .select()
      .from(employees)
      .where(eq(employees.dni, TEST_DNI));
    expect(row.interno).toBe("0000");
  });

  test("agent logueado → 403 y no modifica", async ({ context }) => {
    await setSessionCookie(context, agentUser.signedSessionId);
    const res = await context.request.patch(`/api/usuarios/${TEST_DNI}`, {
      data: { interno: "HACK" },
    });
    expect(res.status()).toBe(403);
    const [row] = await db
      .select()
      .from(employees)
      .where(eq(employees.dni, TEST_DNI));
    expect(row.interno).toBe("0000");
  });

  test("admin logueado → 200 y modifica", async ({ context }) => {
    await setSessionCookie(context, adminUser.signedSessionId);
    const res = await context.request.patch(`/api/usuarios/${TEST_DNI}`, {
      data: { interno: "1234" },
    });
    expect(res.status()).toBe(200);
    const [row] = await db
      .select()
      .from(employees)
      .where(eq(employees.dni, TEST_DNI));
    expect(row.interno).toBe("1234");
  });
});
