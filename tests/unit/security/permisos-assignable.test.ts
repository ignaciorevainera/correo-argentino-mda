// tests/unit/security/permisos-assignable.test.ts
//
// POST /api/admin/permisos/mesas/assignable: toggle de `mesas.assignable`.
// Mockea la DB (select + update) y rbac-middleware; CSRF y rate-limit reales.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../../src/pages/api/admin/permisos/mesas/assignable";
import { generateCsrfToken } from "@lib/csrf";
import { MDA_TI_HELPDESK } from "@lib/helpdeskAccess";

const CSRF_SESSION = "test-session-id";

const dbMock = vi.hoisted(() => ({
  selectResult: [] as Array<{
    id: number;
    invgateId: number;
    name: string;
    assignable: boolean;
  }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../src/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => dbMock.selectResult,
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          dbMock.updates.push(values);
        },
      }),
    }),
  },
}));

vi.mock("../../../src/lib/rbac-middleware", () => ({
  requireWriteAccess: vi.fn(async () => null),
}));

vi.mock("../../../src/lib/auditLogger", () => ({
  logAdminFromAstro: vi.fn(async () => {}),
}));

import { requireWriteAccess } from "../../../src/lib/rbac-middleware";

function makeRequest(body: Record<string, unknown>) {
  const req: any = {
    json: async () => body,
  };
  req.clone = () => req;
  req.headers = { get: () => null };
  return req;
}

function withCsrf(body: Record<string, unknown>) {
  return makeRequest({ ...body, csrf_token: generateCsrfToken(CSRF_SESSION) });
}

const locals = {
  user: { id: 1, username: "admin", role: "admin" },
  sessionId: CSRF_SESSION,
};

describe("POST /api/admin/permisos/mesas/assignable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectResult = [];
    dbMock.updates = [];
    vi.mocked(requireWriteAccess).mockResolvedValue(null);
  });

  it("deshabilitar la mesa principal MDA TI responde 400 y no escribe", async () => {
    dbMock.selectResult = [
      { id: 16, invgateId: 2509, name: MDA_TI_HELPDESK, assignable: true },
    ];

    const res = await POST({
      request: withCsrf({ invgateId: 2509, assignable: false }),
      locals,
    } as any);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("no puede deshabilitarse");
    expect(dbMock.updates).toHaveLength(0);
  });

  it("toggle de una mesa normal actualiza assignable", async () => {
    dbMock.selectResult = [
      { id: 5, invgateId: 999, name: "Otra", assignable: false },
    ];

    const res = await POST({
      request: withCsrf({ invgateId: 999, assignable: true }),
      locals,
    } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      invgateId: 999,
      assignable: true,
    });
    expect(dbMock.updates).toEqual([{ assignable: true }]);
  });

  it("toggle sin cambio de estado responde 200 sin update", async () => {
    dbMock.selectResult = [
      { id: 5, invgateId: 999, name: "Otra", assignable: true },
    ];

    const res = await POST({
      request: withCsrf({ invgateId: 999, assignable: true }),
      locals,
    } as any);

    expect(res.status).toBe(200);
    expect(dbMock.updates).toHaveLength(0);
  });

  it("mesa inexistente responde 404", async () => {
    dbMock.selectResult = [];

    const res = await POST({
      request: withCsrf({ invgateId: 123456, assignable: true }),
      locals,
    } as any);

    expect(res.status).toBe(404);
    expect(dbMock.updates).toHaveLength(0);
  });

  it("sin write access responde denegado y no escribe", async () => {
    vi.mocked(requireWriteAccess).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Acceso denegado" }), {
        status: 403,
      }),
    );
    dbMock.selectResult = [
      { id: 5, invgateId: 999, name: "Otra", assignable: false },
    ];

    const res = await POST({
      request: withCsrf({ invgateId: 999, assignable: true }),
      locals,
    } as any);

    expect(res.status).toBe(403);
    expect(dbMock.updates).toHaveLength(0);
    expect(dbMock.selectResult).toHaveLength(1);
  });

  it("CSRF invalido responde 403 y no toca la DB", async () => {
    dbMock.selectResult = [
      { id: 5, invgateId: 999, name: "Otra", assignable: false },
    ];

    const res = await POST({
      request: makeRequest({ invgateId: 999, assignable: true }),
      locals,
    } as any);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("CSRF");
    expect(dbMock.updates).toHaveLength(0);
  });

  it("assignable no booleano responde 400", async () => {
    const res = await POST({
      request: withCsrf({ invgateId: 999, assignable: "true" }),
      locals,
    } as any);

    expect(res.status).toBe(400);
    expect(dbMock.updates).toHaveLength(0);
  });
});
