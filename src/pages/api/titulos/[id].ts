import type { APIRoute } from "astro";
import { db } from "@/db"
import { titles } from "@/db/schema";
import { eq } from "drizzle-orm";

export const PUT: APIRoute = async ({ request, params }) => {
    await db.update(titles).set({
        ...await request.json(),
        updatedAt: new Date(),
    }).where(eq(titles.id, Number(params.id)));

    return Response.json({
        message: "Título actualizado correctamente",
        status: 200,
        success: true,
    })
}

export const DELETE: APIRoute = async ({ params }) => {
    await db
    .delete(titles)
    .where(eq(titles.id, Number(params.id)))

    return Response.json({
        message: "Título borrado correctamente",
        status: 200,
        success: true,
    })
}