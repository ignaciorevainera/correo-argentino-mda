import type { APIRoute } from "astro";
import { streamQuery } from "@lib/dbRaw";
import { streamCsv } from "@lib/csv";
import { can } from "@lib/roleConfig";
import { normalizeSearchValue } from "@lib/clientSearch";

const SQL_COLUMNS = [
  "id", "code", "name", "type", "provinceCode", "address", "lat", "lng",
  "email", "notes", "street", "number", "locality", "county", "zone",
  "officeType", "categoryClass", "rubric", "parentNis", "phone", "manager",
  "regionId", "enRed", "paqarAdmision", "paqarEntrega", "payroll",
  "tax_exempt", "division", "company", "warehouse", "profit_center",
  "cct_admin_office", "cc_commercial", "cc_commercial_corp", "cc_electoral",
  "cc_network_mgmt", "cc_operations", "cc_operational", "cc_hr",
  "cc_security", "cc_admin", "cc_admission", "cc_ctp", "cc_ctt",
  "cc_transport", "cc_logistics", "pos_auto_auto", "pos_current_account",
  "pos_manual", "pos_manual_auto", "pos_planta_mg", "pos_virtual",
  "pos_auto_auto_2", "pos_sap_terminal", "searchable_text",
];

const HEADERS = [
  "ID", "Código", "Nombre", "Tipo", "Cód. Provincia", "Dirección", "Latitud",
  "Longitud", "Correo", "Notas", "Calle", "Número", "Localidad", "Partido",
  "Zona", "Tipo Oficina", "Clase Categoría", "Rubro", "NIS Padre", "Teléfono",
  "Gerente", "ID Región", "En Red", "Admisión PaqAr", "Entrega PaqAr",
  "Payroll", "Exento Impuestos", "División", "Compañía", "Almacén",
  "Centro de Beneficio", "CCT Oficina Admin", "CC Comercial",
  "CC Comercial Corp", "CC Electoral", "CC Gestión de Red", "CC Operaciones",
  "CC Operativo", "CC RRHH", "CC Seguridad", "CC Admin", "CC Admisión",
  "CC CTP", "CC CTT", "CC Transporte", "CC Logística", "POS Auto-Auto",
  "POS Cta. Corriente", "POS Manual", "POS Manual-Auto", "POS Planta MG",
  "POS Virtual", "POS Auto-Auto 2", "POS Terminal SAP", "Texto de Búsqueda",
];

const BOOL_COLS = new Set([
  "enRed", "paqarAdmision", "paqarEntrega", "payroll", "tax_exempt",
]);

