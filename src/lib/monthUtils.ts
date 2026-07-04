export const MONTH_LABELS: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

export function formatMonthLabel(monthStr: string): string {
  const [mm, yyyy] = monthStr.split("-");
  return `${MONTH_LABELS[mm] || mm} ${yyyy}`;
}
