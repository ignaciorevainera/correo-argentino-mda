import { OperatorStatus } from './types';
import { STATUS_ICONS } from './icons';

export function getStatusStyles(type: string | undefined): {
  badge: string;
  icon: string;
  color: string;
  bgClass: string;
} {
  switch (type) {
    case OperatorStatus.Presencial:
      return {
        badge: 'bg-secondary/10 text-secondary border border-secondary/20 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase whitespace-nowrap',
        icon: STATUS_ICONS.briefcase,
        color: 'var(--color-secondary)',
        bgClass: 'bg-secondary/10 text-secondary',
      };
    case OperatorStatus.HomeOffice:
      return {
        badge: 'bg-primary/10 text-amber-600 dark:text-amber-400 border border-primary/20 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase shadow-sm whitespace-nowrap',
        icon: STATUS_ICONS.home,
        color: 'var(--color-primary)',
        bgClass: 'bg-primary/10 text-amber-600 dark:text-amber-400 border border-primary/25 shadow-sm',
      };
    case OperatorStatus.Licencia:
      return {
        badge: 'bg-error/10 text-error border border-error/20 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase whitespace-nowrap',
        icon: STATUS_ICONS.firstAid,
        color: 'var(--color-error)',
        bgClass: 'bg-error/10 text-error',
      };
    case OperatorStatus.Vacaciones:
      return {
        badge: 'bg-success/10 text-success border border-success/20 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase whitespace-nowrap',
        icon: STATUS_ICONS.sun,
        color: 'var(--color-success)',
        bgClass: 'bg-success/10 text-success',
      };
    case OperatorStatus.HorasExtras:
      return {
        badge: 'bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/30 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase shadow-sm whitespace-nowrap',
        icon: STATUS_ICONS.timer,
        color: '#0284c7',
        bgClass: 'bg-sky-500/20 text-sky-700 dark:text-sky-400 border border-sky-500/25 font-bold hover:bg-sky-500/30 shadow-sm transition-all duration-200',
      };
    case OperatorStatus.GuardiaPasiva:
      return {
        badge: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase shadow-sm whitespace-nowrap',
        icon: STATUS_ICONS.bell,
        color: '#0d9488',
        bgClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/25 shadow-sm',
      };
    case OperatorStatus.Guardia:
      return {
        badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold px-2.5 py-1 rounded-full text-[10px] tracking-wide uppercase shadow-sm whitespace-nowrap',
        icon: STATUS_ICONS.shield,
        color: '#4f46e5',
        bgClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 shadow-sm',
      };
    default:
      return {
        badge: 'bg-base-200 text-base-content/60 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border border-base-300/50 whitespace-nowrap',
        icon: STATUS_ICONS.help,
        color: 'var(--fallback-bc,oklch(var(--bc)/0.4))',
        bgClass: 'bg-base-200/50 text-base-content/50',
      };
  }
}

export function getDetailStatusClass(status: string): string {
  if (status === OperatorStatus.Presencial) return 'text-secondary';
  if (status === OperatorStatus.HomeOffice) return 'text-amber-600 dark:text-amber-400';
  if (status === OperatorStatus.Licencia) return 'text-error';
  if (status === OperatorStatus.Vacaciones) return 'text-success';
  if (status === OperatorStatus.HorasExtras) return 'text-sky-600 dark:text-sky-400';
  if (status === OperatorStatus.GuardiaPasiva) return 'text-teal-600 dark:text-teal-400';
  if (status === OperatorStatus.Guardia) return 'text-indigo-600 dark:text-indigo-400';
  return 'text-base-content/40';
}

export function getDetailIndicatorClass(status: string): string {
  if (status === OperatorStatus.Presencial) return 'bg-secondary';
  if (status === OperatorStatus.HomeOffice) return 'bg-amber-500';
  if (status === OperatorStatus.Licencia) return 'bg-error';
  if (status === OperatorStatus.Vacaciones) return 'bg-success';
  if (status === OperatorStatus.HorasExtras) return 'bg-sky-500';
  if (status === OperatorStatus.GuardiaPasiva) return 'bg-teal-500';
  if (status === OperatorStatus.Guardia) return 'bg-indigo-500';
  return 'bg-base-300';
}
