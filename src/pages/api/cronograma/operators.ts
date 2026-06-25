import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { eq, and } from "drizzle-orm";

import { requireWriteAccess } from "@lib/rbac-middleware";

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { originalName, name, username, location, horarioDefault } = body;

    if (originalName) {
      // --- ACTUALIZACIÓN DE OPERADOR ---
      if (!name) {
        return new Response(
          JSON.stringify({ error: "El nombre es requerido para actualizar" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Validar si ya existe otro agente con el nuevo nombre
      if (name.toLowerCase() !== originalName.toLowerCase()) {
        const check = await db
          .select()
          .from(agents)
          .where(eq(agents.name, name))
          .limit(1);
        if (check.length > 0) {
          return new Response(
            JSON.stringify({ error: `Ya existe un operador con el nombre "${name}"` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      const parts = name.trim().split(/\s+/);
      const initials = parts
        .map((p: string) => p[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      // Actualizar registro en agents
      await db
        .update(agents)
        .set({
          name: name.trim(),
          username: username ? username.trim() : null,
          avatarInitials: initials,
          location: location || "Monte Grande",
          horarioDefault: horarioDefault || "",
        })
        .where(eq(agents.name, originalName));

      // Si cambió el nombre, actualizar en cascada en la tabla schedules
      if (name.trim() !== originalName) {
        await db
          .update(schedules)
          .set({ agentName: name.trim() })
          .where(eq(schedules.agentName, originalName));
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    } else {
      // --- CREACIÓN DE OPERADOR ---
      if (!name) {
        return new Response(
          JSON.stringify({ error: "El nombre es requerido" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const check = await db
        .select()
        .from(agents)
        .where(eq(agents.name, name))
        .limit(1);
      if (check.length > 0) {
        return new Response(
          JSON.stringify({ error: `Ya existe un operador con el nombre "${name}"` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const parts = name.trim().split(/\s+/);
      const initials = parts
        .map((p: string) => p[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      // Insertar nuevo agente
      await db.insert(agents).values({
        name: name.trim(),
        username: username ? username.trim() : null,
        avatarInitials: initials,
        location: location || "Monte Grande",
        horarioDefault: horarioDefault || "",
        esquemaSemanal: {
          Lunes: "Franco",
          Martes: "Franco",
          Miercoles: "Franco",
          Jueves: "Franco",
          Viernes: "Franco",
          Sabado: "Franco",
          Domingo: "Franco",
        },
        esquemaHorario: {},
        esquemaBreakInicio: {},
        esquemaBreakFin: {},
      });

      // Obtener todas las fechas únicas del mes activo y poblar Franco para el nuevo operador
      const uniqueDates = await db
        .selectDistinct({ date: schedules.date })
        .from(schedules);

      if (uniqueDates.length > 0) {
        const inserts = uniqueDates.map((d) => ({
          agentName: name.trim(),
          date: d.date,
          status: "Franco",
          comment: "",
          horario: "",
          entradaReal: "",
          salidaReal: "",
          breakInicio: "",
          breakFin: "",
        }));
        await db.insert(schedules).values(inserts);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("POST Operator API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return new Response(
        JSON.stringify({ error: "El nombre es requerido para eliminar" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Eliminar operador
    await db.delete(agents).where(eq(agents.name, name));

    // 2. Eliminar sus planificaciones de asistencia
    await db.delete(schedules).where(eq(schedules.agentName, name));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("DELETE Operator API Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
