import type { APIRoute } from "astro";
import { jsonResponse, jsonError } from "@/lib/apiResponse";
import { requireWriteAccess } from "@/lib/rbac-middleware";
import { fetchQualityCaseMetadata } from "@/lib/qualityMetadataFetcher";
import { CHANNEL_TYPES, type ChannelType } from "@/types/quality";

export const GET: APIRoute = async ({ locals, request }) => {
  try {
    const perm = await requireWriteAccess(locals, "calidad");
    if (perm) return perm;

    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") as ChannelType;
    const id = url.searchParams.get("id")?.trim() || "";
    const sourceParam = url.searchParams.get("source")?.trim();
    const source = sourceParam === "wise" || sourceParam === "invgate" ? sourceParam : undefined;
    const agentIdParam = url.searchParams.get("agentId")?.trim();
    const rawParam = url.searchParams.get("raw")?.trim();
    const includeRaw = rawParam === "1" || rawParam === "true";

    if (!channel || !CHANNEL_TYPES.includes(channel)) {
      return jsonError("Canal inválido o no especificado", 400);
    }

    if (!id) {
      return jsonError("El identificador del caso es requerido", 400);
    }

    let targetOperatorId: number | null = null;
    let targetOperatorUsername: string | null = null;
    let targetOperatorName: string | null = null;

    if (agentIdParam && !isNaN(Number(agentIdParam))) {
      try {
        const { db } = await import("@/db");
        const { agents, employees } = await import("@/db/schema");
        const { eq, sql } = await import("drizzle-orm");

        const [agentRow] = await db
          .select({
            id: agents.id,
            name: agents.name,
            username: agents.username,
          })
          .from(agents)
          .where(eq(agents.id, Number(agentIdParam)))
          .limit(1);

        if (agentRow) {
          targetOperatorUsername = agentRow.username;
          targetOperatorName = agentRow.name;

          if (agentRow.username) {
            const [emp] = await db
              .select({ invgateId: employees.invgateId })
              .from(employees)
              .where(sql`lower(${employees.username}) = lower(${agentRow.username})`)
              .limit(1);
            if (emp?.invgateId) {
              targetOperatorId = emp.invgateId;
            }
          }
        }
      } catch (err) {
        console.warn("[fetch-metadata] Error al resolver operador desde agentId:", err);
      }
    }

    const result = await fetchQualityCaseMetadata(channel, id, source, {
      targetOperatorId,
      targetOperatorUsername,
      targetOperatorName,
      includeRaw,
    });

    if (!result.ok) {
      return jsonError(result.error || "No se pudieron obtener los metadatos", result.status || 404);
    }

    return jsonResponse({
      ok: true,
      data: result.data,
    });
  } catch (error) {
    console.error("[fetch-metadata] Error inesperado:", error);
    return jsonError(
      error instanceof Error ? error.message : "Error interno del servidor",
      500,
    );
  }
};
