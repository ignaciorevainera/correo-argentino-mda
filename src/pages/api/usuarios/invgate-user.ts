import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { sql } from "drizzle-orm";
import { invgateGet } from "@lib/invgateClient";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import type {
  InvgateUser,
  InvgateUsersByResponse,
  InvgateUsersGroupsResponse,
  InvgateUsersGroupsEntry,
  InvgateGroup,
  InvgateLocation,
  InvgateHelpdesk,
  InvgateCompany,
  InvgateResult,
} from "@/types/invgate";

const EMAIL_DOMAIN = "correoargentino.com.ar";
const OPEN_TICKETS_MAX_PAGES = 10;
const OPEN_TICKETS_PAGE_SIZE = 100;
const TICKETS_MAX = 20;

const STATUS_NAMES: Record<number, string> = {
  1: "Nuevo",
  2: "Abierto",
  3: "Pendiente",
  4: "En espera",
  5: "Solucionado",
  6: "Cerrado",
  7: "Rechazado",
  8: "Cancelado",
};

interface IncidentSummary {
  id: number;
  pretty_id: string;
  title: string;
  status_id: number;
  created_at: number | null;
}

interface IncidentPage {
  requests?: Record<
    string,
    {
      id?: number;
      pretty_id?: string;
      title?: string;
      status_id?: number;
      created_at?: number;
    }
  >;
  next_page_key?: string | null;
}

interface NamedRef {
  id: number;
  name: string;
}

function toRefs(value: unknown): NamedRef[] {
  if (value == null || typeof value !== "object") return [];
  const items = Array.isArray(value) ? value : Object.values(value);
  const refs: NamedRef[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      refs.push({ id: 0, name: item });
    } else if (typeof item === "number") {
      refs.push({ id: item, name: "" });
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const id = typeof obj.id === "number" ? obj.id : Number(obj.id) || 0;
      const name = typeof obj.name === "string" ? obj.name : "";
      if (id || name) refs.push({ id, name });
    }
  }
  return refs;
}

function resolveNames(
  refs: NamedRef[],
  lookup: Map<number, string>,
): NamedRef[] {
  return refs.map((r) => {
    const isPlaceholder = !r.name || r.name === String(r.id);
    return isPlaceholder ? { ...r, name: lookup.get(r.id) ?? String(r.id) } : r;
  });
}

