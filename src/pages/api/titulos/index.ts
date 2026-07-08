import type { APIRoute } from "astro";
import { db } from "@/db"
import { titles, titleCategory } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getModulePermissions } from "@/lib/rbac";


export const GET: APIRoute = async () => {
    const data = await db.select({
        id: titles.id,
        name: titles.name,
        categoryId: titleCategory.id,
        category: titleCategory.name,
        icon: titleCategory.icon,
        tone: titleCategory.tone,
        route: titles.route,
        description: titles.description,
        articleOnKdb: titles.articleOnKdb,
    }).from(titles)
        .leftJoin(
            titleCategory,
            eq(titles.categoryId, titleCategory.id)
        )
        .orderBy(asc(titles.name));

    return Response.json(data);
}

export const POST: APIRoute = async ({ request, locals }) => {
    const user = locals.user;
     console.log({
        user: locals.user,
        role: locals.user?.role,
    });

    const permissions = getModulePermissions(
        "titulos",
        user.role
    )
    if (!permissions.canWrite) {
        return new Response(
            JSON.stringify({
                message: "No autorizado",
            }),
            {
                status: 403,
            }
        );
    }
    const body = await request.json();
    await db.insert(titles).values({
        ...body,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return Response.json({
        message: "Título creado correctamente",
        status: 201,
        success: true,
    })

} 