import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { db } from "@db/index";
import {
  automationParents,
  officeInvgateLinks,
  offices,
  provinces,
  regions,
  terminals,
} from "@db/schema";
import { jsonError, jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import { getOpenOfficeIncidentsByLocation } from "@lib/invgate/officeIncidents";
import {
  MASS_EVENT_MIN_OFFICES,
  buildCountChart,
  buildModernizacionPorProvincia,
  clusterMassEvents,
  countMassEventsByCode,
  countOpenIncidentsByCode,
  toEpochMs,
  type MassEvent,
} from "@lib/officeStats";
import { listClosures } from "@lib/workflow/closures";

const ORDER_BY = ["usuarios", "incidentes", "terminales", "eventos", "nombre"] as const;
type OrderBy = (typeof ORDER_BY)[number];

const WINDOW_DAYS = 30;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

interface RankingRow {
  code: string;
  name: string;
  provincia: string | null;
  region: string | null;
  usuarios: number | null;
  incidentes: number | null;
  eventos: number | null;
  terminales: number;
  activa: boolean;
}

function parsePositiveInt(value: string | null, max?: number): number | null {
  if (value === null) return null;
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) return null;
  if (max !== undefined && parsed > max) return null;
  return parsed;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = await requireReadAccess(locals, "oficinas");
  if (denied) return denied;

  const pageRaw = url.searchParams.get("page");
  const pageSizeRaw = url.searchParams.get("pageSize");
  const page = pageRaw === null ? 1 : parsePositiveInt(pageRaw);
  const pageSize =
    pageSizeRaw === null ? DEFAULT_PAGE_SIZE : parsePositiveInt(pageSizeRaw, MAX_PAGE_SIZE);
  if (page === null) {
    return jsonError("El parámetro 'page' debe ser un entero positivo", 400, "no-store");
  }
  if (pageSize === null) {
    return jsonError(
      `El parámetro 'pageSize' debe ser un entero entre 1 y ${MAX_PAGE_SIZE}`,
      400,
      "no-store",
    );
  }

  const orderByRaw = url.searchParams.get("orderBy");
  if (orderByRaw !== null && !ORDER_BY.includes(orderByRaw as OrderBy)) {
    return jsonError(
      `El parámetro 'orderBy' debe ser uno de: ${ORDER_BY.join(", ")}`,
      400,
      "no-store",
    );
  }
  const orderBy = (orderByRaw ?? "nombre") as OrderBy;
  const dirRaw = url.searchParams.get("dir");
  if (dirRaw !== null && dirRaw !== "asc" && dirRaw !== "desc") {
    return jsonError("El parámetro 'dir' debe ser 'asc' o 'desc'", 400, "no-store");
  }
  const dir = dirRaw ?? (orderBy === "nombre" ? "asc" : "desc");

  const provinciaFilter = url.searchParams.get("provincia");
  const regionFilter = url.searchParams.get("region");
  const tipoFilter = url.searchParams.get("tipo");
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  try {
    const officeRows = await db
      .select({
        code: offices.code,
        name: offices.name,
        type: offices.type,
        active: offices.active,
        provinceName: provinces.name,
        regionName: regions.name,
        invgateLocationId: officeInvgateLinks.invgateLocationId,
        usuarios: officeInvgateLinks.invgateUserTotal,
      })
      .from(offices)
      .leftJoin(provinces, eq(provinces.code, offices.provinceCode))
      .leftJoin(regions, eq(regions.id, provinces.regionId))
      .leftJoin(officeInvgateLinks, eq(officeInvgateLinks.officeId, offices.id));

    const terminalCounts = new Map<string, number>();
    for (const row of await db
      .select({ nis: terminals.nis, total: sql<number>`count(*)` })
      .from(terminals)
      .groupBy(terminals.nis)) {
      if (row.nis) terminalCounts.set(row.nis, row.total);
    }

    const filteredRows = officeRows.filter((row) => {
      if (provinciaFilter && row.provinceName !== provinciaFilter) return false;
      if (regionFilter && row.regionName !== regionFilter) return false;
      if (tipoFilter && row.type !== tipoFilter) return false;
      if (search) {
        const name = row.name.toLowerCase();
        const code = row.code.toLowerCase();
        if (!name.includes(search) && !code.includes(search)) return false;
      }
      return true;
    });

    const provinceByCode = new Map(filteredRows.map((r) => [r.code, r.provinceName]));
    const closures = listClosures();
    const parentRows = (
      await db
        .select({
          automationId: automationParents.automationId,
          branchCode: automationParents.branchCode,
          createdAt: automationParents.createdAt,
          closedAt: automationParents.closedAt,
        })
        .from(automationParents)
    ).flatMap((row) => {
      const provinceName = row.branchCode ? provinceByCode.get(row.branchCode) : undefined;
      const createdAt = toEpochMs(row.createdAt);
      if (!provinceName || createdAt === null) return [];
      const closure = closures.get(row.automationId);
      const effectiveClosedAt = closure?.closedAt ?? row.closedAt ?? null;
      return [{ provinceName, createdAt, closedAt: toEpochMs(effectiveClosedAt) }];
    });

    const nowMs = Date.now();
    const windowStartMs = nowMs - WINDOW_DAYS * 24 * 3600 * 1000;

    let invgateOk = true;
    let openIncidentsByCode = new Map<string, number>();
    let massEventCountByCode = new Map<string, number>();
    let massEvents: MassEvent[] = [];
    try {
      const byLocation = await getOpenOfficeIncidentsByLocation();
      const locationToCode = new Map<number, string>();
      for (const row of filteredRows) {
        if (row.invgateLocationId != null) {
          locationToCode.set(row.invgateLocationId, row.code);
        }
      }
      const allIncidents = [...byLocation.values()].flat();
      openIncidentsByCode = countOpenIncidentsByCode(allIncidents, locationToCode);
      massEvents = clusterMassEvents(allIncidents, locationToCode, nowMs);
      massEventCountByCode = countMassEventsByCode(massEvents);
    } catch (error) {
      invgateOk = false;
      console.error("[API oficinas/estadisticas] InvGate no disponible:", error);
    }

    const activeRows = filteredRows.filter((r) => r.active);
    const usuariosLinked = activeRows.filter((r) => r.usuarios != null);
    const kpis = {
      oficinasActivas: activeRows.length,
      oficinasTotal: filteredRows.length,
      usuarios:
        usuariosLinked.length > 0
          ? usuariosLinked.reduce((sum, r) => sum + (r.usuarios ?? 0), 0)
          : null,
      terminales: filteredRows.reduce((sum, r) => sum + (terminalCounts.get(r.code) ?? 0), 0),
      incidentesAbiertos: invgateOk
        ? [...openIncidentsByCode.values()].reduce((sum, n) => sum + n, 0)
        : null,
      eventosMasivosActivos: invgateOk ? massEvents.length : null,
    };

    const ranking: RankingRow[] = filteredRows.map((row) => ({
      code: row.code,
      name: row.name,
      provincia: row.provinceName ?? null,
      region: row.regionName ?? null,
      usuarios: row.usuarios ?? null,
      incidentes: invgateOk ? openIncidentsByCode.get(row.code) ?? 0 : null,
      eventos: invgateOk ? massEventCountByCode.get(row.code) ?? 0 : null,
      terminales: terminalCounts.get(row.code) ?? 0,
      activa: row.active ?? false,
    }));

    const direction = dir === "asc" ? 1 : -1;
    ranking.sort((a, b) => {
      if (orderBy === "nombre") return direction * a.name.localeCompare(b.name, "es");
      const av = a[orderBy];
      const bv = b[orderBy];
      if (av === null && bv === null) return a.name.localeCompare(b.name, "es");
      if (av === null) return 1;
      if (bv === null) return -1;
      return direction * (av - bv) || a.name.localeCompare(b.name, "es");
    });

    const total = ranking.length;
    const rankingPage = ranking.slice((page - 1) * pageSize, page * pageSize);

    const provinceNames = [
      ...new Set(officeRows.map((r) => r.provinceName).filter(Boolean)),
    ] as string[];
    const regionNames = [
      ...new Set(officeRows.map((r) => r.regionName).filter(Boolean)),
    ] as string[];
    const types = [
      ...new Set(officeRows.map((r) => r.type).filter(Boolean)),
    ] as string[];

    const payload = {
      period: "last30d",
      kpis,
      charts: {
        porProvincia: buildCountChart(
          activeRows.map((r) => r.provinceName),
          "Oficinas",
        ),
        porRegion: buildCountChart(
          activeRows.map((r) => r.regionName),
          "Oficinas",
        ),
        modernizacion: buildModernizacionPorProvincia(parentRows, windowStartMs, nowMs),
      },
      eventosMasivos: massEvents.map((event) => ({
        ...event,
        provincias: [
          ...new Set(
            event.officeCodes
              .map((code) => filteredRows.find((r) => r.code === code)?.provinceName)
              .filter(Boolean),
          ),
        ],
      })),
      ranking: { rows: rankingPage, total, page, pageSize },
      filtros: {
        provincias: provinceNames.sort(),
        regiones: regionNames.sort(),
        tipos: types.sort(),
      },
      meta: {
        invgateOk,
        snapshotAt: new Date(nowMs).toISOString(),
        massEventMinOffices: MASS_EVENT_MIN_OFFICES,
      },
    };

    return jsonResponse(payload, 200, "no-store");
  } catch (error) {
    console.error("[API oficinas/estadisticas] Error:", error);
    return jsonError(sanitizeError(error), 500, "no-store");
  }
};
