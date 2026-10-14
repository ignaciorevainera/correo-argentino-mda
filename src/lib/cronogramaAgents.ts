import { agents, users } from "@db/schema";
import { and, eq } from "drizzle-orm";
import { activeAgentCondition } from "@lib/activeUsers";

/**
 * Condición SQL de agentes elegibles para el cronograma: en cronograma Y
 * usuario de portal activo. Fuente única para el GET y el POST de alta de mes
 * (no pueden divergir). Requiere que la query haga
 * `.leftJoin(users, eq(users.id, agents.userId))`.
 */
export const eligibleAgentsCondition = () =>
  and(eq(agents.enCronograma, true), activeAgentCondition());
