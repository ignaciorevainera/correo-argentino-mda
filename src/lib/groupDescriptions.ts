import { escapeHtml } from "./sanitize";

export interface GroupLicenseInfo {
  name: string;
  description: string;
  recommendation: string;
}

const normalizeGroupKey = (value: string): string =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const GROUP_DESCRIPTIONS: Record<string, GroupLicenseInfo[]> = {
  "Activacion Licencia E1/E3/F3": [
    {
      name: "F3",
      description: "Apps básicas (habitualmente Outlook)",
      recommendation: "Instalar WPS Office",
    },
    {
      name: "E1",
      description:
        "Office web (Word/Excel/PowerPoint online). Sin Office de escritorio",
      recommendation:
        "Instalar WPS Office si requieren suite local. Caso contrario, usar Office web",
    },
    {
      name: "E3",
      description: "Office de escritorio (instalable en la PC)",
      recommendation:
        "Instalar Microsoft Office 365/Apps. WPS solo si hay motivo puntual y validado",
    },
  ],
  "Activacion Licencia Quisco": [
    {
      name: "Kiosko",
      description: "Similar a F3 (habitualmente Outlook)",
      recommendation: "Instalar WPS Office",
    },
  ],
  "Activacion Licencia Kiosko": [
    {
      name: "Kiosko",
      description: "Similar a F3 (habitualmente Outlook)",
      recommendation: "Instalar WPS Office",
    },
  ],
  F1: [
    {
      name: "F1",
      description: "Office web y móvil básico / Teams / Correo Kiosk",
      recommendation: "Instalar WPS Office",
    },
  ],
  F3: [
    {
      name: "F3",
      description: "Apps básicas (habitualmente Outlook)",
      recommendation: "Instalar WPS Office",
    },
  ],
  E1: [
    {
      name: "E1",
      description:
        "Office web (Word/Excel/PowerPoint online). Sin Office de escritorio",
      recommendation:
        "Instalar WPS Office si requieren suite local. Caso contrario, usar Office web",
    },
  ],
  E3: [
    {
      name: "E3",
      description: "Office de escritorio (instalable en la PC)",
      recommendation:
        "Instalar Microsoft Office 365/Apps. WPS solo si hay motivo puntual y validado",
    },
  ],
  Kiosko: [
    {
      name: "Kiosko",
      description: "Similar a F3 (habitualmente Outlook)",
      recommendation: "Instalar WPS Office",
    },
  ],
};

const KIOSKO_LICENSE: GroupLicenseInfo[] = [
  {
    name: "Kiosko",
    description: "Similar a F3 (habitualmente Outlook)",
    recommendation: "Instalar WPS Office",
  },
];

const TOKEN_LICENSES: Array<{ pattern: RegExp; licenses: GroupLicenseInfo[] }> =
  [
    { pattern: /\be3\b/, licenses: GROUP_DESCRIPTIONS.E3 },
    { pattern: /\be1\b/, licenses: GROUP_DESCRIPTIONS.E1 },
    { pattern: /\bf3\b/, licenses: GROUP_DESCRIPTIONS.F3 },
    { pattern: /\bf1\b/, licenses: GROUP_DESCRIPTIONS.F1 },
    {
      pattern: /\bkiosko\b|\bkiosco\b|\bquisco\b|\bkiosk\b/,
      licenses: KIOSKO_LICENSE,
    },
  ];

const LICENSE_PRIORITY: Record<string, number> = {
  E3: 5,
  E1: 4,
  F3: 3,
  F1: 2,
  Kiosko: 1,
};

