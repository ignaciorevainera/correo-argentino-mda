# C3.3 — Factory `createDeleteHandler` para 10 `eliminar.ts`

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar los 10 `eliminar.ts` API routes detrás de una factory `createDeleteHandler(config)` y un helper `deleteCategory(config)` para los 3 archivos de categoría.

**Architecture:** Factory genérica en `src/lib/api/deleteHandler.ts` con hook `beforeDelete`/`afterDelete` opcionales. Helper separado en `src/lib/api/deleteCategory.ts` para los 3 archivos de categoría. Los archivos `eliminar.ts` se vuelven thin wrappers (10-20 líneas).

**Tech Stack:** Astro SSR 5, TypeScript strict, Drizzle ORM, better-sqlite3, `@lib/baseUrl`, `@lib/auditLogger`.

---

## Estructura de archivos

**Crear:**
- `src/lib/api/deleteHandler.ts` (factory genérica)
- `src/lib/api/deleteCategory.ts` (helper categorías)
- `src/lib/api/deleteAppFile.ts` (shared file deletion logic for apps)

**Modificar (10 archivos):**
- `src/pages/oficinas/edit/[id]/eliminar.ts`
- `src/pages/soportes/edit/[id]/eliminar.ts`
- `src/pages/inventario-terminales/cubics/edit/[id]/eliminar.ts`
- `src/pages/admin/contactos/edit/[id]/eliminar.ts`
- `src/pages/admin/operadores/edit/[id]/eliminar.ts`
- `src/pages/admin/recursos/enlace/edit/[id]/eliminar.ts`
- `src/pages/admin/recursos/categoria/edit/[id]/eliminar.ts`
- `src/pages/admin/contactos/categoria/edit/[id]/eliminar.ts`
- `src/pages/admin/aplicativos/edit/[id]/eliminar.ts`
- `src/pages/admin/aplicativos/categorias/edit/[id]/eliminar.ts`

---

## Task 0: Crear `src/lib/api/deleteHandler.ts`

**File:** Create `src/lib/api/deleteHandler.ts`

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { eq } from "drizzle-orm";
import { getBaseNoSlash } from "@lib/baseUrl";
import { logAdminAction } from "@lib/auditLogger";
import { isAllowed } from "@lib/rolesMatrix";

export interface DeleteHandlerConfig {
  entityName: string;
  redirectPath: string;
  requiredFeature?: string;
  unauthorizedMessage?: string;
  invalidIdMessage?: string;
  successMessage?: (deleted: Record<string, unknown> | null) => string;
  notFoundMessage?: string;
  errorMessage?: (error: unknown) => string;
  logMessage?: (deleted: Record<string, unknown> | null) => string;
  returnJsonOnInvalidId?: boolean;
  beforeDelete?: (context: { id: number }) => Promise<void> | void;
  afterDelete?: (context: { id: number; deleted: Record<string, unknown> | null }) => Promise<void> | void;
  performDelete: (id: number) => Promise<Record<string, unknown> | null>;
}

