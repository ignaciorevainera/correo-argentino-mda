import { OperatorStatus } from './types';
import { STATUS_ICONS } from './icons';

export function getStatusStyles(type: string | undefined): {
  badge: string;
  icon: string;
  color: string;
  bgClass: string;
} {
  switch (type) {
    case OperatorStatus.HomeOffice:
      return {
        badge: 'bg-secondary/10 text-secondary border border-secondary/20 font-bold px-2.5 py-1 rounded-full text-xxs tracking-wide uppercase whitespace-nowrap',
        icon: STATUS_ICONS.home,
        color: 'var(--color-secondary)',
        bgClass: 'bg-secondary/10 text-secondary',
      };
    case OperatorStatus.PresencialMonteGrande:
      return {
        badge: 'bg-primary/10 text-amber-700 dark:text-amber-400 border border-primary/20 font-bold px-2.5 py-1 rounded-full text-xxs tracking-wide uppercase shadow-sm whitespace-nowrap',
        icon: STATUS_ICONS.briefcase,
        color: 'var(--color-primary)',
        bgClass: 'bg-primary/10 text-amber-700 dark:text-amber-400 border border-primary/25 shadow-sm',
      };
    case OperatorStatus.PresencialParquePatricios:
      return {
        badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-bold px-2.5 py-1 rounded-full text-xxs tracking-wide uppercase shadow-sm whitespace-nowrap',
        icon: STATUS_ICONS.briefcase,
        color: '#a855f7',
        bgClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/25 shadow-sm',
      };
    case OperatorStatus.Licencia:
      return {
        badge: 'bg-error/10 text-error border border-error/20 font-bold px-2.5 py-1 rounded-full text-xxs tracking-wide uppercase whitespace-nowrap',
        icon: STATUS_ICONS.firstAid,
        color: 'var(--color-error)',
        bgClass: 'bg-error/10 text-error',
      };
    case OperatorStatus.Vacaciones:
      return {
        badge: 'bg-success/10 text-success border border-success/20 font-bold px-2.5 py-1 rounded-full text-xxs tracking-wide uppercase whitespace-nowrap',
        icon: STATUS_ICONS.sun,
        color: 'var(--color-success)',
        bgClass: 'bg-success/10 text-success',
      };
    default:
      return {
        badge: 'bg-base-200 text-base-content/75 px-2.5 py-1 rounded-full text-xxs font-bold tracking-wide uppercase border border-base-300/50 whitespace-nowrap',
        icon: STATUS_ICONS.help,
        color: 'var(--fallback-bc,oklch(var(--bc)/0.4))',
        bgClass: 'bg-base-200/50 text-base-content/70',
      };
  }
}

export function getDetailStatusClass(status: string): string {
  if (status === OperatorStatus.HomeOffice) return 'text-secondary';
  if (status === OperatorStatus.PresencialMonteGrande) return 'text-amber-700 dark:text-amber-400';
  if (status === OperatorStatus.PresencialParquePatricios) return 'text-purple-700 dark:text-purple-400';
  if (status === OperatorStatus.Licencia) return 'text-error';
  if (status === OperatorStatus.Vacaciones) return 'text-success';
  return 'text-base-content/60';
}

export function getDetailIndicatorClass(status: string): string {
  if (status === OperatorStatus.HomeOffice) return 'bg-secondary';
  if (status === OperatorStatus.PresencialMonteGrande) return 'bg-amber-500';
  if (status === OperatorStatus.PresencialParquePatricios) return 'bg-purple-500';
  if (status === OperatorStatus.Licencia) return 'bg-error';
  if (status === OperatorStatus.Vacaciones) return 'bg-success';
  return 'bg-base-300';
}
