import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees, offices, employeeOffices } from "@db/schema";
import { or, and, eq, sql, getTableColumns, inArray } from "drizzle-orm";
import { jsonResponse, jsonError } from "@lib/apiResponse";

const ACCENT_FOLD: Record<string, string> = {
  a: "[aAáàâäãåæÁÀÂÄÃÅÆ]",
  e: "[eEéèêëÉÈÊË]",
  i: "[iIíìîïÍÌÎÏ]",
  o: "[oOóòôöõøÓÒÔÖÕØ]",
  u: "[uUúùûüÚÙÛÜ]",
  n: "[nNñÑ]",
  c: "[cCçÇ]",
};

function buildGlobPattern(word: string): string {
  const normalized = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const escaped = normalized
    .replace(/\*/g, "\\*")
    .replace(/\?/g, "\\?")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
  let pattern = "";
  for (const ch of escaped) {
    pattern +=
      ACCENT_FOLD[ch] ||
      ACCENT_FOLD[ch.toLowerCase()] ||
      (/^[a-zA-Z]$/.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : ch);
  }
  return `*${pattern}*`;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || "";

    if (!q) {
      return jsonResponse({ results: [], total: 0 });
    }

    const words = q.split(/\s+/).filter(Boolean);

    const conditions = words.map((word) => {
      const pattern = buildGlobPattern(word);
      return or(
        sql`${employees.fullname} GLOB ${pattern}`,
        sql`${employees.username} GLOB ${pattern}`,
        sql`${employees.dni} GLOB ${pattern}`,
      );
    });

    const whereClause =
      conditions.length === 1 ? conditions[0] : and(...conditions);

    const results = await db
      .select({
        ...getTableColumns(employees),
        officeName: offices.name,
      })
      .from(employees)
      .leftJoin(offices, eq(employees.sucursal, offices.code))
      .where(whereClause)
      .orderBy(employees.fullname)
      .limit(50);

    const usernames = results
      .map((r) => (r.username?.split("@")[0] ?? "").toLowerCase())
      .filter(Boolean);
    const officesMap = new Map<
      string,
      { code: string; name: string | null }[]
    >();
    if (usernames.length > 0) {
      const rows = await db
        .select({
          username: employeeOffices.username,
          code: employeeOffices.sucursal,
          name: offices.name,
        })
        .from(employeeOffices)
        .leftJoin(offices, eq(employeeOffices.sucursal, offices.code))
        .where(inArray(employeeOffices.username, usernames));

      for (const row of rows) {
        const list = officesMap.get(row.username) ?? [];
        list.push({ code: row.code, name: row.name ?? null });
        officesMap.set(row.username, list);
      }
    }

    return jsonResponse({
      results: results.map((e) => ({
        fullname: e.fullname,
        dni: e.dni,
        username: e.username,
        interno: e.interno,
        telefono: e.telefono,
        sucursal: e.sucursal,
        sucursalNombre: e.officeName || null,
        sucursales:
          officesMap.get((e.username?.split("@")[0] ?? "").toLowerCase()) ?? [],
        invgateExists: e.invgateExists ?? false,
      })),
      total: results.length,
    });
  } catch (error) {
    console.error("[UserSearch] Error:", error);
    return jsonError("Error al buscar usuarios", 500);
  }
};
