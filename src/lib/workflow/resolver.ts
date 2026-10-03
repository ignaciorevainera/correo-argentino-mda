import {
  getIncidents,
  getSolutionComments,
} from "@lib/invgate/automation/incidents";
import { getIncidentLinks } from "@lib/invgate/automation/links";
import { getIncidentTasks } from "@lib/invgate/automation/tasks";
import { deriveInvGateUiUrl } from "@lib/invgate/automation/url";
import { mapWithConcurrency } from "@lib/async";
import { getBranchLocation } from "./branch-location";
import type {
  InvgateAutomationIncident,
  InvgateIncidentLink,
  InvgateIncidentTask,
} from "@lib/invgate/automation/types";
import { htmlToPlainText } from "@lib/format/html-to-text";
import {
  cleanInvGateTitle,
  parseAutomationBranchTitle,
  parseEstimatedEndFromTitle,
  parseStepLabel,
  stripAutomationEmbeddedRefs,
  buildAutomationDisplayName,
} from "./branch-title";
import { branchNameFromDescription } from "./branch-display";
import {
  getCategoryPathMap,
  resolveAutomationCategoryId,
} from "./category-resolver";
import { parseInitialForm } from "./initial-form";
import type { ParsedInitialForm, JefeFormDetails } from "./initial-form";
import {
  parseInstalacionesDescription,
  toParsedInitialForm,
} from "./instalaciones-form";
import { chooseInitialForm } from "./initial-source";
import {
  computeWorkflowProgress,
  mapRequestStatusToLifecycle,
  mapTaskStatusToLifecycle,
} from "./node-status";
import type { WorkflowNodeLifecycle, WorkflowProgress } from "./node-status";
import { buildStageGroups, loadWorkflowTemplate } from "./stages";
import type { StageGrouping, WorkflowKind } from "./stages";
import { isFinalizedStatus, buildStatusNameLookup } from "./automation-status";
import { parseScheduledDate, parseOpeningHours } from "./schedule";
import { getManualData, type AutomationManualData } from "./manual-data";
import { sortChronologically } from "./sort";
import { getUsersByIds } from "@lib/invgate/automation/users";
import { getIncidentStatuses } from "@lib/invgate/automation/statuses";
import {
  getWorkflowRequest,
  parseWorkflowInitialFields,
} from "@lib/invgate/automation/workflow-request";
import type { WorkflowInitialFields } from "@lib/invgate/automation/workflow-request";
import { resolveSectorNames } from "@lib/invgate/automation/helpdesk-names";
import {
  buildAutomationBoard,
  deriveServerInfo,
  parseWorkflowVariables,
} from "./workflow-variables";
import type { AutomationBoard } from "./workflow-variables";
import { normalizeLabel } from "./labels";
import {
  AUTO_CLOSE_REASON,
  getClosure,
  recordClosure,
  removeClosure,
  shouldAutoClose,
} from "./closures";
import type { AutomationClosure } from "./closures";
import { invalidateDiscoveryCache } from "./discovery";
import { upsertAutomationParentStatus } from "./parent-history";
import {
  readPersistedCache,
  writePersistedCache,
  deletePersistedCache,
} from "@lib/invgate/cache";
import {
  detailPersistTtlMs,
  progressTtlMs,
} from "@lib/invgate/automation/cache-config";

export interface WorkflowNodeActivity {
  createdAt: number;
  text: string;
  /** Autor del comentario en InvGate (id crudo). */
  authorId: number | null;
  /** Nombre display del autor; null si no se pudo resolver. */
  authorName: string | null;
}

export interface AutomationTask {
  refId: number;
  name: string;
  lifecycle: WorkflowNodeLifecycle;
  assignedGroupId: number | null;
  assignedId: number | null;
  completedAt: number | null;
  /** Nombre del sector (nivel → helpdesk padre); null si no se resolvió. */
  sectorName: string | null;
}

export interface AutomationNode {
  kind: "request" | "task";
  refId: number;
  prettyId: string | null;
  stepLabel: string;
  title: string;
  /** Descripción del request en texto plano (fallback de matching por etapa). */
  description: string;
  lifecycle: WorkflowNodeLifecycle;
  rawStatusId: number;
  /** Nombre del estado de InvGate (p. ej. "En espera"); null si no se resolvió. */
  rawStatusName: string | null;
  /** Ruta de categoría de InvGate normalizada (match por etapa); null si no se resolvió. */
  categoryPath: string | null;
  /** Fecha programada parseada de la descripción (p. ej. "6 oct 2026"). */
  scheduledFor: string | null;
  /** Epoch de creación; null cuando el bulk no devolvió detalles del request. */
  createdAt: number | null;
  invgateUrl: string;
  activity: WorkflowNodeActivity[];
  /** Comentario marcado como solución (solo nodos completados que lo tengan). */
  solution: string | null;
  /** Autor del comentario de solución; null si no aplica o no se resolvió. */
  solutionAuthorName: string | null;
  /** Tareas internas del request (/incident.tasks). */
  tasks: AutomationTask[];
}

