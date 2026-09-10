import type { APIRoute } from "astro";
import { db } from "@db/index";
import { can } from "@lib/roleConfig";

const HEADERS = [
  "Hostname",
  "Dirección IP",
  "Estado",
  "Último ping",
  "Asignados",
];

const escapeCsv = (value: unknown): string =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user || !can(user.role, "team_leader")) {
    return new Response(
      JSON.stringify({
        error:
          "Acceso denegado. Se requieren permisos de Team Leader o superior para exportar a CSV.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const machines = await db.query.cubics.findMany({
      with: { assignments: { with: { agent: true } } },
    });

    const rows = machines.map((machine) => [
      machine.name,
      machine.ip ?? "",
      machine.status === "online" ? "Online" : "Offline",
      machine.lastPing ?? "",
      machine.assignments.map((a) => a.agent.name).join(" | "),
    ]);

    const csv = [HEADERS, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cubics_${dateStr}.csv"`,
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (error) {
    console.error("Error generating cubics CSV:", error);
    return new Response("Error al generar el archivo CSV.", { status: 500 });
  }
};
