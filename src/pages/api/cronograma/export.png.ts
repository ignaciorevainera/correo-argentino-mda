import type { APIRoute } from "astro";
import { Resvg } from "@resvg/resvg-js";
import { jsonError, sanitizeError } from "@lib/apiResponse";
import { getInternalFetchHeaders, getInternalOrigin } from "@lib/internalOrigin";
import { requireReadAccess } from "@lib/rbac-middleware";
import { buildCronogramaSvg } from "@components/cronograma/lib/exportSvg";
import type { CronogramaPayload } from "@components/cronograma/lib/api";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, m - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthDates(month: string): string[] {
  const [year, m] = month.split("-").map(Number);
  const totalDays = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from(
    { length: totalDays },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}

async function fetchUpstream(month: string, request: Request): Promise<Response> {
  const path = `/api/cronograma?month=${month}`;
  return fetch(new URL(path, getInternalOrigin(request)), {
    headers: getInternalFetchHeaders(request),
  });
}

export const GET: APIRoute = async ({ url, locals, request }) => {
  const denied = await requireReadAccess(locals, "cronograma");
  if (denied) return denied;

  const month = url.searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) {
    return jsonError("Parámetro month inválido (formato esperado YYYY-MM).", 400);
  }

  try {
    const upstream = await fetchUpstream(month, request);
    if (!upstream.ok) {
      return jsonError("No se pudieron cargar los datos del cronograma.", 502);
    }

    const payload = (await upstream.json()) as CronogramaPayload;
    const built = buildCronogramaSvg({
      monthLabel: monthLabel(month),
      dates: monthDates(month),
      operators: payload.operators ?? [],
    });

    const resvg = new Resvg(built.svg, {
      fitTo: { mode: "width", value: built.width * 2 },
      background: "#ffffff",
      font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
    });
    const png = resvg.render().asPng();

    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
        "content-disposition": `inline; filename="cronograma_${month}.png"`,
      },
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 502);
  }
};