export function getLicensesForGroup(groupName: string): GroupLicenseInfo[] {
  if (!groupName) return [];
  const raw = groupName.trim();
  if (!raw) return [];

  const direct = GROUP_DESCRIPTIONS[raw];
  if (direct) return direct;

  const normalized = normalizeGroupKey(raw);
  const normalizedKey = Object.keys(GROUP_DESCRIPTIONS).find(
    (key) => normalizeGroupKey(key) === normalized,
  );
  if (normalizedKey) return GROUP_DESCRIPTIONS[normalizedKey];

  const found: GroupLicenseInfo[] = [];
  for (const { pattern, licenses } of TOKEN_LICENSES) {
    if (!pattern.test(normalized)) continue;
    for (const lic of licenses) {
      if (!found.some((l) => l.name === lic.name)) found.push(lic);
    }
  }
  return found;
}

export interface ResolvedUserLicense {
  sigla: string;
  tooltipText: string;
  allLicenses: GroupLicenseInfo[];
  primaryLicense: GroupLicenseInfo | null;
}

export function resolveUserLicense(groups: string[]): ResolvedUserLicense {
  if (!groups || groups.length === 0) {
    return {
      sigla: "-",
      tooltipText: "Sin licencia de Office asignada en AD",
      allLicenses: [],
      primaryLicense: null,
    };
  }

  const detectedMap = new Map<string, GroupLicenseInfo>();

  for (const group of groups) {
    const lics = getLicensesForGroup(group);
    for (const lic of lics) {
      if (!detectedMap.has(lic.name)) {
        detectedMap.set(lic.name, lic);
      }
    }

    if (lics.length === 0) {
      const norm = normalizeGroupKey(group);
      if (
        norm.includes("licencia") ||
        norm.includes("o365") ||
        norm.includes("m365") ||
        norm.includes("office")
      ) {
        const cleanName = group
          .replace(/^activaci[oó]n\s+licencia\s+/i, "")
          .replace(/^licencia\s+/i, "")
          .trim();
        const fallbackName = cleanName || group;
        if (!detectedMap.has(fallbackName)) {
          detectedMap.set(fallbackName, {
            name: fallbackName,
            description: `Licencia de dominio (${group})`,
            recommendation: "Consultar especificación del perfil",
          });
        }
      }
    }
  }

  const allLicenses = Array.from(detectedMap.values());

  if (allLicenses.length === 0) {
    return {
      sigla: "-",
      tooltipText: "Sin licencia de Office asignada en AD",
      allLicenses: [],
      primaryLicense: null,
    };
  }

  allLicenses.sort((a, b) => {
    const prioA = LICENSE_PRIORITY[a.name] ?? 0;
    const prioB = LICENSE_PRIORITY[b.name] ?? 0;
    return prioB - prioA;
  });

  const primary = allLicenses[0];
  const sigla = primary.name;

  let tooltipText = "";
  if (allLicenses.length === 1) {
    tooltipText = `${primary.name}: ${primary.description}\nRecomendación: ${primary.recommendation}`;
  } else {
    const additional = allLicenses.slice(1).map((l) => l.name).join(", ");
    tooltipText = `Principal: ${primary.name} (${primary.description})\nRecomendación: ${primary.recommendation}\nOtras asignadas: ${additional}`;
  }

  return {
    sigla,
    tooltipText,
    allLicenses,
    primaryLicense: primary,
  };
}

export const LICENSE_COLORS: Record<
  string,
  { badge: string; text: string; bg: string; border: string }
> = {
  E3: {
    badge: "badge-success",
    text: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
  },
  E1: {
    badge: "badge-warning",
    text: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
  },
  F3: {
    badge: "badge-info",
    text: "text-info",
    bg: "bg-info/10",
    border: "border-info/20",
  },
  F1: {
    badge: "badge-secondary",
    text: "text-secondary",
    bg: "bg-secondary/10",
    border: "border-secondary/20",
  },
  Kiosko: {
    badge: "badge-accent",
    text: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/20",
  },
};

export function getLicenseColor(name: string) {
  return (
    LICENSE_COLORS[name] || {
      badge: "badge-primary",
      text: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
    }
  );
}

