// tests/cronograma/months-api.spec.ts
//
// #272 — DELETE /api/cronograma/months debe validar year/month con la misma
// regla que POST (enteros, month 0-11) antes de armar el monthPrefix.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index";
import { saturdayRotationConfig } from "../../src/db/schema";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUserAndSession("admin");
});

test.afterAll(async () => {
  await cleanupTestUser(user.userId, user.sessionId);
});

test.describe("#272 — validación de year/month en months API", () => {
  test("DELETE rechaza year/month no enteros o fuera de rango", async ({
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await setSessionCookie(context, user.signedSessionId);
    const url = new URL("/api/cronograma/months", baseURL).href;

    for (const data of [
      { year: 2099, month: "10" },
      { year: 2099, month: 12 },
      { year: "2099x", month: 1 },
    ]) {
      const res = await context.request.delete(url, { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
  });
});

test.describe("#273 — availableMonths incluye rotación sin schedules", () => {
  test("GET devuelve un mes de saturdayRotationConfig sin schedules", async ({
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const prefix = "2099-02";
    await setSessionCookie(context, user.signedSessionId);

    await db
      .insert(saturdayRotationConfig)
      .values({ month: prefix })
      .onConflictDoNothing();

    try {
      const res = await context.request.get(
        new URL(`/api/cronograma?month=${prefix}`, baseURL).href,
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.availableMonths).toContain(prefix);
    } finally {
      await db
        .delete(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, prefix));
    }
  });
});