/** Formulario inicial completado al crear la automatización (primer comentario del padre). */
export interface AutomationInitialForm {
  createdAt: number;
  text: string;
  /** Campos parseados; null cuando el texto no corresponde a la plantilla de sucursal. */
  parsed: ParsedInitialForm | null;
  /** Nombre del autor si el formulario vino de un comentario. */
  authorName: string | null;
}

export interface AutomationDetail {
  id: number;
  prettyId: string;
  title: string;
  displayName: string;
  statusId: number;
  processId: number;
  createdAt: number;
  closedAt: number | null;
  initialForm: AutomationInitialForm | null;
  nodes: AutomationNode[];
  /**
   * Agrupación por etapas según la plantilla global configurada (null = sin
   * etapas configuradas: la vista cae a la timeline plana cronológica).
   */
  stages: StageGrouping | null;
  /** `workflow` = flujo AUTSUC nuevo; `legacy` = casos manuales previos. */
  workflowKind: WorkflowKind;
  /** Nombre de la sucursal del título (fallback de presentación). */
  branchName: string | null;
  progress: { completed: number; applicableTotal: number; percent: number };
  /** Región/localidad: jerarquía del formulario o DB de oficinas por código. */
  location: { region: string | null; locality: string | null } | null;
  /** Fecha estimada de implementación (formulario o título del padre). */
  estimatedEnd: string | null;
  /** Franja horaria de la sucursal (manual o parseada de la prosa). */
  openingHours: string | null;
  /** Override manual local de los datos del jefe/contacto; null si no hay. */
  manualData: AutomationManualData | null;
  /** Tablero Status Proyecto (semáforos + hijos + datos técnicos); null si N/A. */
  board: AutomationBoard | null;
  /** Cierre local en el portal (manual o auto); null si sigue en curso. */
  closure: AutomationClosure | null;
}

export type AutomationDetailResult =
  { ok: true; detail: AutomationDetail } | { ok: false; message: string };

/**
 * Cache de detalles por id (TTL corto): el detalle consulta links/tasks/bulk
 * por cada apertura; para monitoreo, un desfase de minutos es tolerable y
 * el cache acota el consumo de API ante aperturas repetidas.
 *
 * Estrategia de served para la navegación (single-flight + stale-while-revalidate):
 * - Entrada fresca (< TTL) -> se devuelve al instante.
 * - Pipeline en flight del mismo id -> los llamadores concurrentes (hidratación
 *   de la barra del listado + navegación al detalle) comparten la misma
 *   promesa, sin contención de API ni trabajo duplicado.
 * - Entrada vencida pero dentro del tope de staleness (30 min) -> se devuelve
 *   el último dato conocido al instante y la pipeline corre en background
 *   para refrescar. Ids jamás vistos esperan la pipeline (única vía lenta).
 */
const DETAIL_CACHE_TTL_MS = 2 * 60_000;
const DETAIL_STALE_MAX_MS = 30 * 60_000;
const DETAIL_CACHE_MAX_ENTRIES = 50;

/**
 * Clave del snapshot persistido del detalle (sobrevive restarts del proceso).
 * v2: cambió la elección de la fuente del formulario y el registrador; los
 * snapshots v1 quedan ignorados para no servir datos con la lógica vieja.
 */
const DETAIL_PERSIST_KEY_PREFIX = "automation.detail.v2.";

/** Key del cache persistido del detalle (exportada para tests/invalidación). */
export function getDetailCacheKey(automationId: number): string {
  return `${DETAIL_PERSIST_KEY_PREFIX}${automationId}`;
}

/** Key del cache persistido del progreso liviano. */
function getProgressCacheKey(automationId: number): string {
  return `automation.progress.${automationId}`;
}

/**
 * Quita los `Date` del template de etapas antes de persistir (el JSON los
 * volvería strings; la UI no los usa y achica el payload).
 */
function detailForPersist(detail: AutomationDetail): AutomationDetail {
  if (!detail.stages) {
    return detail;
  }
  return {
    ...detail,
    stages: {
      ...detail.stages,
      groups: detail.stages.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          const { createdAt: _c, updatedAt: _u, ...template } = item.template;
          return { ...item, template: template as typeof item.template };
        }),
      })),
    },
  };
}

/** Límite de llamadas concurrentes a /incident.tasks (una por hijo). */
const CHILD_TASKS_CONCURRENCY = 8;

interface CachedDetailEntry {
  result: AutomationDetailResult;
  expiresAt: number;
  cachedAt: number;
}

