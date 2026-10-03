import { buildStageGroups } from "../src/lib/workflow/stages";
import { normalizeLabel } from "../src/lib/workflow/labels";

/**
 * Verificación unitaria del matching de etapas (fase 1 etapas).
 * Ejecución: node --import tsx tests/workflow-stages.test.mjs
 * (o npx tsx tests/workflow-stages.test.mjs)
 */

function node(partial) {
  return {
    kind: "request",
    refId: 1,
    prettyId: "#1",
    stepLabel: "",
    title: "",
    lifecycle: "pending",
    rawStatusId: 1,
    createdAt: 100,
    invgateUrl: "",
    activity: [],
    solution: null,
    ...partial,
  };
}

const template = () => ({
  stages: [
    {
      id: 1,
      name: "Etapa 1",
      description: null,
      position: 1,
      gateItemId: null,
    },
    { id: 2, name: "Etapa 2", description: null, position: 2, gateItemId: 1 },
  ],
  tickets: [
    {
      id: 1,
      stageId: 1,
      matchLabel: "Solicitud de equipamiento",
      displayName: null,
      blocking: true,
      position: 1,
    },
    {
      id: 2,
      stageId: 2,
      matchLabel: "Configuración de server",
      displayName: null,
      blocking: true,
      position: 1,
    },
    {
      id: 3,
      stageId: 2,
      matchLabel: "Creación de Punto de Venta",
      displayName: null,
      blocking: false,
      position: 2,
    },
    {
      id: 4,
      stageId: 2,
      matchLabel: "Solicitud de SmartPoints y configuración de QR",
      displayName: null,
      blocking: true,
      position: 3,
    },
  ],
});

const failures = [];
function check(name, condition) {
  if (!condition) {
    failures.push(`FAIL: ${name}`);
  } else {
    console.log(`ok - ${name}`);
  }
}

check(
  "normalizeLabel normaliza casing/acentos/espacios",
  normalizeLabel("  Solicitud de Equipamiento  ") ===
    "solicitud de equipamiento" &&
    normalizeLabel("Habilitación") === "habilitacion",
);
check(
  "normalizeLabel unifica º y °",
  normalizeLabel("1º nivel") === "1° nivel",
);

{
  const result = buildStageGroups(
    [
      node({ stepLabel: "Solicitud de equipamiento", lifecycle: "completed" }),
      node({ stepLabel: "Ticket sin template" }),
    ],
    template(),
  );
  check(
    "agrupa por etapa: etapa 1 completa, etapa 2 en curso con faltantes",
    result.groups.length === 2 &&
      result.groups[0].status === "completed" &&
      result.groups[1].status === "in_progress",
  );
  check(
    "nodo sin template queda 'sin etapa'",
    result.stagelessNodes.length === 1,
  );
  check(
    "detecta 2 faltantes bloqueantes (etapa 2 sin tickets)",
    result.missingBlockingCount === 2,
  );
}

{
  const result = buildStageGroups(
    [node({ stepLabel: "Solicitud de equipamiento" })],
    template(),
  );
  check(
    "gate pendiente: etapa 2 'En espera' con label del gate",
    result.groups[1].status === "waiting" &&
      result.groups[1].gateLabel === "Solicitud de equipamiento",
  );
}

{
  const result = buildStageGroups(
    [
      node({ stepLabel: "1° Configuración de server" }),
      node({ stepLabel: "2º Configuración de server" }),
    ],
    template(),
  );
  check(
    "matchea réplicas numeradas ('1°', '2º') al mismo template",
    result.groups[1].items[0].nodes.length === 2 &&
      result.groups[1].items[0].missing === false,
  );
}

{
  const result = buildStageGroups([], template(), { finalized: true });
  check("finalizada: no cuenta faltantes", result.missingBlockingCount === 0);
}

// Variantes de títulos reales de producción (2026-09):
check(
  "título corto real 'Solicitud Smart Point' matchea plantilla larga (hechos a mano)",
  (() => {
    const result = buildStageGroups(
      [node({ stepLabel: "Solicitud Smart Point", lifecycle: "completed" })],
      template(),
    );
    const item = result.groups[1].items.find((item) => !item.missing);
    return item !== undefined && item.nodes.length === 1;
  })(),
);
check(
  "tickets informativos no cuentan para completar la etapa",
  (() => {
    const result = buildStageGroups(
      [
        node({
          stepLabel: "Creación de Punto de Venta",
          lifecycle: "completed",
        }),
      ],
      template(),
    );
    return result.groups[1].completedBlocking === 0;
  })(),
);
check(
  "títulos con variantes reales: 'Generación CAI y carga en ambiente INTEGRA' cae en 'Sin etapa' (otra gestión)",
  (() => {
    const result = buildStageGroups(
      [node({ stepLabel: "Generación CAI y carga en ambiente INTEGRA" })],
      template(),
    );
    return result.stagelessNodes.length === 1;
  })(),
);

