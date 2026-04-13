export type CubicStatus = "online" | "offline";

export interface CubicAgent {
  name: string;
  avatarInitials: string;
}

export interface CubicMachine {
  id: string;
  name: string;
  ip: string;
  status: CubicStatus;
  agent: CubicAgent | null;
}

export interface CubicTrend {
  delta: number;
  message: string;
}

export const cubicMachines: CubicMachine[] = [
  {
    id: "cubic-1515",
    name: "b1842zacw1515.correo.local",
    ip: "10.20.32.42",
    status: "online",
    agent: {
      name: "Ana Rojas",
      avatarInitials: "AR",
    },
  },
  {
    id: "cubic-1917",
    name: "b1842zacw1917.correo.local",
    ip: "10.20.32.43",
    status: "online",
    agent: {
      name: "Matias Gomez",
      avatarInitials: "MG",
    },
  },
  {
    id: "cubic-2321",
    name: "b1842zacw2321.correo.local",
    ip: "10.20.32.44",
    status: "offline",
    agent: null,
  },
  {
    id: "cubic-2725",
    name: "b1842zacw2725.correo.local",
    ip: "10.20.32.45",
    status: "offline",
    agent: {
      name: "Lucia Diaz",
      avatarInitials: "LD",
    },
  },
  {
    id: "cubic-3131",
    name: "b1842zacw3131.correo.local",
    ip: "10.20.32.46",
    status: "online",
    agent: {
      name: "Bruno Perez",
      avatarInitials: "BP",
    },
  },
  {
    id: "cubic-3535",
    name: "b1842zacw3535.correo.local",
    ip: "10.20.32.47",
    status: "offline",
    agent: {
      name: "Sofia Molina",
      avatarInitials: "SM",
    },
  },
  {
    id: "cubic-3941",
    name: "b1842zacw3941.correo.local",
    ip: "10.20.32.48",
    status: "online",
    agent: null,
  },
  {
    id: "cubic-4345",
    name: "b1842zacw4345.correo.local",
    ip: "10.20.32.49",
    status: "offline",
    agent: {
      name: "Diego Navarro",
      avatarInitials: "DN",
    },
  },
];

export const cubicTrend: CubicTrend = {
  delta: 3,
  message: "desde la ultima hora",
};

export const getActiveMachineCount = (machines: CubicMachine[]): number =>
  machines.filter((machine) => machine.status === "online").length;
