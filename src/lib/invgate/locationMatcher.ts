import type { InvgateLocation } from "../../types/invgate.js";

export interface ParsedInvgateLocation {
  id: number;
  name: string;
  displayName: string;
  nis: string | null;
  cp: string | null;
  cc: string | null;
  address: string | null;
}

export interface LocationMatch {
  invgateLocation: ParsedInvgateLocation;
  officeCode: string | null;
  mdaOffice: { name: string; address: string } | null;
  matched: boolean;
}

export interface LocationComparisonStats {
  totalInvgate: number;
  totalMda: number;
  matched: number;
  unmatchedInvgate: number;
}

export interface LocationComparisonResult {
  results: LocationMatch[];
  stats: LocationComparisonStats;
}

export function parseInvgateLocationName(name: string): Omit<ParsedInvgateLocation, "id" | "name"> {
  let displayName = name.split('(')[0].trim();
  let nis: string | null = null;
  let cp: string | null = null;
  let cc: string | null = null;

  // Extract NIS: first parenthesized string match `([A-Z]\d{4}\s*)`
  const nisRegex = /\(([A-Z]\d{4}\s*)\)/;
  const nisMatch = name.match(nisRegex);
  if (nisMatch) {
    nis = nisMatch[1].trim();
  }

  // Extract CP: second parenthesized match matching postal code pattern `([A-Z]\d{4}[A-Z]{3})`
  // We can search the remaining or whole string. Since CP is usually the second parenthesized match,
  // let's match globally or find all parenthesized groups.
  const cpRegex = /\(([A-Z]\d{4}[A-Z]{3})\)/;
  const cpMatch = name.match(cpRegex);
  if (cpMatch) {
    cp = cpMatch[1].trim();
  }

  // Extract CC: string matching `CC_(\d+)`
  const ccRegex = /CC_(\d+)/;
  const ccMatch = name.match(ccRegex);
  if (ccMatch) {
    cc = ccMatch[1];
  }

  let address: string | null = null;
  const firstCloseParen = name.indexOf(')');
  if (firstCloseParen !== -1) {
    const nextOpenParen = name.indexOf('(', firstCloseParen + 1);
    if (nextOpenParen !== -1) {
      const sliced = name.slice(firstCloseParen + 1, nextOpenParen).trim();
      if (sliced.length > 0) {
        address = sliced;
      }
    }
  }

  // Trim displayName in case there was no match or after extraction
  displayName = displayName.trim();

  return {
    displayName,
    nis,
    cp,
    cc,
    address,
  };
}

export function matchLocations(
  invgateLocations: InvgateLocation[],
  allOfficeCodes: Map<string, { name: string; address: string }>
): LocationComparisonResult {
  const results: LocationMatch[] = [];
  let matchedCount = 0;

  // Find all locations that have children (parent_id)
  const parentIds = new Set<number>();
  for (const loc of invgateLocations) {
    if (loc.parent_id !== null) {
      parentIds.add(loc.parent_id);
    }
  }

  // Filter to keep only leaf locations
  const leafLocations = invgateLocations.filter(loc => !parentIds.has(loc.id));

  for (const loc of leafLocations) {
    const parsed = parseInvgateLocationName(loc.name);
    const parsedLocation: ParsedInvgateLocation = {
      id: loc.id,
      name: loc.name,
      ...parsed,
    };

    let officeCode: string | null = null;
    let mdaOffice: { name: string; address: string } | null = null;
    let matched = false;

    if (parsedLocation.nis && allOfficeCodes.has(parsedLocation.nis)) {
      officeCode = parsedLocation.nis;
      mdaOffice = allOfficeCodes.get(parsedLocation.nis) || null;
      matched = true;
      matchedCount++;
    }

    results.push({
      invgateLocation: parsedLocation,
      officeCode,
      mdaOffice,
      matched,
    });
  }

  const totalInvgate = leafLocations.length;
  const totalMda = allOfficeCodes.size;
  const unmatchedInvgate = totalInvgate - matchedCount;

  return {
    results,
    stats: {
      totalInvgate,
      totalMda,
      matched: matchedCount,
      unmatchedInvgate,
    },
  };
}
