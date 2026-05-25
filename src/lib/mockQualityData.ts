export interface QualityCall {
  callId: string;
  ticketId: string;
  duration: string;
  date: string;
  notes?: string;
  monthSummary?: string;
  isCriticalFailure?: boolean;
  section1: {
    score: number;
    maxScore: number;
    details: Record<string, boolean>;
  };
  section2: {
    score: number;
    maxScore: number;
    details: Record<string, boolean>;
  };
  totalScore: number;
}

export interface OperatorQuality {
  id: string;
  name: string;
  status: "Activo" | "Vacaciones" | "Licencia";
  month: string;
  calls: QualityCall[];
  history: number[];
  averageScore: number;
}

const generateRandomCalls = (): QualityCall[] => {
  return Array.from({ length: 4 }).map((_, i) => {
    const s1Score = Math.floor(Math.random() * 20) + 80;
    const s2Score = Math.floor(Math.random() * 20) + 80;
    const total = Math.round((s1Score + s2Score) / 2);

    return {
      callId: `CALL-${Math.floor(Math.random() * 100000)
        .toString()
        .padStart(6, "0")}`,
      ticketId: `INC-${Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(7, "0")}`,
      duration: `${Math.floor(Math.random() * 10) + 2}:${Math.floor(Math.random() * 50) + 10}`,
      date: `2026-05-0${Math.floor(Math.random() * 9) + 1}T10:00:00Z`,
      section1: {
        score: s1Score,
        maxScore: 100,
        details: {
          cordialidad: Math.random() > 0.1,
          saludo: Math.random() > 0.1,
          interes: Math.random() > 0.15,
          sondeo: Math.random() > 0.2,
          escucha: Math.random() > 0.1,
          control: Math.random() > 0.15,
          contencion: Math.random() > 0.1,
          despedida: Math.random() > 0.1,
          solicitud: Math.random() > 0.15,
          lenguaje: Math.random() > 0.1,
        },
      },
      section2: {
        score: s2Score,
        maxScore: 100,
        details: {
          origen: Math.random() > 0.1,
          tipo: Math.random() > 0.1,
          categorizacion: Math.random() > 0.2,
          ortografia: Math.random() > 0.05,
          prioridad: Math.random() > 0.1,
          titulo: Math.random() > 0.1,
          cierre: Math.random() > 0.15,
          descripcion: Math.random() > 0.1,
          exactitud: Math.random() > 0.15,
        },
      },
      totalScore: total,
    };
  });
};

const createOperator = (id: string, name: string): OperatorQuality => {
  const calls = generateRandomCalls();
  const averageScore = Math.round(
    calls.reduce((acc, call) => acc + call.totalScore, 0) / calls.length,
  );

  const history = Array.from({ length: 5 }, () => {
    const variation = Math.floor(Math.random() * 20) - 10;
    return Math.min(100, Math.max(0, averageScore + variation));
  });
  history.push(averageScore);

  return {
    id,
    name,
    status:
      Math.random() > 0.8
        ? Math.random() > 0.5
          ? "Vacaciones"
          : "Licencia"
        : "Activo",
    month: "Mayo 2026",
    calls,
    history,
    averageScore,
  };
};

export const mockOperatorsQuality: OperatorQuality[] = [
  createOperator("OP-4921", "Laura Martínez"),
  createOperator("OP-3312", "Diego Fernández"),
  createOperator("OP-8823", "Sofía Rossi"),
  createOperator("OP-1102", "Martín Silva"),
  createOperator("OP-5534", "Valentina Gómez"),
  createOperator("OP-2245", "Joaquín Pérez"),
  createOperator("OP-7761", "Camila López"),
  createOperator("OP-1983", "Agustín Herrero"),
  createOperator("OP-8234", "Lucía Navarro"),
  createOperator("OP-3142", "Tomás Quiroga"),
];
