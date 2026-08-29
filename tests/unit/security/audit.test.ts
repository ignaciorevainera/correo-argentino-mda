import { describe, it, expect, beforeEach, vi } from "vitest";

const insertMock = vi.fn();

vi.mock("@db/index", () => ({
  db: {
    insert: vi.fn(() => ({ values: insertMock })),
  },
}));

vi.mock("@db/schema", () => ({
  auditLogs: { _name: "audit_logs" },
}));

import { logAdminAction, logAdminActionStructured } from "../../../src/lib/auditLogger";

describe("logAdminActionStructured", () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue(undefined);
  });

  it("inserts row with all fields, JSON-serializable state, ISO timestamp", async () => {
    const before = { invgate_id: 1 };
    const after = { invgate_id: 2 };

    await logAdminActionStructured(
      "admin",
      "Asigno la mesa",
      "support_guide",
      42,
      before,
      after,
    );

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0];
    expect(row.username).toBe("admin");
    expect(row.action).toBe("Asigno la mesa");
    expect(row.entityType).toBe("support_guide");
    expect(row.entityId).toBe(42);
    expect(row.beforeState).toEqual(before);
    expect(row.afterState).toEqual(after);
    expect(() => JSON.stringify(row.beforeState)).not.toThrow();
    expect(() => JSON.stringify(row.afterState)).not.toThrow();
    expect(row.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("accepts null before/after states", async () => {
    await logAdminActionStructured("admin", "Oculto la mesa", "helpdesk", 7, null, {
      hidden: true,
    });

    const row = insertMock.mock.calls[0][0];
    expect(row.beforeState).toBeNull();
    expect(row.afterState).toEqual({ hidden: true });
  });

  it("does not throw when db insert rejects", async () => {
    insertMock.mockRejectedValue(new Error("db down"));

    await expect(
      logAdminActionStructured("admin", "test", "support_guide", 1, null, null),
    ).resolves.toBeUndefined();
  });

  it("existing logAdminAction keeps fire-and-forget behavior", async () => {
    insertMock.mockRejectedValue(new Error("db down"));

    await expect(logAdminAction("admin", "test")).resolves.toBeUndefined();
  });
});
