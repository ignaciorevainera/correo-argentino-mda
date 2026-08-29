// tests/unit/permissions/helpdesk-existence.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as assignPost } from "../../../src/pages/api/support-guides/assign";
import { db } from "@db/index";
import { logAdminAction } from "@lib/auditLogger";
import { mesas } from "@db/schema";
import { generateCsrfToken } from "@lib/csrf";

const CSRF_SESSION = "test-session-id";

vi.mock("@db/index", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@lib/auditLogger", () => ({
  logAdminAction: vi.fn(),
}));

function makeRequest(body: any) {
  return {
    json: async () => ({ ...body, csrf_token: generateCsrfToken(CSRF_SESSION) }),
  } as any;
}

type MesaResult = { id: number } | undefined;

function mockSelects(mesa: MesaResult, record: { invgate_id: number | null } | null) {
  (db.select as any).mockImplementation(() => ({
    from: (table: any) => ({
      where: () =>
        table === mesas
          ? Promise.resolve(mesa ? [mesa] : [])
          : Promise.resolve(record ? [record] : []),
    }),
  }));
}

function mockUpdate(changes = 1) {
  const updateMock = vi.fn().mockReturnValue({
    set: () => ({
      where: () => Promise.resolve({ changes }),
    }),
  });
  (db.update as any) = updateMock;
  return updateMock;
}

const supervisor = (helpdeskId: number | null) => ({
  id: 1,
  username: "sup",
  role: "supervisor",
  helpdeskId,
});

describe("assign helpdesk existence validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no active mesa matches invgate_id (update not called)", async () => {
    mockSelects(undefined, { invgate_id: null });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 999 }),
      locals: { user: supervisor(null), sessionId: CSRF_SESSION },
    } as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Helpdesk no existe en la base de datos");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when mesa exists but is inactive", async () => {
    mockSelects(undefined, { invgate_id: null });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 300 }),
      locals: { user: supervisor(null), sessionId: CSRF_SESSION },
    } as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Helpdesk no existe en la base de datos");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("proceeds when invgate_id matches an active mesa", async () => {
    mockSelects({ id: 5 }, { invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 200 }),
      locals: { user: supervisor(200), sessionId: CSRF_SESSION },
    } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalled();
  });

  it("existence check runs before record lookup (no wasted queries)", async () => {
    mockSelects(undefined, null);
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 999 }),
      locals: { user: supervisor(null), sessionId: CSRF_SESSION },
    } as any);

    expect(res.status).toBe(400);
    const selectCalls = (db.select as any).mock.calls.length;
    expect(selectCalls).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows admin with null helpdeskId to assign valid helpdesk", async () => {
    mockSelects({ id: 5 }, { invgate_id: null });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 300 }),
      locals: { user: supervisor(null), sessionId: CSRF_SESSION },
    } as any);

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });
});
