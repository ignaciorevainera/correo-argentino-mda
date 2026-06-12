import type { APIRoute } from "astro";
import { parse } from "csv-parse/sync";

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No se proporcionó ningún archivo" }), { status: 400 });
    }

    const csvText = await file.text();
    const records = parse(csvText, {
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return new Response(JSON.stringify({ error: "El archivo CSV está vacío" }), { status: 400 });
    }

    const headers: string[] = records[0];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateColumns = headers.map((h, index) => ({ header: h, index })).filter(col => dateRegex.test(col.header));

    if (dateColumns.length === 0) {
      return new Response(JSON.stringify({ error: "No se detectaron columnas con formato de fecha YYYY-MM-DD" }), { status: 400 });
    }

    const parsedEdits: Array<{
      agentName: string;
      date: string;
      status: string;
      horario?: string;
      breakInicio?: string;
      breakFin?: string;
    }> = [];

    // Valid statuses
    const validStatuses = [
      "Presencial Monte Grande",
      "Presencial Parque Patricios",
      "Home Office",
      "Franco",
      "Licencia",
      "Vacaciones"
    ];

    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      const agentName = row[0]; // First column is Operador
      if (!agentName) continue;

      for (const col of dateColumns) {
        const dateVal = col.header;
        const cellValue = row[col.index] || "";
        if (!cellValue) continue;

        // Find matching status
        let matchedStatus = "Franco";
        for (const vs of validStatuses) {
          if (cellValue.startsWith(vs)) {
            matchedStatus = vs;
            break;
          }
        }

        // Parse optional schedule [HH:MM - HH:MM]
        let horario = "";
        const scheduleMatch = cellValue.match(/\[([^\]]+)\]/);
        if (scheduleMatch) {
          horario = scheduleMatch[1];
        }

        // Parse optional break times (Break: HH:MM - HH:MM)
        let breakInicio = "";
        let breakFin = "";
        const breakMatch = cellValue.match(/\(Break:\s*([^\s-]+)\s*-\s*([^\s)]+)\)/);
        if (breakMatch) {
          breakInicio = breakMatch[1] === "--:--" ? "" : breakMatch[1];
          breakFin = breakMatch[2] === "--:--" ? "" : breakMatch[2];
        }

        parsedEdits.push({
          agentName,
          date: dateVal,
          status: matchedStatus,
          horario,
          breakInicio,
          breakFin
        });
      }
    }

    return new Response(JSON.stringify({ edits: parsedEdits }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Import CSV Error:", error);
    return new Response(JSON.stringify({ error: "Error al procesar el archivo CSV: " + error.message }), { status: 500 });
  }
};
