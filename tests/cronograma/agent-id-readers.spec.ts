// tests/cronograma/agent-id-readers.spec.ts
//
// Plan B1: los lectores de schedules usan agentId (fallback agentName solo si
// agentId IS NULL). Prueba que una fila con nombre STALE sigue apareciendo
// porque el vinculo por id manda.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, schedules, mesas } from "../../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const sign = (id: string) => `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

test.describe("lectores de schedules por agentId", () => {
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
      .values({ username: `reader_admin_${ts}`, password: "x", role: "admin", helpdeskId: mda.invgateId, helpdeskName: MDA })
      .returning({ id: users.id });
    adminId = admin.id;
    createdUserIds.push(adminId);
    const sess = `sess_reader_admin_${ts}`;
    await db.insert(sessions).values({ id: sess, userId: adminId, expiresAt: Date.now() + 3600000 });
    adminCookie = sign(sess);

    const [agent] = await db
      .insert(agents)
      .values({ name: `Reader Agent ${ts}`, username: `reader_agent_${ts}`, enCronograma: true })
      .returning({ id: agents.id });
    createdAgentIds.push(agent.id);

    // Fila con agentId correcto pero agentName STALE: solo un lector por id la ve.
    const [row] = await db
      .insert(schedules)
      .values({
        agentName: `NOMBRE VIEJO ${ts}`,
        agentId: agent.id,
        date: "2026-05-11",
        status: "Trabajo",
        horario: "09:00-18:00",
        isOverride: true,
      })
      .returning({ id: schedules.id });
    createdScheduleIds.push(row.id);
  });

  test.afterAll(async () => {
    if (createdScheduleIds.length) await db.delete(schedules).where(inArray(schedules.id, createdScheduleIds));
    if (createdAgentIds.length) await db.delete(agents).where(inArray(agents.id, createdAgentIds));
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  test("GET 2026-05 refleja el override de la fila con nombre stale (match por id)", async ({ context }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);
    // GET usa ?month=YYYY-MM (ver src/components/cronograma/lib/api.ts:41).
    const res = await context.request.get(new URL("/api/cronograma?month=2026-05", baseURL).href);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const [agent] = await db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.id, createdAgentIds));
    const op = body.operators.find((o: any) => o.id === agent.id);
    expect(op).toBeDefined();
    // El override del día 11 debe verse aunque el agentName de la fila sea viejo.
    expect(op.overrides["2026-05-11"]).toBeTruthy();
    expect(op.horarios_dias["2026-05-11"]).toBe("09:00-18:00");
  });

  test("asistencia del operador refleja el plan de la fila con nombre stale (match por id)", async ({ context }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);
    const [agent] = await db.select({ id: agents.id }).from(agents).where(inArray(agents.id, createdAgentIds));
    // GET /api/asistencia usa ?startDate=&endDate= y sirve getAttendanceData
    // (src/pages/api/asistencia/index.ts). NOTA: /api/asistencia/operador/[id]
    // usa ?year=&month= y tiene su propio lector name-keyed (otra tarea del plan B1).
    const res = await context.request.get(
      new URL("/api/asistencia?startDate=2026-05-11&endDate=2026-05-11", baseURL).href,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const row = (body as any[]).find(
      (r: any) => r.agentId === agent.id && r.date === "2026-05-11" && r.shiftType === "normal",
    );
    expect(row).toBeDefined();
    // El plan del día debe venir de la fila vinculada por id (nombre stale).
    expect(row.modalidadPlanificada).toBe("Trabajo");
    expect(row.horarioEstipulado).toBe("09:00-18:00");
  });
});
