import { db } from "@db/index";
import {
  provinces,
  regions,
  offices,
  officeAssets,
  officeInvgateLinks,
} from "@db/schema";
import { eq, or, and, sql, inArray, asc, desc, like } from "drizzle-orm";
import type {
  OfficeDirectoryItem,
  OfficeAssetType,
  OfficeType,
  SiblingOffice,
} from "@/types/offices";
import { normalizeSearchValue } from "@lib/clientSearch";
import { buildSiblingMap } from "@lib/officeSiblings";
import { isSucursalAutomatizada } from "@lib/officeHelpers";
import {
  getOfficeAddressKey,
  normalizeOfficeAddress,
} from "@lib/officeAddress";
import { createQueryCache } from "@lib/queryCache";

const OFFICE_META_TTL_MS = 60_000;
const officeMetaCache = createQueryCache<unknown>({
  ttlMs: OFFICE_META_TTL_MS,
});

export function invalidateOfficeCaches(): void {
  officeMetaCache.invalidateAll();
}

export interface ProvinceWithRegionRow {
  code: string;
  name: string;
  regionId: number;
  regionName: string | null;
}

export async function getCachedProvincesWithRegion(): Promise<
  ProvinceWithRegionRow[]
> {
  return (await officeMetaCache.getOrCompute("provincesWithRegion", async () =>
    db
      .select({
        code: provinces.code,
        name: provinces.name,
        regionId: provinces.regionId,
        regionName: regions.name,
      })
      .from(provinces)
      .leftJoin(regions, eq(provinces.regionId, regions.id))
      .orderBy(regions.name, provinces.name),
  )) as ProvinceWithRegionRow[];
}

export async function getOfficeTypeCounts(): Promise<{
  processedCounts: { type: string; count: number }[];
  officeCountByType: Record<string, number>;
}> {
  const cached = (await officeMetaCache.getOrCompute(
    "officeTypeCounts",
    async () => {
      const rawCounts = await db
        .select({
          type: offices.type,
          officeType: offices.officeType,
          name: offices.name,
          invgateDisplayName: officeInvgateLinks.invgateDisplayName,
        })
        .from(offices)
        .leftJoin(
          officeInvgateLinks,
          eq(offices.id, officeInvgateLinks.officeId),
        );

      const processedCounts: { type: string; count: number }[] = [];
      let sucursalAutoCount = 0;
      let sucursalNoAutoCount = 0;
      const otherMap = new Map<string, number>();

      for (const row of rawCounts) {
        if (!row.type) continue;
        if (row.type === "SUCURSAL") {
          if (isSucursalAutomatizada(row)) {
            sucursalAutoCount += 1;
          } else {
            sucursalNoAutoCount += 1;
          }
        } else {
          otherMap.set(row.type, (otherMap.get(row.type) ?? 0) + 1);
        }
      }

      for (const [type, count] of otherMap.entries()) {
        processedCounts.push({ type, count });
      }
      if (sucursalAutoCount > 0) {
        processedCounts.push({
          type: "SUCURSAL_AUTOMATIZADA",
          count: sucursalAutoCount,
        });
      }
      if (sucursalNoAutoCount > 0) {
        processedCounts.push({
          type: "SUCURSAL_NO_AUTOMATIZADA",
          count: sucursalNoAutoCount,
        });
      }

      const officeCountByType = processedCounts.reduce(
        (acc, row) => {
          acc.all += row.count;
          acc[row.type] = row.count;
          return acc;
        },
        { all: 0 } as Record<string, number>,
      );

      return { processedCounts, officeCountByType };
    },
  )) as {
    processedCounts: { type: string; count: number }[];
    officeCountByType: Record<string, number>;
  };

  return {
    processedCounts: cached.processedCounts.map((r) => ({ ...r })),
    officeCountByType: { ...cached.officeCountByType },
  };
}

