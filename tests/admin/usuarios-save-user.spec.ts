// tests/admin/usuarios-save-user.spec.ts
// RED suite (Task 1): el action unificado `update-user` debe manejar rol,
// mesa, username, nombre visible y flags de participacion en un solo submit.
// Hoy el handler ignora `newRole`/`helpdesk`, asi que los tests 1 y 3 fallan;
// los de conflictos/rename fijan el contrato que Task 2 debe preservar.
import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, schedules, mesas } from "../../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";
const sign = (id: string) =>
  `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

interface Flags {
  enCronograma: boolean;
  asignableCubic: boolean;
  incluidoCalidad: boolean;
  asignableAgs: boolean;
}

const ALL_FALSE: Flags = {
  enCronograma: false,
  asignableCubic: false,
  incluidoCalidad: false,
  asignableAgs: false,
};

test.describe("update-user unificado (rol + mesa + flags + rename)", () => {
  let adminSession: string;
  let adminId: number;
  let adminUsername: string;
  let adminCookie: string;
  const createdUserIds: number[] = [];
  const createdScheduleIds: number[] = [];

  test.beforeAll(async () => {
    // Asegurar mesas por NOMBRE (invgateId varia segun entorno).
    const desired = [
      { name: MDA, fallbackId: 910010 },
      { name: COORD, fallbackId: 910011 },
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
    adminUsername = `admin_saveuser_${ts}`;
    adminSession = `sess_saveuser_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: adminUsername, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({
      id: adminSession,
      userId: adminId,
      expiresAt: Date.now() + 86400000,
    });
    adminCookie = sign(adminSession);
  });

  test.beforeEach(async ({ context }) => {
    // Host-agnostico: deriva el dominio del baseURL del proyecto.
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    if (createdScheduleIds.length > 0) {
      await db.delete(schedules).where(inArray(schedules.id, createdScheduleIds));
    }
    if (createdUserIds.length > 0) {
      // Agents primero (identidad por user_id), despues users.
      await db.delete(agents).where(inArray(agents.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function mesaId(name: string): Promise<number> {
    const [m] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, name));
    if (!m) throw new Error(`mesa inexistente en DB de test: ${name}`);
    return m.invgateId;
  }

  async function seed(opts: {
    username: string;
    role?: string;
    mesa?: string | null;
    name?: string;
    flags?: Partial<Flags>;
  }): Promise<{ userId: number; agentId: number; agentName: string }> {
    const { username, role = "agent", mesa = MDA } = opts;
    const agentName = opts.name ?? username.toUpperCase();
    const flags: Flags = { ...ALL_FALSE, ...opts.flags };
    const [m] = mesa
      ? await db
          .select({ invgateId: mesas.invgateId })
          .from(mesas)
          .where(eq(mesas.name, mesa))
      : [undefined];
    const [u] = await db
      .insert(users)
      .values({
        username,
        password: "x",
        role,
        helpdeskId: m?.invgateId ?? null,
        helpdeskName: mesa,
      })
      .returning({ id: users.id });
    const [a] = await db
      .insert(agents)
      .values({ name: agentName, userId: u.id, ...flags })
      .returning({ id: agents.id });
    createdUserIds.push(u.id);
    return { userId: u.id, agentId: a.id, agentName };
  }

  async function readFlags(agentId: number): Promise<Flags> {
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
  }

  async function post(context: BrowserContext, form: Record<string, string>) {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    return context.request.post(new URL("/admin/usuarios", baseURL).href, {
      form: { action: "update-user", ...form },
      headers: { Accept: "application/json" },
    });
  }

  test("rol + mesa + flags en un submit: mover a Coordinacion resetea participaciones", async ({
    context,
  }) => {
    const uname = `save_move_${Date.now()}`;
    const { userId, agentId, agentName } = await seed({
      username: uname,
      role: "agent",
      mesa: MDA,
      flags: {
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      },
    });
    const coordId = await mesaId(COORD);

    const res = await post(context, {
      userId: String(userId),
      username: uname,
      name: agentName,
      newRole: "referent",
      helpdesk: `${coordId}|${COORD}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const [u] = await db
      .select({
        role: users.role,
        helpdeskId: users.helpdeskId,
        helpdeskName: users.helpdeskName,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(u.role).toBe("referent");
    expect(u.helpdeskId).toBe(coordId);
    expect(u.helpdeskName).toBe(COORD);
    expect(await readFlags(agentId)).toEqual(ALL_FALSE);
  });

  test("misma mesa participativa: preserva rol y persiste flags enviados", async ({
    context,
  }) => {
    const uname = `save_keep_${Date.now()}`;
    const { userId, agentId } = await seed({
      username: uname,
      role: "team_leader",
      mesa: MDA,
      flags: { enCronograma: true },
    });
    const mdaId = await mesaId(MDA);

    const res = await post(context, {
      userId: String(userId),
      username: uname,
      name: uname.toUpperCase(),
      newRole: "team_leader",
      helpdesk: `${mdaId}|${MDA}`,
      enCronograma: "on",
      asignableCubic: "on",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const [u] = await db
      .select({ role: users.role, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.id, userId));
    expect(u.role).toBe("team_leader");
    expect(u.helpdeskName).toBe(MDA);
    expect(await readFlags(agentId)).toEqual({
      enCronograma: true,
      asignableCubic: true,
      incluidoCalidad: false,
      asignableAgs: false,
    });
  });

  test("supervisor: enCronograma forzado a false aunque se envie on", async ({
    context,
  }) => {
    const uname = `save_sup_${Date.now()}`;
    const { userId, agentId } = await seed({
      username: uname,
      role: "agent",
      mesa: MDA,
      flags: { enCronograma: true, incluidoCalidad: true },
    });
    const mdaId = await mesaId(MDA);

    const res = await post(context, {
      userId: String(userId),
      username: uname,
      name: uname.toUpperCase(),
      newRole: "supervisor",
      helpdesk: `${mdaId}|${MDA}`,
      enCronograma: "on",
      incluidoCalidad: "on",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const [u] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    expect(u.role).toBe("supervisor");
    const flags = await readFlags(agentId);
    expect(flags.enCronograma).toBe(false);
    expect(flags.incluidoCalidad).toBe(true);
  });

  test("rename de username + nombre visible NO toca schedules", async ({
    context,
  }) => {
    const ts = Date.now();
    const uname = `save_rename_${ts}`;
    const oldName = `SAVE RENAME OLD ${ts}`;
    const newUname = `save_renamed_${ts}`;
    const newName = `SAVE RENAMED ${ts}`;
    const { userId, agentId } = await seed({
      username: uname,
      role: "agent",
      mesa: MDA,
      name: oldName,
    });
    const mdaId = await mesaId(MDA);
    const [sched] = await db
      .insert(schedules)
      .values({ agentId, date: "2026-02-01", status: "Trabajo" })
      .returning({ id: schedules.id });
    createdScheduleIds.push(sched.id);

    const res = await post(context, {
      userId: String(userId),
      username: newUname,
      name: newName,
      newRole: "agent",
      helpdesk: `${mdaId}|${MDA}`,
      enCronograma: "on",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const [u] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId));
    expect(u.username).toBe(newUname);
    // Plan B: la identidad del agente es user_id. El rename de red actualiza
    // users.username; la fila agents conserva su id y su nombre visible se
    // actualiza por el campo `name` del form (no por el username).
    const [a] = await db
      .select({ name: agents.name, userId: agents.userId })
      .from(agents)
      .where(eq(agents.id, agentId));
    expect(a.userId).toBe(userId);
    expect(a.name).toBe(newName);
    // El rename ya no propaga a schedules (los lectores vinculan por agentId):
    // la fila sembrada queda intacta, sin cambios de status.
    const rows = await db
      .select({ status: schedules.status, agentId: schedules.agentId })
      .from(schedules)
      .where(eq(schedules.id, sched.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Trabajo");
    expect(rows[0].agentId).toBe(agentId);

    // El username del operador en el payload del cronograma viene del join
    // users por user_id: refleja el username NUEVO tras el rename.
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const payloadRes = await context.request.get(
      new URL("/api/cronograma?month=2026-02", baseURL).href,
    );
    expect(payloadRes.status()).toBe(200);
    const cronograma = await payloadRes.json();
    const op = cronograma.operators.find((o: any) => o.id === agentId);
    expect(op).toBeTruthy();
    expect(op.username).toBe(newUname);
  });

  test("conflictos: username duplicado, nombre duplicado, usuario inexistente y autoedicion", async ({
    context,
  }) => {
    const ts = Date.now();
    const unameA = `save_conf_a_${ts}`;
    const unameB = `save_conf_b_${ts}`;
    const nameB = unameB.toUpperCase();
    const { userId: idA } = await seed({ username: unameA, mesa: MDA });
    await seed({ username: unameB, mesa: MDA, name: nameB });
    const mdaId = await mesaId(MDA);
    const base = { newRole: "agent", helpdesk: `${mdaId}|${MDA}` };

    // 1. Username duplicado.
    const dupUser = await post(context, {
      ...base,
      userId: String(idA),
      username: unameB,
      name: unameA.toUpperCase(),
    });
    expect(dupUser.status()).toBe(400);
    expect(JSON.stringify(await dupUser.json())).toMatch(/nombre de usuario ya existe/);

    // 2. Nombre visible duplicado (agents.name UNIQUE).
    const dupName = await post(context, {
      ...base,
      userId: String(idA),
      username: unameA,
      name: nameB,
    });
    expect(dupName.status()).toBe(400);
    expect(JSON.stringify(await dupName.json())).toMatch(/nombre completo/);

    // 3. Usuario inexistente (id garantizado ausente: max + offset,
    // nunca hardcodeado — mda.db es copia de prod y 999999 podria existir).
    const [{ maxId }] = await db
      .select({ maxId: sql<number>`max(${users.id})` })
      .from(users);
    const ghostId = (maxId ?? 0) + 1000000;
    const missing = await post(context, {
      ...base,
      userId: String(ghostId),
      username: `save_ghost_${ts}`,
      name: `SAVE GHOST ${ts}`,
    });
    expect(missing.status()).toBe(400);
    expect(JSON.stringify(await missing.json())).toMatch(/no encontrado/);

    // 4. Autoedicion bloqueada (username unico con ts: jamas toca filas reales,
    // sin push a cleanup — el POST 400 no debe crear nada).
    const selfUname = `save_self_${ts}`;
    const self = await post(context, {
      userId: String(adminId),
      username: selfUname,
      name: "X",
      newRole: "admin",
      helpdesk: `${mdaId}|${MDA}`,
    });
    expect(self.status()).toBe(400);
    expect(JSON.stringify(await self.json())).toMatch(/No podés editar tu propio usuario/);

    // 5. Nada cambio en DB: fila A intacta y admin intacto.
    const [rowA] = await db
      .select({
        username: users.username,
        role: users.role,
        helpdeskName: users.helpdeskName,
      })
      .from(users)
      .where(eq(users.id, idA));
    expect(rowA).toEqual({ username: unameA, role: "agent", helpdeskName: MDA });
    const [adminRow] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, adminId));
    expect(adminRow.username).toBe(adminUsername);
    const agentSelf = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.userId, adminId));
    expect(agentSelf.length).toBe(0);
  });
});
