import type { OfficeAssetType } from "@/data/directorio_oficinas";

export type BoxiconName = `boxicons:${string}`;

export function formatTypeLabel(type: string): string {
  if (type.toLowerCase() === "cdd") return "CDD";
  if (type.toLowerCase() === "ctp") return "CTP";
  return (
    type.charAt(0).toUpperCase() +
    type.slice(1).toLowerCase().replace(/_/g, " ")
  );
}

export const officeTypeLabelByType: Record<string, string> = {
  ADMINISTRACION: "Administración",
  AGENCIA: "Agencia",
  CDD: "CDD",
  CDP: "CDP",
  CTP: "CTP",
  "CORREO COLABORATIVO": "Colaborativo",
  ESPECIALES: "Especiales",
  ESTAFETA: "Estafeta",
  GENERAL: "General",
  SUCURSAL_AUTOMATIZADA: "Sucursal Automatizada",
  SUCURSAL_NO_AUTOMATIZADA: "Sucursal No Automatizada",
  TELEGRAFIA: "Telegrafía",
  "UNIDAD POSTAL": "Unidad Postal",
};

export const defaultChipClass =
  "office-type-chip bg-base-300 text-base-content border-base-400";
export const officeTypeChipClassByType: Record<string, string> = {
  ADMINISTRACION: "office-type-chip office-type-chip-administracion",
  AGENCIA: "office-type-chip office-type-chip-agencia",
  CDD: "office-type-chip office-type-chip-cdd",
  CDP: "office-type-chip office-type-chip-cdp",
  CTP: "office-type-chip office-type-chip-ctp",
  "CORREO COLABORATIVO":
    "office-type-chip office-type-chip-correo-colaborativo",
  ESPECIALES: "office-type-chip office-type-chip-especiales",
  ESTAFETA: "office-type-chip office-type-chip-estafeta",
  GENERAL: "office-type-chip office-type-chip-general",
  SUCURSAL_AUTOMATIZADA:
    "office-type-chip office-type-chip-sucursal-automatizada",
  SUCURSAL_NO_AUTOMATIZADA:
    "office-type-chip office-type-chip-sucursal-no-automatizada",
  TELEGRAFIA: "office-type-chip office-type-chip-telegrafia",
  "UNIDAD POSTAL": "office-type-chip office-type-chip-unidad-postal",
};

export const defaultTabClass =
  "office-tab-active bg-primary/10 border-primary text-primary font-bold";
export const officeTypeTabActiveClassByType: Record<string, string> = {
  all: "office-tab-active office-tab-active-all",
  ADMINISTRACION: "office-tab-active office-tab-active-administracion",
  AGENCIA: "office-tab-active office-tab-active-agencia",
  CDD: "office-tab-active office-tab-active-cdd",
  CDP: "office-tab-active office-tab-active-cdp",
  CTP: "office-tab-active office-tab-active-ctp",
  "CORREO COLABORATIVO":
    "office-tab-active office-tab-active-correo-colaborativo",
  ESPECIALES: "office-tab-active office-tab-active-especiales",
  ESTAFETA: "office-tab-active office-tab-active-estafeta",
  GENERAL: "office-tab-active office-tab-active-general",
  SUCURSAL_AUTOMATIZADA:
    "office-tab-active office-tab-active-sucursal-automatizada",
  SUCURSAL_NO_AUTOMATIZADA:
    "office-tab-active office-tab-active-sucursal-no-automatizada",
  TELEGRAFIA: "office-tab-active office-tab-active-telegrafia",
  "UNIDAD POSTAL": "office-tab-active office-tab-active-unidad-postal",
};

export const assetIconByType: Record<OfficeAssetType, BoxiconName> = {
  server: "boxicons:server-filled",
  printer: "boxicons:printer-filled",
  desktop: "boxicons:desktop-filled",
  client: "boxicons:desktop-filled",
};

export const assetLabelByType: Record<OfficeAssetType, string> = {
  server: "Servidor",
  printer: "Impresora",
  desktop: "Terminal",
  client: "Cliente",
};

export const assetColorByType: Record<OfficeAssetType, string> = {
  server:
    "bg-green-600 text-white border-green-700/30 shadow-sm shadow-green-500/20",
  client:
    "bg-blue-600 text-white border-blue-700/30 shadow-sm shadow-blue-500/20",
  desktop:
    "bg-blue-600 text-white border-blue-700/30 shadow-sm shadow-blue-500/20",
  printer:
    "bg-purple-600 text-white border-purple-700/30 shadow-sm shadow-purple-500/20",
};

export const assetOrderByType: Record<OfficeAssetType, number> = {
  server: 1,
  client: 2,
  desktop: 2,
  printer: 3,
};
