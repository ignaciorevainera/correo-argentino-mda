/**
 * Seed de las etapas del workflow de automatizaciones.
 *
 * Fuente de verdad de dos layouts:
 * - `workflow` (AUTSUC nuevo): 5 etapas, gates y Go / No Go.
 * - `legacy` (casos manuales previos a Luis Guillón): 3 etapas simplificadas,
 *   sin gates ni Go / No Go.
 *
 * Es un sync idempotente por etapa:
 * - upsert de etapas (nombre normalizado) con `scope`/`description`/`position`;
 * - upsert de tickets por `matchLabel` (incluye `aliases`/`blocking`/`position`);
 * - prune de los tickets de cada etapa que ya no están en el seed (así los
 *   movimientos entre etapas y las bajas convergen);
 * - NO pisa `displayName`/`aliases` editados a mano (solo los completa si están
 *   vacíos).
 *
 * Ejecución: npm run db:seed-etapas
 */
import { db } from "../src/db/index";
import { workflowStages, workflowStageTickets } from "../src/db/schema";
import { asc, eq } from "drizzle-orm";
import { normalizeLabel } from "../src/lib/workflow/labels";

type StageTicketRow = typeof workflowStageTickets.$inferSelect;

interface SeedTicket {
  matchLabel: string;
  /** Etiqueta amigable; cae al matchLabel si no se define. */
  displayName?: string;
  /** Labels alternativos que también matchean esta card. */
  aliases?: string[];
  /** Frases de la descripción que matchean cuando el label no alcanza. */
  matchDescription?: string[];
  /** Sufijo de ruta de categoría de InvGate que también matchea la card. */
  matchCategory?: string;
  /** Anidar los tickets matcheados como sub-nodos de una card madre. */
  nestChildren?: boolean;
  blocking: boolean;
  /** Naturaleza: ticket (default), formulario, manual, subproceso o auto. */
  kind?: "ticket" | "form" | "manual" | "subprocess" | "auto";
}

interface SeedStage {
  name: string;
  description: string;
  scope: "workflow" | "legacy";
  /** matchLabel del ticket de otra etapa que habilita esta etapa. */
  gateMatchLabel?: string;
  tickets: SeedTicket[];
}

/** Aliases compartidos entre el layout workflow y legacy. */
const SERVER_ALIASES = [
  "Configuración de server",
  "Configuración de servidor",
  "Configuración de equipo",
  "CONFIGURACIÓN DE SERVER",
  "CONFIGURACIÓN DE EQUIPO",
  "CONFIGURACIÓN FINAL DE SERVER",
];

const MF_ALIASES = [
  "Solicitud Smart Point y configuración de QR",
  "Solicitud Smart Point",
  "Creación de Punto de Venta",
  "Generación CAI y carga en ambiente INTEGRA",
  "Generación de CAI y carga en ambiente INTEGRA",
];

const ALTA_OPERADOR_ALIASES = [
  "ALTA OPERADOR MOSAIC",
  "ALTA OEPRADOR MOSAIC",
  "ALTA NUEVO OPERADORES MOSAIC",
  "Mosaic- Alta de operador",
  "Mosaic - Alta de operador",
];

const BUI_ALIASES = ["Configuración ruta BUIS", "Mosaic- Configuración ruta BUIS"];

const SWITCH_ALIASES = ["Revisión del Switch"];

const GDI_ALIASES = ["Habilitación de terminales de GDI a servidores Mosaic"];

const REVIEW_ALIASES = [
  "REVISIÓN GENERAL",
  "REVISIÓN ESTADO GENERAL",
  "Validación de estado",
];

/** Workflow AUTSUC: 1 / 1.1 Server / 1.2 HH / 1.3 extra, todos en una card. */
const EQUIPMENT_ALIASES = [
  "Equipamiento",
  "1-Equipamiento",
  "1.1-Equipamiento - Server",
  "1.2-Equipamiento - HH",
  "1.3-Equipamiento",
];

