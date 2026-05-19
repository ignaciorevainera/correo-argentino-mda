export interface NavItem {
  href: string;
  label: string;
  icon: string;
  children?: NavItem[];
  parentLabel?: string;
  nested?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    id: "mesa-ayuda",
    label: "Mesa de ayuda",
    items: [
      {
        href: "/supervision",
        label: "Supervisión",
        icon: "boxicons:shield-quarter-filled",
        children: [
          {
            href: "/supervision/cronograma",
            label: "Cronograma",
            icon: "boxicons:calendar-filled",
          },
          {
            href: "/supervision/calidad-operadores",
            label: "Calidad de operadores",
            icon: "boxicons:bar-chart-big-filled",
          },
          {
            href: "/supervision/asignacion-autogestiones",
            label: "Asignación de autogestiones",
            icon: "boxicons:git-branch-filled",
          },
        ],
      },
      {
        href: "/titulos-tickets",
        label: "Títulos de tickets",
        icon: "boxicons:list-ul-filled",
      },
      {
        href: "/guia-soportes",
        label: "Guía de soportes",
        icon: "boxicons:buoy-filled",
      },
    ],
  },
  {
    id: "consultas-recursos",
    label: "Consultas y recursos",
    items: [
      {
        href: "/buscador-usuarios",
        label: "Buscador de usuarios",
        icon: "boxicons:group-filled",
      },
      {
        href: "/generador-firmas",
        label: "Generador de firmas",
        icon: "boxicons:pencil-draw-filled",
      },
      {
        href: "/contactos",
        label: "Contactos",
        icon: "boxicons:phone-filled",
      },
      {
        href: "/enlaces-recursos",
        label: "Enlaces y recursos",
        icon: "boxicons:link-filled",
        children: [
          {
            href: "/catalogo-aplicativos",
            label: "Catálogo de aplicativos",
            icon: "boxicons:link-filled",
          },
        ],
      },
    ],
  },
  {
    id: "referencia",
    label: "Referencia",
    items: [
      {
        href: "/design-system",
        label: "Estándar de diseño",
        icon: "boxicons:palette-filled",
      },
    ],
  },
  {
    id: "directorio-oficinas",
    label: "Directorio de oficinas",
    items: [
      {
        href: "/directorio-oficinas",
        label: "Directorio de oficinas",
        icon: "boxicons:building-filled",
      },
    ],
  },
  {
    id: "terminales",
    label: "Inventario",
    items: [
      {
        href: "/inventario-equipos",
        label: "Inventario de equipos",
        icon: "boxicons:desktop-filled",
      },
    ],
  },
  {
    id: "admin",
    label: "Administración",
    items: [
      {
        href: "/admin",
        label: "Panel de administración",
        icon: "boxicons:apps-filled",
        children: [
          {
            href: "/admin/users",
            label: "Gestión de usuarios",
            icon: "boxicons:group-filled",
          },
          {
            href: "/admin/cubics",
            label: "Gestión de cubics",
            icon: "boxicons:server-filled",
          },
          {
            href: "/admin/offices",
            label: "Gestión de oficinas",
            icon: "boxicons:building-filled",
          },
        ],
      }
    ],
  },
];

export function getSectionTitle(pathname: string): string {
  // Flatten items
  const allItems: NavItem[] = [];
  navSections.forEach(section => {
    section.items.forEach(item => {
      allItems.push(item);
      if (item.children) {
        item.children.forEach(child => {
          allItems.push({ ...child, parentLabel: item.label });
        });
      }
    });
  });

  // Normalize pathname to remove trailing slash if present (except for root)
  const normalizedPath = pathname === "/" ? pathname : pathname.replace(/\/$/, "");

  // Find exact match first
  const exactMatch = allItems.find(item => item.href === normalizedPath);
  if (exactMatch) return exactMatch.label;

  // Find prefix match (avoiding "/")
  const prefixMatch = allItems
    .filter(item => item.href !== "/")
    .find(item => normalizedPath.startsWith(item.href));
    
  if (prefixMatch) return prefixMatch.label;

  // Default cases
  if (normalizedPath === "/") return "Portal MDA";
  
  return "";
}