export function createDeleteHandler(config: DeleteHandlerConfig): APIRoute {
  return async ({ params, redirect, locals }) => {
    const rawId = params.id;
    const id = Number(rawId);
    const isInvalid = !rawId || isNaN(id) || id <= 0;
    const invalidIdMsg = config.invalidIdMessage ?? `ID de ${config.entityName} no proporcionado`;

    if (isInvalid) {
      if (config.returnJsonOnInvalidId) {
        return new Response(invalidIdMsg, { status: 400 });
      }
      return redirect(
        `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(invalidIdMsg)}&toast_type=error`
      );
    }

    if (config.requiredFeature) {
      const user = locals.user;
      if (!user || !isAllowed(config.requiredFeature, user.role)) {
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(
            config.unauthorizedMessage ?? "No autorizado"
          )}&toast_type=error`
        );
      }
    }

    try {
      if (config.beforeDelete) {
        await config.beforeDelete({ id });
      }

      const deleted = await config.performDelete(id);

      if (config.afterDelete) {
        await config.afterDelete({ id, deleted });
      }

      const username = (locals as any).user?.username || "Sistema";
      const logMsg = config.logMessage
        ? config.logMessage(deleted)
        : `Eliminó el ${config.entityName} "${id}"`;
      await logAdminAction(username, logMsg);

      if (deleted) {
        const successMsg = config.successMessage
          ? config.successMessage(deleted)
          : `${config.entityName.charAt(0).toUpperCase() + config.entityName.slice(1)} eliminado con éxito.`;
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(successMsg)}&toast_type=success`
        );
      } else {
        const notFoundMsg = config.notFoundMessage ?? `El ${config.entityName} no existe.`;
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(notFoundMsg)}&toast_type=error`
        );
      }
    } catch (error) {
      console.error(`[deleteHandler] Error al eliminar ${config.entityName}:`, error);
      const errorMsg = config.errorMessage
        ? config.errorMessage(error)
        : `Error al eliminar el ${config.entityName}.`;
      return redirect(
        `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent(errorMsg)}&toast_type=error`
      );
    }
  };
}
```

Steps:
1. Create the file.
2. Run `npm run build`. Must pass.
3. Commit: `feat(lib): add createDeleteHandler factory`.

---

## Task 1: Crear `src/lib/api/deleteCategory.ts`

**File:** Create `src/lib/api/deleteCategory.ts`

```typescript
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { eq } from "drizzle-orm";
import { getBaseNoSlash } from "@lib/baseUrl";
import { logAdminAction } from "@lib/auditLogger";

export interface DeleteCategoryConfig {
  categoryTable: any;
  itemsTable: any;
  categoryIdColumn: any;
  itemsCategoryColumn: any;
  defaultCategoryTitle: string;
  defaultCategoryValues: Record<string, unknown>;
  redirectPath: string;
  entityName: string;
  deleteItemFiles?: (item: Record<string, unknown>) => Promise<void> | void;
}

export function createCategoryDeleteHandler(config: DeleteCategoryConfig): APIRoute {
  return async ({ params, request, redirect, locals }) => {
    const categoryId = parseInt(params.id as string, 10);
    if (!categoryId || isNaN(categoryId)) {
      return new Response("ID de categoría no válido", { status: 400 });
    }

    const formData = await request.formData();
    const deleteOption = formData.get("deleteOption")?.toString();

    try {
      const existingDefault = await db
        .select()
        .from(config.categoryTable)
        .where(eq(config.categoryTable.title, config.defaultCategoryTitle))
        .limit(1);

      if (existingDefault.length > 0 && categoryId === existingDefault[0].id) {
        return redirect(
          `${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent("No se puede eliminar la categoría por defecto")}&toast_type=error`
        );
      }

      if (deleteOption === "unassign") {
        let defaultCategoryId: number;
        if (existingDefault.length === 0) {
          const [inserted] = await db.insert(config.categoryTable).values(config.defaultCategoryValues).returning({ id: config.categoryTable.id });
          defaultCategoryId = inserted.id;
        } else {
          defaultCategoryId = existingDefault[0].id;
        }
        await db.update(config.itemsTable).set({ categoryId: defaultCategoryId }).where(eq(config.itemsCategoryColumn, categoryId));
      }

      if (deleteOption === "cascade") {
        const itemsToDelete = await db.select().from(config.itemsTable).where(eq(config.itemsCategoryColumn, categoryId));
        if (config.deleteItemFiles) {
          for (const item of itemsToDelete) {
            await config.deleteItemFiles(item);
          }
        }
        await db.delete(config.itemsTable).where(eq(config.itemsCategoryColumn, categoryId));
      }

      const [categoryToDelete] = await db.select().from(config.categoryTable).where(eq(config.categoryIdColumn, categoryId)).limit(1);
      const categoryTitle = categoryToDelete?.title || categoryId;

      await db.delete(config.categoryTable).where(eq(config.categoryIdColumn, categoryId));
      await logAdminAction((locals as any).user?.username || "Sistema", `Eliminó ${config.entityName} "${categoryTitle}"`);

      return redirect(`${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent("Categoría eliminada con éxito")}&toast_type=success`);
    } catch (error) {
      console.error(`[deleteCategory] Error al eliminar ${config.entityName}:`, error);
      return redirect(`${getBaseNoSlash()}/${config.redirectPath}?toast_msg=${encodeURIComponent("Error al eliminar la categoría")}&toast_type=error`);
    }
  };
}
```