/** Desambigua los dos "Instalaciones para AUTSUC…" (mismo título). */
const RELEVAMIENTO_DESC = [
  "acondicionamiento de redes y cableado",
  "redes y cableado",
];
const VISITA_DESC = [
  "programar instalaciones",
  "programar la visita",
  "visita técnica",
];

const SEED: SeedStage[] = [
  // ─────────────────────────── WORKFLOW (AUTSUC) ───────────────────────────
  {
    name: "Etapa 1 — Lanzamiento y habilitación",
    scope: "workflow",
    description:
      "Gestión previa a la configuración técnica del ambiente de la sucursal.",
    tickets: [
      {
        matchLabel: "Solicitud de equipamiento",
        displayName: "Equipamiento (Prep y Despacho)",
        aliases: EQUIPMENT_ALIASES,
        blocking: true,
        kind: "ticket",
      },
      {
        matchLabel: "Relevamiento de conexiones",
        displayName: "Relevamiento de conexiones / cableado",
        aliases: SWITCH_ALIASES,
        matchDescription: RELEVAMIENTO_DESC,
        blocking: true,
        kind: "ticket",
      },
      {
        matchLabel: "Habilitación de terminales de GDI",
        displayName: "Habilitación de terminales de GDI / VDI en rango IPv4",
        aliases: GDI_ALIASES,
        blocking: true,
        kind: "form",
      },
      {
        matchLabel: "Visita técnica para instalaciones",
        matchDescription: VISITA_DESC,
        blocking: false,
        kind: "ticket",
      },
    ],
  },
  {
    name: "Etapa 2 — Configuración y registro",
    scope: "workflow",
    description:
      "Configuración del server, red y servicios. Los registros (SmartPoints, PDV, CAI) se agrupan en M&F y no bloquean la etapa.",
    tickets: [
      {
        // El server MOA ya no se gestiona por ticket: se resuelve por variables
        // (nombre + IP). Por eso es manual y sin aliases que atrapen tickets de
        // configuración de PCs en sitio.
        matchLabel: "Configuración serv",
        displayName: "Configuración de server",
        aliases: [],
        blocking: false,
        kind: "auto",
      },
      {
        matchLabel: "Solicitud de Hostnames",
        displayName: "Solicitud de hostnames",
        blocking: true,
        kind: "form",
      },
      {
        matchLabel: "Habilitación de servicios M&F",
        aliases: MF_ALIASES,
        blocking: false,
        kind: "ticket",
      },
      {
        matchLabel: "Validación de NIS en OnBase",
        displayName: "Alta NIS en OnBase",
        aliases: ["Alta NIS"],
        blocking: true,
        kind: "subprocess",
      },
      { matchLabel: "Alta en OfficeTrack", blocking: false, kind: "manual" },
    ],
  },
  {
    name: "Etapa 4 — Implementación",
    scope: "workflow",
    description:
      "Altas de usuarios y actualización de sistemas centrales (la instalación en sitio ya se cubre en la etapa 1).",
    tickets: [
      {
        matchLabel: "Alta operador Mosaic",
        displayName: "Alta de usuarios Mosaic",
        aliases: ALTA_OPERADOR_ALIASES,
        blocking: true,
        kind: "manual",
      },
      {
        matchLabel: "Validación Central PAQ",
        displayName: "Actualización de Central PAQ",
        matchCategory: "Central Paq. » Implementación",
        blocking: true,
        kind: "ticket",
      },
      {
        matchLabel: "Actualización SOP Central",
        displayName: "Actualización SOP Central",
        matchCategory: "SOP Central » Implementación",
        blocking: false,
        kind: "ticket",
      },
      {
        matchLabel: "Baja de usuarios en SOP Central",
        displayName: "Gestión de bajas de servicios de Giros",
        aliases: ["Solicitud baja de usuarios SOP Central"],
        matchCategory: "BAJA Giros y Transferencias Sucursales",
        nestChildren: true,
        blocking: true,
        kind: "ticket",
      },
      {
        matchLabel: "Modificación de tipo",
        displayName: "Configuraciones de Soporte Técnico",
        blocking: true,
        kind: "manual",
      },
      {
        matchLabel: "Configuración carpeta de escaneos BUI",
        displayName: "Actualización BUI",
        aliases: BUI_ALIASES,
        blocking: false,
        kind: "ticket",
      },
    ],
  },
  {
    name: "Acciones finales y cierre de la automatización",
    scope: "workflow",
    description:
      "Validación final de terminales y aplicativos, actualización de ubicación y cierre del workflow.",
    tickets: [
      {
        matchLabel: "Revisión general",
        displayName: "Revisión de estado general",
        aliases: REVIEW_ALIASES,
        blocking: false,
        kind: "manual",
      },
      {
        matchLabel: "Actualizar Ubicación",
        displayName: "Solicitud de actualización de ubicación en InvGate",
        blocking: false,
        kind: "ticket",
      },
    ],
  },

  // ──────────────────────── LEGACY (manuales previos) ────────────────────────
  {
    name: "Etapa 1 — Lanzamiento y configuración",
    scope: "legacy",
    description:
      "Lanzamiento, relevamiento y configuración del server, red y servicios. Sin Go / No Go.",
    tickets: [
      { matchLabel: "Solicitud de equipamiento", blocking: true },
      {
        matchLabel: "Relevamiento de conexiones",
        displayName: "Relevamiento de conexiones / cableado",
        aliases: SWITCH_ALIASES,
        blocking: false,
      },
      { matchLabel: "Preparación y envío de HH", blocking: false },
      {
        matchLabel: "Habilitación de terminales de GDI",
        displayName: "Habilitación de terminales de GDI / VDI en rango IPv4",
        aliases: GDI_ALIASES,
        blocking: false,
      },
      { matchLabel: "Visita técnica para instalaciones", blocking: false },
      {
        matchLabel: "Configuración serv",
        displayName: "Configuración de server",
        aliases: SERVER_ALIASES,
        blocking: true,
      },
      {
        matchLabel: "Solicitud de Hostnames",
        displayName: "Solicitud de hostnames",
        blocking: false,
      },
      {
        matchLabel: "Habilitación de servicios M&F",
        aliases: MF_ALIASES,
        blocking: false,
      },
      {
        matchLabel: "Validación de NIS en OnBase",
        displayName: "Alta NIS en OnBase",
        aliases: ["Alta NIS"],
        blocking: false,
      },
      { matchLabel: "Alta en OfficeTrack", blocking: false },
    ],
  },
  {
    name: "Etapa 2 — Implementación",
    scope: "legacy",
    description:
      "Instalaciones, altas de usuarios y actualización de sistemas centrales.",
    tickets: [
      {
        matchLabel: "Solicitud de asistencia técnica",
        displayName: "Instalaciones por Servicio Técnico",
        blocking: true,
      },
      {
        matchLabel: "Alta operador Mosaic",
        displayName: "Alta de usuarios Mosaic",
        aliases: ALTA_OPERADOR_ALIASES,
        blocking: true,
      },
      {
        matchLabel: "Validación Central PAQ",
        displayName: "Actualización de Central PAQ",
        blocking: false,
      },
      {
        matchLabel: "Baja de usuarios en SOP Central",
        displayName: "Gestión de bajas de servicios de Giros",
        aliases: ["Solicitud baja de usuarios SOP Central"],
        blocking: false,
      },
      {
        matchLabel: "Modificación de tipo",
        displayName: "Configuraciones de Soporte Técnico",
        blocking: false,
      },
      {
        matchLabel: "Configuración carpeta de escaneos BUI",
        displayName: "Actualización BUI",
        aliases: BUI_ALIASES,
        blocking: false,
      },
    ],
  },
  {
    name: "Etapa 3 — Revisión final y cierre",
    scope: "legacy",
    description:
      "Revisión de estado general de terminales y aplicativos y cierre del caso.",
    tickets: [
      {
        matchLabel: "Revisión general",
        displayName: "Revisión de estado general",
        aliases: REVIEW_ALIASES,
        blocking: false,
      },
    ],
  },
];

