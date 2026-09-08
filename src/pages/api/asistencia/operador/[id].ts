import type { APIRoute } from "astro";
import { db } from "@db/index";
import { agents, operatorAttendance } from "@db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireReadAccess } from "@lib/rbac-middleware";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ params, url, locals }) => {
  const denied = requireReadAccess(locals, "asistencia");
  if (denied) return denied;

  try {
    const agentId = parseInt(params.id || "");
    if (isNaN(agentId)) {
      return jsonResponse({ error: "ID de operador inválido" }, 400);
    }

    // 1. Obtener datos del operador
    const agent = await db
      .select({
        id: agents.id,
        name: agents.name,
        username: agents.username,
        location: agents.location,
        avatarInitials: agents.avatarInitials,
        horarioDefault: agents.horarioDefault,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1)
      .then((res) => res[0]);

    if (!agent) {
      return jsonResponse({ error: "Operador no encontrado" }, 404);
    }

    // 2. Resolver filtros de rango de fechas
    const currentYear = new Date().getFullYear();
    const yearParam = url.searchParams.get("year");
    let year = yearParam ? parseInt(yearParam) : currentYear;
    if (isNaN(year) || year < 2020 || year > currentYear + 1) {
      year = currentYear;
    }
    const month = url.searchParams.get("month") || "all"; // "all" o "01".."12"
    const statusFilter = url.searchParams.get("status") || "all";

    let startDate = `${year}-01-01`;
    let endDate = `${year}-12-31`;

    if (month !== "all") {
      const monthNum = parseInt(month);
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    }

    // 3. Consulta indexada a base de datos
    const logs = await db
      .select()
      .from(operatorAttendance)
      .where(
        and(
          eq(operatorAttendance.agentId, agentId),
          gte(operatorAttendance.date, startDate),
          lte(operatorAttendance.date, endDate),
        ),
      )
      .orderBy(desc(operatorAttendance.date));

    // 4. Filtrado por estado en memoria
    const filteredLogs = logs.filter((log) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "tardanza")
        return log.cumplimiento === "Llegada Tarde";
      if (statusFilter === "incumplio")
        return log.cumplimiento === "Incumplió";
      if (statusFilter === "cumplio")
        return log.cumplimiento === "Cumplió";
      if (statusFilter === "ausente")
        return Boolean(log.ausencia && log.ausencia.trim() !== "");
      return true;
    });

    // 5. Cálculo de métricas agregadas del período consultado
    let totalWorkDays = 0;
    let punctuals = 0;
    let lates = 0;
    let failed = 0;
    let absences = 0;

    logs.forEach((log) => {
      const hasSchedule =
        log.horarioEstipulado &&
        log.horarioEstipulado !== "Franco" &&
        log.horarioEstipulado !== "--:--" &&
        log.horarioEstipulado.trim() !== "";
      if (hasSchedule || log.cumplimientoForzado) {
        totalWorkDays++;
        if (log.cumplimiento === "Cumplió") punctuals++;
        if (log.cumplimiento === "Llegada Tarde") lates++;
        if (log.cumplimiento === "Incumplió") failed++;
      }
      if (log.ausencia && log.ausencia.trim() !== "") {
        absences++;
      }
    });

    const punctualityRate =
      totalWorkDays > 0 ? Math.round((punctuals / totalWorkDays) * 100) : 100;

    return jsonResponse(
      {
        operator: agent,
        period: { year, month },
        summary: {
          totalWorkDays,
          punctuals,
          lates,
          failed,
          absences,
          punctualityRate,
        },
        records: filteredLogs.map((log) => ({
          id: log.id,
          date: log.date,
          horarioEstipulado:
            !log.horarioEstipulado ||
            log.horarioEstipulado === "Franco" ||
            log.horarioEstipulado.trim() === ""
              ? "--:--"
              : log.horarioEstipulado,
          entradaReal: log.entradaReal || "--:--",
          cumplimiento: log.cumplimiento || "Sin Registro",
          ausencia: log.ausencia || null,
          motivoLoguin: log.motivoLoguin || null,
          detalle: log.detalle || null,
          shiftType: log.shiftType,
        })),
      },
      200,
      "no-store, no-cache, must-revalidate",
    );
  } catch (error: any) {
    console.error("Error en endpoint /api/asistencia/operador/[id]:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