const detailCache = new Map<number, CachedDetailEntry>();
const inflightDetail = new Map<number, Promise<AutomationDetailResult>>();

function runDetailPipeline(
  automationId: number,
): Promise<AutomationDetailResult> {
  const existing = inflightDetail.get(automationId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const result = await resolveAutomationDetailUncached(automationId);
      if (result.ok) {
        detailCache.set(automationId, {
          result,
          expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
          cachedAt: Date.now(),
        });
        // Snapshot persistido: una sola pipeline por id cada TTL, compartida
        // entre usuarios y restarts del proceso.
        writePersistedCache(
          getDetailCacheKey(automationId),
          detailForPersist(result.detail),
          detailPersistTtlMs(),
        );
        // El detalle deja el progreso disponible para el listado.
        writePersistedCache(
          getProgressCacheKey(automationId),
          result.detail.progress,
          detailPersistTtlMs(),
        );

        if (detailCache.size > DETAIL_CACHE_MAX_ENTRIES) {
          const oldest = detailCache.keys().next().value;
          if (oldest !== undefined) {
            detailCache.delete(oldest);
          }
        }
      }
      return result;
    } finally {
      inflightDetail.delete(automationId);
    }
  })();

  inflightDetail.set(automationId, promise);
  return promise;
}

export async function resolveAutomationDetail(
  automationId: number,
): Promise<AutomationDetailResult> {
  const cached = detailCache.get(automationId);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const inFlight = inflightDetail.get(automationId);
  if (inFlight) {
    return inFlight;
  }

  if (cached && now - cached.cachedAt <= DETAIL_STALE_MAX_MS) {
    void runDetailPipeline(automationId);
    return cached.result;
  }

  // Sin memoria fresca: servir el snapshot persistido (sobrevivió a restart o
  // pertenece a otra instancia) y regenerar SIEMPRE en background. El snapshot
  // persistido puede tener hasta su TTL de antigüedad (default 15 min), así que
  // sin este refresh la vista quedaba pegada a un estado viejo hasta que
  // venciera el persistido.
  const persisted = readPersistedCache<AutomationDetail>(
    getDetailCacheKey(automationId),
  );
  if (persisted && persisted.id === automationId) {
    detailCache.set(automationId, {
      result: { ok: true, detail: persisted },
      expiresAt: now + DETAIL_CACHE_TTL_MS,
      cachedAt: now,
    });
    void runDetailPipeline(automationId);
    return { ok: true, detail: persisted };
  }

  return runDetailPipeline(automationId);
}

/**
 * Invalida el detalle cacheado de una automatización (memoria + in-flight)
 * cuando cambia su estado local (cierre/reapertura) para que el próximo render
 * no sirva un `closure` viejo.
 */
export function invalidateAutomationDetail(automationId: number): void {
  detailCache.delete(automationId);
  inflightDetail.delete(automationId);
  deletePersistedCache(getDetailCacheKey(automationId));
  deletePersistedCache(getProgressCacheKey(automationId));
}

export type AutomationProgressResult =
  { ok: true; progress: WorkflowProgress } | { ok: false; message: string };

/**
 * Progreso liviano para la hidratación de las cards del listado: reusa el
 * detalle persistido si existe; si no, hace el mínimo (`incident.link` + un
 * bulk sin comentarios) y calcula el progreso sobre los lifecycles, sin pedir
 * tasks/solutions/wf.request/users.
 */
export async function resolveAutomationProgress(
  automationId: number,
): Promise<AutomationProgressResult> {
  const cachedProgress = readPersistedCache<WorkflowProgress>(
    getProgressCacheKey(automationId),
  );
  if (cachedProgress && typeof cachedProgress.percent === "number") {
    return { ok: true, progress: cachedProgress };
  }

  const persisted = readPersistedCache<AutomationDetail>(
    getDetailCacheKey(automationId),
  );
  if (persisted && persisted.id === automationId && persisted.progress) {
    writePersistedCache(
      getProgressCacheKey(automationId),
      persisted.progress,
      progressTtlMs(),
    );
    return { ok: true, progress: persisted.progress };
  }

  const links = await fetchLinksAndIds(automationId);
  if (!links.ok) {
    return { ok: false, message: links.message };
  }

  const detailsResult = await getIncidents([automationId, ...links.linkIds]);
  if (!detailsResult.ok) {
    return {
      ok: false,
      message: `No se pudieron obtener los detalles: ${detailsResult.message}`,
    };
  }

  const parentIncident = detailsResult.data[String(automationId)];
  if (!parentIncident) {
    return {
      ok: false,
      message: `El ticket ${automationId} no existe en InvGate.`,
    };
  }

  if (parentIncident.category_id !== (await resolveAutomationCategoryId())) {
    return {
      ok: false,
      message: `El ticket ${automationId} no pertenece a la categoría de automatizaciones.`,
    };
  }

  // Write-back del estado mutable del padre: la card se abre con datos frescos
  // de InvGate y el listado (que lee la DB) refleja el cambio sin recargar todo
  // el scan de discovery.
  upsertAutomationParentStatus(automationId, {
    statusId: parentIncident.status_id,
    updatedAt: parentIncident.last_update ?? parentIncident.created_at,
    closedAt:
      typeof parentIncident.closed_at === "number"
        ? parentIncident.closed_at
        : null,
  });

  const lifecycles = links.links.map((link) => {
    const incident = detailsResult.data[String(link.id)];
    return mapRequestStatusToLifecycle(incident ? incident.status_id : -1);
  });
  const progress = computeWorkflowProgress(lifecycles);
  writePersistedCache(
    getProgressCacheKey(automationId),
    progress,
    progressTtlMs(),
  );

  // Al 100% se dispara la pipeline de detalle en background para evaluar el
  // auto-cierre oportunista, sin encarecer esta respuesta liviana.
  if (progress.percent === 100) {
    void runDetailPipeline(automationId).catch(() => {});
  }

  return { ok: true, progress };
}

