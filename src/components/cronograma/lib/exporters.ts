import type { OperatorData, RulesConfig } from "./types";
// Removed checkTimeAlerts and timeToMinutes import

// Lazy loading of html-to-image with requestIdleCallback preloading
let _toPng: ((el: HTMLElement, options?: any) => Promise<string>) | null = null;

if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  (window as any).requestIdleCallback(async () => {
    try {
      const mod = await import("html-to-image");
      _toPng = mod.toPng;
    } catch (err: unknown) {
      console.error("Failed to preload html-to-image:", err);
    }
  });
}

async function getToPng() {
  if (!_toPng) {
    const mod = await import("html-to-image");
    _toPng = mod.toPng;
  }
  return _toPng;
}

function escapeCSVCell(val: any): string {
  const str = val === null || val === undefined ? "" : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export function exportCSV(
  cronoData: OperatorData[],
  dates: string[],
  rules: RulesConfig,
  monthName: string,
): void {
  const headers = [
    "Operador",
    "Email",
    "Sede",
    "Turno Base",
    "Presencial (P)",
    "Home Office (HO)",
    "Licencia (L)",
    "Vacaciones (V)",
    "Franco (F)",
    "Inconsistencias Normativas",
    ...dates,
  ];

  // Pre-calculate daily license coverage for compliance checks
  const coveragePerDay: Record<string, { total: number; licenses: number }> =
    {};
  dates.forEach((d) => {
    let active = 0;
    let lics = 0;
    cronoData.forEach((op) => {
      const s = op.asistencia?.[d];
      if (
        s === "Presencial Monte Grande" ||
        s === "Presencial Parque Patricios" ||
        s === "Home Office"
      )
        active++;
      if (s === "Licencia" || s === "Vacaciones") lics++;
    });
    coveragePerDay[d] = { total: active, licenses: lics };
  });

  const csvRows = [headers.map(escapeCSVCell).join(",")];

  cronoData.forEach((op) => {
    const stats = { P: 0, HO: 0, L: 0, V: 0, F: 0 };

    // Policy compliance calculations
    const opMaxHO =
      op.maxConsecutiveHO !== undefined && op.maxConsecutiveHO !== null
        ? op.maxConsecutiveHO
        : rules.maxConsecutiveHOLimit;
    const opMinPWeek =
      op.minPWeek !== undefined && op.minPWeek !== null
        ? op.minPWeek
        : rules.minPWeekLimit;

    let maxConsecutiveHO = 0;
    let currentHO = 0;
    let currentWeekP = 0;
    let currentWeekDays = 0;
    let pWeekViolation = false;
    let licenseOverlapCount = 0;

    dates.forEach((d) => {
      const s = op.asistencia?.[d];

      // Count statuses
      if (
        s === "Presencial Monte Grande" ||
        s === "Presencial Parque Patricios"
      )
        stats.P++;
      else if (s === "Home Office") stats.HO++;
      else if (s === "Licencia") stats.L++;
      else if (s === "Vacaciones") stats.V++;
      else stats.F++; // Franco / No set

      // Compliance rules: HO consecutive
      if (s === "Home Office") {
        currentHO++;
        maxConsecutiveHO = Math.max(maxConsecutiveHO, currentHO);
      } else if (s !== "Franco" && s) {
        currentHO = 0;
      }

      // Compliance rules: Weekly P limit
      const dateObj = new Date(d + "T12:00:00");
      if (
        s === "Presencial Monte Grande" ||
        s === "Presencial Parque Patricios"
      )
        currentWeekP++;
      if (s !== "Franco" && s !== "Licencia" && s !== "Vacaciones" && s) {
        currentWeekDays++;
      }
      if (dateObj.getDay() === 0 || d === dates[dates.length - 1]) {
        if (currentWeekDays >= 5 && currentWeekP < opMinPWeek) {
          pWeekViolation = true;
        }
        currentWeekP = 0;
        currentWeekDays = 0;
      }

      // Compliance rules: License overlap limit
      const isLicenseOverlap =
        (s === "Licencia" || s === "Vacaciones") &&
        coveragePerDay[d].licenses > rules.maxLicenseOverlapLimit;
      if (isLicenseOverlap) {
        licenseOverlapCount++;
      }
    });

    const hoViolation = maxConsecutiveHO > opMaxHO;
    const totalInconsistencias =
      (hoViolation ? 1 : 0) + (pWeekViolation ? 1 : 0) + licenseOverlapCount;

    const email = op.username ? op.username + "@correoargentino.com.ar" : "";
    const sede = op.location || "Monte Grande";
    const turnoBase = op.horario || "-";

    const row = [
      escapeCSVCell(op.nombre),
      escapeCSVCell(email),
      escapeCSVCell(sede),
      escapeCSVCell(turnoBase),
      escapeCSVCell(stats.P),
      escapeCSVCell(stats.HO),
      escapeCSVCell(stats.L),
      escapeCSVCell(stats.V),
      escapeCSVCell(stats.F),
      escapeCSVCell(totalInconsistencias),
    ];

    // Format daily cells
    dates.forEach((d) => {
      const status = op.asistencia?.[d] || "Franco";
      const comment = op.comentarios?.[d] || "";
      const dailyHorario =
        (op.horarios_dias && op.horarios_dias[d]) || op.horario;
      const isAbsent =
        status === "Licencia" || status === "Vacaciones" || status === "Franco";

      let cellValue = "";
      if (isAbsent) {
        cellValue = status;
      } else {
        const breakInicio = (op.breaks_inicio && op.breaks_inicio[d]) || "";
        const breakFin = (op.breaks_fin && op.breaks_fin[d]) || "";

        cellValue = `${status} [${dailyHorario || "-"}]${breakInicio || breakFin ? ` (Break: ${breakInicio || "--:--"} - ${breakFin || "--:--"})` : ""}`;
      }

      if (comment) {
        cellValue += ` {Nota: ${comment}}`;
      }

      row.push(escapeCSVCell(cellValue));
    });

    csvRows.push(row.join(","));
  });

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `cronograma_${monthName.toLowerCase().replace(/\s+/g, "_")}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportAsImage(
  tableContainer: HTMLElement,
  monthName: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  if (onStart) onStart();

  const originalWidth = tableContainer.style.width;
  const originalHeight = tableContainer.style.height;
  const originalMaxWidth = tableContainer.style.maxWidth;
  const originalMaxHeight = tableContainer.style.maxHeight;
  const originalOverflow = tableContainer.style.overflow;

  try {
    tableContainer.style.width = tableContainer.scrollWidth + "px";
    tableContainer.style.height = tableContainer.scrollHeight + "px";
    tableContainer.style.maxWidth = "none";
    tableContainer.style.maxHeight = "none";
    tableContainer.style.overflow = "visible";

    // Force layout reflow
    tableContainer.offsetHeight;

    const toPng = await getToPng();
    const computedBg =
      window.getComputedStyle(tableContainer).backgroundColor || "#ffffff";

    const dataUrl = await toPng(tableContainer, {
      backgroundColor: computedBg,
      style: {
        transform: "scale(1)",
        transformOrigin: "top left",
        width: tableContainer.scrollWidth + "px",
        height: tableContainer.scrollHeight + "px",
      },
      quality: 1.0,
      pixelRatio: 2,
    });

    // Restore original styles
    tableContainer.style.width = originalWidth;
    tableContainer.style.height = originalHeight;
    tableContainer.style.maxWidth = originalMaxWidth;
    tableContainer.style.maxHeight = originalMaxHeight;
    tableContainer.style.overflow = originalOverflow;

    const link = document.createElement("a");
    link.download = `cronograma_${monthName.toLowerCase().replace(/\s+/g, "_")}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error: unknown) {
    console.error("Error generating image:", error);
    tableContainer.style.width = originalWidth;
    tableContainer.style.height = originalHeight;
    tableContainer.style.maxWidth = originalMaxWidth;
    tableContainer.style.maxHeight = originalMaxHeight;
    tableContainer.style.overflow = originalOverflow;
    throw error;
  } finally {
    if (onEnd) onEnd();
  }
}

