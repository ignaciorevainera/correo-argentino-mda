import type { APIRoute } from "astro";
import { db } from "@db/index";
import { saturdayRotationConfig } from "@db/schema";
import { eq, desc, lt } from "drizzle-orm";
import { jsonResponse } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";

const getLocalMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  try {
    const month = url.searchParams.get("month") || getLocalMonth();
    
    if (!MONTH_REGEX.test(month)) {
      return jsonResponse({ error: "Invalid month format. Expected YYYY-MM" }, 400);
    }
    
    // Intentar obtener la configuración específica de este mes
    const configList = await db
      .select()
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, month))
      .limit(1);
    
    let config = configList[0];

    // Si no existe, intentar heredar del mes anterior más cercano (EN MEMORIA)
    if (!config) {
      const previousConfigs = await db
        .select()
        .from(saturdayRotationConfig)
        .where(lt(saturdayRotationConfig.month, month))
        .orderBy(desc(saturdayRotationConfig.month))
        .limit(1);
      
      const baseConfig = previousConfigs[0] || {
        rotationOrder: "A,B,C,D",
        startDate: "2026-06-06",
        startGroup: "A",
        disabledGroups: "",
      };

      // Devolver configuración en memoria sin persistirla
      config = {
        id: 0,
        month,
        rotationOrder: baseConfig.rotationOrder,
        startDate: baseConfig.startDate,
        startGroup: baseConfig.startGroup,
        disabledGroups: baseConfig.disabledGroups || "",
      };
    }

    return jsonResponse(config, 200, "no-store, no-cache, must-revalidate");
  } catch (error: any) {
    console.error("GET rotation-config API Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireWriteAccess(locals, "cronograma");
  if (denied) return denied;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Malformed JSON body" }, 400);
    }

    const { month, rotationOrder, startDate, startGroup, disabledGroups } = body;
    
    if (
      typeof startDate !== "string" ||
      typeof startGroup !== "string" ||
      typeof rotationOrder !== "string"
    ) {
      return jsonResponse({ error: "Required fields (startDate, startGroup, rotationOrder) must be strings" }, 400);
    }

    const disabledGroupsStr = typeof disabledGroups === "string" ? disabledGroups : "";

    const targetMonth = (typeof month === "string" && month)
      ? month
      : startDate.slice(0, 7);

    if (!MONTH_REGEX.test(targetMonth)) {
      return jsonResponse({ error: "Invalid target month format. Expected YYYY-MM" }, 400);
    }

    // Validar que la fecha sea un sábado
    const dateObj = new Date(startDate + "T12:00:00");
    if (isNaN(dateObj.getTime()) || dateObj.getDay() !== 6) {
      return jsonResponse({ error: "Start date must be a valid Saturday" }, 400);
    }

    const configList = await db
      .select()
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, targetMonth))
      .limit(1);
    const existing = configList[0];

    if (existing) {
      await db
        .update(saturdayRotationConfig)
        .set({ rotationOrder, startDate, startGroup, disabledGroups: disabledGroupsStr })
        .where(eq(saturdayRotationConfig.id, existing.id));
    } else {
      await db
        .insert(saturdayRotationConfig)
        .values({
          month: targetMonth,
          rotationOrder,
          startDate,
          startGroup,
          disabledGroups: disabledGroupsStr,
        });
    }

    const updatedList = await db
      .select()
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, targetMonth))
      .limit(1);
    const result = updatedList[0];

    return jsonResponse(result);
  } catch (error: any) {
    console.error("POST rotation-config API Error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
