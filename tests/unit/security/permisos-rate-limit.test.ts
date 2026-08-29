// tests/unit/security/permisos-rate-limit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as syncPost } from "../../../src/pages/api/admin/permisos/mesas/sync";
import { generateCsrfToken } from "@lib/csrf";
import { resetRateLimit } from "@lib/rateLimit";

const CSRF_SESSION = "test-session-id";

vi.mock("../../../src/db/index", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    })),
    transaction: vi.fn(),
  },
}));

vi.mock("../../../src/lib/rbac-middleware", () => ({
  requireWriteAccess: vi.fn(async () => null),
}));

vi.mock("../../../src/lib/permissions/cache", () => ({
  invalidatePermissionsCache: vi.fn(async () => {}),
}));

vi.mock("../../../src/lib/auditLogger", () => ({
  logAdminFromAstro: vi.fn(async () => {}),
}));

vi.mock("../../../src/lib/permissions/mesaSync", () => ({
  syncMesas: vi.fn(async () => ({ ok: true })),
}));

function makeRequest(userId: number) {
  const payload = { csrf_token: generateCsrfToken(CSRF_SESSION) };
  const req: any = {
    json: async () => payload,
  };
  req.clone = () => req;
  req.headers = {
    get: () => null,
  };
  return req;
}

function makeLocals(userId: number) {
  return { user: { id: userId, username: `user${userId}`, role: "admin" }, sessionId: CSRF_SESSION };
}

describe("POST /api/admin/permisos/mesas/sync rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRateLimit();
  });

  it("allows 5 sync requests within the window (no 429)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await syncPost({
        request: makeRequest(1),
        locals: makeLocals(1),
      } as any);
      expect(res.status).not.toBe(429);
    }
  });

  it("blocks 6th request with 429 and Spanish message", async () => {
    for (let i = 0; i < 5; i++) {
      await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any);
    }
    const res = await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Demasiadas solicitudes");
  });

  it("allows again after 60s window expires", async () => {
    for (let i = 0; i < 5; i++) {
      await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any);
    }
    expect(
      (await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any)).status,
    ).toBe(429);
    vi.advanceTimersByTime(60_001);
    const res = await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any);
    expect(res.status).not.toBe(429);
  });

  it("separate limit per user id", async () => {
    for (let i = 0; i < 5; i++) {
      await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any);
    }
    expect(
      (await syncPost({ request: makeRequest(1), locals: makeLocals(1) } as any)).status,
    ).toBe(429);
    const res = await syncPost({ request: makeRequest(2), locals: makeLocals(2) } as any);
    expect(res.status).not.toBe(429);
  });
});
