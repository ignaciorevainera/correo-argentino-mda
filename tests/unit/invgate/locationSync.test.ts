import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  deletes: 0,
  inserts: [] as Array<Record<string, unknown>>,
  invgateGet: vi.fn(),
}));

vi.mock("../../../src/db/index", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: async () => ({ changes: 1 }) };
      },
    }),
    delete: async () => {
      mocks.deletes++;
    },
    select: () => ({ from: async () => [] }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserts.push(values);
        return { onConflictDoNothing: async () => {} };
      },
    }),
  },
}));

vi.mock("@lib/invgateClient", () => ({
  invgateGet: mocks.invgateGet,
}));

import { syncInvgateLocations } from "../../../src/lib/invgate/locationSync";

describe("syncInvgateLocations (#368)", () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.deletes = 0;
    mocks.inserts.length = 0;
    mocks.invgateGet.mockReset();
  });

  it("no toca employees.sucursal ni employeeOffices si el fetch falla", async () => {
    mocks.invgateGet.mockResolvedValue({
      ok: false,
      status: 500,
      message: "boom",
    });

    await syncInvgateLocations();

    expect(mocks.updates).toEqual([]);
    expect(mocks.deletes).toBe(0);
    expect(mocks.inserts).toEqual([]);
  });

  it("no toca employees.sucursal ni employeeOffices si InvGate devuelve 0 ubicaciones", async () => {
    mocks.invgateGet.mockResolvedValue({ ok: true, status: 200, data: [] });

    await syncInvgateLocations();

    expect(mocks.updates).toEqual([]);
    expect(mocks.deletes).toBe(0);
    expect(mocks.inserts).toEqual([]);
  });

  it("con fetch exitoso limpia y luego escribe la sucursal", async () => {
    mocks.invgateGet
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [{ id: 1, name: "Capital (B0001)", total: 2 }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { data: { users: [{ username: "jperez@correo.local" }] } },
      });

    await syncInvgateLocations();

    expect(mocks.deletes).toBe(1);
    expect(mocks.updates).toEqual([
      { sucursal: null },
      { sucursal: "Capital (B0001)" },
      { invgateUserTotal: 2 },
    ]);
    expect(mocks.inserts).toEqual([
      { username: "jperez", sucursal: "Capital (B0001)" },
    ]);
  });
});
