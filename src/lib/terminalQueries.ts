import { db } from "@db/index";
import { terminals, offices, provinces, regions } from "@db/schema";
import {
  eq,
  like,
  notLike,
  inArray,
  or,
  and,
  sql,
  gte,
  lt,
  isNull,
  asc,
  desc,
} from "drizzle-orm";
import { normalizeSearchValue } from "@lib/clientSearch";

import { type OsFamily, toOsFamily } from "@lib/terminalHelpers";
export type { OsFamily };

import {
  groupTTDevices,
  sortTTGroups,
  type TTMinimalRow,
  type TTGroup,
  type TTPairState,
} from "@lib/ttGroups";

export type { TTPairState };

export type TerminalSortKey = "hostname" | "hardware" | "os" | "location";
export type SortOrder = "asc" | "desc";

const terminalSortColumns = {
  hostname: terminals.hostname,
  hardware: terminals.manufacturer,
  os: terminals.operatingSystem,
  location: terminals.nis,
} as const satisfies Record<
  TerminalSortKey,
  (typeof terminals)[keyof typeof terminals]
>;

export interface TerminalItem {
  hostname: string;
  ip: string;
  mac: string;
  manufacturer: string;
  model: string;
  ram: string;
  serial: string;
  osName: string;
  architecture: string;
  lastContactRaw: string;
  branch: string;
  province: string;
  region: string;
  nis: string;
  lastContactDate: string;
  lastContactTime: string;
  osFamily: OsFamily;
  isTelegrafia: boolean;
}

const telegrafiaExists = sql<number>`EXISTS (
  SELECT 1
  FROM office_assets oa
  JOIN offices o ON oa.office_id = o.id
  WHERE o.type = 'TELEGRAFIA'
    AND (oa.hostname = ${terminals.hostname} OR oa.ip = ${terminals.ipAddress})
)`;

const fullTerminalSelect = () =>
  db
    .select({
      terminal: terminals,
      officeName: offices.name,
      provinceCode: offices.provinceCode,
      provinceName: provinces.name,
      regionName: regions.name,
      isTelegrafia: telegrafiaExists,
    })
    .from(terminals)
    .leftJoin(offices, eq(terminals.nis, offices.code))
    .leftJoin(provinces, eq(offices.provinceCode, provinces.code))
    .leftJoin(regions, eq(provinces.regionId, regions.id));

interface TerminalQueryRow {
  terminal: typeof terminals.$inferSelect;
  officeName: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  regionName: string | null;
  isTelegrafia: number;
}

function mapTerminalQueryRow(row: TerminalQueryRow): TerminalItem {
  const t = row.terminal;
  const lastContact = parseLastContact(t.lastContact || "");

  let architecture = "--";
  if (t.osArchitecture) {
    if (t.osArchitecture.includes("64")) {
      architecture = "64 bits";
    } else if (
      t.osArchitecture.includes("32") ||
      t.osArchitecture.includes("86")
    ) {
      architecture = "32 bits";
    } else {
      architecture = t.osArchitecture;
    }
  }

  return {
    hostname: t.hostname || "--",
    ip: t.ipAddress || "--",
    mac: t.macAddress || "--",
    manufacturer: t.manufacturer || "--",
    model: t.model || "--",
    ram: t.ram || "--",
    serial: t.serialNumber || "--",
    osName: t.operatingSystem || "--",
    architecture,
    branch: row.officeName || "--",
    province: row.provinceName || "--",
    region: row.regionName || "--",
    nis: t.nis || "--",
    lastContactRaw: t.lastContact || "",
    lastContactDate: lastContact.date,
    lastContactTime: lastContact.time,
    osFamily: toOsFamily(t.operatingSystem || ""),
    isTelegrafia: row.isTelegrafia === 1,
  };
}

const monthLabels = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const parseLastContact = (
  lastContact: string,
): { date: string; time: string } => {
  const parsedDate = new Date(lastContact.replace(" ", "T"));
  if (Number.isNaN(parsedDate.getTime())) return { date: "--", time: "--" };
  const day = String(parsedDate.getDate()).padStart(2, "0");
  const month = monthLabels[parsedDate.getMonth()];
  const year = parsedDate.getFullYear();
  const hours = String(parsedDate.getHours()).padStart(2, "0");
  const minutes = String(parsedDate.getMinutes()).padStart(2, "0");
  return { date: `${day} ${month} ${year}`, time: `${hours}:${minutes}` };
};

