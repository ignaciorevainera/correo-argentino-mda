import type { APIRoute } from "astro";
import { parse } from "csv-parse/sync";
import { db } from "@db/index";
import { agents } from "@db/schema";
import { jsonResponse } from "@lib/apiResponse";

// Helper to normalize multiple date formats to YYYY-MM-DD
function normalizeDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // Format DD/MM/YYYY or D/M/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  return null;
}

// Helper to check if a date falls on a Saturday
function isSaturday(dateStr: string): boolean {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dateObj = new Date(y, m, d);
  return dateObj.getDay() === 6;
}

// Helper to parse Spanish dates like "lunes, 1 de junio de 2026"
function parseSpanishDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d+)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})/i);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const monthName = match[2].toLowerCase();
  const year = match[3];
  
  const months: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04",
    mayo: "05", junio: "06", julio: "07", agosto: "08",
    septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12"
  };
  
  const month = months[monthName];
  if (!month) return null;
  
  return `${year}-${month}-${day.toString().padStart(2, '0')}`;
}

// Robust name matching with DB
function findMatchingAgent(csvName: string, allAgentNames: string[]): string | null {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim();
  const normCsv = normalize(csvName);
  
  // Try direct match first (including cases where both have the comma or both do not)
  for (const name of allAgentNames) {
    if (normalize(name) === normCsv) return name;
  }
  
  // Generate possible normalized forms for the CSV name
  const csvForms = [normCsv];
  if (csvName.includes(',')) {
    const parts = csvName.split(',');
    if (parts.length === 2) {
      csvForms.push(normalize(`${parts[1]} ${parts[0]}`));
    }
  }
  
  // Compare each CSV form against all DB names and their alternative forms
  for (const name of allAgentNames) {
    const normDb = normalize(name);
    const dbForms = [normDb];
    if (name.includes(',')) {
      const parts = name.split(',');
      if (parts.length === 2) {
        dbForms.push(normalize(`${parts[1]} ${parts[0]}`));
      }
    }
    
    // Check if any CSV form matches any DB form
    for (const cForm of csvForms) {
      for (const dForm of dbForms) {
        if (cForm === dForm) return name;
      }
    }
  }
  
  return null;
}

// Map raw cell status string to database valid OperatorStatus
function mapStatusText(cellValue: string): string {
  const val = cellValue.trim().toLowerCase();
  if (!val) return "Franco";
  
  if (val.startsWith("presencial monte grande") || val.startsWith("mg") || val === "monte grande") {
    return "Presencial Monte Grande";
  }
  if (val.startsWith("presencial parque patricios") || val.startsWith("pp") || val === "parque patricios") {
    return "Presencial Parque Patricios";
  }
  if (val.startsWith("home office") || val.startsWith("ho")) {
    return "Home Office";
  }
  if (val.startsWith("licencia") || val === "l") {
    return "Licencia";
  }
  if (val.startsWith("vacaciones") || val === "v") {
    return "Vacaciones";
  }
  if (val.startsWith("franco") || val === "f") {
    return "Franco";
  }
  
  return "Franco"; // Default fallback
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return jsonResponse({ error: "No se proporcionó ningún archivo válido" }, 400);
    }

    const csvText = await file.text();
    
    // Auto-detect delimiter
    const semicolons = (csvText.match(/;/g) || []).length;
    const commas = (csvText.match(/,/g) || []).length;
    const delimiter = semicolons > commas ? ';' : ',';

    const records = parse(csvText, {
      skip_empty_lines: true,
      trim: true,
      delimiter: delimiter,
      relax_column_count: true
    });

    if (records.length === 0) {
      return jsonResponse({ error: "El archivo CSV está vacío" }, 400);
    }

    // Load database agents to validate and match CSV names
    const allAgents = await db.select({ name: agents.name }).from(agents);
    const allAgentNames = allAgents.map(a => a.name);

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

    const firstRow: string[] = records[0];
    const dateRegex = /^(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})$/;
    
    // Detect if Format A (has date columns in the first row)
    const isFormatA = firstRow.some(h => dateRegex.test(h.trim()));

    if (isFormatA) {
      // --- FORMAT A: Exported CSV parser ---
      const dateColumns = firstRow
        .map((h, index) => ({ rawHeader: h, index }))
        .map(col => ({ header: normalizeDate(col.rawHeader), index: col.index }))
        .filter((col): col is { header: string; index: number } => col.header !== null);

      const scheduleRegex = /\[([^\]]+)\]/;
      const breakRegex = /\(Break:\s*([^\s-]+)\s*-\s*([^\s)]+)\)/;

      for (let i = 1; i < records.length; i++) {
        const row = records[i];
        const rawName = row[0];
        if (!rawName) continue;

        const matchedAgentName = findMatchingAgent(rawName, allAgentNames);
        if (!matchedAgentName) continue;

        for (const col of dateColumns) {
          const dateVal = col.header;
          if (isSaturday(dateVal)) continue;
          const cellValue = row[col.index] || "";
          if (!cellValue) continue;

          const matchedStatus = mapStatusText(cellValue);

          let horario = "";
          const scheduleMatch = cellValue.match(scheduleRegex);
          if (scheduleMatch) {
            horario = scheduleMatch[1];
          }

          let breakInicio = "";
          let breakFin = "";
          const breakMatch = cellValue.match(breakRegex);
          if (breakMatch) {
            breakInicio = breakMatch[1] === "--:--" ? "" : breakMatch[1];
            breakFin = breakMatch[2] === "--:--" ? "" : breakMatch[2];
          }

          parsedEdits.push({
            agentName: matchedAgentName,
            date: dateVal,
            status: matchedStatus,
            horario,
            breakInicio,
            breakFin
          });
        }
      }
    } else {
      // --- FORMAT B: Excel original parser ---
      // 1. Identify date columns in row 0
      const dateColumns: Array<{ date: string; startIndex: number }> = [];
      for (let j = 0; j < firstRow.length; j++) {
        const cell = firstRow[j];
        if (cell) {
          const parsedDate = parseSpanishDate(cell);
          if (parsedDate) {
            dateColumns.push({ date: parsedDate, startIndex: j });
          }
        }
      }

      if (dateColumns.length === 0) {
        return jsonResponse({ error: "No se detectaron cabeceras de fecha con formato de Excel original ('lunes, 1 de junio de 2026') o YYYY-MM-DD" }, 400);
      }

      // 2. Parse operator rows (starting from index 2, since index 0 is dates and index 1 is hours)
      for (let i = 2; i < records.length; i++) {
        const row = records[i];
        const rawName = row[0];
        if (!rawName) continue;

        const matchedAgentName = findMatchingAgent(rawName, allAgentNames);
        if (!matchedAgentName) continue; // Skip section headers, blank names, etc.

        for (const col of dateColumns) {
          if (isSaturday(col.date)) continue;
          // Scan the 24 hour columns for this date
          let dayStatusText = "";
          for (let offset = 0; offset < 24; offset++) {
            const cellIndex = col.startIndex + offset;
            const cellValue = row[cellIndex];
            if (cellValue && cellValue.trim()) {
              dayStatusText = cellValue.trim();
              break; // Take the first status found in this day block
            }
          }

          const matchedStatus = mapStatusText(dayStatusText);

          parsedEdits.push({
            agentName: matchedAgentName,
            date: col.date,
            status: matchedStatus
          });
        }
      }
    }

    return jsonResponse({ edits: parsedEdits });
  } catch (error: any) {
    console.error("Import CSV Error:", error);
    return jsonResponse({ error: "Error al procesar el archivo CSV: " + error.message }, 500);
  }
};