function toActivity(
  comments:
    | readonly {
        message: string;
        created_at: number;
        author_id?: number;
      }[]
    | undefined,
): WorkflowNodeActivity[] {
  if (!comments) {
    return [];
  }
  return [...comments]
    .sort((a, b) => a.created_at - b.created_at)
    .map((comment) => ({
      createdAt: comment.created_at,
      text: htmlToPlainText(comment.message),
      authorId:
        typeof comment.author_id === "number" ? comment.author_id : null,
      authorName: null,
    }));
}

function buildRequestNodes(
  links: readonly InvgateIncidentLink[],
  incidentsById: Record<string, InvgateAutomationIncident>,
  statusNames: Readonly<Record<number, string>>,
  categoryPaths: ReadonlyMap<number, string>,
): AutomationNode[] {
  const nodes = links.map((link) => {
    const incident = incidentsById[String(link.id)];
    const cleanTitle = cleanInvGateTitle(link.title);
    // El bulk puede omitir campos del request (title undefined observado en
    // producción): los títulos de link y bulk se combinan con degradación.
    const incidentTitle = incident
      ? cleanInvGateTitle(incident.title ?? "")
      : "";

    if (!incident) {
      // El enlace existe pero el bulk no devolvió detalles del request.
      return {
        kind: "request" as const,
        refId: link.id,
        prettyId: `#${link.id}`,
        stepLabel: parseStepLabel(cleanTitle),
        title: cleanTitle,
        description: "",
        lifecycle: mapRequestStatusToLifecycle(-1),
        rawStatusId: -1,
        rawStatusName: null,
        categoryPath: null,
        scheduledFor: null,
        createdAt: null,
        invgateUrl: deriveInvGateUiUrl(link.id),
        activity: [],
        solution: null,
        solutionAuthorName: null,
        tasks: [],
      };
    }

    const description = htmlToPlainText(incident.description ?? "");

    return {
      kind: "request" as const,
      refId: incident.id,
      prettyId: incident.pretty_id,
      stepLabel: parseStepLabel(incidentTitle || cleanTitle),
      title: incidentTitle,
      description,
      lifecycle: mapRequestStatusToLifecycle(incident.status_id),
      rawStatusId: incident.status_id,
      rawStatusName: statusNames[incident.status_id] ?? null,
      categoryPath: categoryPaths.get(incident.category_id) ?? null,
      scheduledFor: parseScheduledDate(description),
      createdAt: incident.created_at,
      invgateUrl: deriveInvGateUiUrl(incident.id),
      activity: toActivity(incident.comments),
      solution: null,
      solutionAuthorName: null,
      tasks: [],
    };
  });

  return sortChronologically(nodes);
}

/**
 * Convierte las tareas internas de un request al modelo de la card. Deduplica
 * por nombre normalizado: InvGate arrastra réplicas exactas (p. ej. "Crear
 * carpeta para Servicios BUI" x3 por cargas repetidas) que no aportan nada.
 */
function toAutomationTasks(
  tasks: readonly InvgateIncidentTask[],
): AutomationTask[] {
  const seen = new Set<string>();
  const result: AutomationTask[] = [];
  for (const task of tasks) {
    const key = normalizeLabel(task.name ?? "");
    if (key.length > 0) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }
    result.push({
      refId: task.task_id,
      name: task.name,
      lifecycle: mapTaskStatusToLifecycle(task.status),
      assignedGroupId:
        typeof task.helpdesk_id === "number" ? task.helpdesk_id : null,
      assignedId: typeof task.agent_id === "number" ? task.agent_id : null,
      completedAt:
        typeof task.completed_at === "number" ? task.completed_at : null,
      sectorName: null,
    });
  }
  return result;
}

