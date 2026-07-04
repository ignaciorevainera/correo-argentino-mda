export interface FilterButtonConfig {
  activeClass: string;
  inactiveClass: string;
  activeDotClass?: string;
  inactiveDotClass?: string;
}

const BASE = "font-bold uppercase tracking-wider text-tiny";
const INACTIVE = `btn btn-xs btn-soft ${BASE}`;
const ACTIVE = (color: string) => `btn btn-xs ${color} btn-active ${BASE}`;

export const STATUS_FILTER_CONFIGS: Record<'monthly' | 'daily', Record<string, FilterButtonConfig>> = {
  monthly: {
    all: {
      activeClass: ACTIVE("btn-secondary"),
      inactiveClass: INACTIVE,
    },
    'Presencial Monte Grande': {
      activeClass: ACTIVE("btn-primary"),
      inactiveClass: `btn btn-xs btn-soft ${BASE} gap-1.5`,
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-amber-500"
    },
    'Presencial Parque Patricios': {
      activeClass: ACTIVE("bg-purple-600 text-white"),
      inactiveClass: `btn btn-xs btn-soft ${BASE} gap-1.5`,
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-purple-500"
    },
    'Home Office': {
      activeClass: ACTIVE("btn-secondary"),
      inactiveClass: `btn btn-xs btn-soft ${BASE} gap-1.5`,
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-secondary"
    },
    Licencia: {
      activeClass: ACTIVE("btn-error"),
      inactiveClass: `btn btn-xs btn-soft ${BASE} gap-1.5`,
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-error"
    },
    Vacaciones: {
      activeClass: ACTIVE("btn-success"),
      inactiveClass: `btn btn-xs btn-soft ${BASE} gap-1.5`,
      activeDotClass: "w-1.5 h-1.5 rounded-full bg-white",
      inactiveDotClass: "w-1.5 h-1.5 rounded-full bg-success"
    }
  },
  get daily() {
    return this.monthly;
  }
};

export const LOCATION_FILTER_CONFIG: FilterButtonConfig = {
  activeClass: ACTIVE("btn-secondary"),
  inactiveClass: INACTIVE,
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