export interface GetTerminalsParams {
  page?: number;
  limit?: number;
  search?: string;
  os?: string;
  osVariant?: string;
  architecture?: string;
  brand?: string;
  ram?: string;
  status?: string;
  model?: string;
  sortBy?: TerminalSortKey;
  sortOrder?: SortOrder;
  isMediterranea?: boolean;
  mediterraneaType?: string;
  ttType?: "all" | "tyt" | "sts";
  vmFilter?: "all" | "with" | "without";
  duplicates?: boolean;
  orphans?: boolean;
}

export async function getTerminals(params: GetTerminalsParams = {}) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  let queryBuilder = fullTerminalSelect().$dynamic();

  const filters = [];

  if (params.isMediterranea === true) {
    if (params.mediterraneaType === "turnero") {
      filters.push(like(terminals.hostname, "TMEDI%"));
    } else if (params.mediterraneaType === "tv") {
      filters.push(like(terminals.hostname, "TVMEDI%"));
    } else {
      filters.push(
        or(
          like(terminals.hostname, "TMEDI%"),
          like(terminals.hostname, "TVMEDI%"),
        ),
      );
    }
  }

  if (params.search && params.search !== "") {
    const normalizedSearch = normalizeSearchValue(params.search).trim();
    filters.push(
      or(
        like(terminals.searchableText, `%${normalizedSearch}%`),
        like(offices.searchableText, `%${normalizedSearch}%`),
      ),
    );
  }

  if (params.osVariant && params.osVariant !== "all") {
    filters.push(
      like(
        sql`lower(${terminals.operatingSystem})`,
        `%${params.osVariant.toLowerCase()}%`,
      ),
    );
  } else if (params.os && params.os !== "all") {
    switch (params.os) {
      case "win11":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%windows 11%"),
        );
        break;
      case "win10":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%windows 10%"),
        );
        break;
      case "win7":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%windows 7%"),
        );
        break;
      case "winxp":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%windows xp%"),
        );
        break;
      case "winserver":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%windows server%"),
        );
        break;
      case "ubuntu":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%ubuntu%"),
        );
        break;
      case "debian":
        filters.push(
          like(sql`lower(${terminals.operatingSystem})`, "%debian%"),
        );
        break;
      default:
        filters.push(eq(terminals.operatingSystem, params.os));
    }
  }

  if (params.architecture && params.architecture !== "all") {
    if (params.architecture.includes("64")) {
      filters.push(like(terminals.osArchitecture, "%64%"));
    } else if (
      params.architecture.includes("32") ||
      params.architecture.includes("86")
    ) {
      filters.push(
        or(
          like(terminals.osArchitecture, "%32%"),
          like(terminals.osArchitecture, "%86%"),
        ),
      );
    } else {
      filters.push(eq(terminals.osArchitecture, params.architecture));
    }
  }

  if (params.brand && params.brand !== "all") {
    if (params.brand === "hp") {
      filters.push(
        or(
          like(sql`lower(${terminals.manufacturer})`, "%hp%"),
          like(sql`lower(${terminals.manufacturer})`, "%hewlett-packard%"),
          like(sql`lower(${terminals.manufacturer})`, "%hewlett packard%"),
        ),
      );
    } else {
      filters.push(
        like(
          sql`lower(${terminals.manufacturer})`,
          `%${params.brand.toLowerCase()}%`,
        ),
      );
    }
  }

  if (params.ram && params.ram !== "all") {
    if (params.ram === "<=1gb") {
      filters.push(
        or(
          like(terminals.ram, "%MB%"),
          like(terminals.ram, "1.%"),
          like(terminals.ram, "1 %"),
        ),
      );
    } else if (params.ram === "2gb") {
      filters.push(like(terminals.ram, "2%"));
    } else if (params.ram === "4gb") {
      filters.push(like(terminals.ram, "4%"));
    } else if (params.ram === "8gb") {
      filters.push(or(like(terminals.ram, "8%"), like(terminals.ram, "7%")));
    } else if (params.ram === ">=16gb") {
      filters.push(
        or(
          like(terminals.ram, "16%"),
          like(terminals.ram, "24%"),
          like(terminals.ram, "32%"),
          like(terminals.ram, "64%"),
          like(terminals.ram, "128%"),
        ),
      );
    }
  }

  if (params.status && params.status !== "all") {
    // Calculamos la fecha límite de 24 horas atrás en formato 'YYYY-MM-DD HH:MM:SS'
    const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    if (params.status === "online") {
      filters.push(gte(terminals.lastContact, thresholdDate));
    } else if (params.status === "offline") {
      filters.push(
        or(
          lt(terminals.lastContact, thresholdDate),
          isNull(terminals.lastContact),
          eq(terminals.lastContact, ""),
        ),
      );
    }
  }

  if (params.model && params.model !== "all") {
    filters.push(eq(terminals.model, params.model));
  }

  if (params.duplicates) {
    // Hostname o IP repetidos: síntoma de equipos que dejaron de reportar
    // pero persisten en el inventario legacy.
    filters.push(
      sql`(${terminals.hostname} IN (SELECT hostname FROM terminals WHERE hostname IS NOT NULL AND hostname != '' GROUP BY hostname HAVING COUNT(*) > 1)
        OR ${terminals.ipAddress} IN (SELECT ip_address FROM terminals WHERE ip_address IS NOT NULL AND ip_address != '' GROUP BY ip_address HAVING COUNT(*) > 1))`,
    );
  }

  if (params.orphans) {
    // NIS que no matchea ninguna oficina registrada.
    filters.push(isNull(offices.code));
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(terminals)
    .leftJoin(offices, eq(terminals.nis, offices.code))
    .where(whereClause);

  if (whereClause) {
    queryBuilder = queryBuilder.where(whereClause);
  }

  const sortColumn = params.sortBy
    ? terminalSortColumns[params.sortBy]
    : undefined;

  if (sortColumn) {
    const orderFn = params.sortOrder === "desc" ? desc : asc;
    queryBuilder = queryBuilder.orderBy(orderFn(sortColumn));
  } else if (params.isMediterranea === true) {
    queryBuilder = queryBuilder.orderBy(
      asc(
        sql`SUBSTR(${terminals.hostname}, INSTR(${terminals.hostname}, 'MEDI') + 6)`,
      ),
      asc(sql`CASE WHEN ${terminals.hostname} LIKE 'TMEDI%' THEN 0 ELSE 1 END`),
      asc(terminals.hostname),
    );
  } else {
    queryBuilder = queryBuilder.orderBy(asc(terminals.hostname));
  }

  const rows = await queryBuilder
    .limit(limit + 1)
    .offset(offset)
    .all();
  const hasMore = rows.length > limit;

  if (hasMore) {
    rows.pop();
  }

  // Mapeamos al formato requerido por TerminalRow.astro
  const data: TerminalItem[] = rows.map(mapTerminalQueryRow);

  return {
    data,
    count,
    hasMore,
  };
}