/** Variable de workflow "activa" (Activado/Sí/Finalizado/...). */
function isTruthyFlag(value: string | undefined): boolean {
  return Boolean(
    value &&
      /^(si|sí|true|1|activado|activo|finalizado|realizado|conectado|ok)/i.test(
        value.trim(),
      ),
  );
}

/**
 * matchLabels de ítems form/manual que se dan por completados a partir de las
 * variables del workflow (no generan ticket):
 * - GDI/VDI ← `accesovdisarangoips`.
 * - Hostnames ← `hostnamesadicional` (lista real) o su flag booleano.
 * - Configuración de server ← nombre + IP del servidor MOA derivados.
 */
function formatHostnames(raw: string): string | null {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : null;
}

function computeSatisfiedStageItems(
  variables: Map<string, string>,
): Map<string, string | null> {
  const satisfied = new Map<string, string | null>();
  if (isTruthyFlag(variables.get("accesovdisarangoips"))) {
    satisfied.set(normalizeLabel("Habilitación de terminales de GDI"), null);
  }
  const hostnames = (variables.get("hostnamesadicional") ?? "").trim();
  if (
    hostnames.length > 0 ||
    isTruthyFlag(variables.get("booleanhostnamesadicionales"))
  ) {
    satisfied.set(
      normalizeLabel("Solicitud de Hostnames"),
      formatHostnames(hostnames),
    );
  }
  const server = deriveServerInfo(variables);
  if (server) {
    satisfied.set(
      normalizeLabel("Configuración serv"),
      `${server.name} · ${server.ip}`,
    );
  }
  return satisfied;
}

/**
 * Busca entre los hijos vinculados el primero con data de INSTALACIONES
 * (título "Instalaciones para AUTSUC #..." en el formato viejo, o gestión
 * "Instalaciones"/"TECO Instalaciones" en el formato nuevo) y description
 * parseable. Los hijos con data siempre vienen del bulk del detalle
 * (padre + hijos, comments=1). De los duplicados gana el más nuevo que
 * mencione "Sucursal" en su description (formulario en prosa).
 */
function findInstalacionesChild(
  links: readonly InvgateIncidentLink[],
  incidentsById: Record<string, InvgateAutomationIncident>,
): InvgateAutomationIncident | null {
  const candidates = links
    .map((link) => incidentsById[String(link.id)])
    .filter(
      (incident): incident is InvgateAutomationIncident =>
        typeof incident === "object" &&
        incident !== null &&
        Boolean(incident.description),
    )
    .filter((incident) => {
      const title = cleanInvGateTitle(incident.title ?? "").trim();
      if (/^instalaciones para autsuc/i.test(title)) {
        return true;
      }
      return /\binstalaciones\b/i.test(stripAutomationEmbeddedRefs(title));
    })
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

  const withSucursal = candidates.filter((incident) =>
    /\bsucursal\b/i.test(htmlToPlainText(incident.description ?? "")),
  );

  return withSucursal[0] ?? candidates[0] ?? null;
}

/**
 * Clasifica la automatización para elegir el layout de etapas:
 * - `workflow`: título del padre "AUTSUC …" o hijo "Instalaciones para AUTSUC".
 * - `legacy`: casos manuales anteriores a Luis Guillón.
 */
export function detectWorkflowKind(
  parentTitle: string,
  nodes: readonly AutomationNode[],
): WorkflowKind {
  if (/^autsuc\b/i.test(parentTitle.trim())) {
    return "workflow";
  }
  const hasInstalacionesChild = nodes.some((node) =>
    /^instalaciones para autsuc/i.test(node.title.trim()),
  );
  return hasInstalacionesChild ? "workflow" : "legacy";
}

/**
 * Mergea los datos del jefe: el override (workflow o manual) gana sobre el
 * formulario parseado, campo por campo.
 */
function mergeJefeFields(
  base: JefeFormDetails | null,
  override: { name: string | null; dni: string | null; legajo: string | null },
): JefeFormDetails | null {
  const jefe: JefeFormDetails = {
    name: override.name ?? base?.name ?? null,
    dni: override.dni ?? base?.dni ?? null,
    legajo: override.legajo ?? base?.legajo ?? null,
    extras: base?.extras ?? [],
  };
  const hasJefe =
    jefe.name !== null ||
    jefe.dni !== null ||
    jefe.legajo !== null ||
    jefe.extras.length > 0;
  return hasJefe ? jefe : null;
}

/**
 * Mergea los initial fields del workflow (best-effort `/wf.request`) sobre el
 * formulario parseado. Los valores del workflow ganan cuando están presentes;
 * si no había formulario, se crea uno base.
 */
