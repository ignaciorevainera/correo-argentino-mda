import type { APIRoute } from "astro";
import { db } from "@/db";
import { saturdayRotationConfig } from "@/db/schema";
import { eq, desc, lt } from "drizzle-orm";

const getLocalMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  try {
    const month = url.searchParams.get("month") || getLocalMonth();
    
    if (!MONTH_REGEX.test(month)) {
      return new Response(JSON.stringify({ error: "Invalid month format. Expected YYYY-MM" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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
      };

      // Devolver configuración en memoria sin persistirla
      config = {
        id: 0,
        month,
        rotationOrder: baseConfig.rotationOrder,
        startDate: baseConfig.startDate,
        startGroup: baseConfig.startGroup,
      };
    }

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET rotation-config API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Malformed JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { month, rotationOrder, startDate, startGroup } = body;
    
    if (
      typeof startDate !== "string" ||
      typeof startGroup !== "string" ||
      typeof rotationOrder !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Required fields (startDate, startGroup, rotationOrder) must be strings" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const targetMonth = (typeof month === "string" && month)
      ? month
      : startDate.slice(0, 7);

    if (!MONTH_REGEX.test(targetMonth)) {
      return new Response(JSON.stringify({ error: "Invalid target month format. Expected YYYY-MM" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validar que la fecha sea un sábado
    const dateObj = new Date(startDate + "T12:00:00");
    if (isNaN(dateObj.getTime()) || dateObj.getDay() !== 6) {
      return new Response(JSON.stringify({ error: "Start date must be a valid Saturday" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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
        .set({ rotationOrder, startDate, startGroup })
        .where(eq(saturdayRotationConfig.id, existing.id));
    } else {
      await db
        .insert(saturdayRotationConfig)
        .values({
          month: targetMonth,
          rotationOrder,
          startDate,
          startGroup,
        });
    }

    const updatedList = await db
      .select()
      .from(saturdayRotationConfig)
      .where(eq(saturdayRotationConfig.month, targetMonth))
      .limit(1);
    const result = updatedList[0];

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("POST rotation-config API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
