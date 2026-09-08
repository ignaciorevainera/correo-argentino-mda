export interface GroupLicenseInfo {
  name: string;
  description: string;
  recommendation: string;
}

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