export type OfficeSortKey =
  | "code"
  | "name"
  | "parent-nis"
  | "address"
  | "type"
  | "region"
  | "cost-center";
export type SortOrder = "asc" | "desc";

const officeSortColumns = {
  code: offices.code,
  name: sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(${offices.name}), 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), 'á', 'A'), 'é', 'E'), 'í', 'I'), 'ó', 'O'), 'ú', 'U'), 'Ñ', 'N~'), 'ñ', 'N~'), 'Ü', 'U'), 'ü', 'U')`,
  "parent-nis": offices.parentNis,
  address: sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(${offices.address}), 'Á', 'A'), 'É', 'E'), 'Í', 'I'), 'Ó', 'O'), 'Ú', 'U'), 'á', 'A'), 'é', 'E'), 'í', 'I'), 'ó', 'O'), 'ú', 'U'), 'Ñ', 'N~'), 'ñ', 'N~'), 'Ü', 'U'), 'ü', 'U')`,
  type: offices.type,
  region: offices.provinceCode,
  "cost-center": sql`COALESCE(
    NULLIF(${offices.cctAdminOffice}, ''),
    NULLIF(${offices.ccCommercial}, ''),
    NULLIF(${offices.ccCommercialCorp}, ''),
    NULLIF(${offices.ccElectoral}, ''),
    NULLIF(${offices.ccNetworkMgmt}, ''),
    NULLIF(${offices.ccOperations}, ''),
    NULLIF(${offices.ccOperational}, ''),
    NULLIF(${offices.ccHr}, ''),
    NULLIF(${offices.ccSecurity}, ''),
    NULLIF(${offices.ccAdmin}, ''),
    NULLIF(${offices.ccAdmission}, ''),
    NULLIF(${offices.ccCtp}, ''),
    NULLIF(${offices.ccCtt}, ''),
    NULLIF(${offices.ccTransport}, ''),
    NULLIF(${offices.ccLogistics}, ''),
    '—'
  )`,
} as const;

export interface OfficeAddressMatch {
  id: number;
  code: string;
  name: string;
  address: string;
  provinceCode: string;
  provinceName: string;
  regionName: string;
}

export interface GetOfficesParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  region?: string;
  province?: string;
  zone?: string;
  paqar?: string;
  hasParent?: boolean;
  isHeadquarter?: boolean;
  noAddress?: boolean;
  sortBy?: OfficeSortKey;
  sortOrder?: SortOrder;
  status?: "all" | "active" | "closed";
}

export async function hasClosedOffices(): Promise<boolean> {
  return (await officeMetaCache.getOrCompute("hasClosedOffices", async () => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(offices)
      .where(eq(offices.active, false));
    return count > 0;
  })) as boolean;
}

async function loadSiblingMap(): Promise<Map<string, SiblingOffice[]>> {
  return (await officeMetaCache.getOrCompute("siblingMap", async () => {
    const rows = await db
      .select({
        code: offices.code,
        name: offices.name,
        type: offices.type,
        officeType: offices.officeType,
        address: offices.address,
        provinceCode: offices.provinceCode,
        region: regions.name,
      })
      .from(offices)
      .leftJoin(provinces, eq(offices.provinceCode, provinces.code))
      .leftJoin(regions, eq(provinces.regionId, regions.id));

    return buildSiblingMap(
      rows.map((r) => {
        let mappedType = isSucursalAutomatizada({
          type: r.type,
          officeType: r.officeType,
          name: r.name,
        })
          ? "SUCURSAL_AUTOMATIZADA"
          : r.type === "SUCURSAL"
            ? "SUCURSAL_NO_AUTOMATIZADA"
            : r.type;
        return {
          code: r.code,
          name: r.name,
          type: mappedType,
          address: r.address ?? "",
          region: r.region ?? "",
          provinceCode: r.provinceCode,
        };
      }),
    );
  })) as Map<string, SiblingOffice[]>;
}

