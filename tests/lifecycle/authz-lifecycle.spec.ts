// tests/lifecycle/authz-lifecycle.spec.ts
//
// Simulacion E2E del ciclo de vida de un usuario contra el servidor real
// (http://127.0.0.1:4321):
//   1. alta de usuario via POST /admin/usuarios (accion `create`),
//   2. asignacion de mesa + rol,
//   3. login real (una muestra) y sesion de test para el resto,
//   4. verificacion de la matriz efectiva rol x mesa.
//
// La matriz efectiva es la interseccion de las DOS capas:
//   - rbac.hasPermission(role, path)          -> rol
//   - isSectionVisibleSync(mesa, role, path)  -> mesa
// El resultado esperado se hardcodea a partir del contrato documentado en
// docs/CONTEXT.md (no se importan las funciones, para no validar el codigo
// contra si mismo).
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db/index";
import { users, sessions, mesas, agents } from "../../src/db/schema";
import {
  MDA_TI_HELPDESK,
  COORD_HELPDESK,
} from "../../src/lib/helpdeskAccess";

const BASE = "http://localhost:4321";
const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const PASSWORD = "Password.123";

function sign(sessionId: string): string {
  return `${sessionId}.${createHmac("sha256", SECRET).update(sessionId).digest("base64url")}`;
}

function cookieHeader(sessionId: string): string {
  return `session_id=${sign(sessionId)}`;
}

