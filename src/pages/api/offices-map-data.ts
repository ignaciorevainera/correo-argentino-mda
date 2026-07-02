import type { APIRoute } from "astro";
import { db } from "@db/index";
import { offices, provinces, regions, technologyReferents } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { jsonError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user || user.id === 0) {
    return jsonError("No autenticado", 401);
  }

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
        regionColor: regions.color,
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

    const allRegions = await db
      .select({ id: regions.id, name: regions.name, color: regions.color })
      .from(regions)
      .orderBy(regions.name);

    const allReferents = await db
      .select({
        id: technologyReferents.id,
        regionId: technologyReferents.regionId,
        firstName: technologyReferents.firstName,
        lastName: technologyReferents.lastName,
      })
      .from(technologyReferents);

    const regionsWithReferents = allRegions.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      referents: allReferents
        .filter((ref) => ref.regionId === r.id)
        .map((ref) => ({
          id: ref.id,
          firstName: ref.firstName,
          lastName: ref.lastName,
        })),
    }));

    return new Response(JSON.stringify({ sucursales, provincesByRegion, regions: regionsWithReferents }), {
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