export interface TTGroupResultItem {
  base: string;
  primary: TerminalItem;
  displayPrimary: TerminalItem;
  vm: TerminalItem | null;
  pairState: TTPairState;
}

export interface TTGroupResult {
  groups: TTGroupResultItem[];
  count: number;
  hasMore: boolean;
}

// Unión TT: Debian/Ubuntu O hostname TT_____P, excluyendo Mediterránea.
const ttUnionConditions = () => [
  notLike(terminals.hostname, "TMEDI%"),
  notLike(terminals.hostname, "TVMEDI%"),
  or(
    like(sql`lower(${terminals.operatingSystem})`, "%debian%"),
    like(sql`lower(${terminals.operatingSystem})`, "%ubuntu%"),
    like(terminals.hostname, "TT_____P"),
  ),
];

const statusThresholdDate = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);

export interface StatusCounts {
  online: number;
  offline: number;
}

export async function getTerminalStatusCounts(): Promise<StatusCounts> {
  const threshold = statusThresholdDate();
  const [online] = await db
    .select({ c: sql<number>`count(*)` })
    .from(terminals)
    .where(gte(terminals.lastContact, threshold));
  const [offline] = await db
    .select({ c: sql<number>`count(*)` })
    .from(terminals)
    .where(
      or(
        lt(terminals.lastContact, threshold),
        isNull(terminals.lastContact),
        eq(terminals.lastContact, ""),
      ),
    );
  return { online: online.c, offline: offline.c };
}

