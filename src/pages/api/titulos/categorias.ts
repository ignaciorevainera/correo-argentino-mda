import type { APIRoute } from "astro";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { titleCategory } from "@/db/schema";

export const GET: APIRoute = async () => {
    const data = await db
        .select()
        .from(titleCategory)
        .orderBy(asc(titleCategory.name));

    return Response.json(data)
}