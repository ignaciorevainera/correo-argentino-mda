import type { OperatorData, RulesConfig } from './types';
// Removed checkTimeAlerts and timeToMinutes import

// Lazy loading of html-to-image with requestIdleCallback preloading
let _toPng: ((el: HTMLElement, options?: any) => Promise<string>) | null = null;

if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  (window as any).requestIdleCallback(async () => {
    try {
      const mod = await import('html-to-image');
      _toPng = mod.toPng;
    } catch (err: unknown) {
      console.error('Failed to preload html-to-image:', err);
    }
  });
}

async function getToPng() {
  if (!_toPng) {
    const mod = await import('html-to-image');
    _toPng = mod.toPng;
  }
  return _toPng;
}

function escapeCSVCell(val: any): string {
  const str = (val === null || val === undefined) ? '' : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export function exportCSV(
  cronoData: OperatorData[],
  dates: string[],
  rules: RulesConfig,
  monthName: string
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
    ...dates
  ];

  // Pre-calculate daily license coverage for compliance checks
  const coveragePerDay: Record<string, { total: number; licenses: number }> = {};
  dates.forEach(d => {
    let active = 0;
    let lics = 0;
    cronoData.forEach(op => {
      const s = op.asistencia?.[d];
      if (s === 'Presencial Monte Grande' || s === 'Presencial Parque Patricios' || s === 'Home Office') active++;
      if (s === 'Licencia' || s === 'Vacaciones') lics++;
    });
    coveragePerDay[d] = { total: active, licenses: lics };
  });

  const csvRows = [headers.map(escapeCSVCell).join(",")];

  cronoData.forEach(op => {
    const stats = { P: 0, HO: 0, L: 0, V: 0, F: 0 };

    // Policy compliance calculations
    const opMaxHO = (op.maxConsecutiveHO !== undefined && op.maxConsecutiveHO !== null) ? op.maxConsecutiveHO : rules.maxConsecutiveHOLimit;
    const opMinPWeek = (op.minPWeek !== undefined && op.minPWeek !== null) ? op.minPWeek : rules.minPWeekLimit;

    let maxConsecutiveHO = 0;
    let currentHO = 0;
    let currentWeekP = 0;
    let currentWeekDays = 0;
    let pWeekViolation = false;
    let licenseOverlapCount = 0;

    dates.forEach(d => {
      const s = op.asistencia?.[d];

      // Count statuses
      if (s === 'Presencial Monte Grande' || s === 'Presencial Parque Patricios') stats.P++;
      else if (s === 'Home Office') stats.HO++;
      else if (s === 'Licencia') stats.L++;
      else if (s === 'Vacaciones') stats.V++;
      else stats.F++; // Franco / No set

      // Compliance rules: HO consecutive
      if (s === 'Home Office') {
        currentHO++;
        maxConsecutiveHO = Math.max(maxConsecutiveHO, currentHO);
      } else if (s !== 'Franco' && s) {
        currentHO = 0;
      }

      // Compliance rules: Weekly P limit
      const dateObj = new Date(d + 'T12:00:00');
      if (s === 'Presencial Monte Grande' || s === 'Presencial Parque Patricios') currentWeekP++;
      if (s !== 'Franco' && s !== 'Licencia' && s !== 'Vacaciones' && s) {
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
      const isLicenseOverlap = (s === 'Licencia' || s === 'Vacaciones') && coveragePerDay[d].licenses > rules.maxLicenseOverlapLimit;
      if (isLicenseOverlap) {
        licenseOverlapCount++;
      }
    });

    const hoViolation = maxConsecutiveHO > opMaxHO;
    const totalInconsistencias = (hoViolation ? 1 : 0) + (pWeekViolation ? 1 : 0) + licenseOverlapCount;

    const email = op.username ? op.username + "@correoargentino.com.ar" : "";
    const sede = op.location || "Monte Grande";
    const turnoBase = op.horario || '-';

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
      escapeCSVCell(totalInconsistencias)
    ];

    // Format daily cells
    dates.forEach(d => {
      const status = op.asistencia?.[d] || 'Franco';
      const comment = op.comentarios?.[d] || '';
      const dailyHorario = (op.horarios_dias && op.horarios_dias[d]) || op.horario;
      const isAbsent = status === 'Licencia' || status === 'Vacaciones' || status === 'Franco';

      let cellValue = '';
      if (isAbsent) {
        cellValue = status;
      } else {
        const breakInicio = (op.breaks_inicio && op.breaks_inicio[d]) || '';
        const breakFin = (op.breaks_fin && op.breaks_fin[d]) || '';

        cellValue = `${status} [${dailyHorario || '-'}]${(breakInicio || breakFin) ? ` (Break: ${breakInicio || '--:--'} - ${breakFin || '--:--'})` : ''}`;
      }

      if (comment) {
        cellValue += ` {Nota: ${comment}}`;
      }

      row.push(escapeCSVCell(cellValue));
    });

    csvRows.push(row.join(","));
  });

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `cronograma_${monthName.toLowerCase().replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportAsImage(
  tableContainer: HTMLElement,
  monthName: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (onStart) onStart();

  const originalWidth = tableContainer.style.width;
  const originalHeight = tableContainer.style.height;
  const originalMaxWidth = tableContainer.style.maxWidth;
  const originalMaxHeight = tableContainer.style.maxHeight;
  const originalOverflow = tableContainer.style.overflow;

  try {
    tableContainer.style.width = tableContainer.scrollWidth + 'px';
    tableContainer.style.height = tableContainer.scrollHeight + 'px';
    tableContainer.style.maxWidth = 'none';
    tableContainer.style.maxHeight = 'none';
    tableContainer.style.overflow = 'visible';

    // Force layout reflow
    tableContainer.offsetHeight;

    const toPng = await getToPng();
    const computedBg = window.getComputedStyle(tableContainer).backgroundColor || '#ffffff';

    const dataUrl = await toPng(tableContainer, {
      backgroundColor: computedBg,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
        width: tableContainer.scrollWidth + 'px',
        height: tableContainer.scrollHeight + 'px'
      },
      quality: 1.0,
      pixelRatio: 2
    });

    // Restore original styles
    tableContainer.style.width = originalWidth;
    tableContainer.style.height = originalHeight;
    tableContainer.style.maxWidth = originalMaxWidth;
    tableContainer.style.maxHeight = originalMaxHeight;
    tableContainer.style.overflow = originalOverflow;

    const link = document.createElement('a');
    link.download = `cronograma_${monthName.toLowerCase().replace(/\s+/g, '_')}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (error: unknown) {
    console.error('Error generating image:', error);
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
  monthName: string
): Promise<void> {
  if (!excelJsPromise) {
    // @ts-ignore
    const libName = 'exceljs';
    excelJsPromise = import(/* @vite-ignore */ libName);
  }
  const ExcelJS = await excelJsPromise;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Cronograma');

  const headers = [
    "Operador",
    "Email",
    "Sede",
    "Turno Base",
    ...dates
  ];
  worksheet.addRow(headers);

  cronoData.forEach(op => {
    const email = op.username ? op.username + "@correoargentino.com.ar" : "";
    const row = [
      op.nombre,
      email,
      op.location || "Monte Grande",
      op.horario || '-'
    ];
    dates.forEach(d => {
      row.push(op.asistencia?.[d] || 'Franco');
    });
    worksheet.addRow(row);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cronograma_${monthName.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
