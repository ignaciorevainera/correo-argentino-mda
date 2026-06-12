import type { APIRoute } from "astro";
import { db } from "../../db";
import { offices, provinces, regions } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

export const GET: APIRoute = async () => {
  try {
    const allOffices = await db
      .select({
        code: offices.code,
        name: offices.name,
        address: offices.address,
        lat: offices.lat,
        lng: offices.lng,
      })
      .from(offices)
      .where(sql`${offices.lat} IS NOT NULL AND ${offices.lng} IS NOT NULL`);

    const sucursales = allOffices.map((o) => ({
      nis: o.code,
      nombre: o.name,
      direccion: o.address || "Sin dirección",
      lat: o.lat,
      lng: o.lng,
    }));

    const allProvincesWithRegion = await db
      .select({
        code: provinces.code,
        name: provinces.name,
        regionId: provinces.regionId,
        regionName: regions.name,
      })
      .from(provinces)
      .leftJoin(regions, eq(provinces.regionId, regions.id))
      .orderBy(regions.name, provinces.name);

    const provincesByRegion: Record<string, { code: string; name: string }[]> = {};
    for (const p of allProvincesWithRegion) {
      const rName = p.regionName ?? "Sin región";
      if (!provincesByRegion[rName]) provincesByRegion[rName] = [];
      provincesByRegion[rName].push({ code: p.code, name: p.name });
    }

    return new Response(JSON.stringify({ sucursales, provincesByRegion }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate",
      },
    });
  } catch (error) {
    console.error("Error in offices-map-data API:", error);
    return new Response(JSON.stringify({ error: "Error fetching map data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

