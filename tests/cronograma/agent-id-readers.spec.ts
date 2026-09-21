// tests/cronograma/agent-id-readers.spec.ts
//
// Plan B1: los lectores de schedules usan agentId (fallback agentName solo si
// agentId IS NULL). Prueba que una fila con nombre STALE sigue apareciendo
// porque el vinculo por id manda.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
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
    // usa ?year=&month= y ya matchea por agentId con fallback por nombre (B1).
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

  test("POST con agentId y nombre stale actualiza la fila existente sin duplicar", async ({ context }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);
    const [agent] = await db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.id, createdAgentIds));

    const staleName = `NOMBRE STALE ${Date.now()}`; // a propósito: no debe usarse
    const res = await context.request.post(new URL("/api/cronograma", baseURL).href, {
      data: {
        edits: [
          {
            agentId: agent.id,
            agentName: staleName,
            date: "2026-05-11",
            status: "Licencia",
          },
        ],
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);

    // Filtrado por (agentId, fecha): el agente de la fixture solo tiene la fila
    // sembrada para esa fecha; debe seguir habiendo UNA sola fila y con el
    // status nuevo. Sin match por id, el nombre stale INSERTaría un duplicado.
    const rows = await db
      .select({ id: schedules.id, status: schedules.status, agentId: schedules.agentId })
      .from(schedules)
      .where(and(eq(schedules.agentId, agent.id), eq(schedules.date, "2026-05-11")));
    // Rastrear ids nuevos para que el afterAll limpie aunque haya duplicado (red).
    for (const r of rows) if (!createdScheduleIds.includes(r.id)) createdScheduleIds.push(r.id);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("Licencia");
    // Mitad "sin duplicar": el nombre stale no debe haber creado ninguna fila.
    const dupes = await db
      .select({ id: schedules.id })
      .from(schedules)
      .where(eq(schedules.agentName, staleName));
    for (const d of dupes) if (!createdScheduleIds.includes(d.id)) createdScheduleIds.push(d.id);
    expect(dupes.length).toBe(0);
  });

  test("POST con agentId string resuelve y vincula por id numérico", async ({ context }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);
    const [agent] = await db.select({ id: agents.id, name: agents.name }).from(agents).where(inArray(agents.id, createdAgentIds));

    const res = await context.request.post(new URL("/api/cronograma", baseURL).href, {
      data: {
        edits: [
          {
            agentId: String(agent.id), // a propósito: string, debe coercionarse
            date: "2026-05-12",
            status: "Trabajo",
            horario: "09:00-18:00",
          },
        ],
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(1);
    expect(body.skipped).toBe(0);

    const rows = await db
      .select({ id: schedules.id, status: schedules.status, agentId: schedules.agentId, agentName: schedules.agentName })
      .from(schedules)
      .where(and(eq(schedules.agentId, agent.id), eq(schedules.date, "2026-05-12")));
    for (const r of rows) if (!createdScheduleIds.includes(r.id)) createdScheduleIds.push(r.id);
    expect(rows.length).toBe(1);
    expect(rows[0].agentId).toBe(agent.id);
    expect(rows[0].agentName).toBe(agent.name); // canónico, no vacío
    expect(rows[0].status).toBe("Trabajo");
  });

  test("POST con agentId desconocido omite el edit y lo cuenta como skipped", async ({ context }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);

    const res = await context.request.post(new URL("/api/cronograma", baseURL).href, {
      data: {
        edits: [
          {
            agentId: 999999999, // sin agente ni nombre: no hay nombre canónico
            date: "2026-05-13",
            status: "Trabajo",
          },
        ],
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(0);
    expect(body.skipped).toBe(1);

    const rows = await db
      .select({ id: schedules.id })
      .from(schedules)
      .where(eq(schedules.date, "2026-05-13"));
    expect(rows.length).toBe(0);
  });
});
