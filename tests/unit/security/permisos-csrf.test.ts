// tests/unit/security/permisos-csrf.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as syncPost } from "../../../src/pages/api/admin/permisos/mesas/sync";
import { generateCsrfToken } from "@lib/csrf";

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

vi.mock("../../../src/lib/auditLogger", () => ({
  logAdminFromAstro: vi.fn(async () => {}),
}));

vi.mock("../../../src/lib/permissions/mesaSync", () => ({
  syncMesas: vi.fn(async () => ({ ok: true })),
}));

function makeRequest(body: any, withToken: boolean) {
  const payload = withToken
    ? { ...body, csrf_token: generateCsrfToken(CSRF_SESSION) }
    : { ...body };
  const req: any = {
    json: async () => payload,
  };
  req.clone = () => req;
  req.headers = {
    get: () => null,
  };
  return req;
}

const locals = { user: { id: 1, username: "admin", role: "admin" }, sessionId: CSRF_SESSION };

describe("permisos endpoints CSRF protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/admin/permisos/mesas/sync", () => {
    it("rejects request without CSRF token (403)", async () => {
      const res = await syncPost({
        request: makeRequest({}, false),
        locals,
      } as any);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("CSRF");
    });

    it("does not reject request with valid CSRF token", async () => {
      const res = await syncPost({
        request: makeRequest({}, true),
        locals,
      } as any);
      expect(res.status).not.toBe(403);
    });
  });
});
