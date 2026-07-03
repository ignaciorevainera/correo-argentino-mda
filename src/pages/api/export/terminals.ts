import type { APIRoute } from "astro";
import { db } from "@db/index";
import { terminals } from "@db/schema";
import { generateCsv } from "@lib/csv";

export const GET: APIRoute = async () => {
  try {
    const data = await db.select({
      id: terminals.id,
      hostname: terminals.hostname,
      macAddress: terminals.macAddress,
      ipAddress: terminals.ipAddress,
      operatingSystem: terminals.operatingSystem,
      osArchitecture: terminals.osArchitecture,
      ram: terminals.ram,
      serialNumber: terminals.serialNumber,
      manufacturer: terminals.manufacturer,
      model: terminals.model,
      nis: terminals.nis,
      nis2: terminals.nis2,
      lastContact: terminals.lastContact,
      syncedAt: terminals.syncedAt,
      searchableText: terminals.searchableText,
    }).from(terminals);

    const headers = [
      "ID",
      "Hostname",
      "Dirección MAC",
      "Dirección IP",
      "Sistema Operativo",
      "Arquitectura OS",
      "RAM",
      "Número de Serie",
      "Fabricante",
      "Modelo",
      "NIS (Oficina)",
      "NIS Alternativo",
      "Último Contacto",
      "Sincronizado El",
      "Texto de Búsqueda",
    ];

    const rows = data.map((terminal) => [
      terminal.id,
      terminal.hostname,
      terminal.macAddress,
      terminal.ipAddress,
      terminal.operatingSystem,
      terminal.osArchitecture,
      terminal.ram,
      terminal.serialNumber,
      terminal.manufacturer,
      terminal.model,
      terminal.nis,
      terminal.nis2,
      terminal.lastContact,
      terminal.syncedAt,
      terminal.searchableText,
    ]);

    const csvStr = generateCsv(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];

    return new Response(csvStr, {
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