async function seedWorkflowStages() {
  const existingStages = await db
    .select()
    .from(workflowStages)
    .orderBy(asc(workflowStages.position), asc(workflowStages.id));
  const existingTickets = await db
    .select()
    .from(workflowStageTickets)
    .orderBy(asc(workflowStageTickets.stageId), asc(workflowStageTickets.position));

  const stageByName = new Map(
    existingStages.map((stage) => [normalizeLabel(stage.name), stage]),
  );
  const ticketsByStage = new Map<number, Map<string, StageTicketRow>>();
  for (const ticket of existingTickets) {
    const bucket = ticketsByStage.get(ticket.stageId) ?? new Map();
    bucket.set(normalizeLabel(ticket.matchLabel), ticket);
    ticketsByStage.set(ticket.stageId, bucket);
  }

  console.log("Sincronizando etapas del workflow de automatizaciones...");

  let position: number;
  const scopePosition = new Map<string, number>();
  const stageIdBySeedName = new Map<string, number>();

  for (const stageSeed of SEED) {
    const existing = stageByName.get(normalizeLabel(stageSeed.name));
    let stageId: number;
    const nextPosition = (scopePosition.get(stageSeed.scope) ?? 0) + 1;
    scopePosition.set(stageSeed.scope, nextPosition);
    position = nextPosition;

    if (existing) {
      stageId = existing.id;
      await db
        .update(workflowStages)
        .set({
          description: stageSeed.description,
          scope: stageSeed.scope,
          position,
        })
        .where(eqStage(existing.id));
      console.log(`Etapa existente actualizada: "${existing.name}" (#${stageId})`);
    } else {
      const [inserted] = await db
        .insert(workflowStages)
        .values({
          name: stageSeed.name,
          description: stageSeed.description,
          scope: stageSeed.scope,
          position,
        })
        .returning({ id: workflowStages.id });
      stageId = inserted.id;
      console.log(`Etapa creada: "${stageSeed.name}" (#${stageId})`);
    }

    stageIdBySeedName.set(stageSeed.name, stageId);
    const bucket =
      ticketsByStage.get(stageId) ?? new Map<string, StageTicketRow>();

    const seedKeys = new Set(
      stageSeed.tickets.map((ticket) => normalizeLabel(ticket.matchLabel)),
    );

    // Prune: tickets de la etapa que ya no están en el seed convergen.
    for (const [key, existingTicket] of bucket) {
      if (!seedKeys.has(key)) {
        await db
          .delete(workflowStageTickets)
          .where(eqTicket(existingTicket.id));
        console.log(
          `  - ticket "${existingTicket.matchLabel}" quitado de etapa #${stageId}`,
        );
      }
    }

    let ticketPosition = 1;
    for (const ticketSeed of stageSeed.tickets) {
      const key = normalizeLabel(ticketSeed.matchLabel);
      const existingTicket = bucket.get(key);

      if (existingTicket) {
        await db
          .update(workflowStageTickets)
          .set({
            matchLabel: ticketSeed.matchLabel,
            blocking: ticketSeed.blocking,
            kind: ticketSeed.kind ?? "ticket",
            matchCategory: ticketSeed.matchCategory ?? null,
            nestChildren: ticketSeed.nestChildren ?? false,
            position: ticketPosition,
            // No pisar displayName/aliases editados a mano: solo completarlos.
            // Excepción: un `aliases: []` explícito en la seed limpia los
            // aliases (señal de que el template dejó de matchear por alias).
            ...(existingTicket.displayName?.trim()
              ? {}
              : { displayName: ticketSeed.displayName ?? null }),
            ...(ticketSeed.aliases !== undefined &&
            ticketSeed.aliases.length === 0
              ? { aliases: [] }
              : Array.isArray(existingTicket.aliases) &&
                  existingTicket.aliases.length > 0
                ? {}
                : { aliases: ticketSeed.aliases ?? [] }),
            ...(Array.isArray(existingTicket.matchDescription) &&
            existingTicket.matchDescription.length > 0
              ? {}
              : { matchDescription: ticketSeed.matchDescription ?? [] }),
          })
          .where(eqTicket(existingTicket.id));
      } else {
        await db.insert(workflowStageTickets).values({
          stageId,
          matchLabel: ticketSeed.matchLabel,
          displayName: ticketSeed.displayName ?? null,
          aliases: ticketSeed.aliases ?? [],
          matchDescription: ticketSeed.matchDescription ?? [],
          matchCategory: ticketSeed.matchCategory ?? null,
          nestChildren: ticketSeed.nestChildren ?? false,
          blocking: ticketSeed.blocking,
          kind: ticketSeed.kind ?? "ticket",
          position: ticketPosition,
        });
        console.log(
          `  + ticket "${ticketSeed.matchLabel}" en etapa #${stageId}`,
        );
      }
      ticketPosition += 1;
    }
  }

  // Pruning: las etapas que ya no están en el SEED se eliminan (el seed es la
  // fuente de verdad del template; la cascada borra sus tickets). Cubre quitar
  // etapas y renombrarlas (la vieja cae, la nueva se crea arriba).
  const seedStageKeys = new Set(SEED.map((stage) => normalizeLabel(stage.name)));
  for (const [key, existing] of stageByName) {
    if (!seedStageKeys.has(key)) {
      await db
        .delete(workflowStages)
        .where(eqStage(existing.id));
      console.log(
        `Etapa eliminada (fuera del seed): "${existing.name}" (#${existing.id})`,
      );
    }
  }

  // Gates: resolver por matchLabel global tras insertar todos los tickets,
  // restringido al scope de la etapa (hay labels compartidos workflow/legacy).
  const allTickets = await db
    .select({
      id: workflowStageTickets.id,
      matchLabel: workflowStageTickets.matchLabel,
      scope: workflowStages.scope,
    })
    .from(workflowStageTickets)
    .innerJoin(
      workflowStages,
      eq(workflowStageTickets.stageId, workflowStages.id),
    );

  for (const stageSeed of SEED) {
    const stageId = stageIdBySeedName.get(stageSeed.name);
    if (stageId === undefined) {
      continue;
    }
    // Sin gateMatchLabel: limpiar un gate previo (el seed es la fuente de verdad).
    if (!stageSeed.gateMatchLabel) {
      await db
        .update(workflowStages)
        .set({ gateItemId: null })
        .where(eqStage(stageId));
      continue;
    }
    const gateTicket = allTickets.find(
      (ticket) =>
        normalizeLabel(ticket.matchLabel) ===
          normalizeLabel(stageSeed.gateMatchLabel!) &&
        ticket.scope === stageSeed.scope,
    );
    await db
      .update(workflowStages)
      .set({ gateItemId: gateTicket?.id ?? null })
      .where(eqStage(stageId));
    if (gateTicket) {
      console.log(
        `Gate de "${stageSeed.name}": "${stageSeed.gateMatchLabel}" (#${gateTicket.id}).`,
      );
    }
  }

  console.log("Sincronización de etapas completada.");
  process.exit(0);
}

function eqStage(id: number) {
  return eq(workflowStages.id, id);
}
function eqTicket(id: number) {
  return eq(workflowStageTickets.id, id);
}

seedWorkflowStages().catch((error) => {
  console.error("Seed de etapas falló:", error);
  process.exit(1);
});
