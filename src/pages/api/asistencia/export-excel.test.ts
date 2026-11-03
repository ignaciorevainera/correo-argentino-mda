import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./export-excel";

describe("GET /api/asistencia/export-excel", () => {
  it("rejects unauthorized access without valid session", async () => {
    const request = new Request("http://localhost:4321/api/asistencia/export-excel?date=2026-11-03");
    const response = await GET({
      request,
      locals: {} as any,
    } as any);

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.ok(body.error);
  });

  it("rejects user without read access to asistencia", async () => {
    const request = new Request("http://localhost:4321/api/asistencia/export-excel?date=2026-11-03");
    const response = await GET({
      request,
      locals: {
        user: { id: 999, username: "test_viewer", role: "none" },
      } as any,
    } as any);

    // requireReadAccess returns 403 or redirects/denies
    assert.ok(response.status === 403 || response.status === 401);
  });

  it("rejects invalid date format", async () => {
    const request = new Request("http://localhost:4321/api/asistencia/export-excel?date=invalid-date");
    const response = await GET({
      request,
      locals: {
        user: { id: 1, username: "admin", role: "admin" },
      } as any,
    } as any);

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /inv[aá]lido/i);
  });
});
