import type { APIRoute } from "astro";
import { streamQuery } from "@lib/dbRaw";
import { streamCsv } from "@lib/csv";

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

const SQL = `SELECT ${SQL_COLUMNS.join(", ")}
FROM terminals
ORDER BY hostname ASC`;

export const GET: APIRoute = async () => {
  try {
    const csvStream = streamCsv(HEADERS, streamQuery(SQL), KEY_MAP);
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
