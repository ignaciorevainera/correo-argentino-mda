export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export function getGanttPosition(timeStr: string): number {
  const totalMinutes = 24 * 60; // 1440
  const minutes = timeToMinutes(timeStr);
  return (minutes / totalMinutes) * 100;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDMY(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year.slice(-2)}`;
}

export function formatDetailDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr + 'T12:00:00'));
}

export function escapeHtml(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isCurrentlyWorking(
  horario: string,
  breakInicio?: string,
  breakFin?: string
): { status: 'online' | 'break' | 'offline'; text: string } {
  if (!horario || horario === '-') return { status: 'offline', text: 'Fuera de horario' };

  const now = new Date();
  const [start, end] = horario.split(' - ');
  if (!start || !end) return { status: 'offline', text: 'Sin horario' };

  const [hS, mS] = start.split(':').map(Number);
  const [hE, mE] = end.split(':').map(Number);

  const startTime = new Date(now);
  startTime.setHours(hS, mS, 0);

  const endTime = new Date(now);
  endTime.setHours(hE, mE, 0);

  if (now >= startTime && now <= endTime) {
    let breakStart: Date;
    let breakEnd: Date;

    if (breakInicio && breakFin) {
      const [bhS, bmS] = breakInicio.split(':').map(Number);
      const [bhE, bmE] = breakFin.split(':').map(Number);
      breakStart = new Date(now);
      breakStart.setHours(bhS, bmS, 0);
      breakEnd = new Date(now);
      breakEnd.setHours(bhE, bmE, 0);
    } else {
      const shiftDuration = endTime.getTime() - startTime.getTime();
      breakStart = new Date(startTime.getTime() + shiftDuration / 2 - 30 * 60000);
      breakEnd = new Date(breakStart.getTime() + 60 * 60000);
    }

    if (now >= breakStart && now <= breakEnd) {
      return { status: 'break', text: 'En descanso' };
    }
    return { status: 'online', text: 'En servicio' };
  }

  return { status: 'offline', text: 'Fuera de horario' };
}

export function formatTimeInput(val: string): string {
  val = val.trim();
  if (!val) return '';
  // Support patterns like "0800" or "830"
  if (/^\d{3,4}$/.test(val)) {
    const pad = val.padStart(4, '0');
    const hh = parseInt(pad.slice(0, 2), 10);
    const mm = parseInt(pad.slice(2, 4), 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    }
  }
  // Support patterns like "8" -> "08:00"
  if (/^\d{1,2}$/.test(val)) {
    const num = parseInt(val, 10);
    if (num >= 0 && num <= 23) {
      return `${num.toString().padStart(2, '0')}:00`;
    }
  }
  // Support patterns like "8:30" or "08:30"
  const parts = val.split(':');
  if (parts.length === 2) {
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (!isNaN(hh) && !isNaN(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    }
  }
  return '';
}

export function formatScheduleInput(val: string): string {
  const trimmed = val.trim();
  if (!trimmed || trimmed === '-') return '-';

  const lower = trimmed.toLowerCase();
  if (lower === 'franco') return 'Franco';
  if (lower === 'vacaciones') return 'Vacaciones';
  if (lower === 'licencia') return 'Licencia';
  if (lower === 'home office' || lower === 'ho') return 'Home Office';
  if (lower === 'presencial monte grande' || lower === 'pmg') return 'Presencial Monte Grande';
  if (lower === 'presencial parque patricios' || lower === 'ppp') return 'Presencial Parque Patricios';

  if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    if (parts.length === 2) {
      const start = formatTimeInput(parts[0]);
      const end = formatTimeInput(parts[1]);
      if (start && end) {
        return `${start} - ${end}`;
      }
    }
  }

  const single = formatTimeInput(trimmed);
  if (single) return single;

  return '-';
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timeoutId: any;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  } as any;
}
