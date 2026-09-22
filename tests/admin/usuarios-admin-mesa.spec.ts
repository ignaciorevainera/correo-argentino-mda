// tests/admin/usuarios-admin-mesa.spec.ts
// Guard server-side: el rol `admin` solo puede asignarse a la mesa MDA TI.
// Cualquier otra mesa (Coordinacion y futuras) acepta todos los roles menos
// `admin`, tanto en el alta (action=create) como en la edicion
// (action=update-user). Los invgateId se leen de la DB de test (no hardcode).
import "dotenv/config";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, agents, mesas } from "../../src/db/schema";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

const MDA_TI = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";
const ADMIN_MESA_ERROR = "administrador solo puede asignarse a la mesa MDA TI";
const PREFIX = "e2e_adminmesa_";

test.describe("rol admin restringido a mesa MDA TI", () => {
  let adminSession: string;
  let adminId: number;
  let adminCookie: string;
  let mdaInvgateId: number;
  let coordInvgateId: number;
  const createdUsernames: string[] = [];

  test.beforeAll(async () => {
    // Asegurar mesas por NOMBRE (invgateId varia segun entorno) y leer el
    // invgateId real desde la DB para no hardcodearlo.
    const desired = [
      { name: MDA_TI, fallbackId: 910001 },
      { name: COORD, fallbackId: 910002 },
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

    const [mda] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI));
    const [coord] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, COORD));
    expect(mda, `mesa ${MDA_TI} disponible`).toBeTruthy();
    expect(coord, `mesa ${COORD} disponible`).toBeTruthy();
    mdaInvgateId = mda.invgateId;
    coordInvgateId = coord.invgateId;

    const ts = Date.now();
    adminSession = `sess_adminmesa_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_adminmesa_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({
      id: adminSession,
      userId: adminId,
      expiresAt: Date.now() + 86400000,
    });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    if (createdUsernames.length > 0) {
      await db.delete(agents).where(inArray(agents.username, createdUsernames));
      await db.delete(users).where(inArray(users.username, createdUsernames));
    }
    await db.delete(users).where(eq(users.id, adminId));
  });

  async function seedUser(
    username: string,
    role: string,
    mesaName: string,
  ): Promise<{ userId: number; agentId: number }> {
    const [m] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, mesaName));
    const [u] = await db
      .insert(users)
      .values({
        username,
        password: "x",
        role,
        helpdeskId: m?.invgateId ?? null,
        helpdeskName: mesaName,
      })
      .returning({ id: users.id });
    const [a] = await db
      .insert(agents)
      .values({ name: `${username}_NAME`, username })
      .returning({ id: agents.id });
    createdUsernames.push(username);
    return { userId: u.id, agentId: a.id };
  }

  async function post(
    context: BrowserContext,
    form: Record<string, string>,
  ) {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    return context.request.post(new URL("/admin/usuarios", baseURL).href, {
      form,
      headers: { Accept: "application/json" },
    });
  }

  async function login(context: BrowserContext): Promise<void> {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
  }

  test("CREATE: role=admin + Coordinacion -> 400 y sin fila de usuario", async ({
    context,
  }) => {
    await login(context);
    const uname = `${PREFIX}create_admin_coord_${Date.now()}`;
    const res = await post(context, {
      action: "create",
      username: uname,
      password: "Password.123",
      role: "admin",
      name: `${uname}_NAME`,
      helpdesk: `${coordInvgateId}|${COORD}`,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain(ADMIN_MESA_ERROR);

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, uname));
    expect(rows.length).toBe(0);
    const agentRows = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.username, uname));
    expect(agentRows.length).toBe(0);
  });

  test("CREATE: role=admin + MDA TI -> success y fila creada", async ({
    context,
  }) => {
    await login(context);
    const uname = `${PREFIX}create_admin_mda_${Date.now()}`;
    const res = await post(context, {
      action: "create",
      username: uname,
      password: "Password.123",
      role: "admin",
      name: `${uname}_NAME`,
      helpdesk: `${mdaInvgateId}|${MDA_TI}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const rows = await db
      .select({ id: users.id, role: users.role, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.username, uname));
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("admin");
    expect(rows[0].helpdeskName).toBe(MDA_TI);
    createdUsernames.push(uname);
  });

  test("CREATE: role=agent + Coordinacion -> success (otros roles permitidos)", async ({
    context,
  }) => {
    await login(context);
    const uname = `${PREFIX}create_agent_coord_${Date.now()}`;
    const res = await post(context, {
      action: "create",
      username: uname,
      password: "Password.123",
      role: "agent",
      name: `${uname}_NAME`,
      helpdesk: `${coordInvgateId}|${COORD}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const rows = await db
      .select({ id: users.id, role: users.role, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.username, uname));
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe("agent");
    expect(rows[0].helpdeskName).toBe(COORD);
    createdUsernames.push(uname);
  });

  test("UPDATE: agente en Coordinacion -> newRole=admin rechazado y rol intacto", async ({
    context,
  }) => {
    await login(context);
    const uname = `${PREFIX}update_admin_coord_${Date.now()}`;
    const { userId } = await seedUser(uname, "agent", COORD);

    const res = await post(context, {
      action: "update-user",
      userId: String(userId),
      username: uname,
      name: `${uname}_NAME`,
      newRole: "admin",
      helpdesk: `${coordInvgateId}|${COORD}`,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain(ADMIN_MESA_ERROR);

    const [row] = await db
      .select({ role: users.role, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.id, userId));
    expect(row.role).toBe("agent");
    expect(row.helpdeskName).toBe(COORD);
  });

  test("UPDATE: usuario MDA TI -> newRole=admin permitido", async ({
    context,
  }) => {
    await login(context);
    const uname = `${PREFIX}update_admin_mda_${Date.now()}`;
    const { userId } = await seedUser(uname, "agent", MDA_TI);

    const res = await post(context, {
      action: "update-user",
      userId: String(userId),
      username: uname,
      name: `${uname}_NAME`,
      newRole: "admin",
      helpdesk: `${mdaInvgateId}|${MDA_TI}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const [row] = await db
      .select({ role: users.role, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.id, userId));
    expect(row.role).toBe("admin");
    expect(row.helpdeskName).toBe(MDA_TI);
  });
});
