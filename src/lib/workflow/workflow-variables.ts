import { formatEpochDate } from "@lib/format/datetime";
import { richFieldText } from "@lib/invgate/automation/value-text";
import type { InvgateWorkflowRequest } from "@lib/invgate/automation/workflow-request";

/**
 * Tablero Status Proyecto: los 8 indicadores + "Acción a tomar" del tablero
 * de InvGate, más links a los tickets hijos y datos técnicos. Se alimenta de
 * `current_variables_values` de /wf.request (validado 2026-10 con #79867 y
 * #84909) — misma respuesta que ya se pide para el formulario inicial, sin
 * llamadas extra.
 */

export type BoardTone = "success" | "warning" | "neutral";

export interface AutomationBoardIndicator {
  key: string;
  label: string;
  value: string;
  tone: BoardTone;
}

export interface AutomationBoardLink {
  refId: number;
  label: string;
}

export interface AutomationBoardTech {
  label: string;
  value: string;
}

export interface AutomationBoard {
  indicators: AutomationBoardIndicator[];
  links: AutomationBoardLink[];
  tech: AutomationBoardTech[];
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Valor legible de una variable (value_label / HTML→texto + espacios). */
function variableValue(value: unknown, valueLabel: unknown): string {
  return richFieldText(value, valueLabel)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mapa normalizado (nombre → valor) de las variables calculadas del proceso. */
export function parseWorkflowVariables(
  request: InvgateWorkflowRequest | null | undefined,
): Map<string, string> {
  const variables = new Map<string, string>();
  const rows = request?.current_variables_values;
  if (!Array.isArray(rows)) {
    return variables;
  }
  for (const row of rows) {
    if (!row || typeof row !== "object" || !row.name) {
      continue;
    }
    const value = variableValue(row.value, row.value_label);
    if (value.length > 0) {
      variables.set(normalizeKey(row.name), value);
    }
  }
  return variables;
}

interface IndicatorDef {
  key: string;
  label: string;
  match: string[];
}

const INDICATOR_DEFS: readonly IndicatorDef[] = [
  { key: "server", label: "Servidor", match: ["estadoservermoa"] },
  { key: "hh", label: "HandHeld", match: ["estadohh"] },
  {
    key: "otherHw",
    label: "Equipamiento (otro)",
    match: ["estadootrohw", "estadosolicitudequipamiento"],
  },
  {
    key: "network",
    label: "Red y cableado",
    match: ["estadotecoinstalaciones"],
  },
  { key: "mf", label: "Servicios M&F", match: ["estadoservicios"] },
  { key: "cai", label: "CAI informado", match: ["estadocai"] },
  { key: "pdv", label: "Punto de venta", match: ["estadopuntodeventa"] },
  { key: "bui", label: "Carpeta BUI", match: ["estadobui"] },
  {
    key: "action",
    label: "Acción a tomar",
    match: ["tablerogonogo", "tablerostatusproyecto"],
  },
];

const LINK_DEFS: readonly { match: string; label: string }[] = [
  { match: "idticketserver", label: "Servidor MOA" },
  { match: "idtickethh", label: "HandHeld" },
  { match: "idticketequipamiento", label: "Equipamiento" },
  { match: "idticketservicios", label: "Servicios M&F" },
  { match: "tecoinstalaciones", label: "TECO Instalaciones" },
  { match: "idticketvisit", label: "Visita técnico" },
  { match: "idticketrecambio", label: "Recambio" },
];

const TECH_DEFS: readonly { label: string; match: string[]; date?: boolean }[] =
  [
    { label: "Rango IP", match: ["rangoips"] },
    { label: "Punto de venta", match: ["puntodeventa"] },
    { label: "Carpeta BUI", match: ["carpetabui"] },
    { label: "Fecha de apertura", match: ["fechadeapertura"], date: true },
  ];

function findValue(
  variables: Map<string, string>,
  fragments: string[],
): string {
  for (const fragment of fragments) {
    const exact = variables.get(fragment);
    if (exact) {
      return exact;
    }
  }
  for (const fragment of fragments) {
    for (const [key, value] of variables) {
      // Los flags booleanos ("booleanhostnamesadicionales") contienen el nombre
      // de la variable real como substring: excluirlos evita devolver
      // "Activado" en lugar del valor real (p. ej. la lista de hostnames).
      if (key.startsWith("boolean")) continue;
      if (key.includes(fragment) && value) {
        return value;
      }
    }
  }
  return "";
}

/**
 * Datos del servidor MOA derivados de variables del workflow:
 * - IP: primeros 3 octetos de `rangoips` + ".231" (el último octeto del rango
 *   es de ejemplo).
 * - Nombre: `nis` + "308".
 * Null si faltan el rango o el NIS.
 */
export function deriveServerInfo(
  variables: Map<string, string>,
): { ip: string; name: string } | null {
  const range = (variables.get("rangoips") ?? "").trim();
  const nis = (variables.get("nis") ?? "").trim();
  if (!range || !nis) {
    return null;
  }
  const octets = range.split(".").filter(Boolean);
  if (octets.length < 3) {
    return null;
  }
  const prefix = octets.slice(0, 3).join(".");
  if (!/^\d+\.\d+\.\d+$/.test(prefix)) {
    return null;
  }
  return { ip: `${prefix}.231`, name: `${nis}308` };
}

/** Semáforo por estado: verde para resuelto, amarillo para pendiente/negativo. */
function toneFor(value: string): BoardTone {
  const v = normalizeKey(value);
  if (v.length === 0) return "neutral";
  if (
    /^(si|true|ok|finaliz|entregad|realizad|complet|cerrad|avanz|go)/.test(v)
  ) {
    return "success";
  }
  if (/^(no|false)/.test(v)) {
    return "warning";
  }
  if (
    /(proceso|pendient|espera|demora|bloque|rechaz|encurso|actualiz)/.test(v)
  ) {
    return "warning";
  }
  return "neutral";
}

/**
 * Arma el tablero. Devuelve `null` cuando no hay ninguna variable útil (casos
 * legacy o sin workflow), para no renderizar una sección vacía.
 */
export function buildAutomationBoard(
  variables: Map<string, string>,
): AutomationBoard | null {
  if (variables.size === 0) {
    return null;
  }

  const indicators: AutomationBoardIndicator[] = [];
  for (const def of INDICATOR_DEFS) {
    const value = findValue(variables, def.match);
    if (value.length > 0) {
      indicators.push({
        key: def.key,
        label: def.label,
        value,
        tone: toneFor(value),
      });
    }
  }

  const links: AutomationBoardLink[] = [];
  for (const def of LINK_DEFS) {
    const raw = findValue(variables, [def.match]);
    const refId = Number.parseInt(raw, 10);
    if (Number.isInteger(refId) && refId > 0) {
      links.push({ refId, label: def.label });
    }
  }

  const tech: AutomationBoardTech[] = [];
  for (const def of TECH_DEFS) {
    const raw = findValue(variables, def.match);
    if (raw.length === 0) {
      continue;
    }
    const epoch = Number.parseInt(raw, 10);
    const value =
      def.date && Number.isInteger(epoch) ? formatEpochDate(epoch) : raw;
    tech.push({ label: def.label, value });
  }

  if (indicators.length === 0 && links.length === 0 && tech.length === 0) {
    return null;
  }

  return { indicators, links, tech };
}
