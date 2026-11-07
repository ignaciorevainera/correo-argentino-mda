export type OfficeType = string;

export type OfficeAssetType =
  "server" | "printer" | "desktop" | "client" | "backup";

export interface OfficeAsset {
  type: OfficeAssetType;
  hostname: string;
  ip: string;
}

export interface OfficeTerminal {
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
}

export interface SiblingOffice {
  code: string;
  name: string;
  type: string;
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
  assets: OfficeAsset[];
  terminals: OfficeTerminal[];
  invgateLinked?: boolean;
  invgateDisplayName?: string | null;
  invgateCp?: string | null;
  invgateCc?: string | null;
  invgateAddress?: string | null;
  invgateParentName?: string | null;
  invgateDuplicateCount?: number;
  invgateUserTotal?: number;
  active?: boolean;
  closedReason?: string | null;
  siblings?: SiblingOffice[];
}
