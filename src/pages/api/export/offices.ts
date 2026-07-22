import type { APIRoute } from "astro";
import { streamQuery } from "@lib/dbRaw";
import { streamCsv } from "@lib/csv";
import { can } from "@lib/roleConfig";

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
    ? `CASE WHEN ${col} THEN 'Sí' ELSE 'No' END AS ${col}`
    : col;
}

const KEY_MAP: Record<number, string> = {};
SQL_COLUMNS.forEach((col, i) => { KEY_MAP[i] = col; });

const SQL = `SELECT ${SQL_COLUMNS.map(toSqlExpr).join(", ")}
FROM offices
ORDER BY substr(code, 1, 1) ASC, CAST(substr(code, 2) AS INTEGER) ASC`;

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user || !can(user.role, "team_leader")) {
    return new Response(
      JSON.stringify({ error: "Acceso denegado. Se requieren permisos de Team Leader o superior para exportar a CSV." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const csvStream = streamCsv(HEADERS, streamQuery(SQL), KEY_MAP);
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