Note: The `any` types are intentional — the Drizzle SQLiteTable types are complex and the factory works the same way existing eliminar.ts did (using the table objects directly without generics). The `eq(config.categoryTable.title, ...)` pattern works because `categoryTable.title` is an actual column reference at runtime.

Steps:
1. Create the file.
2. Create directory `src/lib/api/` if it doesn't exist.
3. Run `npm run build`. Must pass.
4. Commit: `feat(lib): add createCategoryDeleteHandler for cascade/unassign categories`.

---

## Task 2: Crear `src/lib/api/deleteAppFile.ts`

**File:** Create `src/lib/api/deleteAppFile.ts`

```typescript
import { getCleanBase } from "@lib/baseUrl";
import { getAppsDir } from "@lib/storage";

export async function deleteAppPhysicalFile(filePath: string): Promise<void> {
  if (!filePath || filePath.startsWith("http")) return;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const cleanBase = getCleanBase();
  const downloadPrefix = `${cleanBase}api/download/`;
  const fileName = filePath.startsWith(downloadPrefix)
    ? filePath.slice(downloadPrefix.length)
    : path.basename(filePath);
  const absPath = path.join(getAppsDir(), fileName);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
}
```

Steps:
1. Create the file.
2. Run `npm run build`. Must pass.
3. Commit: `feat(lib): add deleteAppPhysicalFile shared helper`.

---

## Task 3: Migrar grupo 1 — 3 archivos simples CON auth

**Files to modify:**
- `src/pages/oficinas/edit/[id]/eliminar.ts`
- `src/pages/soportes/edit/[id]/eliminar.ts`
- `src/pages/inventario-terminales/cubics/edit/[id]/eliminar.ts`

**Transformation pattern:**

Replace the entire file content with a thin wrapper:

```typescript
import { db } from "@db/index";
import { offices } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "oficina",
  redirectPath: "oficinas",
  requiredFeature: "Administrar Contenido",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(offices)
      .where(eq(offices.id, id))
      .returning({ code: offices.code, name: offices.name });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Oficina "${(d as any).name}" (${(d as any).code}) eliminada con éxito.`
    : "Oficina eliminada con éxito.",
  logMessage: (d) => `Eliminó la oficina "${(d as any)?.name}" (${(d as any)?.code})`,
});
```

For **soportes**:
```typescript
import { db } from "@db/index";
import { supportGuides } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "soporte",
  redirectPath: "soportes",
  requiredFeature: "Administrar Contenido",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(supportGuides)
      .where(eq(supportGuides.id, id))
      .returning({ helpDeskName: supportGuides.helpDeskName });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Soporte "${(d as any).helpDeskName}" eliminado con éxito.`
    : "Soporte eliminado con éxito.",
  logMessage: (d) => `Eliminó el soporte "${(d as any)?.helpDeskName}"`,
});
```

