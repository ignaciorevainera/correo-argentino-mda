import { getTelegrafiaOfficesFromDB } from "@lib/offices";

export type OfficeType =
  | "comercial"
  | "telegrafia"
  | "distribucion"
  | "paqueteria";

export type OfficeAssetType = "server" | "printer" | "desktop" | "client";

export interface OfficeContact {
  name: string;
  timeSlot: string;
  phone: string;
}

export interface OfficeAsset {
  type: OfficeAssetType;
  hostname: string;
  ip: string;
}

export interface OfficeDirectoryItem {
  id: string;
  type: OfficeType;
  code: string;
  name: string;
  location: string;
  costCenter: string;
  postalCode: string;
  provinceCode: string;
  provinceName: string;
  region: string;
  address: string;
  email: string;
  notes: string;
  contacts: OfficeContact[];
  assets: OfficeAsset[];
}

export async function getOfficeDirectoryItems(): Promise<
  OfficeDirectoryItem[]
> {
  const telegrafiaItems = await getTelegrafiaOfficesFromDB();

  return telegrafiaItems.sort((a, b) => {
    const codeComp = a.code.localeCompare(b.code, undefined, { numeric: true });
    if (codeComp !== 0) return codeComp;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}
