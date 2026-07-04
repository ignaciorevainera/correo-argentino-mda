import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { or, and, sql } from "drizzle-orm";
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
  const escaped = normalized.replace(/\*/g, "\\*").replace(/\?/g, "\\?").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  let pattern = "";
  for (const ch of escaped) {
    pattern += ACCENT_FOLD[ch] || ACCENT_FOLD[ch.toLowerCase()] || (
      /^[a-zA-Z]$/.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : ch
    );
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

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const results = await db
      .select()
      .from(employees)
      .where(whereClause)
      .orderBy(employees.fullname)
      .limit(50);

    return jsonResponse({
      results: results.map((e) => ({
        fullname: e.fullname,
        dni: e.dni,
        username: e.username,
        interno: e.interno,
        telefono: e.telefono,
        sucursal: e.sucursal,
        invgateExists: e.invgateExists ?? false,
      })),
      total: results.length,
    });
  } catch (error) {
    console.error("[UserSearch] Error:", error);
    return jsonError("Error al buscar usuarios", 500);
  }
};