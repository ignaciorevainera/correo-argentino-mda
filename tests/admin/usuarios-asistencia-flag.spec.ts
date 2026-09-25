// tests/admin/usuarios-asistencia-flag.spec.ts
// Bug: el control de asistencia listaba TODOS los agentes (mesas sin seccion de
// asistencia y usuarios con cronograma apagado). Fix: flag agents.enAsistencia
// (invariante: asistencia ⊆ cronograma) + filtro en getAttendanceData + switch
// en alta/edicion solo para mesas participativas.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents, operatorAttendance } from "../../src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${sig}`;
}

const MDA_TI_MESA = "TI_GSM_MDA TI";
const COORD_MESA = "TI_GSM_Mesa de Coord";
const VALID_PASSWORD = "CambiarEst0!Clave";

test.describe("Flag de asistencia por agente", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;
  const createdUsernames: string[] = [];
  const createdAgentIds: number[] = [];
  const createdUserIds: number[] = [];
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    const desired = [
      { name: MDA_TI_MESA, fallbackId: 910001 },
      { name: COORD_MESA, fallbackId: 910002 },
    ];
    for (const d of desired) {
      const [existing] = await db
        .select({ invgateId: mesas.invgateId })
        .from(mesas)
        .where(eq(mesas.name, d.name));
      if (!existing) {
        await db
          .insert(mesas)
          .values({
            invgateId: d.fallbackId,
            name: d.name,
            displayName: null,
            active: true,
            assignable: true,
            lastSyncedAt: new Date().toISOString(),
          })
          .onConflictDoNothing();
      }
    }

    const ts = Date.now();
    const adminUsername = `admin_asistflag_${ts}`;
    adminSession = `sess_asistflag_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db
      .insert(sessions)
      .values({ id: adminSession, userId: adminId, expiresAt: Date.now() + 86400000 });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    if (createdSessionIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.id, createdSessionIds));
    }
    if (createdAgentIds.length > 0) {
      await db.delete(operatorAttendance).where(inArray(operatorAttendance.agentId, createdAgentIds));
      await db.delete(agents).where(inArray(agents.id, createdAgentIds));
    }
    await db
      .delete(agents)
      .where(inArray(agents.username, createdUsernames.length ? createdUsernames : [""]));
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function baseURL(): Promise<string> {
    return test.info().project.use.baseURL ?? "http://localhost:4321";
  }

  async function seedAgent(opts: {
    role?: string;
    mesaName: string | null;
    enCronograma: boolean;
    enAsistencia: boolean;
  }): Promise<{ userId: number; agentId: number; username: string }> {
    const uname = `asistflag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const [m] = opts.mesaName
      ? await db
          .select({ invgateId: mesas.invgateId })
          .from(mesas)
          .where(eq(mesas.name, opts.mesaName))
      : [undefined];
    const [u] = await db
      .insert(users)
      .values({
        username: uname,
        password: "x",
        role: opts.role ?? "agent",
        helpdeskId: m?.invgateId ?? null,
        helpdeskName: opts.mesaName,
      })
      .returning({ id: users.id });
    const [a] = await db
      .insert(agents)
      .values({
        name: uname.toUpperCase(),
        username: uname,
        userId: u.id,
        enCronograma: opts.enCronograma,
        enAsistencia: opts.enAsistencia,
      })
      .returning({ id: agents.id });
    createdUsernames.push(uname);
    createdUserIds.push(u.id);
    createdAgentIds.push(a.id);
    return { userId: u.id, agentId: a.id, username: uname };
  }

  async function makeSession(userId: number): Promise<string> {
    const id = `sess_asistflag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db
      .insert(sessions)
      .values({ id, userId, expiresAt: Date.now() + 86400000 });
    createdSessionIds.push(id);
    return sign(id);
  }

  async function mdMesaId(mesaName: string): Promise<number> {
    const [m] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, mesaName));
    return m.id;
  }

  function todayAr(): string {
    return new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
  }

  async function listedAgentIds(
    context: import("@playwright/test").BrowserContext,
    date: string,
  ): Promise<Set<number>> {
    const res = await context.request.get(
      new URL(`/api/asistencia?startDate=${date}&endDate=${date}`, await baseURL()).href,
    );
    expect(res.status()).toBe(200);
    const rows = (await res.json()) as Array<{ agentId: number }>;
    return new Set(rows.map((r) => r.agentId));
  }

  test("GET /api/asistencia solo lista agentes con enAsistencia=true", async ({ context }) => {
    const visible = await seedAgent({
      mesaName: MDA_TI_MESA,
      enCronograma: true,
      enAsistencia: true,
    });
    const flagOff = await seedAgent({
      mesaName: MDA_TI_MESA,
      enCronograma: true,
      enAsistencia: false,
    });
    const coord = await seedAgent({
      mesaName: COORD_MESA,
      enCronograma: true,
      enAsistencia: false,
    });

    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(await baseURL()).hostname, path: "/" },
    ]);
    const res = await context.request.get(
      new URL("/api/asistencia?startDate=2026-05-11&endDate=2026-05-11", await baseURL()).href,
    );
    expect(res.status()).toBe(200);
    const rows = (await res.json()) as Array<{ agentId: number }>;
    const ids = new Set(rows.map((r) => r.agentId));

    expect(ids.has(visible.agentId)).toBe(true);
    expect(ids.has(flagOff.agentId)).toBe(false);
    expect(ids.has(coord.agentId)).toBe(false);
  });

  test("alta MDA TI con asistencia persiste enCronograma + enAsistencia", async ({ context }) => {
    const uname = `asistcreate_${Date.now()}`;
    createdUsernames.push(uname);
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(await baseURL()).hostname, path: "/" },
    ]);
    const res = await context.request.post(`${await baseURL()}/admin/usuarios`, {
      form: {
        action: "create",
        username: uname,
        password: VALID_PASSWORD,
        passwordRepeat: VALID_PASSWORD,
        name: `Asist Create ${uname}`,
        role: "agent",
        helpdesk: `${(await db.select({ id: mesas.invgateId }).from(mesas).where(eq(mesas.name, MDA_TI_MESA)))[0].id}|${MDA_TI_MESA}`,
        enCronograma: "on",
        enAsistencia: "on",
      },
      headers: { Accept: "application/json" },
    });
    expect(res.status()).toBe(200);
    const [row] = await db
      .select({ enCronograma: agents.enCronograma, enAsistencia: agents.enAsistencia })
      .from(agents)
      .where(eq(agents.username, uname));
    expect(row.enCronograma).toBe(true);
    expect(row.enAsistencia).toBe(true);
    const [a] = await db.select({ id: agents.id }).from(agents).where(eq(agents.username, uname));
    createdAgentIds.push(a.id);
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, uname));
    createdUserIds.push(u.id);
  });

  test("alta en mesa sin asistencia (Coord) fuerza enAsistencia=false", async ({ context }) => {
    const uname = `asistcoord_${Date.now()}`;
    createdUsernames.push(uname);
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(await baseURL()).hostname, path: "/" },
    ]);
    const res = await context.request.post(`${await baseURL()}/admin/usuarios`, {
      form: {
        action: "create",
        username: uname,
        password: VALID_PASSWORD,
        passwordRepeat: VALID_PASSWORD,
        name: `Asist Coord ${uname}`,
        role: "agent",
        helpdesk: `${(await db.select({ id: mesas.invgateId }).from(mesas).where(eq(mesas.name, COORD_MESA)))[0].id}|${COORD_MESA}`,
        enCronograma: "on",
        enAsistencia: "on",
      },
      headers: { Accept: "application/json" },
    });
    expect(res.status()).toBe(200);
    const [row] = await db
      .select({ enCronograma: agents.enCronograma, enAsistencia: agents.enAsistencia })
      .from(agents)
      .where(eq(agents.username, uname));
    expect(row.enCronograma).toBe(false);
    expect(row.enAsistencia).toBe(false);
    const [a] = await db.select({ id: agents.id }).from(agents).where(eq(agents.username, uname));
    createdAgentIds.push(a.id);
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, uname));
    createdUserIds.push(u.id);
  });

  test("invariante: asistencia sin cronograma se apaga al guardar", async ({ context }) => {
    const uname = `asistnocron_${Date.now()}`;
    createdUsernames.push(uname);
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(await baseURL()).hostname, path: "/" },
    ]);
    const res = await context.request.post(`${await baseURL()}/admin/usuarios`, {
      form: {
        action: "create",
        username: uname,
        password: VALID_PASSWORD,
        passwordRepeat: VALID_PASSWORD,
        name: `Asist NoCron ${uname}`,
        role: "agent",
        helpdesk: `${(await db.select({ id: mesas.invgateId }).from(mesas).where(eq(mesas.name, MDA_TI_MESA)))[0].id}|${MDA_TI_MESA}`,
        enAsistencia: "on",
      },
      headers: { Accept: "application/json" },
    });
    expect(res.status()).toBe(200);
    const [row] = await db
      .select({ enCronograma: agents.enCronograma, enAsistencia: agents.enAsistencia })
      .from(agents)
      .where(eq(agents.username, uname));
    expect(row.enCronograma).toBe(false);
    expect(row.enAsistencia).toBe(false);
    const [a] = await db.select({ id: agents.id }).from(agents).where(eq(agents.username, uname));
    createdAgentIds.push(a.id);
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, uname));
    createdUserIds.push(u.id);
  });

  test("DELETE /api/cronograma/operators limpia enAsistencia", async ({ context }) => {
    const seeded = await seedAgent({
      mesaName: MDA_TI_MESA,
      enCronograma: true,
      enAsistencia: true,
    });
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(await baseURL()).hostname, path: "/" },
    ]);
    const res = await context.request.delete(`${await baseURL()}/api/cronograma/operators`, {
      data: { name: seeded.username.toUpperCase() },
      headers: { Accept: "application/json" },
    });
    expect(res.status()).toBe(200);
    const [row] = await db
      .select({ enCronograma: agents.enCronograma, enAsistencia: agents.enAsistencia })
      .from(agents)
      .where(eq(agents.id, seeded.agentId));
    expect(row.enCronograma).toBe(false);
    expect(row.enAsistencia).toBe(false);
  });

  test("desmarcar asistencia oculta al operador pero conserva los registros y no bloquea el acceso", async ({
    context,
  }) => {
    const seeded = await seedAgent({
      mesaName: MDA_TI_MESA,
      enCronograma: true,
      enAsistencia: true,
    });
    const mesaId = await mdMesaId(MDA_TI_MESA);
    const date = todayAr();
    const year = date.slice(0, 4);
    const base = await baseURL();
    await context.addCookies([
      { name: "session_id", value: adminCookie, domain: new URL(base).hostname, path: "/" },
    ]);

    const recordCount = async () =>
      (
        await db
          .select({ id: operatorAttendance.id })
          .from(operatorAttendance)
          .where(eq(operatorAttendance.agentId, seeded.agentId))
      ).length;
    const postAttendance = (asistencia: string) =>
      context.request.post(`${base}/api/asistencia`, {
        data: {
          date,
          edits: [
            {
              agentId: seeded.agentId,
              shiftType: "normal",
              asistencia,
              entradaReal: "09:05",
              horarioEstipulado: "08:00 - 17:00",
              ausencia: "",
              motivoLoguin: "",
              detalle: "e2e-flag",
            },
          ],
        },
        headers: { Accept: "application/json" },
      });

    // 1. Registro de asistencia real + visible en el listado.
    expect((await postAttendance("HOME OFFICE")).status()).toBe(200);
    expect(await recordCount()).toBe(1);
    expect((await listedAgentIds(context, date)).has(seeded.agentId)).toBe(true);

    // 2. Desmarcar el flag (cronograma sigue activo).
    const off = await context.request.post(`${base}/admin/usuarios`, {
      form: {
        action: "update-user",
        userId: seeded.userId,
        username: seeded.username,
        name: seeded.username.toUpperCase(),
        newRole: "agent",
        helpdesk: `${mesaId}|${MDA_TI_MESA}`,
        enCronograma: "on",
      },
      headers: { Accept: "application/json" },
    });
    expect(off.status()).toBe(200);
    const [afterOff] = await db
      .select({ enCronograma: agents.enCronograma, enAsistencia: agents.enAsistencia })
      .from(agents)
      .where(eq(agents.id, seeded.agentId));
    expect(afterOff.enCronograma).toBe(true);
    expect(afterOff.enAsistencia).toBe(false);

    // 3. El registro NO se borra y sigue accesible por el endpoint del operador.
    expect(await recordCount()).toBe(1);
    const opRes = await context.request.get(
      `${base}/api/asistencia/operador/${seeded.agentId}?year=${year}&month=all`,
    );
    expect(opRes.status()).toBe(200);
    const opData = (await opRes.json()) as { records: Array<{ date: string }> };
    expect(opData.records.some((r) => r.date === date)).toBe(true);

    // 4. Oculto en el listado, pero la escritura sigue habilitada (flag = visibilidad).
    expect((await listedAgentIds(context, date)).has(seeded.agentId)).toBe(false);
    expect((await postAttendance("HOME OFFICE 2")).status()).toBe(200);
    expect(await recordCount()).toBe(1);
    const [updated] = await db
      .select({ asistencia: operatorAttendance.asistencia })
      .from(operatorAttendance)
      .where(eq(operatorAttendance.agentId, seeded.agentId));
    expect(updated.asistencia).toBe("HOME OFFICE 2");

    // 5. Re-activar el flag restaura la visibilidad con el registro intacto.
    const on = await context.request.post(`${base}/admin/usuarios`, {
      form: {
        action: "update-user",
        userId: seeded.userId,
        username: seeded.username,
        name: seeded.username.toUpperCase(),
        newRole: "agent",
        helpdesk: `${mesaId}|${MDA_TI_MESA}`,
        enCronograma: "on",
        enAsistencia: "on",
      },
      headers: { Accept: "application/json" },
    });
    expect(on.status()).toBe(200);
    expect((await listedAgentIds(context, date)).has(seeded.agentId)).toBe(true);
    expect(await recordCount()).toBe(1);
  });

  test("el acceso a asistencia lo define la mesa, no el flag", async ({ context }) => {
    const supMdaTi = await seedAgent({
      role: "supervisor",
      mesaName: MDA_TI_MESA,
      enCronograma: false,
      enAsistencia: false,
    });
    const supCoord = await seedAgent({
      role: "supervisor",
      mesaName: COORD_MESA,
      enCronograma: false,
      enAsistencia: false,
    });
    const date = todayAr();
    const base = await baseURL();

    // Supervisor de MDA TI con el flag apagado: la sección sigue accesible.
    await context.addCookies([
      { name: "session_id", value: await makeSession(supMdaTi.userId), domain: new URL(base).hostname, path: "/" },
    ]);
    const mdaRes = await context.request.get(
      new URL(`/api/asistencia?startDate=${date}&endDate=${date}`, base).href,
    );
    expect(mdaRes.status()).toBe(200);

    // Supervisor de Coordinación: bloqueado por la mesa (no por el flag).
    await context.addCookies([
      { name: "session_id", value: await makeSession(supCoord.userId), domain: new URL(base).hostname, path: "/" },
    ]);
    const coordRes = await context.request.get(
      new URL(`/api/asistencia?startDate=${date}&endDate=${date}`, base).href,
    );
    expect(coordRes.status()).toBe(401);
  });
});
