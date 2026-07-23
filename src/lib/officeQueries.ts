import { db } from "@db/index";
import { provinces, regions, offices, officeAssets, officeInvgateLinks } from "@db/schema";
import { eq, or, and, sql, inArray, asc, desc, like } from "drizzle-orm";
import type {
  OfficeDirectoryItem,
  OfficeAssetType,
  OfficeType,
} from "@/types/offices";
import { normalizeSearchValue } from "@lib/clientSearch";

let manualHostnamesCache: Set<string> | null = null;
let manualHostnamesCacheTime = 0;
const MANUAL_HOSTNAMES_TTL_MS = 60_000;

export type OfficeSortKey = "code" | "name" | "parent-nis" | "address" | "type" | "region" | "cost-center";
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
  const allProvincesWithRegion = await db
    .select({
      code: provinces.code,
      name: provinces.name,
      regionId: provinces.regionId,
      regionName: regions.name,
    })
    .from(provinces)
    .leftJoin(regions, eq(provinces.regionId, regions.id))
    .orderBy(regions.name, provinces.name);

  const provincesByRegion: Record<string, { code: string; name: string }[]> = {};
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
        and(eq(offices.type, "SUCURSAL"), eq(offices.officeType, "AUTOMATIZADA")),
      );
    } else if (typeFilter === "SUCURSAL_NO_AUTOMATIZADA") {
      whereConditions.push(
        and(
          eq(offices.type, "SUCURSAL"),
          or(
            eq(offices.officeType, "NO AUTOMATIZADA"),
            sql`${offices.officeType} IS NULL`,
          ),
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
              AND t.ip_address LIKE ${trimmedSearch + '%'}
          )`,
          sql`EXISTS (
            SELECT 1 FROM office_assets oa
            WHERE oa.office_id = ${offices.id}
              AND oa.ip LIKE ${trimmedSearch + '%'}
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
      or(
        sql`${offices.address} IS NULL`,
        sql`${offices.address} = ''`,
      ),
    );
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
      contacts: { with: { contact: true } },
      province: { with: { region: true } },
      invgateLink: true,
    },
  });

  // Cached: fetch all manual hostnames globally to deduplicate terminals
  const now = Date.now();
  if (!manualHostnamesCache || now - manualHostnamesCacheTime > MANUAL_HOSTNAMES_TTL_MS) {
    const allManualHostnamesRows = await db
      .select({ hostname: officeAssets.hostname })
      .from(officeAssets)
      .where(sql`${officeAssets.hostname} IS NOT NULL AND ${officeAssets.hostname} != ''`);
    manualHostnamesCache = new Set(
      allManualHostnamesRows.map((r) => r.hostname?.toLowerCase())
    );
    manualHostnamesCacheTime = now;
  }
  const manualHostnames = manualHostnamesCache;

  const officeDirectoryItems: OfficeDirectoryItem[] = dbOffices.map((office) => {
    let mappedType = office.type;
    if (office.type === "SUCURSAL") {
      mappedType =
        office.officeType === "AUTOMATIZADA"
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
      costCenter: [
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
        office.ccLogistics
      ].find((val) => val && val.trim() !== "") || "—",
      postalCode: "",
      region: office.province?.region?.name ?? "",
      address: office.address ?? "",
      email: office.email ?? "",
      notes: office.notes ?? "",
      officeType: office.officeType,
      parentNis: office.parentNis,
      contacts: office.contacts.map((oc) => ({
        name: oc.contact.name,
        phone: oc.contact.phone ?? "",
        timeSlot: oc.timeSlot ?? "",
      })),
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
    };
  });

  const hasMore = offset + dbOffices.length < count;

  return {
    data: officeDirectoryItems,
    count,
    hasMore,
  };
}
