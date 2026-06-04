export type OfficeType = string;

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
  dbId?: number;
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
  officeType?: string | null;
  parentNis?: string | null;
  contacts: OfficeContact[];
  assets: OfficeAsset[];
}
