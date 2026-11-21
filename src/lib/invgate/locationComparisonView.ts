import type {
  LocationComparisonResult,
  LocationMatch,
} from "./locationMatcher";

export interface LocationComparisonViewParams {
  page: number;
  limit: number;
  filter: string;
  q: string;
}

export interface LocationComparisonView {
  results: LocationMatch[];
  stats: LocationComparisonResult["stats"];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
}

export function buildLocationComparisonView(
  comparison: LocationComparisonResult,
  { page, limit, filter, q }: LocationComparisonViewParams,
): LocationComparisonView {
  const safeLimit = Math.max(1, limit);
  let filtered = comparison.results;

  if (filter === "matched") {
    filtered = filtered.filter((row) => row.matched);
  } else if (filter === "unmatched") {
    filtered = filtered.filter((row) => !row.matched);
  }

  const query = q.toLowerCase().trim();
  if (query) {
    filtered = filtered.filter((row) => {
      const inv = row.invgateLocation;
      return (
        inv.displayName.toLowerCase().includes(query) ||
        inv.name.toLowerCase().includes(query) ||
        (inv.nis && inv.nis.toLowerCase().includes(query)) ||
        (inv.cp && inv.cp.toLowerCase().includes(query)) ||
        (inv.cc && inv.cc.toLowerCase().includes(query))
      );
    });
  }

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / safeLimit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * safeLimit;

  return {
    results: filtered.slice(offset, offset + safeLimit),
    stats: comparison.stats,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalPages,
      totalItems,
    },
  };
}