export function formatSingleLicenseTooltipHtml(lic: GroupLicenseInfo): string {
  const color = getLicenseColor(lic.name);
  return `
    <div class="flex items-center gap-1.5 border-b border-neutral-content/15 pb-1.5 mb-2">
      <span class="badge badge-sm ${color.badge} font-bold font-mono tracking-wide">${escapeHtml(lic.name)}</span>
      <span class="text-xs font-semibold">Licencia Microsoft</span>
    </div>
    <div class="space-y-1">
      <div class="text-xxs font-bold uppercase tracking-wider opacity-60">Descripción</div>
      <p class="text-xs leading-relaxed opacity-90">${escapeHtml(lic.description)}</p>
    </div>
    <div class="space-y-1 border-t border-neutral-content/15 pt-2 mt-2">
      <div class="text-xxs font-bold uppercase tracking-wider ${color.text} flex items-center gap-1">
        <svg class="size-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        Recomendación MDA
      </div>
      <div class="rounded-md ${color.bg} border ${color.border} px-2 py-1 text-xs ${color.text} font-medium leading-relaxed">
        ${escapeHtml(lic.recommendation)}
      </div>
    </div>
  `.trim();
}

export function formatLicenseTooltipHtml(info: ResolvedUserLicense): string {
  if (!info.primaryLicense) {
    return `
      <div class="space-y-1.5 text-left">
        <div class="flex items-center border-b border-neutral-content/15 pb-1.5">
          <span class="font-bold text-xs flex items-center gap-1.5 opacity-90">
            <svg class="size-3.5 text-warning shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Sin Licencia de Office
          </span>
        </div>
        <p class="text-xs opacity-80 leading-relaxed">
          El usuario no cuenta con grupos de licencia de Office asignados en Active Directory.
        </p>
        <div class="rounded-md bg-neutral-content/5 p-1.5 text-xxs opacity-70 border border-neutral-content/10">
          Si requiere suite de escritorio o correo, tramitar la solicitud correspondiente.
        </div>
      </div>
    `.trim();
  }

  const primary = info.primaryLicense;
  const color = getLicenseColor(primary.name);
  const otherLicenses = info.allLicenses.filter((l) => l.name !== primary.name);

  const otherLicensesHtml =
    otherLicenses.length > 0
      ? `
      <div class="space-y-1 border-t border-neutral-content/15 pt-2 mt-2">
        <div class="text-xxs font-bold uppercase tracking-wider opacity-60">Otras licencias asignadas</div>
        <div class="flex flex-wrap gap-1">
          ${otherLicenses
            .map(
              (l) =>
                `<span class="badge badge-xs ${getLicenseColor(l.name).badge} font-mono">${escapeHtml(l.name)}</span>`,
            )
            .join("")}
        </div>
      </div>
    `
      : "";

  return `
    <div class="space-y-2 text-left">
      <div class="flex items-center gap-1.5 border-b border-neutral-content/15 pb-1.5">
        <span class="badge badge-sm ${color.badge} font-bold font-mono tracking-wide">${escapeHtml(primary.name)}</span>
        <span class="text-xs font-semibold">Licencia Microsoft</span>
      </div>

      <div class="space-y-1">
        <div class="text-xxs font-bold uppercase tracking-wider opacity-60">Descripción</div>
        <p class="text-xs leading-relaxed opacity-90">${escapeHtml(primary.description)}</p>
      </div>

      <div class="space-y-1 border-t border-neutral-content/15 pt-2">
        <div class="text-xxs font-bold uppercase tracking-wider ${color.text} flex items-center gap-1">
          <svg class="size-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          Recomendación MDA
        </div>
        <div class="rounded-md ${color.bg} border ${color.border} px-2 py-1 text-xs ${color.text} font-medium leading-relaxed">
          ${escapeHtml(primary.recommendation)}
        </div>
      </div>

      ${otherLicensesHtml}
    </div>
  `.trim();
}


