import { db } from "@db/index";
import { provinces, regions, offices, officeAssets } from "@db/schema";
import { eq, or, and, sql, inArray, asc, desc } from "drizzle-orm";
import type {
  OfficeDirectoryItem,
  OfficeAssetType,
  OfficeType,
} from "@/types/offices";
import { normalizeSearchValue } from "@lib/clientSearch";

export type OfficeSortKey = "code" | "name" | "parent-nis" | "address" | "type" | "region";
export type SortOrder = "asc" | "desc";

const officeSortColumns = {
  code: offices.code,
  name: offices.name,
  "parent-nis": offices.parentNis,
  address: offices.address,
  type: offices.type,
  region: offices.provinceCode,
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

  // Search filter (FTS5)
  if (searchFilter) {
    const normalizedSearch = normalizeSearchValue(searchFilter);
    const ftsSearch = `"${normalizedSearch}"*`;
    whereConditions.push(
      sql`${offices.id} IN (SELECT rowid FROM offices_fts WHERE searchable_text MATCH ${ftsSearch})`
    );
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
    },
  });

  // Fetch all manual hostnames globally to deduplicate terminals
  const allManualHostnamesRows = await db
    .select({ hostname: officeAssets.hostname })
    .from(officeAssets)
    .where(sql`${officeAssets.hostname} IS NOT NULL AND ${officeAssets.hostname} != ''`);
  
  const manualHostnames = new Set(
    allManualHostnamesRows.map((r) => r.hostname?.toLowerCase())
  );

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
      costCenter: "",
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
    };
  });

  const hasMore = offset + dbOffices.length < count;

  return {
    data: officeDirectoryItems,
    count,
    hasMore,
  };
}
