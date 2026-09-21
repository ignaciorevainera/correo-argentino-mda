// tests/cronograma/agent-id-link.spec.ts
//
// Plan B2: guardar un edit de cronograma escribe agent_id. El payload puede
// seguir mandando agentName (compat de entrada), pero el writer lo resuelve
// contra agents y guarda solo el id. Requiere admin con mesa MDA TI
// (module cronograma write = TL+).
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, schedules, mesas } from "../../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const sign = (id: string) => `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

test.describe("schedules.agentId dual-write", () => {
  let adminId = 0;
  let adminCookie = "";
  const createdUserIds: number[] = [];
  const createdAgentIds: number[] = [];
  const createdScheduleIds: number[] = [];

  test.beforeAll(async () => {
    await db
      .insert(mesas)
      .values({ invgateId: 910010, name: MDA, displayName: null, active: true, lastSyncedAt: new Date().toISOString() })
      .onConflictDoNothing();
    const [mda] = await db.select({ invgateId: mesas.invgateId }).from(mesas).where(eq(mesas.name, MDA));

    const ts = Date.now();
    const [admin] = await db
      .insert(users)
      .values({ username: `link_admin_${ts}`, password: "x", role: "admin", helpdeskId: mda.invgateId, helpdeskName: MDA })
      .returning({ id: users.id });
    adminId = admin.id;
    createdUserIds.push(adminId);
    const sess = `sess_link_admin_${ts}`;
    await db.insert(sessions).values({ id: sess, userId: adminId, expiresAt: Date.now() + 3600000 });
    adminCookie = sign(sess);

    const [agent] = await db
      .insert(agents)
      .values({ name: `Link Agent ${ts}`, username: `link_agent_${ts}`, enCronograma: true })
      .returning({ id: agents.id });
    createdAgentIds.push(agent.id);
  });

  test.afterAll(async () => {
    if (createdScheduleIds.length) await db.delete(schedules).where(inArray(schedules.id, createdScheduleIds));
    if (createdAgentIds.length) await db.delete(agents).where(inArray(agents.id, createdAgentIds));
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  test("POST /api/cronograma escribe agent_id en la fila nueva", async ({ context }) => {
    const [agent] = await db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.id, createdAgentIds));
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);

    // Sin agentId en el payload: debe resolver el nombre contra agents.
    const res = await context.request.post(new URL("/api/cronograma", baseURL).href, {
      data: { edits: [{ agentName: agent.name, date: "2026-04-07", status: "Trabajo" }] },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);

    const [row] = await db
      .select({ id: schedules.id, agentId: schedules.agentId })
      .from(schedules)
      .where(and(eq(schedules.agentId, agent.id), eq(schedules.date, "2026-04-07")));
    expect(row).toBeDefined();
    createdScheduleIds.push(row.id);
    expect(row.agentId).toBe(agent.id);
  });
});