For **cubics** (has cascade to cubicAssignments via `beforeDelete`):
```typescript
import { db } from "@db/index";
import { cubics, cubicAssignments } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "cubic",
  redirectPath: "inventario-terminales",
  requiredFeature: "Administrar Contenido",
  beforeDelete: async ({ id }) => {
    await db.delete(cubicAssignments).where(eq(cubicAssignments.cubicId, id));
  },
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(cubics)
      .where(eq(cubics.id, id))
      .returning({ name: cubics.name });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Ordenador "${(d as any).name}" dado de baja con éxito.`
    : "Cubic eliminado con éxito.",
  logMessage: (d) => `Eliminó el cubic "${(d as any)?.name}"`,
});
```

Steps:
1. Modify all 3 files with the replacements above.
2. Run `npm run build`. Must pass.
3. Commit: `refactor(api): migrate auth-protected eliminar.ts to factory (oficinas, soportes, cubics)`.

---

## Task 4: Migrar grupo 2 — 3 archivos simples SIN auth

**Files to modify:**
- `src/pages/admin/contactos/edit/[id]/eliminar.ts`
- `src/pages/admin/operadores/edit/[id]/eliminar.ts`
- `src/pages/admin/recursos/enlace/edit/[id]/eliminar.ts`

For **contactos**:
```typescript
import { db } from "@db/index";
import { providerContacts } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "contacto",
  redirectPath: "admin/contactos",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(providerContacts)
      .where(eq(providerContacts.id, id))
      .returning({ provider: providerContacts.provider, service: providerContacts.service });
    return deleted ?? null;
  },
  successMessage: (d) => d
    ? `Contacto "${(d as any).provider} - ${(d as any).service}" eliminado con éxito.`
    : "Contacto eliminado con éxito.",
  logMessage: (d) => d
    ? `Eliminó el contacto "${(d as any).provider} - ${(d as any).service}"`
    : undefined,
});
```

For **operadores** (has cascade to schedules via `afterDelete`):
```typescript
import { db } from "@db/index";
import { agents, schedules } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "operador",
  redirectPath: "admin/operadores",
  performDelete: async (id) => {
    const [deleted] = await db
      .delete(agents)
      .where(eq(agents.id, id))
      .returning({ id: agents.id, name: agents.name });
    return deleted ?? null;
  },
  afterDelete: async ({ deleted }) => {
    if (deleted) {
      await db.delete(schedules).where(eq(schedules.agentName, (deleted as any).name));
    }
  },
  successMessage: () => "Operador eliminado con éxito.",
});
```

For **enlace** (uses `findFirst` pre-fetch instead of `.returning()`):
```typescript
import { db } from "@db/index";
import { resourceLinks } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";

export const POST = createDeleteHandler({
  entityName: "enlace",
  redirectPath: "admin/recursos",
  invalidIdMessage: "ID de enlace no proporcionado",
  performDelete: async (id) => {
    const existing = await db.query.resourceLinks.findFirst({
      where: eq(resourceLinks.id, id),
    });
    if (existing) {
      await db.delete(resourceLinks).where(eq(resourceLinks.id, id));
      return existing as Record<string, unknown>;
    }
    return null;
  },
  successMessage: () => "Enlace eliminado con éxito",
  logMessage: (d) => d ? `Eliminó el enlace "${(d as any).title}"` : "Eliminó un enlace",
});
```

Steps:
1. Modify all 3 files.
2. Run `npm run build`. Must pass.
3. Commit: `refactor(api): migrate simple eliminar.ts to factory (contactos, operadores, enlace)`.

---

## Task 5: Migrar grupo 3 — 2 archivos de categoría SIN archivos físicos

**Files to modify:**
- `src/pages/admin/recursos/categoria/edit/[id]/eliminar.ts`
- `src/pages/admin/contactos/categoria/edit/[id]/eliminar.ts`

For **recursos/categoria**:
```typescript
import { createCategoryDeleteHandler } from "@lib/api/deleteCategory";
import { resourceCategories, resourceLinks } from "@db/schema";

export const POST = createCategoryDeleteHandler({
  categoryTable: resourceCategories,
  itemsTable: resourceLinks,
  categoryIdColumn: resourceCategories.id,
  itemsCategoryColumn: resourceLinks.categoryId,
  defaultCategoryTitle: "Sin Categoría",
  defaultCategoryValues: { title: "Sin Categoría", iconName: "boxicons:folder", tone: "neutral" },
  redirectPath: "admin/recursos",
  entityName: "la categoría de recursos",
});
```

For **contactos/categoria**:
```typescript
import { createCategoryDeleteHandler } from "@lib/api/deleteCategory";
import { contactCategories, providerContacts } from "@db/schema";