let excelJsPromise: any = null;

export async function exportScheduleToExcel(
  cronoData: OperatorData[],
  dates: string[],
  _rules: RulesConfig,
  monthName: string,
): Promise<void> {
  if (!excelJsPromise) {
    // @ts-ignore
    const libName = "exceljs";
    excelJsPromise = import(/* @vite-ignore */ libName);
  }
  const ExcelJS = await excelJsPromise;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cronograma");

  const headers = ["Operador", "Email", "Sede", "Turno Base", ...dates];
  worksheet.addRow(headers);

  cronoData.forEach((op) => {
    const email = op.username ? op.username + "@correoargentino.com.ar" : "";
    const row = [
      op.nombre,
      email,
      op.location || "Monte Grande",
      op.horario || "-",
    ];
    dates.forEach((d) => {
      row.push(op.asistencia?.[d] || "Franco");
    });
    worksheet.addRow(row);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cronograma_${monthName.toLowerCase().replace(/\s+/g, "_")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExportImageOptions {
  padding?: number;
  compact?: boolean;
  /** Fixed render width in CSS px (e.g. 1034, 1388). When set, height is measured after layout so text reflows correctly. */
  width?: number;
}

export async function exportAsClipboardImage(
  element: HTMLElement,
  options: ExportImageOptions = {},
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  if (onStart) onStart();
  const { padding = 0, compact = false, width: fixedWidth } = options;

  // Fixed width mode: render at a device-independent width (e.g. 1034 / 1388)
  // so the captured image looks identical regardless of the viewer's viewport.
  // When fixedWidth is absent we fall back to the live element's scroll size.
  const liveWidth = element.scrollWidth;
  const targetWidth = fixedWidth ?? liveWidth;

  // Offscreen host so the live UI is never mutated. It acts as a BFC
  // (flow-root) that CONTAINS the clone's margin, so the final canvas is
  // exactly clone + margin ring and nothing gets cropped.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone
    .querySelectorAll("[id]")
    .forEach((el) => el.removeAttribute("id"));

  // Pin the clone to the target width so w-full children can't expand to
  // max-content (which exploded to 101k px and corrupted the canvas).
  // Height is left auto so it reflows correctly at the fixed width.
  // Breathing room is a real MARGIN on the wrapper (keeps its rounded
  // border intact), NOT canvas padding which clipped the corners.
  clone.style.width = `${targetWidth}px`;
  clone.style.maxWidth = "none";
  clone.style.overflow = "visible";
  if (padding > 0) {
    clone.style.margin = `${padding}px`;
  }
  host.style.width = `${targetWidth + padding * 2}px`;
  host.style.display = "flow-root";
  host.style.background = "var(--color-base-100)";
  const tightenStack = (selector: string, margin: string) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((parent) => {
      for (let i = 1; i < parent.children.length; i++) {
        (parent.children[i] as HTMLElement).style.marginTop = margin;
      }
    });
  };
  if (compact && padding > 0) {
    clone.querySelectorAll<HTMLElement>(".p-2").forEach((el) => {
      el.style.padding = "0.25rem";
    });
    clone.querySelectorAll<HTMLElement>(".px-3").forEach((el) => {
      el.style.paddingLeft = "0.5rem";
      el.style.paddingRight = "0.5rem";
    });
    clone.querySelectorAll<HTMLElement>(".py-2, .py-2\\.5").forEach((el) => {
      el.style.paddingTop = "0.25rem";
      el.style.paddingBottom = "0.25rem";
    });
    clone.querySelectorAll<HTMLElement>(".gap-3").forEach((el) => {
      el.style.gap = "0.375rem";
    });
    clone.querySelectorAll<HTMLElement>(".gap-2").forEach((el) => {
      el.style.gap = "0.25rem";
    });
    tightenStack(".space-y-2", "0.25rem");
    tightenStack(".space-y-3", "0.375rem");
  }
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const toPng = await getToPng();
    const computedBg =
      window.getComputedStyle(host).backgroundColor || "#ffffff";

    // Height depends on width (text reflow), so measure after the clone is
    // laid out at targetWidth. flow-root on the host makes scrollHeight
    // include the clone's margin box.
    const captureWidth = targetWidth + padding * 2;
    const captureHeight = host.scrollHeight;

    const dataUrl = await toPng(host, {
      backgroundColor: computedBg,
      style: {
        transform: "scale(1)",
        transformOrigin: "top left",
      },
      quality: 1.0,
      pixelRatio: 3,
      // html-to-image expects NUMBERS here; strings with units break the
      // canvas sizing.
      width: captureWidth,
      height: captureHeight,
    });

    const res = await fetch(dataUrl);
    const blob = await res.blob();

    if (
      !navigator.clipboard ||
      !navigator.clipboard.write ||
      typeof ClipboardItem === "undefined"
    ) {
      const link = document.createElement("a");
      link.download = `tabla_${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      throw new Error("CLIPBOARD_UNAVAILABLE_DOWNLOADED");
    }

    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
  } finally {
    if (host.parentNode) document.body.removeChild(host);
    if (onEnd) onEnd();
  }
}
