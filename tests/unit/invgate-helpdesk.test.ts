// tests/unit/invgate-helpdesk.test.ts
import { describe, it, expect } from "vitest";
import { buildRootMaps } from "../../src/lib/invgateHelpdesk";

describe("buildRootMaps", () => {
  const sample = [
    { id: 1, name: "TI_GSM_MDA TI", parent_id: null, level_order: undefined, members_ids: [100, 101] },
    { id: 2, name: "MDA TI Nivel 2", parent_id: 1, level_order: 1, members_ids: [102] },
    { id: 3, name: "TI_GSM_Mesa de Coord", parent_id: null, level_order: undefined, members_ids: [200] },
  ];

  it("aplanar subniveles a la mesa raiz via parent_id", () => {
    const { rootByHelpdeskId } = buildRootMaps(sample as any);
    expect(rootByHelpdeskId.get(1)).toEqual({ invgateId: 1, name: "TI_GSM_MDA TI" });
    // El subnivel 2 pertenece a la raiz 1
    expect(rootByHelpdeskId.get(2)).toEqual({ invgateId: 1, name: "TI_GSM_MDA TI" });
    expect(rootByHelpdeskId.get(3)).toEqual({ invgateId: 3, name: "TI_GSM_Mesa de Coord" });
  });

  it("mapear member id -> mesa raiz (subniveles y raiz)", () => {
    const { rootByMemberId } = buildRootMaps(sample as any);
    expect(rootByMemberId.get(100)).toEqual({ invgateId: 1, name: "TI_GSM_MDA TI" });
    expect(rootByMemberId.get(101)).toEqual({ invgateId: 1, name: "TI_GSM_MDA TI" });
    // Miembro del subnivel 2 -> raiz 1
    expect(rootByMemberId.get(102)).toEqual({ invgateId: 1, name: "TI_GSM_MDA TI" });
    expect(rootByMemberId.get(200)).toEqual({ invgateId: 3, name: "TI_GSM_Mesa de Coord" });
  });
});
