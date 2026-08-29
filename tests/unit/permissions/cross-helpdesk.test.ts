// tests/unit/permissions/cross-helpdesk.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as assignPost } from "../../../src/pages/api/support-guides/assign";
import { POST as unassignPost } from "../../../src/pages/api/support-guides/unassign";
import { db } from "@db/index";
import { logAdminAction } from "@lib/auditLogger";

vi.mock("@db/index", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@lib/auditLogger", () => ({
  logAdminAction: vi.fn(),
}));

function makeRequest(body: any) {
  return { json: async () => body } as any;
}

function mockRecord(record: { invgate_id: number | null } | null) {
  (db.select as any).mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(record ? [record] : []),
    }),
  });
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

describe("assign cross-helpdesk validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks supervisor from another helpdesk (403, no update)", async () => {
    mockRecord({ invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 200 }),
      locals: { user: supervisor(100) },
    } as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("otra mesa");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows supervisor from matching helpdesk", async () => {
    mockRecord({ invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 200 }),
      locals: { user: supervisor(200) },
    } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalled();
  });

  it("does not block user with helpdeskId null", async () => {
    mockRecord({ invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 200 }),
      locals: { user: supervisor(null) },
    } as any);

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it("blocks record with invgate_id null when target mismatches user mesa (Issue 1)", async () => {
    mockRecord({ invgate_id: null });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 300 }),
      locals: { user: supervisor(100) },
    } as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("otra mesa");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows assign when target helpdesk matches user mesa (record already assigned to it)", async () => {
    mockRecord({ invgate_id: 100 });
    const updateMock = mockUpdate();

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 100 }),
      locals: { user: supervisor(100) },
    } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalled();
  });

  it("returns 404 when conditional update affects 0 rows (race)", async () => {
    mockRecord({ invgate_id: null });
    mockUpdate(0);

    const res = await assignPost({
      request: makeRequest({ recordId: 1, invgate_id: 100 }),
      locals: { user: supervisor(100) },
    } as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Registro no encontrado");
  });
});

describe("unassign cross-helpdesk validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks supervisor from another helpdesk (403, no update)", async () => {
    mockRecord({ invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await unassignPost({
      request: makeRequest({ recordId: 1 }),
      locals: { user: supervisor(100) },
    } as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("otra mesa");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows supervisor from matching helpdesk", async () => {
    mockRecord({ invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await unassignPost({
      request: makeRequest({ recordId: 1 }),
      locals: { user: supervisor(200) },
    } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalled();
  });

  it("does not block user with helpdeskId null", async () => {
    mockRecord({ invgate_id: 200 });
    const updateMock = mockUpdate();

    const res = await unassignPost({
      request: makeRequest({ recordId: 1 }),
      locals: { user: supervisor(null) },
    } as any);

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it("does not block record with invgate_id null", async () => {
    mockRecord({ invgate_id: null });
    const updateMock = mockUpdate();

    const res = await unassignPost({
      request: makeRequest({ recordId: 1 }),
      locals: { user: supervisor(100) },
    } as any);

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });
});
