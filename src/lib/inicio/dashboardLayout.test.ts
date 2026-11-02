import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedWidgetsForRole,
  defaultLayout,
  parseStoredDashboard,
  resolveAccessList,
  resolveDashboardLayout,
  resolveStoredAccess,
  type DashboardWidgetId,
} from "./dashboardLayout";

const all: DashboardWidgetId[] = [
  "week",
  "quality",
  "quality-team",
  "ags",
  "automation",
  "audit",
  "feedback",
  "users",
];

test("cada perfil tiene un default de 1 grande + 2 en la columna", () => {
  const operador = defaultLayout("operador");
  assert.equal(operador?.big, "week");
  assert.deepEqual(operador?.side, ["ags", "quality"]);

  const admin = defaultLayout("admin");
  assert.equal(admin?.big, "audit");
  assert.deepEqual(admin?.side, ["feedback", "users"]);

  assert.equal(defaultLayout("base"), null);
});

test("la lista blanca crece con la jerarquía de rol", () => {
  const agent = allowedWidgetsForRole("agent");
  const referent = allowedWidgetsForRole("referent");
  const teamLeader = allowedWidgetsForRole("team_leader");
  const supervisor = allowedWidgetsForRole("supervisor");
  const admin = allowedWidgetsForRole("admin");

  assert.ok(agent.includes("week"));
  assert.equal(agent.includes("quality-team"), false);
  assert.equal(referent.includes("quality-team"), true);
  assert.equal(teamLeader.includes("quality-team"), true);
  assert.equal(supervisor.includes("quality-team"), true);
  assert.equal(supervisor.includes("audit"), false);
  assert.deepEqual([...admin].sort(), [...all].sort());
});

test("sin configuración guardada se usa el default del perfil", () => {
  const layout = resolveDashboardLayout({
    profile: "operador",
    role: "agent",
    raw: null,
    available: ["week", "quality", "ags", "automation"],
  });
  assert.equal(layout?.big, "week");
  assert.deepEqual(layout?.side, ["ags", "quality"]);
});

test("se respeta una configuración válida", () => {
  const layout = resolveDashboardLayout({
    profile: "operador",
    role: "agent",
    raw: { big: "quality", side: ["ags", "week"] },
    available: ["week", "quality", "ags", "automation"],
  });
  assert.equal(layout?.big, "quality");
  assert.deepEqual(layout?.side, ["ags", "week"]);
});

test("un widget fuera de la lista blanca del rol cae al default", () => {
  const layout = resolveDashboardLayout({
    profile: "operador",
    role: "agent",
    raw: { big: "audit", side: ["users", "feedback"] },
    available: ["week", "quality", "ags", "automation"],
  });
  assert.equal(layout?.big, "week");
  assert.deepEqual(layout?.side, ["ags", "quality"]);
});

test("no se puede repetir el grande en la columna ni un widget dos veces", () => {
  const layout = resolveDashboardLayout({
    profile: "operador",
    role: "agent",
    raw: { big: "week", side: ["week", "ags", "ags"] },
    available: ["week", "quality", "ags"],
  });
  assert.equal(layout?.big, "week");
  assert.deepEqual(layout?.side, ["ags", "quality"]);
});

test("los widgets sin datos disponibles se descartan y se completan", () => {
  const layout = resolveDashboardLayout({
    profile: "operador",
    role: "agent",
    raw: { big: "week", side: ["ags", "quality"] },
    available: ["week", "ags", "automation"],
  });
  assert.equal(layout?.big, "week");
  assert.deepEqual(layout?.side, ["ags", "automation"]);
});

test("si la card grande configurada no está disponible, cae a la siguiente", () => {
  const layout = resolveDashboardLayout({
    profile: "operador",
    role: "agent",
    raw: { big: "week", side: ["ags", "quality"] },
    available: ["quality", "ags"],
  });
  assert.equal(layout?.big, "quality");
  assert.deepEqual(layout?.side, ["ags"]);
});

test("sin widgets disponibles no hay layout", () => {
  assert.equal(
    resolveDashboardLayout({
      profile: "operador",
      role: "agent",
      raw: null,
      available: [],
    }),
    null,
  );
});

test("un admin puede usar widgets de roles inferiores", () => {
  const layout = resolveDashboardLayout({
    profile: "admin",
    role: "admin",
    raw: { big: "week", side: ["audit", "users"] },
    available: all,
  });
  assert.equal(layout?.big, "week");
  assert.deepEqual(layout?.side, ["audit", "users"]);
});

test("el JSON viejo { big, side } migra al perfil real", () => {
  const store = parseStoredDashboard(
    { big: "quality", side: ["ags", "week"] },
    "operador",
  );
  assert.equal(store.version, 2);
  assert.equal(store.profiles.operador?.big, "quality");
  assert.deepEqual(store.profiles.operador?.side, ["ags", "week"]);
  assert.equal(store.profiles.admin, undefined);
});

test("el JSON v2 guarda layouts por perfil y accesos por rol", () => {
  const store = parseStoredDashboard(
    {
      version: 2,
      profiles: {
        operador: { big: "week", side: ["ags", "quality"] },
        admin: { big: "feedback", side: ["audit", "users"] },
      },
      accessByRole: { agent: ["/titulos", "/oficinas"], admin: ["/admin"] },
    },
    "admin",
  );
  assert.equal(store.profiles.operador?.big, "week");
  assert.equal(store.profiles.admin?.big, "feedback");
  assert.deepEqual(store.accessByRole.agent, ["/titulos", "/oficinas"]);
  assert.deepEqual(store.accessByRole.admin, ["/admin"]);
});

test("un JSON corrupto no rompe: devuelve el store vacío", () => {
  const store = parseStoredDashboard("basura", "operador");
  assert.deepEqual(store.profiles, {});
  assert.deepEqual(store.accessByRole, {});
});

test("accesos: sin configuración se muestran las primeras 8 permitidas", () => {
  const permitted = Array.from({ length: 12 }, (_, i) => `/ruta-${i}`);
  assert.deepEqual(
    resolveAccessList(undefined, permitted),
    permitted.slice(0, 8),
  );
});

test("accesos: respeta el orden guardado y descarta los no permitidos", () => {
  const permitted = ["/a", "/b", "/c", "/d"];
  assert.deepEqual(
    resolveAccessList(["/c", "/a", "/zzz", "/c"], permitted),
    ["/c", "/a"],
  );
});

test("accesos: una lista vacía es válida (el usuario no quiere cards)", () => {
  assert.deepEqual(resolveAccessList([], ["/a", "/b"]), []);
});

test("accesos: resolveStoredAccess lee el rol normalizado", () => {
  const raw = {
    version: 2,
    profiles: {},
    accessByRole: { agent: ["/b", "/a"] },
  };
  assert.deepEqual(resolveStoredAccess(raw, "agent", ["/a", "/b"]), [
    "/b",
    "/a",
  ]);
  assert.deepEqual(
    resolveStoredAccess(raw, " Admin ", ["/a", "/b"]).slice(0, 2),
    ["/a", "/b"],
  );
});
