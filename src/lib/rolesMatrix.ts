// Tabla DESCRIPTIVA de capacidades por rol, renderizada en /admin/usuarios
// ("tabla comparativa de permisos") y usada por `isAllowed` para gating de UI.
// NO es la fuente de verdad: la matriz real vive en `rbac.ts`
// (`getModulePermissions` + `routePermissions` + `hasPermission`) y en
// `helpdeskAccess.ts` (visibilidad por mesa). Si una fila discrepa de esas,
// el bug esta en esta tabla. El test
// `tests/unit/roles-matrix-consistency.test.ts` cubre las filas mapeables.
//
// Nota: la visibilidad efectiva de varias filas (cronograma, cubics, calidad,
// autogestiones, asistencia) tambien depende de la mesa del usuario
// (`isSectionVisibleSync`). Esta tabla modela solo la capa de rol; el gating
// por mesa no se representa aca (es por mesa, no por rol).
export type RoleMatrixFeature = {
  feature: string;
  icon: string;
  agent: boolean;
  referent: boolean;
  team_leader: boolean;
  supervisor: boolean;
  admin: boolean;
};

export const rolesMatrix: RoleMatrixFeature[] = [
  {
    feature: "Ver Oficinas",
    icon: "boxicons:building-house",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Enlaces",
    icon: "boxicons:git-branch-filled",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Títulos",
    icon: "boxicons:note",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Mesas de Ayuda",
    icon: "boxicons:headphone",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Inventario",
    icon: "boxicons:chip-filled",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Generar Firmas",
    icon: "boxicons:edit-alt",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Cronogramas",
    icon: "boxicons:calendar",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Métricas Propias",
    icon: "boxicons:user-id-card",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Gestión de Calidad",
    icon: "boxicons:star",
    agent: false,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Autogestiones",
    icon: "boxicons:user-check",
    agent: false,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Editar Cronogramas",
    icon: "boxicons:calendar",
    agent: false,
    referent: false,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Asistencia",
    icon: "boxicons:clock",
    agent: false,
    referent: false,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Administrar Títulos",
    icon: "boxicons:note",
    agent: false,
    referent: false,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Administrar Contenido",
    icon: "boxicons:task",
    agent: false,
    referent: false,
    team_leader: false,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Administrar Usuarios",
    icon: "boxicons:group",
    agent: false,
    referent: false,
    team_leader: false,
    supervisor: false,
    admin: true,
  },
  {
    feature: "Logs de Auditoría",
    icon: "boxicons:history",
    agent: false,
    referent: false,
    team_leader: false,
    supervisor: false,
    admin: true,
  },
];

export const isAllowed = (featureName: string, role: string) => {
  const feature = rolesMatrix.find((f) => f.feature === featureName);
  const normalizedRole = role.replace(/[- ]/g, "_");
  return feature
    ? feature[normalizedRole as keyof typeof feature] === true
    : false;
};
