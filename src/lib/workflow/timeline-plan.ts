import type { AutomationNode } from "./resolver";
import type { StageGrouping, StageGroup, StageItemGroup } from "./stages";
import { resolveNodeDisplayLabel } from "./node-display";
import { stripAutomationEmbeddedRefs } from "./branch-title";

/**
 * Estructura de render de la timeline del detalle de automatización:
 * precalcula, por etapa, las cards reales (numeradas), los nodos fantasma de
 * tickets esperados que todavía no existen y los ítems que no son ticket
 * (formulario/manual). El equipamiento (1 / 1.1 / 1.2 / 1.3) se anida bajo su
 * ticket general. Puro y sin dependencias de Astro para poder testearlo.
 */

export type PlannedCardKind =
  "ticket" | "missing" | "registration" | "form" | "manual" | "auto";

export interface PlannedCard {
  kind: PlannedCardKind;
  node: AutomationNode;
  /** Etiqueta amigable: template de etapa o derivada del título. */
  displayLabel?: string;
  stepNumber: number;
  isLast: boolean;
  /** Sub-nodos anidados (equipamiento 1.1/1.2/1.3 bajo el 1-Equipamiento). */
  children?: PlannedCard[];
  /** Ítem generado por subproceso (badge). */
  subprocess?: boolean;
}

export interface PlannedSection {
  name: string;
  description: string | null;
  status: "waiting" | "in_progress" | "completed";
  /** Label del gate SOLO cuando todavía no está satisfecho. */
  gateLabel: string | null;
  completedBlocking: number;
  totalBlocking: number;
  /** Cards de cada ítem esperado (una lista por template). */
  items: PlannedCard[][];
}

export interface PlannedRender {
  sections: PlannedSection[];
  stageless: PlannedCard[];
}

/** Nodo placeholder para tarjetas sin ticket real (fantasma/form/manual). */
export function ghostNode(stepLabel: string): AutomationNode {
  return {
    kind: "task",
    refId: 0,
    prettyId: null,
    stepLabel,
    title: stepLabel,
    description: "",
    lifecycle: "pending",
    rawStatusId: 0,
    rawStatusName: null,
    categoryPath: null,
    scheduledFor: null,
    createdAt: null,
    invgateUrl: "",
    activity: [],
    solution: null,
    solutionAuthorName: null,
    tasks: [],
  };
}

const SUB_INDEX_TOKEN_RE = /^\d+\.\d+/;
const BASE_INDEX_TOKEN_RE = /^(\d+)[-\s]+(.+)$/;

interface IndexInfo {
  sub: boolean;
  base: boolean;
  baseName: string | null;
}

/** Detecta el índice del nodo (1-Equipamiento = base; 1.1-... = sub). */
function nodeIndexInfo(node: AutomationNode): IndexInfo {
  const tokens = stripAutomationEmbeddedRefs(node.title)
    .split(/\s+-\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (SUB_INDEX_TOKEN_RE.test(token)) {
      return { sub: true, base: false, baseName: null };
    }
  }
  for (const token of tokens) {
    const match = BASE_INDEX_TOKEN_RE.exec(token);
    if (match) {
      return {
        sub: false,
        base: true,
        baseName: match[2].replace(/\s*\(.*\)\s*$/, "").trim(),
      };
    }
  }
  return { sub: false, base: false, baseName: null };
}

