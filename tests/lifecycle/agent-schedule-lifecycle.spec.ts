// tests/lifecycle/agent-schedule-lifecycle.spec.ts
//
// Ciclo de vida extendido del agente con cronograma:
//   alta (user+agent vinculados) -> crear edit de cronograma (agentId)
//   -> modificar el edit -> desactivar participacion (enCronograma off)
//   -> cambiar a mesa no participativa (Coord) -> volver a MDA TI y reactivar.
// En cada salto se verifica que la fila de `schedules` (keyed by agent_id)
// y el vinculo agents.user_id NO se pierdan.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, schedules, mesas } from "../../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";
const PASSWORD = "CambiarEst0!Clave";
const DATE = "2026-07-07";
const sign = (id: string) =>
  `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

test.describe("Ciclo de vida del cronograma del agente", () => {
  let adminCookie = "";
  let adminUserId = 0;
  let adminSessionId = "";
  let mdaId = 0;
  let coordId = 0;
  let userId = 0;
  let agentId = 0;
  let username = "";
  let fullName = "";

  test.beforeAll(async () => {
    for (const [id, name] of [
      [910011, MDA],
      [910012, COORD],
    ] as const) {
      await db
        .insert(mesas)
        .values({
          invgateId: id,
          name,
          displayName: null,
          active: true,
          lastSyncedAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
    }
    const [mda] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA));
    const [coord] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, COORD));
    mdaId = mda.id;
    coordId = coord.id;

    const ts = Date.now();
    const [admin] = await db
      .insert(users)
      .values({
        username: `sched_admin_${ts}`,
        password: "x",
        role: "admin",
        helpdeskId: mdaId,
        helpdeskName: MDA,
      })
      .returning({ id: users.id });
    adminUserId = admin.id;
    adminSessionId = `sess_sched_${ts}`;
    await db.insert(sessions).values({
      id: adminSessionId,
      userId: adminUserId,
      expiresAt: Date.now() + 3600000,
    });
    adminCookie = sign(adminSessionId);
  });

  test.afterAll(async () => {
    if (agentId) await db.delete(schedules).where(eq(schedules.agentId, agentId));
    if (username) await db.delete(agents).where(eq(agents.username, username));
    if (userId) await db.delete(sessions).where(eq(sessions.userId, userId));
    if (username) await db.delete(users).where(eq(users.username, username));
    if (adminSessionId) await db.delete(sessions).where(eq(sessions.id, adminSessionId));
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
  });

  test("el schedule y el vinculo por id sobreviven off/on y cambio de mesa", async ({
    context,
  }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(baseURL).hostname, path: "/" },
    ]);

    const ts = Date.now();
    username = `0sched_${ts}`;
    fullName = `Sched Life ${ts}`;

    // 1) Alta real via POST /admin/usuarios (crea user + agent vinculado).
    const createRes = await context.request.post(
      new URL("/admin/usuarios", baseURL).href,
      {
        form: {
          action: "create",
          username,
          password: PASSWORD,
          role: "agent",
          name: fullName,
          helpdesk: `${mdaId}|${MDA}`,
          enCronograma: "on",
          asignableCubic: "on",
        },
        headers: { Accept: "application/json" },
      },
    );
    expect(createRes.status()).toBe(200);

    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    userId = u.id;
    const [ag] = await db
      .select({ id: agents.id, userId: agents.userId, enCronograma: agents.enCronograma })
      .from(agents)
      .where(eq(agents.username, username));
    agentId = ag.id;
    expect(ag.userId).toBe(userId); // vinculo por id
    expect(ag.enCronograma).toBe(true);

    // 2) Crear edit de cronograma por agentId.
    let res = await context.request.post(
      new URL("/api/cronograma", baseURL).href,
      {
        data: { edits: [{ agentId, date: DATE, status: "Trabajo", horario: "09:00-18:00" }] },
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).saved).toBe(1);
    const [s1] = await db
      .select({ id: schedules.id, status: schedules.status, horario: schedules.horario })
      .from(schedules)
      .where(and(eq(schedules.agentId, agentId), eq(schedules.date, DATE)));
    expect(s1).toBeTruthy();
    const scheduleId = s1.id;
    expect(s1.horario).toBe("09:00-18:00");

    // 3) Modificar el edit (misma fila, sin duplicar).
    res = await context.request.post(new URL("/api/cronograma", baseURL).href, {
      data: { edits: [{ agentId, date: DATE, status: "Licencia" }] },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).saved).toBe(1);
    const afterEdit = await db
      .select({ id: schedules.id, status: schedules.status })
      .from(schedules)
      .where(and(eq(schedules.agentId, agentId), eq(schedules.date, DATE)));
    expect(afterEdit.length).toBe(1); // no duplico
    expect(afterEdit[0].id).toBe(scheduleId);
    expect(afterEdit[0].status).toBe("Licencia");

    const scheduleIntact = async () => {
      const [row] = await db
        .select({ id: schedules.id, status: schedules.status, horario: schedules.horario })
        .from(schedules)
        .where(eq(schedules.id, scheduleId));
      return row?.status === "Licencia" && row?.horario === "09:00-18:00";
    };
    const agentFlags = async () => {
      const [a] = await db
        .select({
          enCronograma: agents.enCronograma,
          asignableCubic: agents.asignableCubic,
          incluidoCalidad: agents.incluidoCalidad,
          asignableAgs: agents.asignableAgs,
        })
        .from(agents)
        .where(eq(agents.id, agentId));
      return a;
    };
    const updateUser = (fields: Record<string, string>) =>
      context.request.post(new URL("/admin/usuarios", baseURL).href, {
        form: {
          action: "update-user",
          userId: String(userId),
          username,
          name: fullName,
          newRole: "agent",
          ...fields,
        },
        headers: { Accept: "application/json" },
      });

    // 4) Desactivar participacion (enCronograma off, misma mesa MDA TI).
    res = await updateUser({ helpdesk: `${mdaId}|${MDA}` });
    expect(res.status()).toBe(200);
    expect((await agentFlags()).enCronograma).toBe(false);
    expect(await scheduleIntact(), "schedule tras OFF de participacion").toBe(true);

    // 5) Cambiar a mesa no participativa (Coord): resetea flags.
    res = await updateUser({ helpdesk: `${coordId}|${COORD}`, enCronograma: "on" });
    expect(res.status()).toBe(200);
    const coordFlags = await agentFlags();
    expect(coordFlags.enCronograma).toBe(false);
    expect(coordFlags.asignableCubic).toBe(false);
    expect(coordFlags.incluidoCalidad).toBe(false);
    expect(coordFlags.asignableAgs).toBe(false);
    expect(await scheduleIntact(), "schedule tras cambio a Coord").toBe(true);

    // 6) Reactivar: volver a MDA TI + enCronograma on.
    res = await updateUser({
      helpdesk: `${mdaId}|${MDA}`,
      enCronograma: "on",
      asignableCubic: "on",
    });
    expect(res.status()).toBe(200);
    const reactivated = await agentFlags();
    expect(reactivated.enCronograma).toBe(true);
    expect(reactivated.asignableCubic).toBe(true);
    expect(await scheduleIntact(), "schedule tras reactivacion").toBe(true);
    expect(ag.userId).toBe(userId); // vinculo sigue

    // 7) El agente reaparece en el listado de cronograma.
    const listRes = await context.request.get(new URL("/api/cronograma/", baseURL).href);
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    expect(body.operators.some((o: any) => o.username === username)).toBe(true);
  });
});