check(
  "títulos con typo y gestión tras ' - ': 'AUTOMATICACIÓN DE SUCURSAL B0168\\tLIBERTAD - SOLICITUD DE EQUIPAMIENTO' matchea",
  (() => {
    const result = buildStageGroups(
      [
        node({
          stepLabel: "AUTOMATICACIÓN DE SUCURSAL B0168\tLIBERTAD",
          title:
            "AUTOMATICACIÓN DE SUCURSAL B0168\tLIBERTAD - SOLICITUD DE EQUIPAMIENTO",
          lifecycle: "completed",
        }),
        node({
          stepLabel: "AUTOMATICAZIÓN DE SUCURSAL B1618 TRISTAN SUAREZ",
          title:
            "AUTOMATICAZIÓN DE SUCURSAL B1618 TRISTAN SUAREZ - SOLICITUD DE EQUIPAMIENTO",
        }),
      ],
      template(),
    );
    const item = result.groups.find((g) => g.template.name === "Etapa 1")
      ?.items[0];
    return item !== undefined && !item.missing && item.nodes.length === 2;
  })(),
);

{
  // Aliases: dos labels distintos caen en la MISMA card (mismo item).
  const aliasTemplate = {
    stages: [
      {
        id: 1,
        name: "Etapa 1",
        description: null,
        position: 1,
        gateItemId: null,
      },
    ],
    tickets: [
      {
        id: 1,
        stageId: 1,
        matchLabel: "Configuración serv",
        displayName: "Configuración de server",
        aliases: ["Configuración de equipo"],
        blocking: true,
        position: 1,
      },
    ],
  };
  const result = buildStageGroups(
    [
      node({ stepLabel: "Configuración de equipo" }),
      node({ stepLabel: "Configuración de servidor" }),
      node({ stepLabel: "CONFIGURACIÓN DE EQUIPO" }),
    ],
    aliasTemplate,
  );
  check(
    "aliases agrupan variantes reales en una sola card",
    result.groups[0].items.length === 1 &&
      result.groups[0].items[0].nodes.length === 3 &&
      result.stagelessNodes.length === 0,
  );
}

{
  // Scope: workflow filtra solo etapas workflow; legacy solo legacy.
  const scoped = {
    stages: [
      {
        id: 1,
        name: "Workflow 1",
        description: null,
        position: 1,
        scope: "workflow",
        gateItemId: null,
      },
      {
        id: 2,
        name: "Workflow 2",
        description: null,
        position: 2,
        scope: "workflow",
        gateItemId: 1,
      },
      {
        id: 3,
        name: "Legacy 1",
        description: null,
        position: 1,
        scope: "legacy",
        gateItemId: null,
      },
    ],
    tickets: [
      {
        id: 1,
        stageId: 1,
        matchLabel: "Solicitud de equipamiento",
        aliases: [],
        displayName: null,
        blocking: true,
        position: 1,
      },
      {
        id: 2,
        stageId: 2,
        matchLabel: "Go / No Go",
        aliases: [],
        displayName: null,
        blocking: true,
        position: 1,
      },
      {
        id: 3,
        stageId: 3,
        matchLabel: "Configuración de server",
        aliases: [],
        displayName: null,
        blocking: true,
        position: 1,
      },
    ],
  };
  const workflow = buildStageGroups(
    [node({ stepLabel: "Configuración de server" })],
    scoped,
    { workflowKind: "workflow" },
  );
  check(
    "scope workflow: el nodo legacy queda en 'Sin etapa'",
    workflow.groups.length === 2 &&
      workflow.stagelessNodes.length === 1 &&
      workflow.groups.every((group) => group.template.scope === "workflow"),
  );
  const legacy = buildStageGroups(
    [node({ stepLabel: "Configuración de server", lifecycle: "pending" })],
    scoped,
    { workflowKind: "legacy" },
  );
  check(
    "scope legacy: solo etapas legacy, sin gates ni faltantes",
    legacy.groups.length === 1 &&
      legacy.groups[0].template.name === "Legacy 1" &&
      legacy.groups[0].gateSatisfied === true &&
      legacy.missingBlockingCount === 0,
  );
  check(
    "scope legacy: etapa sin bloqueo no queda 'waiting'",
    legacy.groups[0].status === "in_progress",
  );
}

