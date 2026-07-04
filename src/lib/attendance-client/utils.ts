export function parseTimeRange(range: string) {
  if (!range || range.trim() === "" || range.trim() === "-") return null;
  const clean = range.toLowerCase().replace(/\s+/g, "");
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?(?:-|a)(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  return {
    startH: parseInt(match[1]),
    startM: match[2] ? parseInt(match[2]) : 0,
    endH: parseInt(match[3]),
    endM: match[4] ? parseInt(match[4]) : 0,
  };
}

export function calculateCompliance(entrada: string | null | undefined, estipulado: string | null | undefined) {
  if (!entrada) return "Sin Registro";
  if (!estipulado) return "Cumplió";

  const times = parseTimeRange(estipulado);
  if (!times) return "Cumplió";

  let late = false;

  const [eh, em] = entrada.split(":").map(Number);
  if (!isNaN(eh) && !isNaN(em)) {
    const startMinutes = times.startH * 60 + times.startM;
    const realMinutes = eh * 60 + em;
    if (realMinutes > startMinutes + 10) {
      late = true;
    }
  }

  if (late) return "Llegada Tarde";
  return "Cumplió";
}

export const attendanceClasses: Record<string, string[]> = {
  "HOME OFFICE": ["text-secondary", "border-secondary/40"],
  "PRESENCIAL MONTE GRANDE": ["text-amber-600", "dark:text-amber-400", "border-primary/40"],
  "PRESENCIAL PARQUE PATRICIOS": ["text-purple-600", "dark:text-purple-400", "border-purple-500/40"],
};

export const ausenciaClasses: Record<string, string[]> = {
  "": ["text-base-content/50", "border-base-300"],
  "Tramite": ["text-slate-500", "dark:text-slate-400", "border-slate-300"],
  "Demorado": ["text-amber-500", "dark:text-amber-400", "border-amber-500/40"],
  "Se reporta enfermo": ["text-orange-400", "dark:text-orange-300", "border-orange-300"],
  "Ausente Justificado": ["text-emerald-600", "dark:text-emerald-400", "border-emerald-500/40"],
  "Ausente con Permiso": ["text-slate-500", "dark:text-slate-400", "border-slate-300"],
  "Ausente No Justificado": ["text-amber-500", "dark:text-amber-400", "border-amber-500/40"],
  "Ausencia sin aviso": ["text-rose-600", "dark:text-rose-400", "border-rose-500/40"],
  "Lic. Estudio": ["text-slate-500", "dark:text-slate-400", "border-slate-300"],
  "Lic. Medica": ["text-orange-600", "dark:text-orange-400", "border-orange-500/40"],
  "Lic. Anual": ["text-emerald-500", "dark:text-emerald-300", "border-emerald-500/20"],
  "Lic. UI": ["text-green-600", "dark:text-green-400", "border-green-500/40"],
  "Lic. Gremial": ["text-amber-600", "dark:text-amber-400", "border-amber-500/40"],
  "Lic. Paternidad": ["text-blue-500", "dark:text-blue-400", "border-blue-400/40"],
  "Lic. Maternidad": ["text-pink-500", "dark:text-pink-400", "border-pink-400/40"],
  "Lic. Fallecimiento": ["text-violet-500", "dark:text-violet-400", "border-violet-400/40"],
  "ART": ["text-cyan-500", "dark:text-cyan-400", "border-cyan-400/40"],
};

export const complianceClasses: Record<string, string> = {
  "Sin Registro": "badge-ghost text-base-content/50",
  "Cumplió": "badge-success text-success-content dark:bg-emerald-950/20 dark:text-emerald-400",
  "Incumplió": "badge-error text-error-content dark:bg-rose-950/20 dark:text-rose-400",
  "Llegada Tarde": "badge-warning text-warning-content dark:bg-amber-950/20 dark:text-amber-400",
  "Retiro Anticipado": "badge-warning text-warning-content dark:bg-amber-950/20 dark:text-amber-400",
  "Tarde y Retiro Anticipado": "badge-error text-error-content dark:bg-rose-950/20 dark:text-rose-400"
};

export const complianceLabels: Record<string, string> = {
  "Sin Registro": "SIN REGISTRO",
  "Cumplió": "CUMPLIÓ",
  "Incumplió": "INCUMPLIÓ",
  "Llegada Tarde": "LLEGADA TARDE",
  "Retiro Anticipado": "RET. ANTICIPADO",
  "Tarde y Retiro Anticipado": "TARDE Y R. ANTIC."
};

export function getSpanishDayName(dateStr: string) {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const date = new Date(dateStr + "T12:00:00");
  return days[date.getDay()];
}
