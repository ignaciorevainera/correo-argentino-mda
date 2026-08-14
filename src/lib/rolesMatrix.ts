export type RoleMatrixFeature = {
  feature: string;
  icon: string;
  agent: boolean;
  agent_coord: boolean;
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
    agent_coord: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Enlaces",
    icon: "boxicons:git-branch-filled",
    agent: true,
    agent_coord: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Títulos",
    icon: "boxicons:note",
    agent: true,
    agent_coord: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Mesas de Ayuda",
    icon: "boxicons:headphone",
    agent: true,
    agent_coord: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Ver Inventario",
    icon: "boxicons:chip-filled",
    agent: true,
    agent_coord: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Generar Firmas",
    icon: "boxicons:edit-alt",
    agent: true,
    agent_coord: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Soporte Téc. Franquicias",
    icon: "boxicons:store-alt",
    agent: false,
    agent_coord: true,
    referent: false,
    team_leader: false,
    supervisor: false,
    admin: false,
  },
  {
    feature: "Ver Cronogramas",
    icon: "boxicons:calendar",
    agent: true,
    agent_coord: false,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Métricas Propias",
    icon: "boxicons:user-id-card",
    agent: true,
    agent_coord: false,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Gestión de Calidad",
    icon: "boxicons:star",
    agent: false,
    agent_coord: false,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Autogestiones",
    icon: "boxicons:user-check",
    agent: false,
    agent_coord: false,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Editar Cronogramas",
    icon: "boxicons:calendar",
    agent: false,
    agent_coord: false,
    referent: false,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Asistencia",
    icon: "boxicons:clock",
    agent: false,
    agent_coord: false,
    referent: false,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Administrar Títulos",
    icon: "boxicons:note",
    agent: false,
    agent_coord: false,
    referent: false,
    team_leader: false,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Administrar Contenido",
    icon: "boxicons:task",
    agent: false,
    agent_coord: false,
    referent: false,
    team_leader: false,
    supervisor: true,
    admin: true,
  },
  {
    feature: "Administrar Usuarios",
    icon: "boxicons:group",
    agent: false,
    agent_coord: false,
    referent: false,
    team_leader: false,
    supervisor: false,
    admin: true,
  },
  {
    feature: "Logs de Auditoría",
    icon: "boxicons:history",
    agent: false,
    agent_coord: false,
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