async function fetchManual(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  return fetch(`${BASE}${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
}

async function getStatus(
  cookie: string,
  path: string,
): Promise<{ status: number; location: string | null }> {
  const res = await fetchManual(path, { cookie });
  return { status: res.status, location: res.headers.get("location") };
}

async function postJson(
  cookie: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetchManual(path, {
    method: "POST",
    cookie,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* body no JSON */
  }
  return { status: res.status, json };
}

async function adminForm(
  cookie: string,
  form: Record<string, string>,
): Promise<{ status: number; json: any }> {
  const res = await fetchManual("/admin/usuarios", {
    method: "POST",
    cookie,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* redirect */
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Rutas a evaluar y matriz esperada (contrato).
// ---------------------------------------------------------------------------
const ROUTES = {
  common_titulos: "/titulos",
  common_oficinas: "/oficinas",
  sup_root: "/supervision",
  sup_cronograma: "/supervision/cronograma",
  sup_calidad: "/supervision/calidad-operadores",
  sup_ags: "/supervision/asignacion-autogestiones",
  sup_asistencia: "/supervision/asistencia",
  cubics_create: "/inventario-terminales/cubics/create",
  admin_root: "/admin",
  admin_usuarios: "/admin/usuarios",
  admin_permisos: "/admin/permisos",
  admin_auditoria: "/admin/auditoria",
  admin_feedback: "/admin/feedback",
} as const;
type RouteKey = keyof typeof ROUTES;

type RoleKey = "agent" | "referent" | "team_leader" | "supervisor";
type MesaKey = "mda" | "coord" | "none";

const ROLES: RoleKey[] = ["agent", "referent", "team_leader", "supervisor"];
const MESAS: MesaKey[] = ["mda", "coord", "none"];

function expectedAllowed(role: RoleKey, mesa: MesaKey, key: RouteKey): boolean {
  if (key.startsWith("common")) return true;
  // Mesa distinta de MDA TI (Coord o sin mesa): la capa de mesa bloquea
  // supervision/cubics/admin completos; el resto lo bloquea el rol.
  if (mesa !== "mda") return false;
  const superior = role === "team_leader" || role === "supervisor";
  switch (key) {
    case "sup_root":
    case "sup_cronograma":
    case "sup_calidad":
    case "sup_ags":
      return true; // rbac: todos los roles; mesa MDA TI: visible
    case "sup_asistencia":
      return superior; // mesa MDA TI: solo team_leader/supervisor
    case "cubics_create":
      return role === "supervisor"; // rbac: admin/supervisor
    case "admin_root":
      return superior; // rbac: admin/supervisor/team_leader
    case "admin_usuarios":
    case "admin_permisos":
    case "admin_auditoria":
    case "admin_feedback":
      return false; // rbac: admin only
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
interface CreatedUser {
  id: number;
  username: string;
  sessionId: string;
  cookie: string;
  role: string;
  helpdeskId: number | null;
  helpdeskName: string | null;
}

const createdUserIds: number[] = [];
const createdUsernames: string[] = [];
const allSessionIds: string[] = [];
let adminSessionId = "";
let adminCookie = "";
let mdaId = 0;
let coordId = 0;
let inactiveMesaId = 990001;

const matrix: Record<string, CreatedUser> = {};
const legacy: Record<string, CreatedUser> = {};

// El form de login tiene maxlength=30 y pattern alfanumerico: los usernames de
// prueba deben entrar en ese molde para el test de login real.
function shortUsername(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function registerCreatedUser(id: number, username: string): void {
  createdUserIds.push(id);
  createdUsernames.push(username);
}

async function insertSession(userId: number): Promise<{ id: string; cookie: string }> {
  const id = `sess_life_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
  allSessionIds.push(id);
  return { id, cookie: cookieHeader(id) };
}

async function createUserViaDb(
  username: string,
  role: string,
  helpdeskId: number | null,
  helpdeskName: string | null,
): Promise<CreatedUser> {
  const [u] = await db
    .insert(users)
    .values({ username, password: "x", role, helpdeskId, helpdeskName })
    .returning({ id: users.id });
  const { id: sessionId, cookie } = await insertSession(u.id);
  registerCreatedUser(u.id, username);
  return { id: u.id, username, sessionId, cookie, role, helpdeskId, helpdeskName };
}

test.describe("Ciclo de vida de usuario y autorización efectiva", () => {
  test.beforeAll(async () => {
    const [mda] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA_TI_HELPDESK));
    const [coord] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, COORD_HELPDESK));
    expect(mda?.id, "mesa MDA TI debe existir").toBeTruthy();
    expect(coord?.id, "mesa Coord debe existir").toBeTruthy();
    mdaId = mda.id;
    coordId = coord.id;

    // Mesa inactiva para el caso fail-closed.
    const [inactive] = await db
      .select({ id: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.invgateId, inactiveMesaId));
    if (!inactive) {
      await db.insert(mesas).values({
        invgateId: inactiveMesaId,
        name: "TEST_LIFECYCLE_INACTIVA",
        displayName: null,
        active: false,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    // Admin de la simulacion (bypass de password, como el resto de la suite).
    const adminUsername = shortUsername("admlf");
    const [admin] = await db
      .insert(users)
      .values({
        username: adminUsername,
        password: "x",
        role: "admin",
        helpdeskId: mdaId,
        helpdeskName: MDA_TI_HELPDESK,
      })
      .returning({ id: users.id });
    registerCreatedUser(admin.id, adminUsername);
    const s = await insertSession(admin.id);
    adminSessionId = s.id;
    adminCookie = s.cookie;

    // Alta REAL via POST /admin/usuarios (accion create) para cada rol x mesa
    // participativa. "Sin mesa" no es creable por API (mesa obligatoria), se
    // siembra por DB para representar usuarios huerfanos preexistentes.
    const roleCode: Record<RoleKey, string> = {
      agent: "a",
      referent: "r",
      team_leader: "t",
      supervisor: "s",
    };
    const mesaCode: Record<MesaKey, string> = { mda: "m", coord: "c", none: "n" };
    for (const role of ROLES) {
      for (const mesa of MESAS) {
        const username = shortUsername(`lf${roleCode[role]}${mesaCode[mesa]}`);
        if (mesa === "none") {
          matrix[`${role}|none`] = await createUserViaDb(username, role, null, null);
          continue;
        }
        const hd = mesa === "mda" ? { id: mdaId, name: MDA_TI_HELPDESK } : { id: coordId, name: COORD_HELPDESK };
        const res = await adminForm(adminCookie, {
          action: "create",
          // name unico: agents.name tiene indice UNIQUE y se reusa entre runs.
          name: `Life ${username}`,
          username,
          password: PASSWORD,
          role,
          helpdesk: `${hd.id}|${hd.name}`,
        });
        expect(
          res.status,
          `alta ${role}/${mesa} debe ser 200 (body: ${JSON.stringify(res.json)})`,
        ).toBe(200);
        expect(res.json?.success, `alta ${role}/${mesa}`).toBe(true);
        const [row] = await db
          .select({
            id: users.id,
            role: users.role,
            helpdeskId: users.helpdeskId,
            helpdeskName: users.helpdeskName,
          })
          .from(users)
          .where(eq(users.username, username));
        expect(row, `usuario ${username} persistido`).toBeTruthy();
        const { id: sessionId, cookie } = await insertSession(row.id);
        registerCreatedUser(row.id, username);
        matrix[`${role}|${mesa}`] = {
          id: row.id,
          username,
          sessionId,
          cookie,
          role: row.role,
          helpdeskId: row.helpdeskId,
          helpdeskName: row.helpdeskName,
        };
      }
    }

    // Roles legacy (variantes historicas) asignados a MDA TI.
    legacy.Agent = await createUserViaDb(shortUsername("lga"), "Agent", mdaId, MDA_TI_HELPDESK);
    legacy.supervisor_sp = await createUserViaDb(shortUsername("lgs"), "Supervisor ", mdaId, MDA_TI_HELPDESK);
    legacy.team_leader_sp = await createUserViaDb(shortUsername("lgt"), "team leader", mdaId, MDA_TI_HELPDESK);
    legacy.Admin = await createUserViaDb(shortUsername("lgad"), "Admin", mdaId, MDA_TI_HELPDESK);
  });

  test.afterAll(async () => {
    // Borrar TODA sesion de los usuarios creados (incluye la del login real,
    // que no pasa por insertSession) para no chocar con la FK de sessions.
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    }
    if (allSessionIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.id, allSessionIds));
    }
    await db.delete(mesas).where(eq(mesas.invgateId, inactiveMesaId));
    if (createdUsernames.length > 0) {
      await db.delete(agents).where(inArray(agents.username, createdUsernames));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  // -------- Matriz rol x mesa ------------------------------------------------
  for (const role of ROLES) {
    for (const mesa of MESAS) {
      test(`matriz ${role} / ${mesa}`, async () => {
        const u = matrix[`${role}|${mesa}`];
        expect(u, `usuario de matriz ${role}|${mesa}`).toBeTruthy();
        expect(u.role).toBe(role);
        if (mesa === "mda") expect(u.helpdeskName).toBe(MDA_TI_HELPDESK);
        if (mesa === "coord") expect(u.helpdeskName).toBe(COORD_HELPDESK);

        for (const key of Object.keys(ROUTES) as RouteKey[]) {
          const path = ROUTES[key];
          const { status, location } = await getStatus(u.cookie, path);
          const allowed = expectedAllowed(role, mesa, key);
          const is3xx = status >= 300 && status < 400;
          if (allowed) {
            if (key === "sup_root") {
              // /supervision es un stub que redirige al home para quien tiene
              // acceso; el bloqueo del middleware en cambio agrega toast_msg.
              expect([200, 301, 302, 303, 307, 308]).toContain(status);
              if (is3xx) expect(location ?? "").not.toContain("toast_msg");
            } else {
              expect(status, `${role}/${mesa} GET ${path} debe permitir`).toBe(200);
            }
          } else {
            const blockedByMiddleware =
              status === 401 ||
              status === 403 ||
              (is3xx && (location ?? "").includes("toast_msg"));
            expect(
              blockedByMiddleware,
              `${role}/${mesa} GET ${path} debe bloquear (status=${status}, loc=${location})`,
            ).toBe(true);
          }
        }
      });
    }
  }

  // -------- Admin no revocable ----------------------------------------------
  test("admin ve todo (short-circuit no revocable)", async () => {
    for (const key of Object.keys(ROUTES) as RouteKey[]) {
      const { status, location } = await getStatus(adminCookie, ROUTES[key]);
      if (key === "sup_root") {
        // /supervision es stub -> redirect al home, sin toast de denegado.
        expect([200, 301, 302, 303, 307, 308]).toContain(status);
        if (status >= 300) expect(location ?? "").not.toContain("toast_msg");
      } else {
        expect(status, `admin GET ${ROUTES[key]}`).toBe(200);
      }
    }
  });

  // -------- Fail-closed mesa inactiva ---------------------------------------
  test("mesa inactiva => fail-closed (solo paginas comunes)", async () => {
    const u = await createUserViaDb(
      shortUsername("lfinact"),
      "team_leader",
      inactiveMesaId,
      "TEST_LIFECYCLE_INACTIVA",
    );
    const common = await getStatus(u.cookie, "/titulos");
    expect(common.status).toBe(200);
    const sup = await getStatus(u.cookie, "/supervision");
    expect([301, 302, 303, 307, 308]).toContain(sup.status);
    const adminRoot = await getStatus(u.cookie, "/admin");
    expect([301, 302, 303, 307, 308]).toContain(adminRoot.status);
  });

  // -------- Ciclo: cambio de rol + reset de participaciones ------------------
  test("change-role: agent Coord -> supervisor MDA TI resetea participaciones", async () => {
    const username = shortUsername("lfchg");
    const u = await createUserViaDb(username, "agent", coordId, COORD_HELPDESK);
    // La fila de agente existe y arranca sin participaciones (mesa no participativa).
    await db
      .insert(agents)
      .values({
        name: username.toUpperCase(),
        username,
        enCronograma: true,
        asignableCubic: true,
        incluidoCalidad: true,
        asignableAgs: true,
      })
      .onConflictDoNothing();

    const res = await adminForm(adminCookie, {
      action: "change-role",
      userId: String(u.id),
      newRole: "supervisor",
      helpdesk: `${mdaId}|${MDA_TI_HELPDESK}`,
    });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);

    const [row] = await db
      .select({ role: users.role, helpdeskId: users.helpdeskId })
      .from(users)
      .where(eq(users.id, u.id));
    expect(row.role).toBe("supervisor");
    expect(row.helpdeskId).toBe(mdaId);

    const [agentRow] = await db
      .select({
        enCronograma: agents.enCronograma,
        asignableCubic: agents.asignableCubic,
        incluidoCalidad: agents.incluidoCalidad,
        asignableAgs: agents.asignableAgs,
      })
      .from(agents)
      .where(eq(agents.username, username));
    expect(agentRow.enCronograma).toBe(false); // supervisor nunca figura
    // supervisor MDA TI es mesa participativa -> no se resetean los otros flags
    expect(agentRow.asignableCubic).toBe(true);
  });

  // -------- Participaciones por mesa -----------------------------------------
  test("participaciones: solo mesa MDA TI; supervisor forzado fuera de cronograma", async () => {
    const mdaAgent = matrix["agent|mda"];
    const coordAgent = matrix["agent|coord"];
    const mdaSup = matrix["supervisor|mda"];

    // MDA TI agent: se aplica.
    const ok = await adminForm(adminCookie, {
      action: "update-participaciones",
      userId: String(mdaAgent.id),
      enCronograma: "on",
      asignableCubic: "on",
    });
    expect(ok.status).toBe(200);
    const [a1] = await db
      .select({ enCronograma: agents.enCronograma, asignableCubic: agents.asignableCubic })
      .from(agents)
      .where(eq(agents.username, mdaAgent.username));
    expect(a1.enCronograma).toBe(true);
    expect(a1.asignableCubic).toBe(true);

    // Coord agent: la mesa no tiene secciones participativas -> 400.
    const blocked = await adminForm(adminCookie, {
      action: "update-participaciones",
      userId: String(coordAgent.id),
      enCronograma: "on",
    });
    expect(blocked.status).toBe(400);
    expect(String(blocked.json?.error)).toContain("no tiene secciones");

    // MDA TI supervisor: enCronograma forzado a false server-side.
    const sup = await adminForm(adminCookie, {
      action: "update-participaciones",
      userId: String(mdaSup.id),
      enCronograma: "on",
      incluidoCalidad: "on",
    });
    expect(sup.status).toBe(200);
    const [a3] = await db
      .select({ enCronograma: agents.enCronograma, incluidoCalidad: agents.incluidoCalidad })
      .from(agents)
      .where(eq(agents.username, mdaSup.username));
    expect(a3.enCronograma).toBe(false);
    expect(a3.incluidoCalidad).toBe(true);
  });

  // -------- Alta: mesa obligatoria y nombre canonico --------------------------
  test("alta sin mesa => 400 y no crea usuario", async () => {
    const username = shortUsername("lfnom");
    const res = await adminForm(adminCookie, {
      action: "create",
      name: `SinMesa ${username}`,
      username,
      password: PASSWORD,
      role: "agent",
    });
    expect(res.status).toBe(400);
    expect(String(res.json?.error)).toContain("mesa de ayuda es obligatoria");
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    expect(rows.length).toBe(0);
  });

  test("alta ignora nombre de mesa del cliente y usa el canonico de DB", async () => {
    const username = shortUsername("lfcanon");
    const res = await adminForm(adminCookie, {
      action: "create",
      name: `Canon ${username}`,
      username,
      password: PASSWORD,
      role: "agent",
      // Nombre falso a proposito; el server toma mesas.name por invgateId.
      helpdesk: `${mdaId}|NOMBRE_FALSO_CLIENTE`,
    });
    expect(res.status).toBe(200);
    const [row] = await db
      .select({ id: users.id, helpdeskName: users.helpdeskName })
      .from(users)
      .where(eq(users.username, username));
    expect(row.helpdeskName).toBe(MDA_TI_HELPDESK);
    registerCreatedUser(row.id, username);
  });

  test("no-admin no puede crear usuarios via POST /admin/usuarios", async () => {
    const attacker = matrix["agent|mda"];
    const username = shortUsername("lfevil");
    const res = await adminForm(attacker.cookie, {
      action: "create",
      name: "Evil",
      username,
      password: PASSWORD,
      role: "admin",
      helpdesk: `${mdaId}|${MDA_TI_HELPDESK}`,
    });
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    expect(rows.length).toBe(0);
  });

  test("alta distingue duplicado de username vs de nombre de agente", async () => {
    // 1) username duplicado: choca el UNIQUE de users.username.
    const dupUser = matrix["agent|mda"];
    const resUsername = await adminForm(adminCookie, {
      action: "create",
      name: shortUsername("DupName"),
      username: dupUser.username,
      password: PASSWORD,
      role: "agent",
      helpdesk: `${mdaId}|${MDA_TI_HELPDESK}`,
    });
    expect(resUsername.status).toBe(400);
    expect(String(resUsername.json?.error)).toContain("nombre de usuario");

    // 2) nombre de agente duplicado: users inserta, agents.name UNIQUE falla
    // y la transaccion hace rollback completo (no queda usuario huerfano).
    const dupName = `DupAgente ${shortUsername("")}`;
    const firstUsername = shortUsername("lfdn1");
    const ok = await adminForm(adminCookie, {
      action: "create",
      name: dupName,
      username: firstUsername,
      password: PASSWORD,
      role: "agent",
      helpdesk: `${mdaId}|${MDA_TI_HELPDESK}`,
    });
    expect(ok.status).toBe(200);
    const [firstRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, firstUsername));
    registerCreatedUser(firstRow.id, firstUsername);

    const secondUsername = shortUsername("lfdn2");
    const resName = await adminForm(adminCookie, {
      action: "create",
      name: dupName,
      username: secondUsername,
      password: PASSWORD,
      role: "agent",
      helpdesk: `${mdaId}|${MDA_TI_HELPDESK}`,
    });
    expect(resName.status).toBe(400);
    expect(String(resName.json?.error)).toContain("nombre completo");
    const orphans = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, secondUsername));
    expect(orphans.length).toBe(0);
  });

  // -------- Guards de API con roles legacy -----------------------------------
  test("guards API: variantes legacy se normalizan (no bypass)", async () => {
    // support-guides/assign exige supervisor.
    const agentRes = await postJson(legacy.Agent.cookie, "/api/support-guides/assign", {
      recordId: 1,
      invgate_id: mdaId,
    });
    expect(agentRes.status).toBe(403);
    expect(agentRes.json?.error).toBe("Acceso denegado");

    // "Supervisor " (trailing space) pasa el guard de rol -> cae en CSRF.
    const supRes = await postJson(legacy.supervisor_sp.cookie, "/api/support-guides/assign", {
      recordId: 1,
      invgate_id: mdaId,
    });
    expect(supRes.status).toBe(403);
    expect(String(supRes.json?.error)).toContain("CSRF");

    // soportes/helpdesks/hide exige admin.
    const tlRes = await postJson(legacy.team_leader_sp.cookie, "/api/soportes/helpdesks/hide", {
      invgate_id: mdaId,
    });
    expect(tlRes.status).toBe(403);
    expect(tlRes.json?.error).toBe("Acceso denegado");

    // "Admin" legacy pasa el guard -> cae en CSRF, no en "Acceso denegado".
    const admRes = await postJson(legacy.Admin.cookie, "/api/soportes/helpdesks/hide", {
      invgate_id: mdaId,
    });
    expect(admRes.status).toBe(403);
    expect(String(admRes.json?.error)).toContain("CSRF");
  });

  test("PATCH /api/usuarios/[dni]: agent 403, admin pasa el guard", async () => {
    const agent = matrix["agent|mda"];
    const agentRes = await fetchManual("/api/usuarios/99999999", {
      method: "PATCH",
      cookie: agent.cookie,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ telefono: "123" }),
    });
    expect(agentRes.status).toBe(403);

    const adminRes = await fetchManual("/api/usuarios/99999999", {
      method: "PATCH",
      cookie: adminCookie,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ telefono: "123" }),
    });
    expect(adminRes.status).not.toBe(403); // guard pasa -> 404 (dni inexistente)
    expect(adminRes.status).toBe(404);
  });

  test("GET /api/usuarios/ad-groups-licenses: agent 403, admin no 403", async () => {
    const agent = matrix["agent|mda"];
    const agentRes = await fetchManual("/api/usuarios/ad-groups-licenses", { cookie: agent.cookie });
    expect(agentRes.status).toBe(403);
    const adminRes = await fetchManual("/api/usuarios/ad-groups-licenses", { cookie: adminCookie });
    expect(adminRes.status).not.toBe(403);
  });

  test("reorder /api/admin: agent legacy 403, team_leader legacy 200", async () => {
    const denied = await postJson(legacy.Agent.cookie, "/api/admin/aplicativos/reorder", { items: [] });
    expect(denied.status).toBe(403);
    expect(denied.json?.error).toBe("Acceso denegado");

    const allowed = await postJson(legacy.team_leader_sp.cookie, "/api/admin/aplicativos/reorder", { items: [] });
    expect(allowed.status).toBe(200);
  });

  // -------- Login real (end-to-end con password) ------------------------------
  test("login real con credenciales creadas por el ciclo de vida", async ({ page }) => {
    const u = matrix["agent|mda"];
    await page.goto("/login");
    await page.fill("#login-username", u.username);
    await page.fill("#login-password", PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }),
      page.click("button[type=submit]"),
    ]);

    // Sidebar: accesos comunes presentes, /admin oculto para agent.
    await expect(page.locator('a[href="/titulos"]').first()).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);

    // Ruta permitida (supervision, mesa MDA TI) y ruta bloqueada (admin).
    const sup = await page.goto("/supervision");
    expect(sup?.status()).toBe(200);
    await page.goto("/admin");
    await page.waitForURL((url) => url.pathname === "/" || url.pathname.endsWith("/"));
    expect(page.url()).not.toContain("/admin");
  });
});
