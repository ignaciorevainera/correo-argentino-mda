// tests/cronograma/months-api.spec.ts
//
// #272 — DELETE /api/cronograma/months debe validar year/month con la misma
// regla que POST (enteros, month 0-11) antes de armar el monthPrefix.
import "dotenv/config";
import { randomUUID } from "crypto";
import { test, expect } from "@playwright/test";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../../src/db/index";
import {
  agents,
  agentSaturdayGroups,
  saturdayRotationConfig,
  schedules,
  users,
} from "../../src/db/schema";
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

test.describe("#262 — POST months no precarga agentes inactivos", () => {
  test("no genera schedules para agentes fuera de cronograma ni con usuario inactivo", async ({
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const prefix = "2098-12";
    const year = 2098;
    const month = 11;
    const suffix = randomUUID();
    const createdUserIds: number[] = [];
    const createdAgentIds: number[] = [];

    await setSessionCookie(context, user.signedSessionId);

    const cleanupMonth = async () => {
      await db.delete(schedules).where(like(schedules.date, `${prefix}-%`));
      await db
        .delete(agentSaturdayGroups)
        .where(eq(agentSaturdayGroups.month, prefix));
      await db
        .delete(saturdayRotationConfig)
        .where(eq(saturdayRotationConfig.month, prefix));
    };

    await cleanupMonth();

    try {
      const [inactiveUser] = await db
        .insert(users)
        .values({
          username: `crono_inactive_${suffix}`,
          password: "x",
          role: "agent",
          active: false,
        })
        .returning({ id: users.id });
      createdUserIds.push(inactiveUser.id);

      const [activeUser] = await db
        .insert(users)
        .values({
          username: `crono_active_${suffix}`,
          password: "x",
          role: "agent",
          active: true,
        })
        .returning({ id: users.id });
      createdUserIds.push(activeUser.id);

      const [outOfCronograma] = await db
        .insert(agents)
        .values({
          name: `Crono fuera ${suffix}`,
          username: `crono_out_${suffix}`,
          enCronograma: false,
        })
        .returning({ id: agents.id });
      createdAgentIds.push(outOfCronograma.id);

      const [inactiveLinked] = await db
        .insert(agents)
        .values({
          name: `Crono inactivo ${suffix}`,
          username: `crono_inactive_agent_${suffix}`,
          userId: inactiveUser.id,
          enCronograma: true,
        })
        .returning({ id: agents.id });
      createdAgentIds.push(inactiveLinked.id);

      const [activeControl] = await db
        .insert(agents)
        .values({
          name: `Crono activo ${suffix}`,
          username: `crono_active_agent_${suffix}`,
          userId: activeUser.id,
          enCronograma: true,
        })
        .returning({ id: agents.id });
      createdAgentIds.push(activeControl.id);

      const res = await context.request.post(
        new URL("/api/cronograma/months", baseURL).href,
        { data: { year, month } },
      );
      expect(res.status()).toBe(200);

      const rows = await db
        .select({ agentId: schedules.agentId })
        .from(schedules)
        .where(
          and(
            inArray(schedules.agentId, createdAgentIds),
            like(schedules.date, `${prefix}-%`),
          ),
        );

      const countFor = (agentId: number) =>
        rows.filter((row) => row.agentId === agentId).length;

      expect(countFor(outOfCronograma.id)).toBe(0);
      expect(countFor(inactiveLinked.id)).toBe(0);
      expect(countFor(activeControl.id)).toBeGreaterThan(0);
    } finally {
      const cleanupAgentIds = [...createdAgentIds];
      if (cleanupAgentIds.length > 0) {
        await db
          .delete(schedules)
          .where(
            and(
              inArray(schedules.agentId, cleanupAgentIds),
              like(schedules.date, `${prefix}-%`),
            ),
          );
      }
      await cleanupMonth();
      if (cleanupAgentIds.length > 0) {
        await db.delete(agents).where(inArray(agents.id, cleanupAgentIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    }
  });
});
