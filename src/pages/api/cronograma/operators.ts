import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { eq, and } from "drizzle-orm";

import { requireWriteAccess } from "@lib/rbac-middleware";
import { sanitizeError } from "@lib/apiResponse";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { originalName, name, username, location, horarioDefault } = body;

    if (originalName) {
      // --- ACTUALIZACIÓN DE OPERADOR ---
      if (!name) {
        return new Response(
          JSON.stringify({ error: "El nombre es requerido para actualizar" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Validar si ya existe otro agente con el nuevo nombre
      if (name.toLowerCase() !== originalName.toLowerCase()) {
        const check = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.name, name))
          .limit(1);
        if (check.length > 0) {
          return new Response(
            JSON.stringify({
              error: `Ya existe un operador con el nombre "${name}"`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      const parts = name.trim().split(/\s+/);
      const initials = parts
        .map((p: string) => p[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      // Rename atómico: agents + cascada a schedules en una sola
      // transacción síncrona (better-sqlite3 no admite callbacks async).
      db.transaction((tx) => {
        // Actualizar registro en agents
        tx.update(agents)
          .set({
            name: name.trim(),
            username: username ? username.trim() : null,
            avatarInitials: initials,
            location: location || "Monte Grande",
            horarioDefault: horarioDefault || "",
          })
          .where(eq(agents.name, originalName))
          .run();

        // Si cambió el nombre, actualizar en cascada en la tabla schedules.
        // Solo se toca agentId si la fila existe (si falta, no se borran
        // vínculos previos: fail-safe).
        if (name.trim() !== originalName) {
          const [agentRow] = tx
            .select({ id: agents.id })
            .from(agents)
            .where(eq(agents.name, name.trim()));
          if (agentRow) {
            tx.update(schedules)
              .set({ agentName: name.trim(), agentId: agentRow.id })
              .where(eq(schedules.agentName, originalName))
              .run();
          }
        }
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // --- CREACIÓN DE OPERADOR DEPRECADA ---
      return new Response(
        JSON.stringify({
          error: "La creación de operadores se realiza desde la gestión de usuarios (/admin/usuarios).",
        }),
        { status: 410, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (error: any) {
    console.error("POST Operator API Error:", error);
    return new Response(JSON.stringify({ error: sanitizeError(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = await requireWriteAccess(locals, "cronograma");
  if (denied) return denied;
  try {
    const body = await request.json();
    const { name } = body;
    if (!name) {
      return new Response(
        JSON.stringify({ error: "El nombre es requerido para eliminar" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    await db
      .update(agents)
      .set({ enCronograma: false })
      .where(eq(agents.name, name));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("DELETE Operator API Error:", error);
    return new Response(JSON.stringify({ error: sanitizeError(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
