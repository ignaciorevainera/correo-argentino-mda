import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateCsrfToken,
  validateCsrfToken,
  validateRequestCsrf,
} from "../../../src/lib/csrf";
import { POST as assignPost } from "../../../src/pages/api/support-guides/assign";
import { db } from "@db/index";
import { logAdminActionStructured } from "@lib/auditLogger";

vi.mock("@db/index", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@lib/auditLogger", () => ({
  logAdminAction: vi.fn(),
  logAdminActionStructured: vi.fn(),
}));

const SESSION = "test-session-id";

describe("generateCsrfToken", () => {
  it("returns string with 3 parts", () => {
    const token = generateCsrfToken(SESSION);
    expect(token.split(".")).toHaveLength(3);
  });

  it("starts with the session id", () => {
    const token = generateCsrfToken(SESSION);
    expect(token.startsWith(`${SESSION}.`)).toBe(true);
  });
});

describe("validateCsrfToken", () => {
  it("accepts a valid token", () => {
    const token = generateCsrfToken(SESSION);
    expect(validateCsrfToken(token, SESSION)).toBe(true);
  });

  it("rejects token bound to another session", () => {
    const token = generateCsrfToken(SESSION);
    expect(validateCsrfToken(token, "other-session")).toBe(false);
  });

  it("rejects tampered signature", () => {
    const token = generateCsrfToken(SESSION);
    const parts = token.split(".");
    parts[2] = parts[2].replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(validateCsrfToken(parts.join("."), SESSION)).toBe(false);
  });

  it("rejects expired token (older than 1 hour)", () => {
    const token = generateCsrfToken(SESSION);
    const parts = token.split(".");
    const issuedAt = Number(parts[1]);
    const later = issuedAt + 60 * 60 * 1000 + 1;
    expect(validateCsrfToken(token, SESSION, later)).toBe(false);
  });

  it("accepts token within 1 hour", () => {
    const token = generateCsrfToken(SESSION);
    const parts = token.split(".");
    const issuedAt = Number(parts[1]);
    const later = issuedAt + 60 * 60 * 1000 - 1000;
    expect(validateCsrfToken(token, SESSION, later)).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(validateCsrfToken("", SESSION)).toBe(false);
    expect(validateCsrfToken("only-one", SESSION)).toBe(false);
    expect(validateCsrfToken("a.b", SESSION)).toBe(false);
    expect(validateCsrfToken("a.b.c.d", SESSION)).toBe(false);
    expect(validateCsrfToken(`${SESSION}.notanumber.abcdef`, SESSION)).toBe(
      false,
    );
  });
});

describe("validateRequestCsrf", () => {
  const locals = { sessionId: SESSION, user: { id: 1 } };

  it("accepts valid token in X-CSRF-Token header", async () => {
    const token = generateCsrfToken(SESSION);
    const request = new Request("http://x/api/test", {
      method: "POST",
      headers: { "X-CSRF-Token": token },
    });
    expect(await validateRequestCsrf(request, locals as any)).toBe(true);
  });

  it("accepts valid token in JSON body csrf_token field", async () => {
    const token = generateCsrfToken(SESSION);
    const request = new Request("http://x/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId: 1, csrf_token: token }),
    });
    expect(await validateRequestCsrf(request, locals as any)).toBe(true);
  });

  it("rejects missing token", async () => {
    const request = new Request("http://x/api/test", {
      method: "POST",
      body: JSON.stringify({ recordId: 1 }),
    });
    expect(await validateRequestCsrf(request, locals as any)).toBe(false);
  });

  it("rejects when sessionId is null", async () => {
    const token = generateCsrfToken(SESSION);
    const request = new Request("http://x/api/test", {
      method: "POST",
      headers: { "X-CSRF-Token": token },
    });
    expect(
      await validateRequestCsrf(request, { sessionId: null } as any),
    ).toBe(false);
  });
});

describe("assign endpoint CSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb() {
    (db.select as any).mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{ legacyName: "x", invgate_id: null }]),
      }),
    });
    (db.update as any) = vi.fn().mockReturnValue({
      set: () => ({
        where: () => Promise.resolve({ changes: 1 }),
      }),
    });
  }

  const locals = {
    user: { id: 1, username: "sup", role: "supervisor", helpdeskId: null },
    sessionId: SESSION,
  };

  it("returns 403 with CSRF error when token missing", async () => {
    mockDb();
    const res = await assignPost({
      request: {
        json: async () => ({ recordId: 1, invgate_id: 100 }),
      } as any,
      locals,
    } as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("CSRF");
  });

  it("passes CSRF layer with valid token in body", async () => {
    mockDb();
    const token = generateCsrfToken(SESSION);
    const res = await assignPost({
      request: {
        json: async () => ({ recordId: 1, invgate_id: 100, csrf_token: token }),
      } as any,
      locals,
    } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(logAdminActionStructured).toHaveBeenCalled();
  });
});
