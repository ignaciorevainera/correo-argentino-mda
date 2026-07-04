const sanitizeCell = (cell: any): string => {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "boolean") return cell ? "Sí" : "No";
  const strCell = String(cell);
  if (/["\n\r;]/.test(strCell)) return `"${strCell.replace(/"/g, '""')}"`;
  return strCell;
};

export function generateCsv(headers: string[], rows: any[][]): string {
  const csvRows: string[] = [];
  csvRows.push(headers.map(sanitizeCell).join(";"));
  for (const row of rows) {
    csvRows.push(row.map(sanitizeCell).join(";"));
  }
  return `\uFEFF${csvRows.join("\r\n")}`;
}

export function streamCsv(
  headers: string[],
  rowIter: Iterable<Record<string, unknown>>,
  keyMap: Record<number, string>,
  options?: { includeBom?: boolean; chunkBytes?: number },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const includeBom = options?.includeBom !== false;
  const chunkBytes = options?.chunkBytes ?? 65536;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      let buffer = "";
      if (includeBom) buffer += "\uFEFF";
      buffer += headers.map(sanitizeCell).join(";") + "\r\n";

      for (const row of rowIter) {
        const rowStr = headers
          .map((_, i) => sanitizeCell(row[keyMap[i]]))
          .join(";") + "\r\n";
        buffer += rowStr;
        if (buffer.length >= chunkBytes) {
          await writer.write(encoder.encode(buffer));
          buffer = "";
        }
      }
      if (buffer) await writer.write(encoder.encode(buffer));
      await writer.close();
    } catch (err) {
      await writer.abort(err as Error);
    }
  })();

  return readable;
}
