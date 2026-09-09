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
    {
      pattern: /\bkiosko\b|\bkiosco\b|\bquisco\b|\bkiosk\b/,
      licenses: KIOSKO_LICENSE,
    },
  ];

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
