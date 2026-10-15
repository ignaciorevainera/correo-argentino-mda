import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks
vi.mock("@lib/invgateClient", () => ({
  invgatePost: vi.fn(),
  invgateGet: vi.fn(),
}));

vi.mock("@db/index", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ lastAutogestionAssignedAt: null }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("@/lib/invgate/agsTickets", () => ({
  reassignTicketToAgent: vi.fn(),
  addTicketComment: vi.fn(),
  invalidateUnassignedTicketsCache: vi.fn(),  MDA_COMMENT_PREFIX: "[Portal MDA] ",
}));

vi.mock("@lib/disponibilidad", () => ({
  getDisponibilidadHoy: vi.fn(),
}));

import {
  evaluateAllAutogestionRules,
  executeAutoAssignment,
  AUTOGESTION_AUTOMATION_RULES,
} from "@/lib/autogestion/rulesEngine";
import { evaluateGeneralCyclicRule } from "@/lib/autogestion/rules/generalCyclicRule";
import { reassignTicketToAgent, addTicketComment, invalidateUnassignedTicketsCache } from "@/lib/invgate/agsTickets";
import { db } from "@db/index";

describe("Autogestión Automation Rules - Asignación Cíclica General", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const opA = {
    agentId: 1,
    invgateId: 101,
    nombre: "Operador A",
    username: "op.a",
    disponible: true,
    asignableAgs: true,
    lastAutogestionAssignedAt: 1000,
  };

  const opB = {
    agentId: 2,
    invgateId: 102,
    nombre: "Operador B",
    username: "op.b",
    disponible: true,
    asignableAgs: true,
    lastAutogestionAssignedAt: null, // Nunca recibió asignación hoy (primero en turno)
  };

  const opC = {
    agentId: 3,
    invgateId: 103,
    nombre: "Operador C",
    username: "op.c",
    disponible: true,
    asignableAgs: true,
    lastAutogestionAssignedAt: 5000,
  };

  const generalTicket1 = {
    id: 8001,
    pretty_id: "#8001",
    title: "Nueva solicitud de acceso",
    category_name: "Nueva solicitud",
    category_last_name: "Nueva solicitud",
    creator_id: 9901,
    creator_username: "cliente.externo",
    creator_name: "Cliente Externo",
  };

  const generalTicket2 = {
    id: 8002,
    pretty_id: "#8002",
    title: "Problema con sistema de envíos",
    category_name: "Sistemas > Logística",
    category_last_name: "Logística",
    creator_id: 9902,
    creator_username: "cliente2",
    creator_name: "Cliente 2",
  };

  const rejectedTicket = {
    id: 8003,
    pretty_id: "#8003",
    title: "Solicitud rechazada previa",
    category_name: "Solicitud rechazada en revisión",
    category_last_name: "Solicitud rechazada en revisión",
    creator_id: 103, // Creado por Operador C
    creator_username: "op.c",
    creator_name: "Operador C",
  };

  it("debe seleccionar al operador con menor tiempo o null (prioridad a null)", () => {
    const evalResult = evaluateGeneralCyclicRule(generalTicket1 as any, [opA, opB, opC] as any);
    expect(evalResult.canAssign).toBe(true);
    expect(evalResult.targetOperator?.agentId).toBe(2); // opB porque su lastAutogestionAssignedAt es null
    expect(evalResult.ruleId).toBe("asignacion_ciclica_general");
    expect(evalResult.skipQueueUpdate).toBe(false);
  });

  it("si todos tienen timestamp numérico, debe seleccionar al más antiguo", () => {
    const opBWithTime = { ...opB, lastAutogestionAssignedAt: 3000 };
    const evalResult = evaluateGeneralCyclicRule(generalTicket1 as any, [opA, opBWithTime, opC] as any);
    expect(evalResult.canAssign).toBe(true);
    expect(evalResult.targetOperator?.agentId).toBe(1); // opA (1000 < 3000 < 5000)
  });

  it("debe ignorar operadores no disponibles o no asignables a AGS", () => {
    const opBUnavailable = { ...opB, disponible: false, motivo: "En break" };
    const opANotAssignable = { ...opA, asignableAgs: false };

    const evalResult = evaluateGeneralCyclicRule(generalTicket1 as any, [opANotAssignable, opBUnavailable, opC] as any);
    expect(evalResult.canAssign).toBe(true);
    expect(evalResult.targetOperator?.agentId).toBe(3); // Solo opC está disponible y asignable
  });

  it("debe rechazar tickets cuya categoría sea 'Solicitud rechazada en revisión'", () => {
    const evalResult = evaluateGeneralCyclicRule(rejectedTicket as any, [opA, opB, opC] as any);
    expect(evalResult.matchesCategory).toBe(false);
    expect(evalResult.canAssign).toBe(false);
    expect(evalResult.reason).toContain("Solicitud rechazada en revisión");
  });

  it("evaluateAllAutogestionRules debe aplicar precedencia estricta: rejectedRequest primero, generalCyclic después", () => {
    // Ticket rechazado creado por opC, más 2 tickets generales
    const tickets = [generalTicket1, rejectedTicket, generalTicket2];
    const operators = [opA, opB, opC];

    const actionable = evaluateAllAutogestionRules(tickets as any, operators as any);

    expect(actionable.length).toBe(3);

    // 1. Primer resultado actionable DEBE ser el ticket rechazado asignado a opC (regla 1)
    const rejectedAction = actionable.find((a) => a.ticketId === 8003);
    expect(rejectedAction).toBeDefined();
    expect(rejectedAction?.ruleId).toBe("solicitud_rechazada");
    expect(rejectedAction?.targetOperator?.agentId).toBe(3); // opC

    // 2. Los otros dos tickets generales se distribuyen en cascada respetando la ronda
    const generalActions = actionable.filter((a) => a.ruleId === "asignacion_ciclica_general");
    expect(generalActions.length).toBe(2);
    // Primer ticket general va a opB (null)
    expect(generalActions[0].ticketId).toBe(8001);
    expect(generalActions[0].targetOperator?.agentId).toBe(2);
    // Segundo ticket general va a opA (1000)
    expect(generalActions[1].ticketId).toBe(8002);
    expect(generalActions[1].targetOperator?.agentId).toBe(1);
  });

  it("executeAutoAssignment para regla cíclica general debe actualizar la base de datos (skipQueueUpdate: false)", async () => {
    (reassignTicketToAgent as any).mockResolvedValueOnce({ ok: true });
    (addTicketComment as any).mockResolvedValueOnce({ ok: true });

    const evalResult = {
      ruleId: "asignacion_ciclica_general",
      ruleName: "Asignación Cíclica de Nuevas Autogestiones",
      ticketId: 8001,
      ticketNumber: "#8001",
      canAssign: true,
      skipQueueUpdate: false,
      targetOperator: opB,
    };

    const execRes = await executeAutoAssignment(evalResult as any, "Sistema de Automatizaciones");

    expect(execRes.success).toBe(true);
    expect(reassignTicketToAgent).toHaveBeenCalledWith(8001, 102, 3950, expect.any(Number));
    expect(addTicketComment).toHaveBeenCalledWith(
      8001,
      "[Portal MDA] Se asigna para su gestión.",
      expect.any(Number),
      1
    );
    expect(invalidateUnassignedTicketsCache).toHaveBeenCalled();
    // Debe actualizar DB porque skipQueueUpdate es false
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });
});