export function mergeWorkflowInitialFields(
  parsed: ParsedInitialForm | null,
  fields: WorkflowInitialFields,
): ParsedInitialForm {
  const base: ParsedInitialForm = parsed ?? {
    intro: [],
    sucursal: null,
    ipRange: null,
    estimatedEnd: null,
    jefe: null,
    jefeZonal: null,
    otherFields: [],
  };

  const otherFields = [...base.otherFields];
  if (fields.nis && !otherFields.some((f) => /^nis$/i.test(f.label.trim()))) {
    otherFields.push({ label: "NIS", value: fields.nis });
  }

  return {
    ...base,
    jefe: mergeJefeFields(base.jefe, {
      name: fields.jefeName,
      dni: fields.jefeDni,
      legajo: fields.jefeLegajo,
    }),
    jefeZonal: fields.jefeZonal ?? base.jefeZonal ?? null,
    otherFields,
  };
}

/**
 * Aplica el override manual (portal) sobre el formulario parseado: los datos
 * cargados a mano ganan sobre los de InvGate. Corrige jefe/zonal.
 */
function applyManualOverrides(
  form: ParsedInitialForm | null,
  manual: AutomationManualData,
): ParsedInitialForm {
  const base: ParsedInitialForm = form ?? {
    intro: [],
    sucursal: null,
    ipRange: null,
    estimatedEnd: null,
    jefe: null,
    jefeZonal: null,
    otherFields: [],
  };

  return {
    ...base,
    jefe: mergeJefeFields(base.jefe, {
      name: manual.jefeName,
      dni: manual.jefeDni,
      legajo: manual.jefeLegajo,
    }),
    jefeZonal: manual.jefeZonal ?? base.jefeZonal ?? null,
  };
}

/**
 * Pipeline v2 de una automatización (mismo costo HTTP que v1):
 * links + tasks en paralelo → UN solo bulk /incidents (padre+hijos, comments=1) →
 * validación de categoría sobre el padre ya traído → nodos con actividad +
 * formulario inicial + progreso.
 *
 * Dato empírico v1: la secuencia de pasos sigue el orden temporal de creación
 * (arriba el primero); el desempate usa el ID ascendente observado.
 */
/**
 * Links del padre + ids de los hijos (paso común a detalle y progreso).
 */
async function fetchLinksAndIds(
  automationId: number,
): Promise<
  | { ok: true; links: readonly InvgateIncidentLink[]; linkIds: number[] }
  | { ok: false; message: string }
> {
  const linksResult = await getIncidentLinks(automationId);
  if (!linksResult.ok) {
    return { ok: false, message: linksResult.message };
  }
  return {
    ok: true,
    links: linksResult.data,
    linkIds: linksResult.data.map((link) => link.id),
  };
}

/**
 * Detalle de una automatización. El pipeline en sí vive en
 * resolveAutomationDetailUncached.
 */