export async function findOfficeAddressMatches({
  address,
  provinceCode,
  excludeId,
  partial = false,
}: {
  address: string;
  provinceCode?: string;
  excludeId?: number;
  partial?: boolean;
}): Promise<OfficeAddressMatch[]> {
  const normalizedAddress = normalizeOfficeAddress(address);
  if (!normalizedAddress) return [];

  const rows = await db
    .select({
      id: offices.id,
      code: offices.code,
      name: offices.name,
      address: offices.address,
      provinceCode: offices.provinceCode,
      provinceName: provinces.name,
      regionName: regions.name,
    })
    .from(offices)
    .leftJoin(provinces, eq(offices.provinceCode, provinces.code))
    .leftJoin(regions, eq(provinces.regionId, regions.id));

  return rows
    .filter((row) => row.id !== excludeId)
    .filter((row) => {
      const rowKey = getOfficeAddressKey(row.address);
      return partial
        ? rowKey.includes(normalizedAddress)
        : rowKey === normalizedAddress;
    })
    .filter((row) => !provinceCode || row.provinceCode === provinceCode)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      address: normalizeOfficeAddress(row.address) ?? normalizedAddress,
      provinceCode: row.provinceCode,
      provinceName: row.provinceName ?? "",
      regionName: row.regionName ?? "",
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "es-AR"));
}