export const POST = createCategoryDeleteHandler({
  categoryTable: contactCategories,
  itemsTable: providerContacts,
  categoryIdColumn: contactCategories.id,
  itemsCategoryColumn: providerContacts.categoryId,
  defaultCategoryTitle: "Sin Categoría",
  defaultCategoryValues: { title: "Sin Categoría", iconName: "boxicons:folder", tone: "neutral" },
  redirectPath: "admin/contactos",
  entityName: "la categoría de contactos",
});
```

Steps:
1. Modify both files.
2. Run `npm run build`. Must pass.
3. Commit: `refactor(api): migrate category eliminar.ts to factory (recursos, contactos)`.

---

## Task 6: Migrar grupo 4 — 2 archivos de aplicativos

**Files to modify:**
- `src/pages/admin/aplicativos/edit/[id]/eliminar.ts`
- `src/pages/admin/aplicativos/categorias/edit/[id]/eliminar.ts`

For **admin/aplicativos**:
```typescript
import { db } from "@db/index";
import { applications } from "@db/schema";
import { eq } from "drizzle-orm";
import { createDeleteHandler } from "@lib/api/deleteHandler";
import { deleteAppPhysicalFile } from "@lib/api/deleteAppFile";

export const POST = createDeleteHandler({
  entityName: "aplicativo",
  redirectPath: "admin/aplicativos",
  performDelete: async (id) => {
    const [existing] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));

    if (!existing) return null;

    if (existing.filePath) {
      await deleteAppPhysicalFile(existing.filePath);
    }

    await db.delete(applications).where(eq(applications.id, id));
    return existing as Record<string, unknown>;
  },
  successMessage: (d) => d
    ? `Aplicativo "${(d as any).title}" eliminado con éxito.`
    : "Aplicativo eliminado con éxito.",
  logMessage: (d) => d
    ? `Eliminó el aplicativo "${(d as any).title}"`
    : undefined,
});
```

For **admin/aplicativos/categorias**:
```typescript
import { createCategoryDeleteHandler } from "@lib/api/deleteCategory";
import { applicationCategories, applications } from "@db/schema";
import { deleteAppPhysicalFile } from "@lib/api/deleteAppFile";

export const POST = createCategoryDeleteHandler({
  categoryTable: applicationCategories,
  itemsTable: applications,
  categoryIdColumn: applicationCategories.id,
  itemsCategoryColumn: applications.categoryId,
  defaultCategoryTitle: "Sin Categoría",
  defaultCategoryValues: { title: "Sin Categoría" },
  redirectPath: "admin/aplicativos",
  entityName: "la categoría de aplicativos",
  deleteItemFiles: async (item: any) => {
    if (item.filePath) {
      await deleteAppPhysicalFile(item.filePath);
    }
  },
});
```

Steps:
1. Modify both files.
2. Run `npm run build`. Must pass.
3. Commit: `refactor(api): migrate aplicativos eliminar.ts to factory (with file deletion)`.

---

## Task 7: Marcar C3.3 como resuelto en auditoría

**File:** `docs/superpowers/specs/2026-07-02-auditoria-componentizacion.md`

- Change `C3.3 🟡 10 archivos eliminar.ts...` heading to include `✅ RESUELTO`.
- Update the description with the fix applied.
- Mark in Plan de Acción table.

Steps:
1. Edit the audit file.
2. Stage and commit: `docs(audit): mark C3.3 as resolved`.

---

## Verificación final

- `npm run build` debe pasar.
- `rg "const base = import\.meta\.env\.BASE_URL" src/pages/**/eliminar.ts` → 0 matches.
- `rg "logAdminAction\$" src/pages/**/eliminar.ts` → 0 matches (all in factory now).
- Smoke test: run `npm run dev`, try deleting an office, a contacto, and a categoría.