{
  // Fallback por descripción: títulos idénticos se distinguen por keywords.
  const descTemplate = {
    stages: [
      {
        id: 1,
        name: "Etapa 1",
        description: null,
        position: 1,
        scope: "workflow",
        gateItemId: null,
      },
    ],
    tickets: [
      {
        id: 1,
        stageId: 1,
        matchLabel: "Relevamiento de conexiones",
        displayName: "Relevamiento de conexiones / cableado",
        aliases: [],
        matchDescription: ["acondicionamiento de redes y cableado"],
        blocking: true,
        position: 1,
      },
      {
        id: 2,
        stageId: 1,
        matchLabel: "Visita técnica para instalaciones",
        displayName: null,
        aliases: [],
        matchDescription: ["programar instalaciones", "visita técnica"],
        blocking: false,
        position: 2,
      },
    ],
  };
  const title = "Instalaciones para AUTSUC #79867  (B0106) 25 sep 2026";
  const result = buildStageGroups(
    [
      node({
        refId: 1,
        stepLabel: title,
        title,
        description: "acondicionamiento de redes y cableado",
      }),
      node({
        refId: 2,
        stepLabel: title,
        title,
        description: "se solicita programar instalaciones para el 24 sep",
      }),
      node({
        refId: 3,
        stepLabel: title,
        title,
        description: "texto sin pistas",
      }),
    ],
    descTemplate,
    { workflowKind: "workflow" },
  );
  const labelFor = (refId) => {
    for (const group of result.groups) {
      for (const item of group.items) {
        if (item.nodes.some((n) => n.refId === refId))
          return item.template.matchLabel;
      }
    }
    return null;
  };
  check(
    "fallback por descripción distingue relevamiento de visita técnica",
    labelFor(1) === "Relevamiento de conexiones" &&
      labelFor(2) === "Visita técnica para instalaciones" &&
      labelFor(3) === null &&
      result.stagelessNodes.length === 1,
  );
}

// Ítems `form`/`manual`: no cuentan como faltantes bloqueantes.
{
  const tpl = {
    stages: [
      {
        id: 1,
        name: "Etapa",
        description: null,
        position: 1,
        gateItemId: null,
      },
    ],
    tickets: [
      {
        id: 1,
        stageId: 1,
        matchLabel: "Ticket faltante",
        displayName: null,
        blocking: true,
        kind: "ticket",
        position: 1,
      },
      {
        id: 2,
        stageId: 1,
        matchLabel: "Formulario",
        displayName: null,
        blocking: true,
        kind: "form",
        position: 2,
      },
      {
        id: 3,
        stageId: 1,
        matchLabel: "Manual",
        displayName: null,
        blocking: true,
        kind: "manual",
        position: 3,
      },
    ],
  };
  const result = buildStageGroups([], tpl, { workflowKind: "workflow" });
  check(
    "solo el ticket cuenta como faltante bloqueante",
    result.missingBlockingCount === 1,
  );
}

// Ítems form/manual satisfechos por variables del workflow -> completed.
{
  const tpl = {
    stages: [
      {
        id: 1,
        name: "Etapa",
        description: null,
        position: 1,
        gateItemId: null,
      },
    ],
    tickets: [
      {
        id: 1,
        stageId: 1,
        matchLabel: "Solicitud de Hostnames",
        displayName: null,
        blocking: true,
        kind: "form",
        position: 1,
      },
      {
        id: 2,
        stageId: 1,
        matchLabel: "Otra gestión",
        displayName: null,
        blocking: true,
        kind: "form",
        position: 2,
      },
    ],
  };
  const result = buildStageGroups([], tpl, {
    workflowKind: "workflow",
    satisfiedItems: new Map([
      [normalizeLabel("Solicitud de Hostnames"), "B0106W101 - B0106W102"],
    ]),
  });
  const hostnames = result.groups[0].items.find(
    (item) => item.template.matchLabel === "Solicitud de Hostnames",
  );
  const other = result.groups[0].items.find(
    (item) => item.template.matchLabel === "Otra gestión",
  );
  check(
    "satisfiedItems marca el form completado con detalle (y no el resto)",
    hostnames?.completed === true &&
      hostnames?.detail === "B0106W101 - B0106W102" &&
      other?.completed === false,
  );
}

// Match por categoría (sufijo de ruta de InvGate).
{
  const tpl = {
    stages: [
      {
        id: 1,
        name: "Etapa",
        description: null,
        position: 1,
        scope: "workflow",
        gateItemId: null,
      },
    ],
    tickets: [
      {
        id: 1,
        stageId: 1,
        matchLabel: "Validación Central PAQ",
        aliases: [],
        displayName: "Actualización de Central PAQ",
        matchCategory: "Central Paq. » Implementación",
        blocking: true,
        kind: "ticket",
        position: 1,
      },
    ],
  };
  const result = buildStageGroups(
    [
      node({
        refId: 10,
        stepLabel: "AUTSUC #1",
        title: "AUTSUC #1 - Actualizar",
        categoryPath:
          "ops_admin track and trace » aplicaciones » central paq. » implementacion",
      }),
    ],
    tpl,
    { workflowKind: "workflow" },
  );
  const item = result.groups[0].items[0];
  check(
    "match por sufijo de categoría",
    item.nodes.length === 1 && item.nodes[0].refId === 10 && !item.missing,
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("workflow-stages: all checks passed");
