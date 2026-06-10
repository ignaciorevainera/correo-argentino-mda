export interface FilterButtonConfig {
  activeClass: string;
  inactiveClass: string;
  activeDotClass?: string;
  inactiveDotClass?: string;
}

export const STATUS_FILTER_CONFIGS: Record<'monthly' | 'daily', Record<string, FilterButtonConfig>> = {
  monthly: {
    all: {
      activeClass: "btn btn-xs btn-secondary font-black uppercase tracking-widest text-[9px] px-3 py-1.5 h-auto rounded-lg shadow-sm shadow-secondary/15 transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline border-base-300 text-base-content/60 hover:bg-base-200/50 font-black uppercase tracking-widest text-[9px] px-3 py-1.5 h-auto rounded-lg transition-all duration-200"
    },
    'Presencial Monte Grande': {
      activeClass: "btn btn-xs btn-primary gap-1.5 font-black text-[9px] uppercase tracking-wider px-3 py-1.5 h-auto rounded-lg shadow-sm shadow-primary/15 transition-all duration-200 text-primary-content",
      inactiveClass: "btn btn-xs btn-outline gap-1.5 font-black text-[9px] uppercase tracking-wider border-base-300 hover:bg-primary/10 hover:text-amber-600 dark:hover:text-amber-400 hover:border-primary/20 text-base-content/60 px-3 py-1.5 h-auto rounded-lg transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-amber-500 transition-colors duration-200"
    },
    'Presencial Parque Patricios': {
      activeClass: "btn btn-xs bg-purple-600 border-0 gap-1.5 font-black text-[9px] uppercase tracking-wider px-3 py-1.5 h-auto rounded-lg shadow-sm shadow-purple-600/15 text-white transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1.5 font-black text-[9px] uppercase tracking-wider border-base-300 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-500/20 text-base-content/60 px-3 py-1.5 h-auto rounded-lg transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-purple-500 transition-colors duration-200"
    },
    'Home Office': {
      activeClass: "btn btn-xs btn-secondary gap-1.5 font-black text-[9px] uppercase tracking-wider px-3 py-1.5 h-auto rounded-lg shadow-sm shadow-secondary/15 transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1.5 font-black text-[9px] uppercase tracking-wider border-base-300 hover:bg-secondary/10 hover:text-secondary hover:border-secondary/20 text-base-content/60 px-3 py-1.5 h-auto rounded-lg transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-secondary transition-colors duration-200"
    },
    Licencia: {
      activeClass: "btn btn-xs btn-error gap-1.5 font-black text-[9px] uppercase tracking-wider px-3 py-1.5 h-auto rounded-lg shadow-sm shadow-error/15 text-error-content transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1.5 font-black text-[9px] uppercase tracking-wider border-base-300 hover:bg-error/10 hover:text-error hover:border-error/20 text-base-content/60 px-3 py-1.5 h-auto rounded-lg transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-error transition-colors duration-200"
    },
    Vacaciones: {
      activeClass: "btn btn-xs btn-success gap-1.5 font-black text-[9px] uppercase tracking-wider px-3 py-1.5 h-auto rounded-lg shadow-sm shadow-success/15 text-success-content transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1.5 font-black text-[9px] uppercase tracking-wider border-base-300 hover:bg-success/10 hover:text-success hover:border-success/20 text-base-content/60 px-3 py-1.5 h-auto rounded-lg transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-success transition-colors duration-200"
    }
  },
  daily: {
    all: {
      activeClass: "btn btn-xs btn-secondary font-black uppercase tracking-widest text-[9px] px-2.5 h-6 rounded-md shadow-sm shadow-secondary/15 transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline border-transparent hover:bg-base-200/50 text-base-content/60 font-black uppercase tracking-widest text-[9px] px-2.5 h-6 rounded-md transition-all duration-200"
    },
    'Presencial Monte Grande': {
      activeClass: "btn btn-xs btn-primary gap-1 font-black text-[9px] uppercase tracking-wider px-2.5 h-6 rounded-md shadow-sm shadow-primary/15 transition-all duration-200 text-primary-content",
      inactiveClass: "btn btn-xs btn-outline gap-1 font-black text-[9px] uppercase tracking-wider border-transparent hover:bg-primary/10 hover:text-amber-600 dark:hover:text-amber-400 hover:border-primary/20 text-base-content/60 px-2.5 h-6 rounded-md transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-amber-500 transition-colors duration-200"
    },
    'Presencial Parque Patricios': {
      activeClass: "btn btn-xs bg-purple-600 border-0 gap-1 font-black text-[9px] uppercase tracking-wider px-2.5 h-6 rounded-md shadow-sm shadow-purple-600/15 text-white transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1 font-black text-[9px] uppercase tracking-wider border-transparent hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-500/20 text-base-content/60 px-2.5 h-6 rounded-md transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-purple-500 transition-colors duration-200"
    },
    'Home Office': {
      activeClass: "btn btn-xs btn-secondary gap-1 font-black text-[9px] uppercase tracking-wider px-2.5 h-6 rounded-md shadow-sm shadow-secondary/15 transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1 font-black text-[9px] uppercase tracking-wider border-transparent hover:bg-secondary/10 hover:text-secondary hover:border-secondary/20 text-base-content/60 px-2.5 h-6 rounded-md transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-secondary transition-colors duration-200"
    },
    Licencia: {
      activeClass: "btn btn-xs btn-error gap-1 font-black text-[9px] uppercase tracking-wider px-2.5 h-6 rounded-md shadow-sm shadow-error/15 text-error-content transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1 font-black text-[9px] uppercase tracking-wider border-transparent hover:bg-error/10 hover:text-error hover:border-error/20 text-base-content/60 px-2.5 h-6 rounded-md transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-error transition-colors duration-200"
    },
    Vacaciones: {
      activeClass: "btn btn-xs btn-success gap-1 font-black text-[9px] uppercase tracking-wider px-2.5 h-6 rounded-md shadow-sm shadow-success/15 text-success-content transition-all duration-200",
      inactiveClass: "btn btn-xs btn-outline gap-1 font-black text-[9px] uppercase tracking-wider border-transparent hover:bg-success/10 hover:text-success hover:border-success/20 text-base-content/60 px-2.5 h-6 rounded-md transition-all duration-200",
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white transition-colors duration-200",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-success transition-colors duration-200"
    }
  }
};

