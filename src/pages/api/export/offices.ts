import type { APIRoute } from "astro";
import { db } from "../../../db";
import { offices } from "../../../db/schema";
import { generateCsv } from "../../../lib/csv";

export const GET: APIRoute = async () => {
  try {
    const data = await db.select().from(offices);

    const headers = [
      "ID",
      "Código",
      "Nombre",
      "Tipo",
      "Cód. Provincia",
      "Dirección",
      "Latitud",
      "Longitud",
      "Correo",
      "Notas",
      "Calle",
      "Número",
      "Localidad",
      "Partido",
      "Zona",
      "Tipo Oficina",
      "Clase Categoría",
      "Rubro",
      "NIS Padre",
      "Teléfono",
      "Gerente",
      "ID Región",
      "En Red",
      "Admisión PaqAr",
      "Entrega PaqAr",
    ];

    const rows = data.map((office) => [
      office.id,
      office.code,
      office.name,
      office.type,
      office.provinceCode,
      office.address,
      office.lat,
      office.lng,
      office.email,
      office.notes,
      office.street,
      office.number,
      office.locality,
      office.county,
      office.zone,
      office.officeType,
      office.categoryClass,
      office.rubric,
      office.parentNis,
      office.phone,
      office.manager,
      office.regionId,
      office.enRed ? "Sí" : "No",
      office.paqarAdmision ? "Sí" : "No",
      office.paqarEntrega ? "Sí" : "No",
    ]);

    const csvStr = generateCsv(headers, rows);
    const dateStr = new Date().toISOString().split('T')[0];

    return new Response(csvStr, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="oficinas_${dateStr}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error generating offices CSV:", error);
    return new Response("Error al generar el archivo CSV.", { status: 500 });
  }
};
