// src/lib/scheduleLinks.ts
//
// Resolucion de vinculos nombre→agente y username→usuario para la migracion a
// FK por id. PURO (sin DB) para poder testear y reusar en writers y scripts.
// Nunca adivina: match exacto, luego case-insensitive; si dos candidatos
// normalizan igual, devuelve ambiguous y NO asigna.

export type NameMatch = "exact" | "case-insensitive" | "ambiguous" | "none";

export type ResolvedAgentId = {
  agentId: number | null;
  match: NameMatch;
};

const normalizeName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export function buildNameToAgentId(
  rows: Array<{ id: number; name: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name, row.id);
  }
  return map;
}

export function resolveAgentIdByName(
  map: Map<string, number>,
  name: string | null | undefined,
): ResolvedAgentId {
  const raw = (name ?? "").trim();
  if (!raw) return { agentId: null, match: "none" };

  const exact = map.get(raw);
  if (exact !== undefined) return { agentId: exact, match: "exact" };

  const normalized = normalizeName(raw);
  const candidates: number[] = [];
  for (const [agentName, id] of map) {
    if (normalizeName(agentName) === normalized) candidates.push(id);
  }
  if (candidates.length === 0) return { agentId: null, match: "none" };
  if (candidates.length > 1) return { agentId: null, match: "ambiguous" };
  return { agentId: candidates[0], match: "case-insensitive" };
}

export function buildUsernameToUserId(
  rows: Array<{ id: number; username: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.username.trim().toLowerCase(), row.id);
  }
  return map;
}

export function resolveUserIdByUsername(
  map: Map<string, number>,
  username: string | null | undefined,
): number | null {
  const key = (username ?? "").trim().toLowerCase();
  if (!key) return null;
  return map.get(key) ?? null;
}