async function resolveAutomationDetailUncached(
  automationId: number,
): Promise<AutomationDetailResult> {
  /**
   * Cold-path: el workflow request y la categoría solo dependen del id, así
   * que se lanzan en paralelo con los links y se awaitean en su punto de uso.
   * La categoría puede rechazar: se le adjunta un catch vacío para no dejar
   * una unhandled rejection si salimos antes de awaitearla (el await real
   * sigue propagando el error).
   */
  const workflowRequestPromise = getWorkflowRequest(automationId);
  const categoryIdPromise = resolveAutomationCategoryId();
  categoryIdPromise.catch(() => {});
  const categoryPathsPromise = getCategoryPathMap();

  const links = await fetchLinksAndIds(automationId);
  if (!links.ok) {
    return { ok: false, message: links.message };
  }
  const { links: linkData, linkIds } = links;

  const [detailsResult, childTasksResults] = await Promise.all([
    getIncidents([automationId, ...linkIds], { includeComments: true }),
    mapWithConcurrency(linkIds, CHILD_TASKS_CONCURRENCY, (id) =>
      getIncidentTasks(id),
    ),
  ]);

  if (!detailsResult.ok) {
    return {
      ok: false,
      message: `No se pudieron obtener los detalles de la automatización: ${detailsResult.message}`,
    };
  }

  const parentIncident = detailsResult.data[String(automationId)];

  if (!parentIncident) {
    return {
      ok: false,
      message: `El ticket ${automationId} no existe en InvGate.`,
    };
  }

  if (parentIncident.category_id !== (await categoryIdPromise)) {
    return {
      ok: false,
      message: `El ticket ${automationId} no pertenece a la categoría de automatizaciones (category_id=${parentIncident.category_id})`,
    };
  }

  const statusesResult = await getIncidentStatuses();
  const statusNames = buildStatusNameLookup(
    statusesResult.ok ? statusesResult.data : null,
  );
  const categoryPaths = await categoryPathsPromise;
  const nodes = buildRequestNodes(
    linkData,
    detailsResult.data,
    statusNames,
    categoryPaths,
  );

  // Tareas internas por request vinculado → se muestran dentro de su card.
  const tasksByRef = new Map<number, InvgateIncidentTask[]>();
  childTasksResults.forEach((result, index) => {
    if (result.ok) {
      tasksByRef.set(linkIds[index], result.data);
    }
  });
  const taskGroupIds: number[] = [];
  for (const node of nodes) {
    node.tasks = toAutomationTasks(tasksByRef.get(node.refId) ?? []);
    for (const task of node.tasks) {
      if (task.assignedGroupId) {
        taskGroupIds.push(task.assignedGroupId);
      }
    }
  }
  const sectorNames = await resolveSectorNames(taskGroupIds);
  for (const node of nodes) {
    for (const task of node.tasks) {
      task.sectorName = task.assignedGroupId
        ? (sectorNames.get(task.assignedGroupId) ?? null)
        : null;
    }
  }

  const completedRequestIds = nodes
    .filter((node) => node.kind === "request" && node.lifecycle === "completed")
    .map((node) => node.refId);
  const [solutions, template] = await Promise.all([
    getSolutionComments(completedRequestIds),
    loadWorkflowTemplate(),
  ]);
  const solutionAuthorByRef = new Map<number, number | null>();
  for (const node of nodes) {
    const solution = solutions.get(node.refId);
    node.solution = solution ? htmlToPlainText(solution.message) : null;
    solutionAuthorByRef.set(node.refId, solution?.authorId ?? null);
  }

  const cleanedTitle = cleanInvGateTitle(parentIncident.title);

  /**
   * Fuentes del formulario inicial:
   * 1. Description del padre (formato histórico de producción).
   * 2. Primer comentario del padre (formato QA / formularios por comentario).
   * 3. Description del hijo "Instalaciones para AUTSUC" (workflow AUTSUC nuevo,
   *    ticket 79867): el padre puede llegar sin description ni comentarios.
   *
   * La elección (ver `initial-source.ts`) no se queda con un comentario "débil"
   * (solo `otherFields`, p.ej. B0177) que bloquearía la sucursal del hijo.
   */
  const parentFormComment = toActivity(parentIncident.comments)[0] ?? null;

  const descriptionSource =
    parentIncident.description && parentIncident.description.length > 0
      ? {
          createdAt: parentIncident.created_at,
          text: htmlToPlainText(parentIncident.description),
        }
      : null;

  const instalacionesChild = findInstalacionesChild(
    linkData,
    detailsResult.data,
  );
  const instalacionesSource = instalacionesChild
    ? {
        createdAt:
          instalacionesChild.created_at ?? parentIncident.created_at,
        text: htmlToPlainText(instalacionesChild.description ?? ""),
      }
    : null;
  const instalacionesInfo = instalacionesSource
    ? parseInstalacionesDescription(instalacionesSource.text)
    : null;

  const chosenForm = chooseInitialForm({
    description: descriptionSource
      ? {
          parsed: parseInitialForm(descriptionSource.text),
          source: descriptionSource,
        }
      : null,
    comment: parentFormComment
      ? {
          parsed: parseInitialForm(parentFormComment.text),
          source: parentFormComment,
        }
      : null,
    instalaciones:
      instalacionesSource && instalacionesInfo
        ? {
            parsed: toParsedInitialForm(instalacionesInfo),
            source: instalacionesSource,
          }
        : null,
  });

  let formSource: {
    createdAt: number;
    text: string;
    authorId?: number | null;
  } | null = chosenForm?.source ?? null;
  let parsedForm = chosenForm?.parsed ?? null;

  // Best-effort: initial fields del workflow (/wf.request). En instancias que
  // todavía no exponen el endpoint devuelve null y todo queda igual.
  const workflowRequest = await workflowRequestPromise;
  const workflowFields = parseWorkflowInitialFields(workflowRequest);
  if (workflowFields) {
    parsedForm = mergeWorkflowInitialFields(parsedForm, workflowFields);
    if (!formSource) {
      formSource = { createdAt: parentIncident.created_at, text: "" };
    }
  }
  const workflowVariables = parseWorkflowVariables(workflowRequest);
  const board = buildAutomationBoard(workflowVariables);

  // Override manual del portal (datos del jefe/contacto cargados a mano).
  const manualData = getManualData(automationId);
  if (manualData) {
    parsedForm = applyManualOverrides(parsedForm, manualData);
    if (!formSource) {
      formSource = { createdAt: parentIncident.created_at, text: "" };
    }
  }
  const openingHours =
    manualData?.openingHours ?? parseOpeningHours(formSource?.text ?? null);

  // Resolución única de nombres de autores de comentarios (actividad,
  // solución y formulario si vino de un comentario).
  const authorIds = new Set<number>();
  for (const node of nodes) {
    for (const entry of node.activity) {
      if (entry.authorId) {
        authorIds.add(entry.authorId);
      }
    }
  }
  for (const authorId of solutionAuthorByRef.values()) {
    if (authorId) {
      authorIds.add(authorId);
    }
  }
  const formAuthorId =
    parentFormComment && formSource === parentFormComment
      ? parentFormComment.authorId
      : null;
  if (formAuthorId) {
    authorIds.add(formAuthorId);
  }
  // Registrador cuando el form no vino de un comentario: el creador del padre.
  if (typeof parentIncident.creator_id === "number" && parentIncident.creator_id > 0) {
    authorIds.add(parentIncident.creator_id);
  }

  const authorNames = await getUsersByIds([...authorIds]);
  const formAuthorName =
    (formAuthorId ? (authorNames.get(formAuthorId) ?? null) : null) ??
    authorNames.get(parentIncident.creator_id) ??
    null;
  for (const node of nodes) {
    for (const entry of node.activity) {
      if (entry.authorId) {
        entry.authorName = authorNames.get(entry.authorId) ?? null;
      }
    }
    const solutionAuthorId = solutionAuthorByRef.get(node.refId) ?? null;
    node.solutionAuthorName = solutionAuthorId
      ? (authorNames.get(solutionAuthorId) ?? null)
      : null;
  }

  const workflowKind = detectWorkflowKind(cleanedTitle, nodes);
  let stages: StageGrouping | null = null;
  if (template) {
    stages = buildStageGroups(nodes, template, {
      finalized: isFinalizedStatus(parentIncident.status_id),
      workflowKind,
      satisfiedItems: computeSatisfiedStageItems(workflowVariables),
    });
  }

  const progress = computeWorkflowProgress(nodes.map((node) => node.lifecycle));

  /**
   * Cierre automático oportunista: cuando el detalle se calcula (apertura del
   * caso o card del listado) y el flujo llegó al 100% sin etapas bloqueantes
   * faltantes, se registra el cierre local. Idempotente por `getClosure`.
   */
  let closure = getClosure(automationId);

  // Auto-cierres que dejaron de aplicar (el progreso retrocedió o apareció una
  // etapa bloqueante faltante) se limpian para no dejar el caso finalizado.
  if (
    closure &&
    closure.kind === "auto" &&
    (progress.percent < 100 || (stages?.missingBlockingCount ?? 0) > 0)
  ) {
    removeClosure(automationId);
    invalidateDiscoveryCache();
    closure = null;
  }

  if (
    !closure &&
    shouldAutoClose({
      statusId: parentIncident.status_id,
      percent: progress.percent,
      missingBlockingCount: stages?.missingBlockingCount ?? 0,
      hasClosure: false,
    })
  ) {
    closure = recordClosure({
      automationId,
      kind: "auto",
      reason: AUTO_CLOSE_REASON,
      percent: progress.percent,
      closedBy: "sistema",
    });
    invalidateDiscoveryCache();
  }

  const branchInfo = parseAutomationBranchTitle(cleanedTitle);
  const branchCode = branchInfo.branchCode ?? null;
  const branchName =
    branchInfo.branchName ??
    branchNameFromDescription(parentIncident.description) ??
    null;
  const branchLocation = await getBranchLocation(branchCode);
  const region = parsedForm?.sucursal?.region ?? branchLocation?.region ?? null;
  const locality =
    parsedForm?.sucursal?.locality ?? branchLocation?.locality ?? null;
  const location = region || locality ? { region, locality } : null;
  // La fecha del título del padre es la estimada de implementación; el
  // formulario/prosa queda como fallback (casos viejos sin fecha en el título).
  const estimatedEnd =
    parseEstimatedEndFromTitle(cleanedTitle) ??
    parsedForm?.estimatedEnd ??
    null;

  return {
    ok: true,
    detail: {
      id: parentIncident.id,
      prettyId: parentIncident.pretty_id,
      title: cleanedTitle,
      displayName: buildAutomationDisplayName(
        cleanedTitle,
        branchNameFromDescription(parentIncident.description),
      ),
      statusId: parentIncident.status_id,
      processId: parentIncident.process_id ?? 0,
      createdAt: parentIncident.created_at,
      closedAt: parentIncident.closed_at,
      initialForm: formSource
        ? {
            createdAt: formSource.createdAt,
            text: formSource.text,
            parsed: parsedForm,
            authorName: formAuthorName,
          }
        : null,
      nodes,
      stages,
      workflowKind,
      branchName,
      progress,
      location,
      estimatedEnd,
      openingHours,
      manualData,
      board,
      closure,
    },
  };
}
