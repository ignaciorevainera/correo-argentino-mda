const collapseOfficeAddressSpaces = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export function normalizeOfficeAddress(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;

  const normalized =
    collapseOfficeAddressSpaces(value).toLocaleUpperCase("es-AR");
  return normalized || null;
}

export function getOfficeAddressKey(value: string | null | undefined): string {
  return normalizeOfficeAddress(value) ?? "";
}

export function isSameBuildingConfirmed(
  value: string | null | undefined,
): boolean {
  return value === "on";
}
