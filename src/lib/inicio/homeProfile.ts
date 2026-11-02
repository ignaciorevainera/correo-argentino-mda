/**
 * Perfil del home personalizado: decide qué cards se muestran arriba según el
 * rol y las participaciones del agente.
 *
 * - admin: registro de auditoría + sugerencias + usuarios.
 * - supervisor: calidad del equipo + AGS + automatizaciones.
 * - referente: semana + AGS + calidad del equipo.
 * - calidad: agente con calidad y sin cronograma -> calidad del equipo + AGS + mi calidad.
 * - operador: agente en cronograma (agent/team_leader) -> semana + AGS + mi calidad.
 * - base: sin agente vinculado (sólo cards de accesos).
 */
import { normalizeRole } from "@lib/rbac";

export type HomeProfile =
  | "admin"
  | "supervisor"
  | "referente"
  | "calidad"
  | "operador"
  | "base";

export interface HomeProfileAgent {
  enCronograma: boolean;
  incluidoCalidad: boolean;
}

export function resolveHomeProfile(params: {
  role: string | null | undefined;
  agent: HomeProfileAgent | null | undefined;
}): HomeProfile {
  const role = normalizeRole(params.role ?? "agent");

  if (role === "admin") return "admin";
  if (role === "supervisor") return "supervisor";
  if (role === "referent") return "referente";

  const agent = params.agent;
  if (agent?.incluidoCalidad && !agent.enCronograma) return "calidad";
  if (agent?.enCronograma) return "operador";

  return "base";
}
