export type CubicStatus = "online" | "offline";
export type CubicShift = "morning" | "afternoon_night";

export interface CubicAgent {
  name: string;
  avatarInitials: string;
}

export interface CubicAssignment {
  agent: CubicAgent;
  shift: CubicShift;
}

export interface CubicMachine {
  id: string;
  name: string;
  ip: string;
  status: CubicStatus;
  assignments: CubicAssignment[];
}

export interface CubicTrend {
  delta: number;
  message: string;
}

export const cubicMachines: CubicMachine[] = [
  {
    id: "cubic-2999",
    name: "b1842zacw2999.correo.local",
    ip: "10.254.59.62",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Ana Rojas",
          avatarInitials: "AR",
        },
      },
      {
        shift: "afternoon_night",
        agent: {
          name: "Bruno Perez",
          avatarInitials: "BP",
        },
      },
    ],
  },
  {
    id: "cubic-1919",
    name: "b1842zacw1919.correo.local",
    ip: "10.254.59.66",
    status: "offline",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Matias Gomez",
          avatarInitials: "MG",
        },
      },
    ],
  },
  {
    id: "cubic-1515",
    name: "b1842zacw1515.correo.local",
    ip: "10.254.59.38",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Lucia Diaz",
          avatarInitials: "LD",
        },
      },
    ],
  },
  {
    id: "cubic-1475",
    name: "b1842zacw1475.correo.local",
    ip: "10.254.59.65",
    status: "online",
    assignments: [
      {
        shift: "afternoon_night",
        agent: {
          name: "Ivan Torres",
          avatarInitials: "IT",
        },
      },
    ],
  },
  {
    id: "cubic-0071",
    name: "b1842zacw0071.correo.local",
    ip: "10.254.59.57",
    status: "offline",
    assignments: [],
  },
  {
    id: "cubic-0040",
    name: "b1842zacw0040.correo.local",
    ip: "10.254.59.63",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Carla Suarez",
          avatarInitials: "CS",
        },
      },
      {
        shift: "afternoon_night",
        agent: {
          name: "Diego Navarro",
          avatarInitials: "DN",
        },
      },
    ],
  },
  {
    id: "cubic-6000",
    name: "b1842zacw6000.correo.local",
    ip: "10.254.59.55",
    status: "offline",
    assignments: [
      {
        shift: "afternoon_night",
        agent: {
          name: "Nadia Lopez",
          avatarInitials: "NL",
        },
      },
    ],
  },
  {
    id: "cubic-3015",
    name: "b1842zacw3015.correo.local",
    ip: "10.254.59.50",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Pablo Acuna",
          avatarInitials: "PA",
        },
      },
    ],
  },
  {
    id: "cubic-3003",
    name: "b1842zacw3003.correo.local",
    ip: "10.254.59.51",
    status: "offline",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Sofia Molina",
          avatarInitials: "SM",
        },
      },
      {
        shift: "afternoon_night",
        agent: {
          name: "Matias Gomez",
          avatarInitials: "MG",
        },
      },
    ],
  },
  {
    id: "cubic-1917",
    name: "b1842zacw1917.correo.local",
    ip: "10.254.59.54",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Lucia Diaz",
          avatarInitials: "LD",
        },
      },
    ],
  },
  {
    id: "cubic-1718",
    name: "b1842zacw1718.correo.local",
    ip: "10.254.59.40",
    status: "offline",
    assignments: [
      {
        shift: "afternoon_night",
        agent: {
          name: "Bruno Perez",
          avatarInitials: "BP",
        },
      },
    ],
  },
  {
    id: "cubic-1660",
    name: "b1842zacw1660.correo.local",
    ip: "10.254.59.53",
    status: "online",
    assignments: [],
  },
  {
    id: "cubic-1650",
    name: "b1842zacw1650.correo.local",
    ip: "10.254.59.56",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Carla Suarez",
          avatarInitials: "CS",
        },
      },
    ],
  },
  {
    id: "cubic-1646",
    name: "b1842zacw1646.correo.local",
    ip: "10.254.59.43",
    status: "offline",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Ivan Torres",
          avatarInitials: "IT",
        },
      },
      {
        shift: "afternoon_night",
        agent: {
          name: "Nadia Lopez",
          avatarInitials: "NL",
        },
      },
    ],
  },
  {
    id: "cubic-1051",
    name: "b1842zacw1051.correo.local",
    ip: "10.254.59.45",
    status: "online",
    assignments: [
      {
        shift: "afternoon_night",
        agent: {
          name: "Diego Navarro",
          avatarInitials: "DN",
        },
      },
    ],
  },
  {
    id: "cubic-0645",
    name: "b1842zacw0645.correo.local",
    ip: "10.254.59.80",
    status: "offline",
    assignments: [],
  },
  {
    id: "cubic-0558",
    name: "b1842zacw0558.correo.local",
    ip: "10.254.59.42",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Pablo Acuna",
          avatarInitials: "PA",
        },
      },
    ],
  },
  {
    id: "cubic-0333",
    name: "b1842zacw0333.correo.local",
    ip: "10.254.59.47",
    status: "offline",
    assignments: [
      {
        shift: "afternoon_night",
        agent: {
          name: "Sofia Molina",
          avatarInitials: "SM",
        },
      },
    ],
  },
  {
    id: "cubic-0280",
    name: "b1842zacw0280.correo.local",
    ip: "10.254.59.44",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Ana Rojas",
          avatarInitials: "AR",
        },
      },
      {
        shift: "afternoon_night",
        agent: {
          name: "Ivan Torres",
          avatarInitials: "IT",
        },
      },
    ],
  },
  {
    id: "cubic-0273",
    name: "b1842zacw0273.correo.local",
    ip: "10.254.59.46",
    status: "offline",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Lucia Diaz",
          avatarInitials: "LD",
        },
      },
    ],
  },
  {
    id: "cubic-0150",
    name: "b1842zacw0150.correo.local",
    ip: "10.254.59.58",
    status: "online",
    assignments: [],
  },
  {
    id: "cubic-0120",
    name: "b1842zacw0120.correo.local",
    ip: "10.254.59.48",
    status: "online",
    assignments: [
      {
        shift: "afternoon_night",
        agent: {
          name: "Carla Suarez",
          avatarInitials: "CS",
        },
      },
    ],
  },
  {
    id: "cubic-0107",
    name: "b1842zacw0107.correo.local",
    ip: "10.254.59.64",
    status: "offline",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Nadia Lopez",
          avatarInitials: "NL",
        },
      },
      {
        shift: "afternoon_night",
        agent: {
          name: "Pablo Acuna",
          avatarInitials: "PA",
        },
      },
    ],
  },
  {
    id: "cubic-0044",
    name: "b1842zacw0044.correo.local",
    ip: "10.254.59.39",
    status: "online",
    assignments: [
      {
        shift: "morning",
        agent: {
          name: "Diego Navarro",
          avatarInitials: "DN",
        },
      },
    ],
  },
];

export const cubicTrend: CubicTrend = {
  delta: 3,
  message: "desde la ultima hora",
};

export const getActiveMachineCount = (machines: CubicMachine[]): number =>
  machines.filter((machine) => machine.status === "online").length;