export async function getTTStatusCounts(): Promise<StatusCounts> {
  const threshold = statusThresholdDate();
  const base = and(...ttUnionConditions());
  const [online] = await db
    .select({ c: sql<number>`count(*)` })
    .from(terminals)
    .where(and(base, gte(terminals.lastContact, threshold)));
  const [offline] = await db
    .select({ c: sql<number>`count(*)` })
    .from(terminals)
    .where(
      and(
        base,
        or(
          lt(terminals.lastContact, threshold),
          isNull(terminals.lastContact),
          eq(terminals.lastContact, ""),
        ),
      ),
    );
  return { online: online.c, offline: offline.c };
}

export async function getMediterraneaStatusCounts(): Promise<StatusCounts> {
  const threshold = statusThresholdDate();
  const base = or(
    like(terminals.hostname, "TMEDI%"),
    like(terminals.hostname, "TVMEDI%"),
  );
  const [online] = await db
    .select({ c: sql<number>`count(*)` })
    .from(terminals)
    .where(and(base, gte(terminals.lastContact, threshold)));
  const [offline] = await db
    .select({ c: sql<number>`count(*)` })
    .from(terminals)
    .where(
      and(
        base,
        or(
          lt(terminals.lastContact, threshold),
          isNull(terminals.lastContact),
          eq(terminals.lastContact, ""),
        ),
      ),
    );
  return { online: online.c, offline: offline.c };
}

export async function getTTGroups(
  params: GetTerminalsParams = {},
): Promise<TTGroupResult> {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  const filters = [];

  if (params.search && params.search !== "") {
    const normalizedSearch = normalizeSearchValue(params.search).trim();
    filters.push(
      or(
        like(terminals.searchableText, `%${normalizedSearch}%`),
        like(offices.searchableText, `%${normalizedSearch}%`),
      ),
    );
  }

  if (params.status && params.status !== "all") {
    const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    if (params.status === "online") {
      filters.push(gte(terminals.lastContact, thresholdDate));
    } else if (params.status === "offline") {
      filters.push(
        or(
          lt(terminals.lastContact, thresholdDate),
          isNull(terminals.lastContact),
          eq(terminals.lastContact, ""),
        ),
      );
    }
  }

  // Unión: Debian/Ubuntu O hostname TT_____P. Exclusión explícita de Mediterránea.
  filters.push(...ttUnionConditions());

  if (params.ttType === "tyt" || params.ttType === "sts") {
    // T&T se detecta por base (hostname sin sufijo -D), igual que computeTTBase.
    const ttBaseExpr = sql`CASE WHEN ${terminals.hostname} LIKE '%-D' THEN substr(${terminals.hostname}, 1, length(${terminals.hostname}) - 2) ELSE ${terminals.hostname} END`;

    if (params.ttType === "tyt") {
      filters.push(like(ttBaseExpr, "TT_____P"));
    } else {
      filters.push(
        and(
          or(
            like(sql`lower(${terminals.operatingSystem})`, "%debian%"),
            like(sql`lower(${terminals.operatingSystem})`, "%ubuntu%"),
          ),
          notLike(ttBaseExpr, "TT_____P"),
        ),
      );
    }
  }

  const whereClause = and(...filters);

  // Fase 1: filas mínimas para agrupar y paginar por grupo en JS.
  // Carga todas las filas coincidentes en memoria; aceptable mientras el
  // parque Debian/Ubuntu/TT sea acotado (miles, no millones).
  const minimalRows = await db
    .select({
      id: terminals.id,
      hostname: terminals.hostname ?? "",
      operatingSystem: terminals.operatingSystem,
      manufacturer: terminals.manufacturer,
      model: terminals.model,
      nis: terminals.nis,
    })
    .from(terminals)
    .leftJoin(offices, eq(terminals.nis, offices.code))
    .where(whereClause)
    .all();

  let allGroups = sortTTGroups(
    groupTTDevices(minimalRows),
    params.sortBy,
    params.sortOrder,
  );
  if (params.vmFilter === "with") {
    allGroups = allGroups.filter((g) => g.pairState === "complete");
  } else if (params.vmFilter === "without") {
    allGroups = allGroups.filter((g) => g.pairState === "missing-vm");
  }
  const count = allGroups.length;
  const pageGroups = allGroups.slice(offset, offset + limit + 1);
  const hasMore = pageGroups.length > limit;
  const visibleGroups: TTGroup[] = hasMore
    ? pageGroups.slice(0, limit)
    : pageGroups;

  if (visibleGroups.length === 0) {
    return { groups: [], count, hasMore };
  }

  // Fase 2: datos completos de las filas de los grupos visibles
  const rowIds = visibleGroups.flatMap((g) => g.rows.map((r) => r.id));
  const fullRows = await fullTerminalSelect()
    .where(inArray(terminals.id, rowIds))
    .all();

  const itemsById = new Map<number, TerminalItem>();
  for (const row of fullRows) {
    itemsById.set(row.terminal.id, mapTerminalQueryRow(row));
  }

  const groups: TTGroupResultItem[] = visibleGroups.map((g) => {
    const primary = itemsById.get(g.primaryId)!;
    const vmRow = g.rows.find((r) => r.id !== g.primaryId);
    const vm = vmRow ? (itemsById.get(vmRow.id) ?? null) : null;

    // Cuando existe VM, mostrar el hardware de la VM en la fila física
    // para que la columna de hardware siempre tenga datos reales (Debian 12).
    const displayPrimary: TerminalItem = vm
      ? {
          ...primary,
          manufacturer: vm.manufacturer,
          model: vm.model,
          serial: vm.serial,
          ram: vm.ram,
        }
      : primary;

    return {
      base: g.base,
      primary,
      displayPrimary,
      vm,
      pairState: g.pairState,
    };
  });

  return { groups, count, hasMore };
}