export const LOCATION_FILTER_CONFIG: FilterButtonConfig = {
  activeClass: "btn btn-xs btn-secondary font-black uppercase tracking-widest text-[9px] px-2.5 h-6 rounded-md shadow-sm shadow-secondary/15 transition-all duration-200",
  inactiveClass: "btn btn-xs btn-outline font-black text-[9px] uppercase tracking-wider border-transparent hover:bg-secondary/10 hover:text-secondary hover:border-secondary/20 text-base-content/60 px-2.5 h-6 rounded-md transition-all duration-200"
};

export function updateButtonGroupState(
  buttons: { el: HTMLElement | null; value: string }[],
  activeValue: string,
  config: Record<string, FilterButtonConfig> | FilterButtonConfig
): void {
  buttons.forEach(({ el, value }) => {
    if (!el) return;
    const cfg = 'activeClass' in config ? (config as FilterButtonConfig) : (config as Record<string, FilterButtonConfig>)[value];
    if (!cfg) return;

    const isActive = value === activeValue;
    el.className = isActive ? cfg.activeClass : cfg.inactiveClass;
    el.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    const dot = el.querySelector('.rounded-full');
    if (dot) {
      if (isActive && cfg.activeDotClass) {
        dot.className = cfg.activeDotClass;
      } else if (!isActive && cfg.inactiveDotClass) {
        dot.className = cfg.inactiveDotClass;
      }
    }
  });
}