function dropPlaceholderNames(refs: NamedRef[]): NamedRef[] {
  return refs.filter((r) => !(r.id > 0 && r.name === String(r.id)));
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

function findGroupsEntry(
  data: InvgateUsersGroupsResponse,
  userId: number,
): InvgateUsersGroupsEntry | null {
  if (!Array.isArray(data)) return null;
  return data.find((e) => Number(e.id) === userId) ?? null;
}

async function collectIncidentRequests(
  qsFor: (pageKey: string | null) => string,
): Promise<IncidentSummary[]> {
  const seen = new Map<number, IncidentSummary>();
  let pageKey: string | null = null;
  for (let page = 0; page < OPEN_TICKETS_MAX_PAGES; page++) {
    const result: InvgateResult<IncidentPage> = await invgateGet<IncidentPage>(
      qsFor(pageKey),
    );
    if (!result.ok) break;
    const requests = result.data.requests ?? {};
    for (const key of Object.keys(requests)) {
      const it = requests[key];
      if (!it || typeof it.id !== "number" || seen.has(it.id)) continue;
      seen.set(it.id, {
        id: it.id,
        pretty_id: it.pretty_id ?? String(it.id),
        title: it.title ?? "",
        status_id: it.status_id ?? 0,
        created_at: it.created_at ?? null,
      });
    }
    if (!result.data.next_page_key) break;
    pageKey = result.data.next_page_key;
  }
  return [...seen.values()];
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get("username")?.trim() || "";
    const username = raw.split("@")[0].trim().toLowerCase();

    if (!username) {
      return jsonResponse({ error: "Parámetro username requerido" }, 400);
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      return jsonResponse({ error: "Formato de username inválido" }, 400);
    }

    const [employee] = await db
      .select({ invgateExists: employees.invgateExists })
      .from(employees)
      .where(sql`lower(${employees.username}) = ${username}`)
      .limit(1);

    if (!employee) {
      return jsonResponse({ inInvGate: false, reason: "not_found" });
    }
    if (!employee.invgateExists) {
      return jsonResponse({ inInvGate: false, reason: "not_in_invgate" });
    }

    const fullEmail = `${username}@${EMAIL_DOMAIN}`;

    const [byEmail, byUsername] = await Promise.all([
      invgateGet<InvgateUsersByResponse>(
        `users.by?email=${encodeURIComponent(fullEmail)}&exact_match=true`,
      ),
      invgateGet<InvgateUsersByResponse>(
        `users.by?username=${encodeURIComponent(fullEmail)}&exact_match=true`,
      ),
    ]);

    if (!byEmail.ok && !byUsername.ok) {
      const message =
        "message" in byEmail ? byEmail.message : "Error al consultar InvGate";
      return jsonResponse({ error: message }, 502);
    }

    let invgateUser: InvgateUser | null = null;
    if (byEmail.ok) invgateUser = firstUsersByResult(byEmail.data.data);
    if (!invgateUser && byUsername.ok) {
      invgateUser = firstUsersByResult(byUsername.data.data);
    }

    if (!invgateUser) {
      return jsonResponse({ inInvGate: false, reason: "not_in_invgate" });
    }

    const invgateId = invgateUser.id;

    const profileResult = await invgateGet<InvgateUser>(`user?id=${invgateId}`);
    const profile = profileResult.ok ? profileResult.data : invgateUser;

    let manager: { id: number; fullname: string } | null = null;
    if (profile.manager_id) {
      const managerResult = await invgateGet<InvgateUser>(
        `user?id=${profile.manager_id}`,
      );
      if (managerResult.ok) {
        const m = managerResult.data;
        manager = {
          id: m.id,
          fullname: `${m.name} ${m.lastname}`.trim(),
        };
      }
    }

    const [customerTickets, agentTickets] = await Promise.all([
      collectIncidentRequests((pageKey) =>
        pageKey
          ? `incidents.by.customer?id=${invgateId}&limit=${OPEN_TICKETS_PAGE_SIZE}&page_key=${encodeURIComponent(pageKey)}`
          : `incidents.by.customer?id=${invgateId}&limit=${OPEN_TICKETS_PAGE_SIZE}`,
      ),
      collectIncidentRequests((pageKey) =>
        pageKey
          ? `incidents.by.agent?id=${invgateId}&limit=${OPEN_TICKETS_PAGE_SIZE}&page_key=${encodeURIComponent(pageKey)}`
          : `incidents.by.agent?id=${invgateId}&limit=${OPEN_TICKETS_PAGE_SIZE}`,
      ),
    ]);

    const ticketMap = new Map<
      number,
      IncidentSummary & { role: "customer" | "agent" }
    >();
    for (const t of customerTickets)
      ticketMap.set(t.id, { ...t, role: "customer" });
    for (const t of agentTickets) {
      const existing = ticketMap.get(t.id);
      if (existing) {
        existing.role = "customer";
      } else {
        ticketMap.set(t.id, { ...t, role: "agent" });
      }
    }

    const sortedTickets = [...ticketMap.values()].sort(
      (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
    );
    const openTickets = sortedTickets.length;
    const tickets = sortedTickets.slice(0, TICKETS_MAX).map((t) => ({
      ...t,
      status_name: STATUS_NAMES[t.status_id] ?? String(t.status_id),
    }));

    const org = {
      groups: [] as NamedRef[],
      helpdesks: [] as NamedRef[],
      locations: [] as NamedRef[],
      companies: [] as NamedRef[],
    };

    const groupsResult = await invgateGet<InvgateUsersGroupsResponse>(
      `users.groups?ids[]=${invgateId}`,
    );

    if (groupsResult.ok) {
      const entry = findGroupsEntry(groupsResult.data, invgateId);
      if (entry) {
        org.groups = toRefs(entry.groups);
        org.helpdesks = toRefs(entry.helpdesks);
        org.locations = toRefs(entry.locations);
        org.companies = toRefs(entry.companies);

        const needsLookup = [
          org.groups,
          org.helpdesks,
          org.locations,
          org.companies,
        ].some((arr) =>
          arr.some((r) => r.id && (!r.name || r.name === String(r.id))),
        );
        if (needsLookup) {
          const [groupsList, locationsList, helpdesksList, companiesList] =
            await Promise.all([
              invgateGet<InvgateGroup[]>("groups"),
              invgateGet<InvgateLocation[]>("locations"),
              invgateGet<InvgateHelpdesk[]>("helpdesks"),
              invgateGet<InvgateCompany[]>("companies"),
            ]);
          const groupMap = new Map(
            (groupsList.ok ? groupsList.data : []).map((g) => [g.id, g.name]),
          );
          const locMap = new Map(
            (locationsList.ok ? locationsList.data : []).map((l) => [
              l.id,
              l.name,
            ]),
          );
          const hdMap = new Map(
            (helpdesksList.ok ? helpdesksList.data : []).map((h) => [
              h.id,
              h.name,
            ]),
          );
          const companyMap = new Map(
            (companiesList.ok ? companiesList.data : []).map((c) => [
              c.id,
              c.name,
            ]),
          );
          org.groups = resolveNames(org.groups, groupMap);
          org.helpdesks = resolveNames(org.helpdesks, hdMap);
          org.locations = resolveNames(org.locations, locMap);
          org.companies = resolveNames(org.companies, companyMap);

          org.groups = dropPlaceholderNames(org.groups);
          org.helpdesks = dropPlaceholderNames(org.helpdesks);
          org.locations = dropPlaceholderNames(org.locations);
          org.companies = dropPlaceholderNames(org.companies);
        }
      }
    }

    return jsonResponse({
      inInvGate: true,
      user: {
        id: profile.id,
        username: profile.username,
        fullname: `${profile.name} ${profile.lastname}`.trim(),
        email: profile.email,
        user_type: profile.user_type,
        role_name: profile.role_name,
        position: profile.position,
        is_disabled: profile.is_disabled,
        is_deleted: profile.is_deleted,
        is_external: profile.is_external,
        manager_id: profile.manager_id,
        phone: profile.phone ?? null,
        mobile: profile.mobile ?? null,
        office: profile.office ?? null,
        other: profile.other ?? null,
        fax: profile.fax ?? null,
      },
      manager,
      org,
      openTickets,
      tickets,
    });
  } catch (error) {
    console.error("[InvGateUser] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