export async function getOffices(params: GetOfficesParams) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  const typeFilter = params.type || "all";
  const regionFilter = params.region || "all";
  let provinceFilter = params.province || "all";
  const zoneFilter = params.zone || "all";
  const paqarFilter = params.paqar || "all";
  const searchFilter = params.search || "";

  // 1. Get provinces mapping
  const allProvincesWithRegion = await getCachedProvincesWithRegion();

  const provincesByRegion: Record<string, { code: string; name: string }[]> =
    {};
  for (const p of allProvincesWithRegion) {
    const rName = p.regionName ?? "Sin región";
    if (!provincesByRegion[rName]) provincesByRegion[rName] = [];
    provincesByRegion[rName].push({ code: p.code, name: p.name });
  }

  // Adjust filters logic
  if (regionFilter !== "all" && provinceFilter !== "all") {
    const regionProvinces = provincesByRegion[regionFilter] || [];
    if (!regionProvinces.find((p) => p.code === provinceFilter)) {
      provinceFilter = "all";
    }
  } else if (regionFilter === "all") {
    provinceFilter = "all";
  }

  const whereConditions = [];

  // Type filter
  if (typeFilter !== "all") {
    if (typeFilter === "SUCURSAL_AUTOMATIZADA") {
      whereConditions.push(
        and(
          eq(offices.type, "SUCURSAL"),
          or(
            eq(offices.officeType, "AUTOMATIZADA"),
            sql`lower(${offices.name}) LIKE '%mosaic%'`,
            sql`EXISTS (SELECT 1 FROM ${officeInvgateLinks} l WHERE l.office_id = ${offices.id} AND lower(l.invgate_display_name) LIKE '%mosaic%')`,
          ),
        ),
      );
    } else if (typeFilter === "SUCURSAL_NO_AUTOMATIZADA") {
      whereConditions.push(
        and(
          eq(offices.type, "SUCURSAL"),
          or(
            eq(offices.officeType, "NO_AUTOMATIZADA"),
            eq(offices.officeType, "NO AUTOMATIZADA"),
            sql`${offices.officeType} IS NULL`,
          ),
          sql`lower(${offices.name}) NOT LIKE '%mosaic%'`,
          sql`NOT EXISTS (SELECT 1 FROM ${officeInvgateLinks} l WHERE l.office_id = ${offices.id} AND lower(l.invgate_display_name) LIKE '%mosaic%')`,
        ),
      );
    } else {
      whereConditions.push(eq(offices.type, typeFilter));
    }
  }

  // Search filter
  if (searchFilter) {
    const normalizedSearch = normalizeSearchValue(searchFilter);
    const trimmedSearch = searchFilter.trim();
    const looksLikeIp = /^\d{1,3}(\.\d{1,3}){0,3}\.?$/.test(trimmedSearch);

    const hostnameConditions = [
      sql`EXISTS (
        SELECT 1 FROM terminals t
        WHERE t.nis = ${offices.code}
          AND lower(t.hostname) LIKE ${`%${trimmedSearch.toLowerCase()}%`}
      )`,
      sql`EXISTS (
        SELECT 1 FROM office_assets oa
        WHERE oa.office_id = ${offices.id}
          AND lower(oa.hostname) LIKE ${`%${trimmedSearch.toLowerCase()}%`}
      )`,
    ];

    if (looksLikeIp) {
      whereConditions.push(
        or(
          like(offices.searchableText, `%${normalizedSearch}%`),
          sql`EXISTS (
            SELECT 1 FROM terminals t
            WHERE t.nis = ${offices.code}
              AND t.ip_address LIKE ${trimmedSearch + "%"}
          )`,
          sql`EXISTS (
            SELECT 1 FROM office_assets oa
            WHERE oa.office_id = ${offices.id}
              AND oa.ip LIKE ${trimmedSearch + "%"}
          )`,
          ...hostnameConditions,
        ),
      );
    } else {
      whereConditions.push(
        or(
          like(offices.searchableText, `%${normalizedSearch}%`),
          ...hostnameConditions,
        ),
      );
    }
  }

  // Province/Region filter
  if (provinceFilter !== "all") {
    whereConditions.push(eq(offices.provinceCode, provinceFilter));
  } else if (regionFilter !== "all") {
    const regionProvinces = provincesByRegion[regionFilter] || [];
    if (regionProvinces.length > 0) {
      whereConditions.push(
        inArray(
          offices.provinceCode,
          regionProvinces.map((p) => p.code),
        ),
      );
    } else {
      whereConditions.push(eq(offices.provinceCode, "NONE_MATCH"));
    }
  }

  // Zone filter
  if (zoneFilter !== "all") {
    whereConditions.push(eq(offices.zone, zoneFilter));
  }

  // Paq.AR filter
  if (paqarFilter !== "all") {
    if (paqarFilter === "admision") {
      whereConditions.push(eq(offices.paqarAdmision, true));
    } else if (paqarFilter === "entrega") {
      whereConditions.push(eq(offices.paqarEntrega, true));
    } else if (paqarFilter === "ambos") {
      whereConditions.push(
        and(eq(offices.paqarAdmision, true), eq(offices.paqarEntrega, true)),
      );
    }
  }

  // Parent / Headquarter filters
  if (params.hasParent === true) {
    whereConditions.push(
      sql`${offices.parentNis} IS NOT NULL AND ${offices.parentNis} != ''`,
    );
  }
  if (params.isHeadquarter === true) {
    whereConditions.push(like(offices.code, "_0000"));
  }

  // No address filter
  if (params.noAddress === true) {
    whereConditions.push(
      or(sql`${offices.address} IS NULL`, sql`${offices.address} = ''`),
    );
  }

  // Status filter (active/closed)
  if (params.status === "closed") {
    whereConditions.push(eq(offices.active, false));
  } else if (params.status === "active") {
    whereConditions.push(eq(offices.active, true));
  }

  const whereClause =
    whereConditions.length > 0 ? and(...whereConditions) : undefined;

  // 2. Count total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(offices)
    .where(whereClause);

  const sortKey = params.sortBy;
  const sortOrderVal = params.sortOrder ?? "asc";

  const dbOffices = await db.query.offices.findMany({
    where: whereClause,
    limit: limit,
    offset: offset,
    orderBy: (officesTable, { asc: ascFn, desc: descFn }) => {
      const orderFn = sortOrderVal === "desc" ? descFn : ascFn;
      if (sortKey && officeSortColumns[sortKey]) {
        return [orderFn(officeSortColumns[sortKey])];
      }
      return [ascFn(officesTable.code), ascFn(officesTable.name)];
    },
    with: {
      assets: true,
      terminals: true,
      province: { with: { region: true } },
      invgateLink: true,
    },
  });

  // Cached: fetch all manual hostnames globally to deduplicate terminals
  const manualHostnames = (await officeMetaCache.getOrCompute(
    "manualHostnames",
    async () => {
      const allManualHostnamesRows = await db
        .select({ hostname: officeAssets.hostname })
        .from(officeAssets)
        .where(
          sql`${officeAssets.hostname} IS NOT NULL AND ${officeAssets.hostname} != ''`,
        );
      return new Set(
        allManualHostnamesRows
          .map((r) => r.hostname?.toLowerCase())
          .filter((h): h is string => Boolean(h)),
      );
    },
  )) as Set<string>;

  const siblingMap = await loadSiblingMap();

  const officeDirectoryItems: OfficeDirectoryItem[] = dbOffices.map(
    (office) => {
      let mappedType = office.type;
      if (office.type === "SUCURSAL") {
        mappedType = isSucursalAutomatizada({
          type: office.type,
          officeType: office.officeType,
          name: office.name,
          invgateDisplayName: office.invgateLink?.invgateDisplayName,
        })
          ? "SUCURSAL_AUTOMATIZADA"
          : "SUCURSAL_NO_AUTOMATIZADA";
      }
      return {
        id: `office-${office.code.toLowerCase()}`,
        dbId: office.id,
        type: mappedType as OfficeType,
        code: office.code,
        name: office.name,
        provinceCode: office.provinceCode,
        provinceName: office.province?.name ?? "",
        location: office.province?.name ?? "",
        costCenter:
          [
            office.cctAdminOffice,
            office.ccCommercial,
            office.ccCommercialCorp,
            office.ccElectoral,
            office.ccNetworkMgmt,
            office.ccOperations,
            office.ccOperational,
            office.ccHr,
            office.ccSecurity,
            office.ccAdmin,
            office.ccAdmission,
            office.ccCtp,
            office.ccCtt,
            office.ccTransport,
            office.ccLogistics,
          ].find((val) => val && val.trim() !== "") || "—",
        postalCode: "",
        region: office.province?.region?.name ?? "",
        address: office.address ?? "",
        email: office.email ?? "",
        notes: office.notes ?? "",
        officeType: office.officeType,
        parentNis: office.parentNis,
        assets: office.assets.map((a) => ({
          type: a.type as OfficeAssetType,
          hostname: a.hostname ?? "",
          ip: a.ip ?? "",
        })),
        invgateLinked: !!office.invgateLink,
        invgateDisplayName: office.invgateLink?.invgateDisplayName ?? null,
        invgateCp: office.invgateLink?.invgateCp ?? null,
        invgateCc: office.invgateLink?.invgateCc ?? null,
        invgateAddress: office.invgateLink?.invgateAddress ?? null,
        invgateParentName: office.invgateLink?.invgateParentName ?? null,
        invgateDuplicateCount: office.invgateLink?.invgateDuplicateCount ?? 0,
        invgateUserTotal: office.invgateLink?.invgateUserTotal ?? 0,
        terminals: (office.terminals ?? [])
          .filter((t) => {
            if (!t.hostname) return true;
            return !manualHostnames.has(t.hostname.toLowerCase());
          })
          .map((t) => ({
            hostname: t.hostname ?? "",
            ipAddress: t.ipAddress ?? "",
            operatingSystem: t.operatingSystem ?? "",
          })),
        active: office.active ?? true,
        closedReason: office.closedReason,
        siblings: siblingMap.get(office.code) ?? [],
      };
    },
  );

  const hasMore = offset + dbOffices.length < count;

  return {
    data: officeDirectoryItems,
    count,
    hasMore,
  };
}
