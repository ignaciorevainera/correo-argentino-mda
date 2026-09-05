// src/lib/invgateHelpdesk.ts
import { invgateGet } from "./invgateClient";
import type {
  InvgateHelpdeskAndLevel,
  InvgateUsersByResponse,
  InvgateUser,
} from "@/types/invgate";

export interface RootHelpdesk {
  invgateId: number;
  name: string;
}

export interface RootMaps {
  // id de helpdesk (raiz o subnivel) -> mesa raiz
  rootByHelpdeskId: Map<number, RootHelpdesk>;
  // id de usuario InvGate -> mesa raiz a la que pertenece
  rootByMemberId: Map<number, RootHelpdesk>;
}

// Aplana subniveles (level_order != 0) a su mesa raiz siguiendo parent_id.
export function buildRootMaps(helpdesks: InvgateHelpdeskAndLevel[]): RootMaps {
  const byId = new Map<number, InvgateHelpdeskAndLevel>(
    helpdesks.map((h) => [h.id, h]),
  );
  const rootByHelpdeskId = new Map<number, RootHelpdesk>();

  const rootOf = (id: number): RootHelpdesk => {
    const cached = rootByHelpdeskId.get(id);
    if (cached) return cached;
    const seen = new Set<number>();
    let cur = id;
    while (true) {
      if (rootByHelpdeskId.has(cur)) {
        const r = rootByHelpdeskId.get(cur)!;
        rootByHelpdeskId.set(id, r);
        return r;
      }
      if (seen.has(cur)) {
        throw new Error(`Ciclo en parent_id de helpdesk ${cur}`);
      }
      seen.add(cur);
      const entry = byId.get(cur);
      if (!entry) {
        throw new Error(`Helpdesk ${cur} no encontrado en helpdesksandlevels`);
      }
      const isRoot = !entry.level_order;
      if (isRoot || entry.parent_id == null) {
        const root: RootHelpdesk = {
          invgateId: entry.id,
          name: entry.name ?? `Helpdesk #${entry.id}`,
        };
        rootByHelpdeskId.set(id, root);
        return root;
      }
      cur = entry.parent_id;
    }
  };

  for (const h of helpdesks) rootOf(h.id);

  const rootByMemberId = new Map<number, RootHelpdesk>();
  for (const h of helpdesks) {
    const root = rootByHelpdeskId.get(h.id)!;
    for (const memberId of h.members_ids ?? []) {
      if (!rootByMemberId.has(memberId)) {
        rootByMemberId.set(memberId, root);
      }
    }
  }

  return { rootByHelpdeskId, rootByMemberId };
}

function firstUsersByResult(
  data: InvgateUsersByResponse["data"],
): InvgateUser | null {
  if (!data || typeof data !== "object") return null;
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  const first = data[keys[0]];
  return first && typeof first.id === "number" ? first : null;
}

// Resuelve la mesa raiz de un usuario de InvGate por su username del portal.
// Devuelve null si el usuario no existe o no pertenece a ninguna mesa.
export async function resolveUserRootHelpdesk(
  username: string,
): Promise<RootHelpdesk | null> {
  // Mismo patron de lookup por username que src/pages/api/usuarios/invgate-user.ts:
  // invgateGet("users.by?username=...&exact_match=true") y leer
  // result.data.data (Record<string, InvgateUser>), extraer el primer valor.
  const userRes = await invgateGet<InvgateUsersByResponse>(
    `users.by?username=${encodeURIComponent(username)}&exact_match=true`,
  );
  const match = userRes.ok ? firstUsersByResult(userRes.data.data) : null;
  if (!match) return null;

  const hdRes = await invgateGet<InvgateHelpdeskAndLevel[]>(
    "helpdesksandlevels",
  );
  if (!hdRes.ok || !Array.isArray(hdRes.data)) return null;

  const { rootByMemberId } = buildRootMaps(hdRes.data);
  return rootByMemberId.get(match.id) ?? null;
}
