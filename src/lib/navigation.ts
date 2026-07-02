import { getCleanBase } from "./baseUrl";

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
    id: "supervision",
    label: "Supervisión",
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
          {
            href: "/supervision/asistencia",
            label: "Control de asistencia",
            icon: "boxicons:clock-filled",
          },
        ],
      },
    ],
  },
  {
    id: "accesos-rapidos",
    label: "Accesos rápidos",
    items: [
      {
        href: "/titulos",
        label: "Títulos",
        icon: "boxicons:list-ul-filled",
      },
      {
        href: "/oficinas",
        label: "Oficinas",
        icon: "boxicons:building-filled",
      },
      {
        href: "/inventario-terminales",
        label: "Terminales",
        icon: "boxicons:desktop-filled",
      },
      {
        href: "/recursos",
        label: "Enlaces",
        icon: "boxicons:link-filled",
        children: [
          {
            href: "/recursos/aplicativos",
            label: "Aplicativos",
            icon: "boxicons:link-filled",
          },
        ],
      },
      {
        href: "/contactos",
        label: "Contactos",
        icon: "boxicons:phone-filled",
      },
    ],
  },
  {
    id: "herramientas",
    label: "Herramientas",
    items: [
      {
        href: "/usuarios",
        label: "Buscador de usuarios",
        icon: "boxicons:group-filled",
      },
      {
        href: "/generador-firmas",
        label: "Generador de firmas",
        icon: "boxicons:pencil-draw-filled",
      },
    ],
  },
  {
    id: "admin",
    label: "Panel de Administración",
    items: [
      {
        href: "/admin",
        label: "Panel de Administración",
        icon: "boxicons:apps-filled",
        children: [
          {
            href: "/admin/contactos",
            label: "Contactos",
            icon: "boxicons:phone-filled",
          },
          {
            href: "/admin/recursos",
            label: "Recursos",
            icon: "boxicons:link-filled",
          },
          {
            href: "/admin/usuarios",
            label: "Usuarios",
            icon: "boxicons:group-filled",
          },
          {
            href: "/admin/operadores",
            label: "Operadores",
            icon: "boxicons:user-id-card-filled",
          },
          {
            href: "/admin/auditoria",
            label: "Auditoría",
            icon: "boxicons:history",
          },
          {
            href: "/admin/invgate/ubicaciones",
            label: "Ubicaciones InvGate",
            icon: "boxicons:location-pin-filled",
          },
        ],
      },
    ],
  },
];

export function getSectionTitle(pathname: string): string {
  // Flatten items
  const allItems: NavItem[] = [];
  navSections.forEach((section) => {
    section.items.forEach((item) => {
      allItems.push(item);
      if (item.children) {
        item.children.forEach((child) => {
          allItems.push({ ...child, parentLabel: item.label });
        });
      }
    });
  });

  // Normalize pathname relative to BASE_URL
  const cleanBase = getCleanBase();
  let relativePath = pathname;
  if (pathname.startsWith(cleanBase)) {
    relativePath = "/" + pathname.slice(cleanBase.length);
  } else if (pathname === cleanBase.slice(0, -1)) {
    relativePath = "/";
  }

  // Normalize pathname to remove trailing slash if present (except for root)
  const normalizedPath =
    relativePath === "/" ? relativePath : relativePath.replace(/\/$/, "");

  // Find exact match first
  const exactMatch = allItems.find((item) => item.href === normalizedPath);
  if (exactMatch) return exactMatch.label;

  // Find prefix match (avoiding "/")
  const prefixMatch = allItems
    .filter((item) => item.href !== "/")
    .find((item) => normalizedPath.startsWith(item.href));

  if (prefixMatch) return prefixMatch.label;

  // Default cases
  if (normalizedPath === "/") return "Portal MDA";
  if (normalizedPath === "/login") return "Iniciar sesión";

  return "";
}

export function getResolvedPathname(request: Request, url: URL): string {
  const pathname = url.pathname;
  if (pathname.startsWith("/_server-islands/")) {
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.pathname;
      } catch (e) {
      }
    }
  }
  return pathname;
}

export function getResolvedSearchParams(request: Request, url: URL): URLSearchParams {
  const pathname = url.pathname;
  if (pathname.startsWith("/_server-islands/")) {
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.searchParams;
      } catch (e) {
      }
    }
  }
  return url.searchParams;
}
