import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  invgateGet: vi.fn(),
  syncInvgateLocations: vi.fn(async () => {}),
}));

vi.mock("@db/index", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: async () => {} };
      },
    }),
  },
  getSqliteDataVersion: () => 0,
}));

vi.mock("@lib/invgateClient", () => ({
  invgateGet: mocks.invgateGet,
}));

vi.mock("../../../src/lib/invgate/locationSync", () => ({
  syncInvgateLocations: mocks.syncInvgateLocations,
}));

import { fullInvgateSync } from "../../../src/lib/invgate/userSync";

describe("fullInvgateSync (#362)", () => {
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.invgateGet.mockReset();
    mocks.syncInvgateLocations.mockClear();
  });

  it("no toca employees.invgateExists si el fetch de InvGate falla", async () => {
    mocks.invgateGet.mockResolvedValue({
      ok: false,
      status: 500,
      message: "boom",
    });

    const result = await fullInvgateSync();

    expect(result).toEqual({
      ok: false,
      totalSynced: 0,
      error: "Error InvGate: boom",
    });
    expect(mocks.updates).toEqual([]);
    expect(mocks.syncInvgateLocations).not.toHaveBeenCalled();
  });

  it("no toca employees.invgateExists si InvGate devuelve 0 usuarios", async () => {
    mocks.invgateGet.mockResolvedValue({ ok: true, status: 200, data: [] });

    const result = await fullInvgateSync();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vacía o inválida/);
    expect(mocks.updates).toEqual([]);
  });

  it("con fetch exitoso marca false y después true/position/invgateId", async () => {
    mocks.invgateGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          id: 7,
          username: "jperez@correo.local",
          position: "Operador",
          is_disabled: false,
          is_deleted: false,
        },
      ],
    });

    const result = await fullInvgateSync();

    expect(result).toEqual({ ok: true, totalSynced: 1 });
    expect(mocks.updates).toEqual([
      { invgateExists: false },
      { invgateExists: true },
      { position: "Operador", invgateId: 7 },
    ]);
    expect(mocks.syncInvgateLocations).toHaveBeenCalledOnce();
  });
});
