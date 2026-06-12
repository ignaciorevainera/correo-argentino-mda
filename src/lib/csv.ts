export function generateCsv(headers: string[], rows: any[][]): string {
  // Función auxiliar para sanitizar cada celda individual
  const sanitizeCell = (cell: any): string => {
    if (cell === null || cell === undefined) return "";
    
    // Convertir booleanos a texto amigable, opcionalmente, aunque los endpoints lo harán, esto sirve de fallback
    if (typeof cell === "boolean") {
      return cell ? "Sí" : "No";
    }

    const strCell = String(cell);

    // Si contiene comillas dobles, saltos de línea o el delimitador (;), hay que envolver en comillas
    const needsWrapping = /["\n\r;]/.test(strCell);

    if (needsWrapping) {
      // Escapar las comillas internas duplicándolas (" -> "")
      const escapedStr = strCell.replace(/"/g, '""');
      return `"${escapedStr}"`;
    }

    return strCell;
  };

  const csvRows: string[] = [];

  // Agregar la cabecera
  const headerRow = headers.map(sanitizeCell).join(";");
  csvRows.push(headerRow);

  // Agregar los datos
  for (const row of rows) {
    const csvRow = row.map(sanitizeCell).join(";");
    csvRows.push(csvRow);
  }

  // Unir todas las filas con salto de línea CRLF (\r\n para mayor compatibilidad Windows/Excel)
  const csvContent = csvRows.join("\r\n");

  // Anteponer el BOM (Byte Order Mark) para UTF-8
  return `\uFEFF${csvContent}`;
}
