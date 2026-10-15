import { describe, expect, it } from "vitest";
import {
  deriveGroupMaps,
  groupByAgentId,
} from "../../src/lib/cronograma/payload";

describe("groupByAgentId", () => {
  it("agrupa filas por agentId y descarta agentes nulos", () => {
    const rows = [
      { id: 1, agentId: 7, date: "2026-10-01" },
      { id: 2, agentId: 7, date: "2026-10-02" },
      { id: 3, agentId: 9, date: "2026-10-01" },
      { id: 4, agentId: null, date: "2026-10-03" },
    ];
    const map = groupByAgentId(rows);
    expect(map.get(7)?.map((r) => r.id)).toEqual([1, 2]);
    expect(map.get(9)?.map((r) => r.id)).toEqual([3]);
    expect(map.size).toBe(2);
  });

  it("devuelve Map vacío para entrada vacía", () => {
    expect(groupByAgentId([]).size).toBe(0);
  });
});

describe("deriveGroupMaps", () => {
  const row = (
    agentId: number,
    month: string,
    saturdayGroup: string | null,
  ) => ({ agentId, month, saturdayGroup, saturdayHorario: null });

  it("excluye meses posteriores al mes activo", () => {
    const rows = [row(1, "2026-11", "A"), row(2, "2026-10", "B")];
    const { monthly, previous } = deriveGroupMaps(rows, "2026-10");
    expect(monthly.get(2)?.saturdayGroup).toBe("B");
    expect(monthly.has(1)).toBe(false);
    expect(previous.size).toBe(0);
  });

  it("sin mes anterior devuelve previous vacío", () => {
    const rows = [row(1, "2026-10", "A")];
    const { monthly, previous } = deriveGroupMaps(rows, "2026-10");
    expect(monthly.size).toBe(1);
    expect(previous.size).toBe(0);
  });

  it("con varios meses anteriores elige el más cercano", () => {
    const rows = [
      row(1, "2026-07", "A"),
      row(1, "2026-09", "C"),
      row(1, "2026-10", "D"),
    ];
    const { monthly, previous } = deriveGroupMaps(rows, "2026-10");
    expect(monthly.get(1)?.saturdayGroup).toBe("D");
    expect(previous.get(1)?.saturdayGroup).toBe("C");
  });

  it("un agente solo presente en meses anteriores aparece solo en previous", () => {
    const rows = [row(1, "2026-09", "A"), row(2, "2026-10", "B")];
    const { monthly, previous } = deriveGroupMaps(rows, "2026-10");
    expect(monthly.has(1)).toBe(false);
    expect(previous.get(1)?.saturdayGroup).toBe("A");
    expect(previous.has(2)).toBe(false);
  });
});