/** Label del sub-nodo: quita el índice y el prefijo común ("Server", "HH"). */
function childLabel(node: AutomationNode, parentBase: string | null): string {
  const tokens = stripAutomationEmbeddedRefs(node.title)
    .split(/\s+-\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  // Se toma desde el token del sub-índice hacia adelante (descarta el prefijo
  // de sucursal/AUTSUC que antecede).
  const subIndex = tokens.findIndex((token) => SUB_INDEX_TOKEN_RE.test(token));
  const relevant = subIndex >= 0 ? tokens.slice(subIndex) : tokens;

  const parts = relevant.map((token) =>
    SUB_INDEX_TOKEN_RE.test(token)
      ? token.replace(/^\d+\.\d+\s*-\s*/, "").trim()
      : token,
  );

  if (parts.length === 0) {
    return node.stepLabel;
  }

  // Dedupe del prefijo compartido con el padre ("Equipamiento - Server" → "Server").
  if (
    parts.length > 1 &&
    parentBase &&
    parts[0].toLowerCase() === parentBase.toLowerCase()
  ) {
    parts.shift();
  }

  return parts.join(" - ");
}

/**
 * Anida los sub-nodos de equipamiento (1.1/1.2/1.3) bajo el ticket general
 * (1-Equipamiento). Si no hay padre o sub-nodos, devuelve las cards intactas.
 */
function nestEquipment(cards: PlannedCard[]): PlannedCard[] {
  const tickets = cards.filter((card) => card.kind === "ticket");
  if (tickets.length < 2) {
    return cards;
  }

  const infos = new Map<PlannedCard, IndexInfo>(
    tickets.map((card) => [card, nodeIndexInfo(card.node)]),
  );
  const parent = tickets.find((card) => infos.get(card)!.base);
  const children = tickets.filter((card) => infos.get(card)!.sub);

  if (!parent || children.length === 0) {
    return cards;
  }

  const parentBase = infos.get(parent)!.baseName;
  parent.children = children.map((child) => ({
    ...child,
    displayLabel: childLabel(child.node, parentBase),
  }));

  return cards.filter((card) => card === parent || !children.includes(card));
}

/**
 * Estructura de render precalculada: por etapa, cada ticket esperado aporta
 * sus nodos reales (numerados) y, si no matchea ninguno, un nodo fantasma o
 * una card informativa (formulario/manual).
 */
export function planGrouping(
  grouping: StageGrouping,
  showMissing = true,
): PlannedRender {
  const sections: PlannedSection[] = grouping.groups.map(
    (group: StageGroup): PlannedSection => {
      let stepCounter = 0;
      const nextStep = (): number => {
        stepCounter += 1;
        return stepCounter;
      };

      const items: PlannedCard[][] = group.items.map(
        (item: StageItemGroup): PlannedCard[] => {
          const ticketLike =
            item.kind === "ticket" || item.kind === "subprocess";
          const cards: PlannedCard[] = [];

          if (!ticketLike && item.nodes.length === 0) {
            cards.push({
              kind:
                item.kind === "manual"
                  ? "manual"
                  : item.kind === "auto"
                    ? "auto"
                    : "form",
              node: {
                ...ghostNode(item.label),
                description: item.detail ?? "",
                lifecycle: item.completed ? "completed" : "pending",
              },
              stepNumber: nextStep(),
              isLast: false,
            });
            return cards;
          }

          if (item.template.nestChildren && item.nodes.length > 0) {
            // Los tickets matcheados se agrupan en una card madre con sub-nodos
            // (mismo tratamiento que el equipamiento 1.1/1.2/1.3).
            const [parent, ...rest] = item.nodes;
            const parentCard: PlannedCard = {
              kind: "ticket",
              node: parent,
              displayLabel: item.label,
              stepNumber: nextStep(),
              isLast: false,
              children: rest.map((node) => ({
                kind: "ticket" as const,
                node,
                displayLabel: resolveNodeDisplayLabel(
                  node.title,
                  node.stepLabel,
                ),
                stepNumber: 0,
                isLast: false,
              })),
            };
            cards.push(parentCard);
          } else {
            for (const node of item.nodes) {
              cards.push({
                kind: "ticket",
                node,
                displayLabel: item.label,
                stepNumber: nextStep(),
                isLast: false,
                ...(item.kind === "subprocess" ? { subprocess: true } : {}),
              });
            }
          }

          if (item.missing && showMissing && ticketLike) {
            cards.push({
              kind: item.blocking ? "missing" : "registration",
              node: ghostNode(item.label),
              stepNumber: nextStep(),
              isLast: false,
            });
          }

          return nestEquipment(cards);
        },
      );

      // La última card de la sección corta el conector, aunque el último
      // item no tenga cards (fantasmas ocultos con showMissing=false).
      const lastCard = items.flat().at(-1);
      if (lastCard) {
        lastCard.isLast = true;
      }

      return {
        name: group.template.name,
        description: group.template.description ?? null,
        status: group.status,
        gateLabel: group.gateSatisfied ? null : group.gateLabel,
        completedBlocking: group.completedBlocking,
        totalBlocking: group.totalBlocking,
        items,
      };
    },
  );

  const stageless: PlannedCard[] = grouping.stagelessNodes.map(
    (node, index) => ({
      kind: "ticket" as const,
      node,
      displayLabel: resolveNodeDisplayLabel(node.title, node.stepLabel),
      stepNumber: index + 1,
      isLast: index === grouping.stagelessNodes.length - 1,
    }),
  );

  return { sections, stageless };
}
