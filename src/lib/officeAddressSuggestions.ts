export interface AddressSuggestionInput {
  code: string;
  name: string;
  address: string;
  provinceCode: string;
  provinceName: string;
  regionName: string;
}

export interface AddressSuggestion {
  address: string;
  provinceCode: string;
  provinceName: string;
  regionName: string;
  offices: { code: string; name: string }[];
}

export function buildAddressSuggestions(
  matches: AddressSuggestionInput[],
  normalizedQuery: string,
): AddressSuggestion[] {
  const groups = new Map<string, AddressSuggestion>();

  for (const match of matches) {
    const key = `${match.address}|${match.provinceCode}`;
    const existing = groups.get(key);
    if (existing) {
      existing.offices.push({ code: match.code, name: match.name });
    } else {
      groups.set(key, {
        address: match.address,
        provinceCode: match.provinceCode,
        provinceName: match.provinceName,
        regionName: match.regionName,
        offices: [{ code: match.code, name: match.name }],
      });
    }
  }

  return [...groups.values()].sort((a, b) => {
    const aStarts = a.address.startsWith(normalizedQuery) ? 0 : 1;
    const bStarts = b.address.startsWith(normalizedQuery) ? 0 : 1;
    return (
      aStarts - bStarts ||
      a.address.localeCompare(b.address, "es-AR") ||
      a.provinceName.localeCompare(b.provinceName, "es-AR")
    );
  });
}