const knownBrandConditions = or(
  like(sql`lower(${terminals.manufacturer})`, "%dell%"),
  like(sql`lower(${terminals.manufacturer})`, "%lenovo%"),
  like(sql`lower(${terminals.manufacturer})`, "%hp%"),
  like(sql`lower(${terminals.manufacturer})`, "%hewlett-packard%"),
  like(sql`lower(${terminals.manufacturer})`, "%hewlett packard%"),
  like(sql`lower(${terminals.manufacturer})`, "%bangho%"),
  like(sql`lower(${terminals.manufacturer})`, "%coradir%"),
);

const blockedModelPatterns = [
  /^to be filled/i,
  /o\.?\s*e\.?\s*m/i,
  /advanced micro devices/i,
  /virtualbox/i,
  /vmware/i,
  /virtual machine/i,
  /^intel$/i,
  /^ahv$/i,
  /^system product name$/i,
  /^all series$/i,
  /^default string/i,
  /^dsdt_prj/i,
  /\(garbled\)/i,
  /^pc$/i,
  /[ï¿½]/,
];

export interface ModelBrandEntry {
  model: string;
  brand: string;
}

function inferBrandFromManufacturer(
  manufacturer: string | null,
): string | null {
  if (!manufacturer) return null;
  const lower = manufacturer.toLowerCase();
  if (lower.includes("dell")) return "dell";
  if (lower.includes("lenovo")) return "lenovo";
  if (lower.includes("hp") || lower.includes("hewlett")) return "hp";
  if (lower.includes("bangho")) return "bangho";
  if (lower.includes("coradir")) return "coradir";
  return null;
}

export async function getTerminalModelsByBrand(): Promise<ModelBrandEntry[]> {
  const rows = await db
    .select({ model: terminals.model, manufacturer: terminals.manufacturer })
    .from(terminals)
    .where(
      and(
        sql`${terminals.model} IS NOT NULL AND ${terminals.model} != ''`,
        knownBrandConditions,
      ),
    )
    .groupBy(terminals.model, terminals.manufacturer)
    .orderBy(asc(terminals.model));

  const seen = new Set<string>();
  const result: ModelBrandEntry[] = [];

  for (const row of rows) {
    if (!row.model) continue;
    const model = row.model.trim();
    const brand = inferBrandFromManufacturer(row.manufacturer);
    if (!model || !brand) continue;
    if (blockedModelPatterns.some((p) => p.test(model))) continue;
    if (seen.has(model)) continue;
    seen.add(model);
    result.push({ model, brand });
  }

  return result;
}

export async function getDistinctTerminalModels(): Promise<string[]> {
  const entries = await getTerminalModelsByBrand();
  return entries.map((e) => e.model);
}
