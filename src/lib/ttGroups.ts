export interface TTMinimalRow {
  id: number;
  hostname: string;
  operatingSystem: string | null;
  manufacturer: string | null;
  model: string | null;
  nis: string | null;
}

export type TTPairState = "complete" | "missing-vm" | "missing-physical";

export interface TTGroup {
  base: string;
  primaryId: number;
  rows: TTMinimalRow[];
  pairState: TTPairState;
}

export const TT_HOSTNAME_PATTERN = "TT_____P";

export const computeTTBase = (hostname: string): string =>
  hostname.endsWith("-D") ? hostname.slice(0, -2) : hostname;

export const isTTVmHostname = (hostname: string): boolean =>
  hostname.endsWith("-D");

type TTOsFamily = "windows" | "linux" | "other";

function osFamily(os: string | null): TTOsFamily {
  const s = (os ?? "").toLowerCase();
  if (s.includes("windows")) return "windows";
  if (s.includes("linux") || s.includes("debian") || s.includes("ubuntu"))
    return "linux";
  return "other";
}

// Null/unknown OS physicals are still eligible to pair; only Windows is excluded.
// Physical Windows hosts are not T&T/STS terminals and must not pair with a VM.
function isTTEligible(row: TTMinimalRow): boolean {
  if (isTTVmHostname(row.hostname)) return true;
  return osFamily(row.operatingSystem) !== "windows";
}

export function groupTTDevices(rows: TTMinimalRow[]): TTGroup[] {
  const map = new Map<string, TTMinimalRow[]>();
  for (const row of rows) {
    if (!isTTEligible(row)) continue;
    const base = computeTTBase(row.hostname);
    const list = map.get(base);
    if (list) {
      list.push(row);
    } else {
      map.set(base, [row]);
    }
  }

  const groups: TTGroup[] = [];
  for (const [base, members] of map) {
    members.sort((a, b) => {
      const aVm = isTTVmHostname(a.hostname) ? 1 : 0;
      const bVm = isTTVmHostname(b.hostname) ? 1 : 0;
      if (aVm !== bVm) return aVm - bVm;
      return a.hostname.localeCompare(b.hostname);
    });

    const primary = members[0];
    const hasVm = members.some((m) => isTTVmHostname(m.hostname));
    const hasPhysical = members.some((m) => !isTTVmHostname(m.hostname));
    const pairState: TTPairState =
      hasPhysical && hasVm
        ? "complete"
        : isTTVmHostname(primary.hostname)
          ? "missing-physical"
          : "missing-vm";

    groups.push({ base, primaryId: primary.id, rows: members, pairState });
  }

  groups.sort((a, b) => a.base.localeCompare(b.base));
  return groups;
}

export function sortTTGroups(
  groups: TTGroup[],
  sortBy?: "hostname" | "hardware" | "os" | "location",
  sortOrder?: "asc" | "desc",
): TTGroup[] {
  const keyName = sortBy ?? "hostname";
  const dir = sortOrder === "desc" ? -1 : 1;
  const key = (g: TTGroup): string => {
    const primary = g.rows[0];
    switch (keyName) {
      case "hostname":
        return g.base;
      case "hardware":
        return `${primary.manufacturer ?? ""} ${primary.model ?? ""}`
          .trim()
          .toLowerCase();
      case "os":
        return (primary.operatingSystem ?? "").toLowerCase();
      case "location":
        return (primary.nis ?? "").toLowerCase();
      default:
        return g.base;
    }
  };
  return [...groups].sort((a, b) => key(a).localeCompare(key(b)) * dir);
}
