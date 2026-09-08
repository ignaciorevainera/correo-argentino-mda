import type { OfficeDirectoryItem, SiblingOffice } from "@/types/offices";
import { getOfficeAddressKey } from "@lib/officeAddress";

export function siblingKey(
  address: string | null | undefined,
  region: string | null | undefined,
  provinceCode: string | null | undefined,
): string {
  const normalizedAddress = getOfficeAddressKey(address);
  const normalizedRegion = (region ?? "").trim().toLocaleLowerCase("es-AR");
  const normalizedProvince = (provinceCode ?? "").trim().toUpperCase();

  if (!normalizedAddress) return "";
  return `${normalizedAddress}|${normalizedRegion}|${normalizedProvince}`;
}

type Groupable = Pick<
  OfficeDirectoryItem,
  "code" | "name" | "type" | "address" | "region" | "provinceCode"
>;

export function buildSiblingMap(
  items: Groupable[],
): Map<string, SiblingOffice[]> {
  const groups = new Map<string, Groupable[]>();

  for (const item of items) {
    const key = siblingKey(item.address, item.region, item.provinceCode);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  const result = new Map<string, SiblingOffice[]>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const item of group) {
      const siblings = group
        .filter((o) => o.code !== item.code)
        .map((o) => ({ code: o.code, name: o.name, type: o.type }))
        .sort(
          (a, b) =>
            a.type.localeCompare(b.type) || a.code.localeCompare(b.code),
        );
      result.set(item.code, siblings);
    }
  }

  return result;
}
