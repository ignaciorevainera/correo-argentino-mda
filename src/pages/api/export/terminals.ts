import type { APIRoute } from "astro";
import { streamQuery } from "@lib/dbRaw";
import { streamCsv } from "@lib/csv";
import { can } from "@lib/roleConfig";
import { normalizeSearchValue } from "@lib/clientSearch";

const SQL_COLUMNS = [
  "id", "hostname", "mac_address", "ip_address", "operating_system",
  "os_architecture", "ram", "serial_number", "manufacturer", "model",
  "nis", "nis2", "last_contact", "synced_at", "searchable_text",
];

const HEADERS = [
  "ID", "Hostname", "Dirección MAC", "Dirección IP", "Sistema Operativo",
  "Arquitectura OS", "RAM", "Número de Serie", "Fabricante", "Modelo",
  "NIS (Oficina)", "NIS Alternativo", "Último Contacto", "Sincronizado El",
  "Texto de Búsqueda",
];

const KEY_MAP: Record<number, string> = {};
SQL_COLUMNS.forEach((col, i) => { KEY_MAP[i] = col; });

export const GET: APIRoute = async ({ locals, url }) => {
  const user = locals.user;
  if (!user || !can(user.role, "team_leader")) {
    return new Response(
      JSON.stringify({ error: "Acceso denegado. Se requieren permisos de Team Leader o superior para exportar a CSV." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse filters
  const search = url.searchParams.get("search") || "";
  const os = url.searchParams.get("os") || "all";
  const osVariant = url.searchParams.get("osVariant") || "all";
  const architecture = url.searchParams.get("architecture") || "all";
  const brand = url.searchParams.get("brand") || "all";
  const ram = url.searchParams.get("ram") || "all";
  const model = url.searchParams.get("model") || "all";
  const status = url.searchParams.get("status") || "all";
  const isMediterranea = url.searchParams.get("isMediterranea") === "true";
  const mediterraneaType = url.searchParams.get("mediterraneaType") || "all";

  // Build SQL dynamically
  const selectCols = SQL_COLUMNS.map(col => `t.${col} AS ${col}`).join(", ");
  let query = `SELECT ${selectCols} FROM terminals t LEFT JOIN offices o ON t.nis = o.code`;
  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (isMediterranea) {
    if (mediterraneaType === "turnero") {
      conditions.push("t.hostname LIKE ?");
      queryParams.push("TMEDI%");
    } else if (mediterraneaType === "tv") {
      conditions.push("t.hostname LIKE ?");
      queryParams.push("TVMEDI%");
    } else {
      conditions.push("(t.hostname LIKE ? OR t.hostname LIKE ?)");
      queryParams.push("TMEDI%", "TVMEDI%");
    }
  }

  if (search && search.trim() !== "") {
    const normalizedSearch = normalizeSearchValue(search).trim();
    conditions.push("(t.searchable_text LIKE ? OR o.searchable_text LIKE ?)");
    queryParams.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
  }

  if (osVariant !== "all") {
    conditions.push("LOWER(t.operating_system) LIKE ?");
    queryParams.push(`%${osVariant.toLowerCase()}%`);
  } else if (os !== "all") {
    switch (os) {
      case "win11":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%windows 11%");
        break;
      case "win10":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%windows 10%");
        break;
      case "win7":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%windows 7%");
        break;
      case "winxp":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%windows xp%");
        break;
      case "winserver":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%windows server%");
        break;
      case "ubuntu":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%ubuntu%");
        break;
      case "debian":
        conditions.push("LOWER(t.operating_system) LIKE ?");
        queryParams.push("%debian%");
        break;
      default:
        conditions.push("t.operating_system = ?");
        queryParams.push(os);
    }
  }

  if (architecture !== "all") {
    if (architecture.includes("64")) {
      conditions.push("t.os_architecture LIKE ?");
      queryParams.push("%64%");
    } else if (architecture.includes("32") || architecture.includes("86")) {
      conditions.push("(t.os_architecture LIKE ? OR t.os_architecture LIKE ?)");
      queryParams.push("%32%", "%86%");
    } else {
      conditions.push("t.os_architecture = ?");
      queryParams.push(architecture);
    }
  }

  if (brand !== "all") {
    if (brand === "hp") {
      conditions.push("(LOWER(t.manufacturer) LIKE ? OR LOWER(t.manufacturer) LIKE ? OR LOWER(t.manufacturer) LIKE ?)");
      queryParams.push("%hp%", "%hewlett-packard%", "%hewlett packard%");
    } else {
      conditions.push("LOWER(t.manufacturer) LIKE ?");
      queryParams.push(`%${brand.toLowerCase()}%`);
    }
  }

  if (ram !== "all") {
    if (ram === "<=1gb") {
      conditions.push("(t.ram LIKE ? OR t.ram LIKE ? OR t.ram LIKE ?)");
      queryParams.push("%MB%", "1.%", "1 %");
    } else if (ram === "2gb") {
      conditions.push("t.ram LIKE ?");
      queryParams.push("2%");
    } else if (ram === "4gb") {
      conditions.push("t.ram LIKE ?");
      queryParams.push("4%");
    } else if (ram === "8gb") {
      conditions.push("(t.ram LIKE ? OR t.ram LIKE ?)");
      queryParams.push("8%", "7%");
    } else if (ram === ">=16gb") {
      conditions.push("(t.ram LIKE ? OR t.ram LIKE ? OR t.ram LIKE ? OR t.ram LIKE ? OR t.ram LIKE ?)");
      queryParams.push("16%", "24%", "32%", "64%", "128%");
    }
  }

  if (status !== "all") {
    const thresholdDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    if (status === "online") {
      conditions.push("t.last_contact >= ?");
      queryParams.push(thresholdDate);
    } else if (status === "offline") {
      conditions.push("(t.last_contact < ? OR t.last_contact IS NULL OR t.last_contact = '')");
      queryParams.push(thresholdDate);
    }
  }

  if (model !== "all") {
    conditions.push("t.model = ?");
    queryParams.push(model);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY t.hostname ASC";

  try {
    const csvStream = streamCsv(HEADERS, streamQuery(query, ...queryParams), KEY_MAP);
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(csvStream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="terminales_${dateStr}.csv"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating terminals CSV:", error);
    return new Response("Error al generar el archivo CSV.", { status: 500 });
  }
};
