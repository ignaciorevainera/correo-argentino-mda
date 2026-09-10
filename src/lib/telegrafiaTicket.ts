import { escapeHtml } from "@lib/sanitize";
import { db } from "@db/index";
import { offices, officeInvgateLinks } from "@db/schema";
import { eq } from "drizzle-orm";

// ============================================================
// TOGGLE: true = QA (crear tickets de prueba en entorno QA)
//         false = PROD (crear tickets reales en entorno productivo)
// ============================================================
export const USE_QA_INVGATE = false;

// --- Helpdesk (mismo ID en QA y producción) ---
/** Helpdesk: Mesa de Ayuda Operación Telegráfica (id fijo ya conocido) */
export const TELEGRAFIA_HELPDESK_ID = 5994;

// --- Categoría ---
/** QA: Pruebas */
const QA_CATEGORY_ID = 79;

/** PROD: STS- Problema con agentes
 *  Ruta: Mesa de Ayuda TI → Accesos y Aplicaciones → Distribución → STS → Fallas → STS- Problema con agentes
 *  PENDIENTE: buscar el ID real en producción con GET /api/v1/categories
 */
const PROD_CATEGORY_ID = 257; // STS- Problema con agentes

export const AGENTS_TICKET_CATEGORY_ID = USE_QA_INVGATE
  ? QA_CATEGORY_ID
  : PROD_CATEGORY_ID;

// --- Helpdesk destino de reasignación (TI_GSM_MDA TI Nivel 1) ---
const QA_AGENTS_ASSIGN_GROUP_ID = 3950; // QA
const PROD_AGENTS_ASSIGN_GROUP_ID = 2510; // prod
export const AGENTS_TICKET_ASSIGN_GROUP_ID = USE_QA_INVGATE
  ? QA_AGENTS_ASSIGN_GROUP_ID
  : PROD_AGENTS_ASSIGN_GROUP_ID;

// --- Categorías conocidas del problema "desconexión de agentes" ---
// 257 = STS- Problema con agentes (categoría que usa este portal)
// 2625 = Alarma (Operación Telegráfica) — misma problemática registrada en prod
export const AGENTS_TICKET_CATEGORY_IDS = [AGENTS_TICKET_CATEGORY_ID, 2625];

// Patrón de título para "desconexión de agentes" / "agentes caídos",
// tolera variantes: "STS - Desconexión de Agentes", "Agentes Caidos", "[I1913] STS- ...", etc.
export const AGENTS_TICKET_TITLE_PATTERN =
  /desconexi[oó]n\s*de\s*agentes|agentes\s*ca[ií]dos/i;

export function isAgentsTicketTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return AGENTS_TICKET_TITLE_PATTERN.test(title);
}

// --- IDs de usuario de prueba (solo QA) ---
export const QA_CUSTOMER_ID = 6;
export const QA_CREATOR_ID = 6;

// --- Prioridad ---
export const AGENTS_TICKET_PRIORITY_ID = 1; // Low

// --- Título del ticket ---
export const AGENTS_TICKET_TITLE = "STS - Desconexión de agentes";

export function buildAgentsTicketTitle(officeCode: string): string {
  return `${officeCode.trim()} ${AGENTS_TICKET_TITLE}`;
}

export function buildTicketDescription(
  officeName: string,
  officeCode: string,
  observaciones?: string,
): string {
  const observacionesSection = observaciones?.trim()
    ? `<tr><td style="padding:6px 12px;font-weight:bold;text-transform:uppercase;background-color:#f1f5f9;border:1px solid #e2e8f0;">Observaciones</td><td style="padding:6px 12px;background-color:#ffffff;border:1px solid #e2e8f0;">${escapeHtml(observaciones.trim())}</td></tr>`
    : "";

  return `Se comunican desde OPT y reportan problemas con los agentes.<br><table style="width:100%;max-width:600px;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#334155;"><tr><td style="padding:6px 12px;font-weight:bold;text-transform:uppercase;width:180px;background-color:#f1f5f9;border:1px solid #e2e8f0;">OFICINA AFECTADA</td><td style="padding:6px 12px;background-color:#ffffff;border:1px solid #e2e8f0;">${escapeHtml(officeName)}</td></tr><tr><td style="padding:6px 12px;font-weight:bold;text-transform:uppercase;background-color:#f1f5f9;border:1px solid #e2e8f0;">NIS</td><td style="padding:6px 12px;background-color:#ffffff;border:1px solid #e2e8f0;">${escapeHtml(officeCode)}</td></tr>${observacionesSection}</table>`;
}

export function getInvgateLocationId(officeCode: string): number | null {
  const result = db
    .select({ invgateLocationId: officeInvgateLinks.invgateLocationId })
    .from(officeInvgateLinks)
    .innerJoin(offices, eq(offices.id, officeInvgateLinks.officeId))
    .where(eq(offices.code, officeCode.trim()))
    .get();
  return result?.invgateLocationId ?? null;
}
