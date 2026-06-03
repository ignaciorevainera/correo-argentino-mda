export type RoleMatrixFeature = {
  feature: string;
  icon: string;
  agent: boolean;
  referent: boolean;
  supervisor: boolean;
  admin: boolean;
};

export const rolesMatrix: RoleMatrixFeature[] = [
  {
    feature: "Consulta de oficinas",
    icon: "boxicons:building-house",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Consulta de enlaces",
    icon: "boxicons:git-branch-filled",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Consulta de títulos",
    icon: "boxicons:note",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Consulta de guía de soportes",
    icon: "boxicons:headphone",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Consulta de inventario de terminales/cubics",
    icon: "boxicons:chip-filled",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Generar firmas",
    icon: "boxicons:edit-alt",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Visualizar cronogramas",
    icon: "boxicons:calendar",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Observar calidad de operador del usuario logueado",
    icon: "boxicons:user-id-card",
    agent: true,
    referent: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Gestionar calidad de operadores",
    icon: "boxicons:star",
    agent: false,
    referent: true,
    supervisor: true,
    admin: false,
  },
  {
    feature: "Asignación de autogestiones",
    icon: "boxicons:user-check",
    agent: false,
    referent: true,
    supervisor: true,
    admin: false,
  },
  {
    feature: "Editar cronogramas",
    icon: "boxicons:calendar",
    agent: false,
    referent: false,
    supervisor: true,
    admin: false,
  },
  {
    feature: "Gestión de títulos",
    icon: "boxicons:note",
    agent: false,
    referent: false,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Gestión de oficinas/enlaces/títulos/soportes/inventario",
    icon: "boxicons:task",
    agent: false,
    referent: false,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Gestión de usuarios",
    icon: "boxicons:group",
    agent: false,
    referent: false,
    supervisor: false,
    admin: true,
  },
];