function toSqlExpr(col: string): string {
  return BOOL_COLS.has(col)
    ? `CASE WHEN o.${col} THEN 'Sí' ELSE 'No' END AS ${col}`
    : `o.${col} AS ${col}`;
}

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
  const type = url.searchParams.get("type") || "all";
  const region = url.searchParams.get("region") || "all";
  const province = url.searchParams.get("province") || "all";
  const zone = url.searchParams.get("zone") || "all";
  const paqar = url.searchParams.get("paqar") || "all";
  const hasParent = url.searchParams.get("hasParent") === "true";
  const isHeadquarter = url.searchParams.get("isHeadquarter") === "true";

  const sortBy = url.searchParams.get("sortBy") || "";
  const sortOrder = url.searchParams.get("sortOrder") || "asc";

  // Build query
  const selectCols = SQL_COLUMNS.map(toSqlExpr).join(", ");
  let query = `SELECT ${selectCols} FROM offices o`;
  const conditions: string[] = [];
  const queryParams: any[] = [];

  // Type filter
  if (type !== "all") {
    if (type === "SUCURSAL_AUTOMATIZADA") {
      conditions.push("o.type = ? AND o.officeType = ?");
      queryParams.push("SUCURSAL", "AUTOMATIZADA");
    } else if (type === "SUCURSAL_NO_AUTOMATIZADA") {
      conditions.push("o.type = ? AND (o.officeType = ? OR o.officeType IS NULL)");
      queryParams.push("SUCURSAL", "NO AUTOMATIZADA");
    } else {
      conditions.push("o.type = ?");
      queryParams.push(type);
    }
  }

  // Search filter
  if (search && search.trim() !== "") {
    const normalizedSearch = normalizeSearchValue(search);
    const trimmedSearch = search.trim();
    const looksLikeIp = /^\d{1,3}(\.\d{1,3}){0,3}\.?$/.test(trimmedSearch);

    let searchCond = `(o.searchable_text LIKE ? OR EXISTS (
      SELECT 1 FROM terminals t
      WHERE t.nis = o.code AND LOWER(t.hostname) LIKE ?
    ) OR EXISTS (
      SELECT 1 FROM office_assets oa
      WHERE oa.office_id = o.id AND LOWER(oa.hostname) LIKE ?
    ))`;
    queryParams.push(`%${normalizedSearch}%`, `%${trimmedSearch.toLowerCase()}%`, `%${trimmedSearch.toLowerCase()}%`);

    if (looksLikeIp) {
      searchCond = `(o.searchable_text LIKE ? OR EXISTS (
        SELECT 1 FROM terminals t
        WHERE t.nis = o.code AND t.ip_address LIKE ?
      ) OR EXISTS (
        SELECT 1 FROM office_assets oa
        WHERE oa.office_id = o.id AND oa.ip LIKE ?
      ) OR EXISTS (
        SELECT 1 FROM terminals t
        WHERE t.nis = o.code AND LOWER(t.hostname) LIKE ?
      ) OR EXISTS (
        SELECT 1 FROM office_assets oa
        WHERE oa.office_id = o.id AND LOWER(oa.hostname) LIKE ?
      ))`;
      queryParams.push(
        `%${normalizedSearch}%`,
        trimmedSearch + "%",
        trimmedSearch + "%",
        `%${trimmedSearch.toLowerCase()}%`,
        `%${trimmedSearch.toLowerCase()}%`
      );
    }
    conditions.push(searchCond);
  }

  // Province/Region filter
  if (province !== "all") {
    conditions.push("o.provinceCode = ?");
    queryParams.push(province);
  } else if (region !== "all") {
    conditions.push("o.provinceCode IN (SELECT p.code FROM provinces p JOIN regions r ON p.regionId = r.id WHERE r.name = ?)");
    queryParams.push(region);
  }

  // Zone filter
  if (zone !== "all") {
    conditions.push("o.zone = ?");
    queryParams.push(zone);
  }

  // Paq.AR filter
  if (paqar !== "all") {
    if (paqar === "admision") {
      conditions.push("o.paqarAdmision = 1");
    } else if (paqar === "entrega") {
      conditions.push("o.paqarEntrega = 1");
    } else if (paqar === "ambos") {
      conditions.push("o.paqarAdmision = 1 AND o.paqarEntrega = 1");
    }
  }

  // Parent / Headquarter filters
  if (hasParent) {
    conditions.push("o.parentNis IS NOT NULL AND o.parentNis != ''");
  }
  if (isHeadquarter) {
    conditions.push("o.code LIKE ?");
    queryParams.push("_0000");
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  // Sorting
  const validSortCols: Record<string, string> = {
    code: "o.code",
    name: "o.name",
    "parent-nis": "o.parentNis",
    address: "o.address",
  };

  const orderDir = sortOrder.toLowerCase() === "desc" ? "DESC" : "ASC";
  if (sortBy && validSortCols[sortBy]) {
    query += ` ORDER BY ${validSortCols[sortBy]} ${orderDir}`;
  } else {
    query += " ORDER BY substr(o.code, 1, 1) ASC, CAST(substr(o.code, 2) AS INTEGER) ASC";
  }

  try {
    const csvStream = streamCsv(HEADERS, streamQuery(query, ...queryParams), KEY_MAP);
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(csvStream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="oficinas_${dateStr}.csv"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating offices CSV:", error);
    return new Response("Error al generar el archivo CSV.", { status: 500 });
  }
};
