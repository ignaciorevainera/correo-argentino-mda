# KB Editor con Publicación a InvGate — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una sección `/base-conocimientos` con editor markdown (EasyMDE) que publique artículos a InvGate QA vía API.

**Architecture:** Páginas Astro server-rendered + script vanilla JS para EasyMDE. API routes como proxy thin hacia InvGate QA (`invgateQaPost`/`invgateQaPut`). Sin base de datos local — todo vive en InvGate.

**Tech Stack:** Astro 6, Tailwind CSS v4, DaisyUI 5, `easymde`, `marked`, InvGate QA API

---

## Estructura de archivos

### Archivos a crear
| Archivo | Responsabilidad |
|---------|----------------|
| `src/pages/base-conocimientos/index.astro` | Listado de artículos (server:defer + skeleton) |
| `src/pages/base-conocimientos/create.astro` | Formulario crear artículo + POST handler |
| `src/pages/base-conocimientos/[id].astro` | Vista artículo renderizado (marked) |
| `src/pages/base-conocimientos/edit/[id].astro` | Formulario editar artículo + POST handler |
| `src/components/base-conocimientos/KbListContent.astro` | DataTable + search script |
| `src/components/base-conocimientos/KbListSkeleton.astro` | Skeleton fallback |
| `src/components/base-conocimientos/KbEditor.astro` | Componente compartido EasyMDE + form |
| `src/components/base-conocimientos/KbViewContent.astro` | Artículo renderizado con marked |
| `src/pages/api/invgate/kb-create.ts` | POST → InvGate QA create |
| `src/pages/api/invgate/kb-update.ts` | PUT → InvGate QA update |
| `src/pages/api/invgate/kb-article.ts` | GET single article from InvGate |
| `src/pages/api/invgate/kb-articles.ts` | GET list from InvGate |
| `src/pages/api/invgate/kb-categories.ts` | GET categories from InvGate |

### Archivos a modificar
| Archivo | Cambio |
|---------|--------|
| `package.json` | +`easymde`, +`marked` |
| `src/lib/invgate-qa-client.ts` | Ya existe `invgateQaPost`/`invgateQaPut` — sin cambios |
| `src/lib/rbac.ts` | +`base-conocimientos` module permissions + route permissions |
| `src/lib/navigation.ts` | +nueva sección "Base de Conocimientos" en sidebar |
| `src/lib/rolesMatrix.ts` | +feature "Base de Conocimientos" |

---

## Task 1: Instalar dependencias

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar easymde y marked**

```bash
npm install easymde marked
```

- [ ] **Step 2: Verificar instalación**

```bash
npm ls easymde marked
```
Expected: ambos paquetes listados sin errores.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(kb): add easymde and marked dependencies"
```

---

## Task 2: RBAC — permisos del módulo base-conocimientos

**Files:**
- Modify: `src/lib/rbac.ts` (líneas 62-117, sección `getModulePermissions`)
- Modify: `src/lib/rbac.ts` (líneas 25-42, sección `routePermissions`)

- [ ] **Step 1: Agregar module permissions para base-conocimientos**

En `src/lib/rbac.ts`, dentro de `getModulePermissions()`, agregar un nuevo `else if` después del bloque `titulos` (línea ~114):

```typescript
  } else if (moduleName === "base-conocimientos") {
    // Leen: todos / Escriben: admin, supervisor, team_leader
    perm.canRead = true;
    perm.canWrite = rank >= ROLE_HIERARCHY.team_leader;
  }

  return perm;
```

- [ ] **Step 2: Agregar route permissions para create/edit**

En `src/lib/rbac.ts`, dentro del array `routePermissions`, agregar después de la última entrada (antes del `];`):

```typescript
  { path: "/base-conocimientos/create", roles: ["admin", "supervisor", "team_leader"] },
  { path: "/base-conocimientos/edit", roles: ["admin", "supervisor", "team_leader"] },
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: sin errores de tipo en `rbac.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rbac.ts
git commit -m "feat(kb): add RBAC permissions for base-conocimientos module"
```

---

## Task 3: Navigation — sección en sidebar

**Files:**
- Modify: `src/lib/navigation.ts` (líneas 18-154, array `navSections`)
- Modify: `src/lib/rolesMatrix.ts` (líneas 11-156, array `rolesMatrix`)

- [ ] **Step 1: Agregar nueva sección "Base de Conocimientos" en navigation.ts**

En `src/lib/navigation.ts`, agregar una nueva sección en `navSections` después de la sección "Herramientas" (después de línea ~109, antes de la sección "admin"):

```typescript
  {
    id: "base-conocimientos",
    label: "Base de Conocimientos",
    items: [
      {
        href: "/base-conocimientos",
        label: "Base de Conocimientos",
        icon: "boxicons:book-library-filled",
      },
    ],
  },
```

- [ ] **Step 2: Agregar feature en rolesMatrix.ts**

En `src/lib/rolesMatrix.ts`, agregar una nueva entrada en `rolesMatrix` después de la última entrada (antes del `];`):

```typescript
  {
    feature: "Base de Conocimientos",
    icon: "boxicons:book-library-filled",
    agent: true,
    referent: true,
    team_leader: true,
    supervisor: true,
    admin: true,
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/navigation.ts src/lib/rolesMatrix.ts
git commit -m "feat(kb): register base-conocimientos in sidebar navigation"
```

---

## Task 4: API route — GET kb-categories

**Files:**
- Create: `src/pages/api/invgate/kb-categories.ts`

- [ ] **Step 1: Crear la API route para categorías**

```typescript
import type { APIRoute } from "astro";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import type { InvgateKbCategory, InvgateKbCategoriesResponse } from "@/types/invgate";

export const GET: APIRoute = async ({ locals }) => {
  const accessError = requireReadAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  try {
    const result = await invgateQaGet<InvgateKbCategoriesResponse>("kb.categories");

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const categories = Array.isArray(result.data?.data)
      ? result.data.data.map((cat: InvgateKbCategory) => ({
          id: cat.id,
          name: cat.name,
        }))
      : [];

    return jsonResponse({ categories }, 200, "private, max-age=300");
  } catch (error: any) {
    console.error("[KB Categories] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/kb-categories.ts
git commit -m "feat(kb): add GET kb-categories proxy API route"
```

---

## Task 5: API route — GET kb-articles (listado)

**Files:**
- Create: `src/pages/api/invgate/kb-articles.ts`

- [ ] **Step 1: Crear la API route para listado**

```typescript
import type { APIRoute } from "astro";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import type { InvgateKbArticle } from "@/types/invgate";

interface KbArticlesListResponse {
  status: string;
  data: InvgateKbArticle[];
}

export const GET: APIRoute = async ({ url, locals }) => {
  const accessError = requireReadAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("page_size") || "50", 10)));

  try {
    const result = await invgateQaGet<KbArticlesListResponse>(
      `kb.articles?page=${page}&page_size=${pageSize}`,
    );

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const articles = Array.isArray(result.data?.data) ? result.data.data : [];

    return jsonResponse({ articles, page, page_size: pageSize }, 200, "private, max-age=30");
  } catch (error: any) {
    console.error("[KB Articles] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/kb-articles.ts
git commit -m "feat(kb): add GET kb-articles proxy API route"
```

---

## Task 6: API route — GET kb-article (single)

**Files:**
- Create: `src/pages/api/invgate/kb-article.ts`

- [ ] **Step 1: Crear la API route para artículo individual**

```typescript
import type { APIRoute } from "astro";
import { invgateQaGet } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireReadAccess } from "@lib/rbac-middleware";
import type { InvgateKbArticle } from "@/types/invgate";

interface KbArticleSingleResponse {
  status: string;
  data: InvgateKbArticle[];
}

export const GET: APIRoute = async ({ url, locals }) => {
  const accessError = requireReadAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  const id = url.searchParams.get("id");
  if (!id || isNaN(parseInt(id, 10))) {
    return jsonResponse({ error: "Parámetro ?id= requerido (integer)" }, 400);
  }

  try {
    const result = await invgateQaGet<KbArticleSingleResponse>(
      `kb.articles?id=${parseInt(id, 10)}`,
    );

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const articles = result.data?.data;
    if (!Array.isArray(articles) || articles.length === 0) {
      return jsonResponse({ error: "Artículo no encontrado" }, 404);
    }

    const article = articles[0];

    return jsonResponse({ article }, 200, "private, max-age=10");
  } catch (error: any) {
    console.error("[KB Article] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/kb-article.ts
git commit -m "feat(kb): add GET kb-article single proxy API route"
```

---

## Task 7: API route — POST kb-create

**Files:**
- Create: `src/pages/api/invgate/kb-create.ts`

- [ ] **Step 1: Crear la API route para crear artículo**

```typescript
import type { APIRoute } from "astro";
import { invgateQaPost } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { logAdminFromAstro } from "@lib/auditLogger";

interface InvGateCreateResponse {
  article_id: number;
  status: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const accessError = requireWriteAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  try {
    const fd = await request.formData();
    const title = fd.get("title")?.toString().trim() || "";
    const content = fd.get("content")?.toString() || "";
    const categoryId = parseInt(fd.get("category_id")?.toString() || "0", 10);
    const authorId = locals.user?.id;

    if (!title) {
      return jsonResponse({ error: "El título es obligatorio" }, 400);
    }
    if (!content) {
      return jsonResponse({ error: "El contenido es obligatorio" }, 400);
    }
    if (!categoryId || categoryId <= 0) {
      return jsonResponse({ error: "Seleccioná una categoría" }, 400);
    }
    if (!authorId) {
      return jsonResponse({ error: "Sesión no válida" }, 401);
    }

    const result = await invgateQaPost<InvGateCreateResponse>("kb.articles", {
      title,
      content,
      category_id: categoryId,
      author_id: authorId,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    const articleId = result.data?.article_id;
    if (articleId) {
      await logAdminFromAstro(
        locals,
        `Creó artículo KB #${articleId} "${title}" en InvGate QA`,
      );
    }

    return jsonResponse({ success: true, article_id: articleId }, 200);
  } catch (error: any) {
    console.error("[KB Create] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/kb-create.ts
git commit -m "feat(kb): add POST kb-create proxy API route"
```

---

## Task 8: API route — POST kb-update

**Files:**
- Create: `src/pages/api/invgate/kb-update.ts`

- [ ] **Step 1: Crear la API route para actualizar artículo**

```typescript
import type { APIRoute } from "astro";
import { invgateQaPut } from "@lib/invgate-qa-client";
import { jsonResponse, sanitizeError } from "@lib/apiResponse";
import { requireWriteAccess } from "@lib/rbac-middleware";
import { logAdminFromAstro } from "@lib/auditLogger";

interface InvGateUpdateResponse {
  status: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const accessError = requireWriteAccess(locals, "base-conocimientos");
  if (accessError) return accessError;

  try {
    const fd = await request.formData();
    const articleId = parseInt(fd.get("article_id")?.toString() || "0", 10);
    const title = fd.get("title")?.toString().trim() || "";
    const content = fd.get("content")?.toString() || "";
    const categoryId = parseInt(fd.get("category_id")?.toString() || "0", 10);
    const authorId = locals.user?.id;

    if (!articleId || articleId <= 0) {
      return jsonResponse({ error: "ID de artículo inválido" }, 400);
    }
    if (!title) {
      return jsonResponse({ error: "El título es obligatorio" }, 400);
    }
    if (!content) {
      return jsonResponse({ error: "El contenido es obligatorio" }, 400);
    }
    if (!authorId) {
      return jsonResponse({ error: "Sesión no válida" }, 401);
    }

    const body: Record<string, unknown> = {
      id: articleId,
      title,
      content,
      author_id: authorId,
    };
    if (categoryId > 0) {
      body.category_id = categoryId;
    }

    const result = await invgateQaPut<InvGateUpdateResponse>("kb.articles", body);

    if (!result.ok) {
      return jsonResponse({ error: result.message }, result.status);
    }

    await logAdminFromAstro(
      locals,
      `Actualizó artículo KB #${articleId} "${title}" en InvGate QA`,
    );

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("[KB Update] Error:", error);
    return jsonResponse({ error: sanitizeError(error) }, 500);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/invgate/kb-update.ts
git commit -m "feat(kb): add POST kb-update proxy API route"
```

---

## Task 9: Componente — KbEditor (compartido create/edit)

**Files:**
- Create: `src/components/base-conocimientos/KbEditor.astro`

- [ ] **Step 1: Crear el componente KbEditor**

Este componente se comparte entre `create.astro` y `edit/[id].astro`. Recibe props opcionales para precargar contenido existente.

```astro
---
import FormField from "@components/ui/forms/FormField.astro";
import SelectField from "@components/ui/forms/SelectField.astro";
import SectionCard from "@components/ui/SectionCard.astro";
import { Icon } from "astro-icon/components";

interface Category {
  id: number;
  name: string;
}

interface Props {
  mode: "create" | "edit";
  actionUrl: string;
  categories: Category[];
  initialTitle?: string;
  initialContent?: string;
  initialCategoryId?: number;
  articleId?: number;
  errorMsg?: string;
}

const {
  mode,
  actionUrl,
  categories,
  initialTitle = "",
  initialContent = "",
  initialCategoryId,
  articleId,
  errorMsg,
} = Astro.props;

const pageTitle = mode === "create" ? "Nuevo artículo" : "Editar artículo";
---

<div class="space-y-4">
  {errorMsg && (
    <div class="alert alert-error">
      <Icon name="boxicons:error" size={20} />
      <span>{errorMsg}</span>
    </div>
  )}

  <form method="POST" action={actionUrl} id="kb-editor-form" class="space-y-4" data-async-form>
    <SectionCard class="shadow-md">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content">
        <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/10 text-secondary">
          <Icon name="boxicons:book" size={15} />
        </span>
        Datos del artículo
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <FormField
            id="kb-title"
            name="title"
            label="Título"
            required
            value={initialTitle}
            placeholder="Título del artículo"
            autocomplete="off"
            inputClass="input-sm"
          />
        </div>

        <SelectField
          id="kb-category"
          name="category_id"
          label="Categoría"
          required
          selectClass="select-sm"
          value={initialCategoryId?.toString()}
        >
          <option value="" disabled selected={!initialCategoryId}>
            Seleccionar categoría...
          </option>
          {categories.map((cat) => (
            <option value={cat.id} selected={initialCategoryId === cat.id}>
              {cat.name}
            </option>
          ))}
        </SelectField>
      </div>
    </SectionCard>

    <SectionCard class="shadow-md">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content">
        <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/10 text-secondary">
          <Icon name="boxicons:edit" size={15} />
        </span>
        Contenido (Markdown)
      </h2>

      <textarea id="kb-editor" name="content" class="hidden">{initialContent}</textarea>
    </SectionCard>

    <div class="flex items-center justify-between gap-3 pt-1">
      <a
        href={mode === "create"
          ? `${import.meta.env.BASE_URL || "/"}base-conocimientos`
          : `${import.meta.env.BASE_URL || "/"}base-conocimientos/${articleId}`}
        class="btn btn-sm md:btn-md btn-soft btn-ghost gap-2"
      >
        <Icon name="boxicons:arrow-left-filled" size={16} />
        {mode === "create" ? "Volver al listado" : "Volver al artículo"}
      </a>
      <button type="submit" class="btn btn-sm md:btn-md btn-primary gap-2">
        <Icon name="boxicons:save-filled" size={16} />
        {mode === "create" ? "Publicar artículo" : "Guardar cambios"}
      </button>
    </div>
  </form>
</div>

<script>
  import EasyMDE from "easymde";
  import "easymde/dist/easymde.min.css";

  document.addEventListener("DOMContentLoaded", () => {
    const textarea = document.getElementById("kb-editor") as HTMLTextAreaElement;
    if (!textarea) return;

    const easyMDE = new EasyMDE({
      element: textarea,
      toolbar: [
        "bold", "italic", "heading", "|",
        "code", "quote", "unordered-list", "ordered-list", "|",
        "link", "image", "|",
        "preview", "side-by-side", "fullscreen",
      ],
      spellChecker: false,
      status: ["lines", "words", "cursor"],
      minHeight: "400px",
    });

    // Sync EasyMDE value back to hidden textarea before form submit
    const form = document.getElementById("kb-editor-form") as HTMLFormElement;
    if (form) {
      form.addEventListener("submit", () => {
        textarea.value = easyMDE.value();
      });
    }
  });
</script>

<style is:global>
  .EasyMDEContainer .CodeMirror {
    border: 1px solid oklch(var(--bc) / 0.2);
    border-radius: 0.5rem;
    min-height: 400px;
  }
  .EasyMDEContainer .editor-toolbar {
    border: 1px solid oklch(var(--bc) / 0.2);
    border-radius: 0.5rem 0.5rem 0 0;
    background: oklch(var(--b2));
  }
  .EasyMDEContainer .editor-toolbar button {
    color: oklch(var(--bc) / 0.6);
  }
  .EasyMDEContainer .editor-toolbar button:hover {
    background: oklch(var(--bc) / 0.1);
    color: oklch(var(--bc));
  }
  .EasyMDEContainer .editor-toolbar button.active {
    background: oklch(var(--p) / 0.2);
    color: oklch(var(--p));
  }
  .EasyMDEContainer .CodeMirror-sided {
    border-radius: 0;
  }
  .EasyMDEContainer .editor-preview {
    background: oklch(var(--b1));
    color: oklch(var(--bc));
    padding: 1rem;
  }
  .editor-preview pre {
    background: oklch(var(--b3));
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
  }
  .editor-preview code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.875em;
  }
  .editor-preview pre code {
    background: none;
    padding: 0;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/base-conocimientos/KbEditor.astro
git commit -m "feat(kb): add shared KbEditor component with EasyMDE"
```

---

## Task 10: Componente — KbListContent + KbListSkeleton

**Files:**
- Create: `src/components/base-conocimientos/KbListContent.astro`
- Create: `src/components/base-conocimientos/KbListSkeleton.astro`

- [ ] **Step 1: Crear KbListSkeleton**

```astro
---
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
---

<PageContainer>
  <PageHeader title="Base de Conocimientos" description="Artículos de la base de conocimientos de InvGate." />
  <div class="rounded-box border border-base-300 bg-base-200/70 shadow-md overflow-x-auto">
    <div class="grid grid-cols-[1fr_160px_120px_120px_100px] border-b border-secondary/40 bg-secondary px-4 py-2.5 uppercase font-mono text-xs">
      <span class="text-secondary-content font-semibold">Título</span>
      <span class="text-secondary-content font-semibold">Categoría</span>
      <span class="text-secondary-content font-semibold">Autor</span>
      <span class="text-secondary-content font-semibold">Fecha</span>
      <span class="text-secondary-content font-semibold text-right">Acciones</span>
    </div>
    <div class="divide-y divide-base-300">
      {Array.from({ length: 5 }).map(() => (
        <div class="grid grid-cols-[1fr_160px_120px_120px_100px] items-center px-4 py-3">
          <div class="h-4 bg-base-300 rounded animate-pulse w-3/4"></div>
          <div class="h-4 bg-base-300 rounded animate-pulse w-20"></div>
          <div class="h-4 bg-base-300 rounded animate-pulse w-16"></div>
          <div class="h-4 bg-base-300 rounded animate-pulse w-20"></div>
          <div class="flex justify-end gap-2">
            <div class="h-7 w-7 bg-base-300 rounded animate-pulse"></div>
            <div class="h-7 w-7 bg-base-300 rounded animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
</PageContainer>
```

- [ ] **Step 2: Commit skeleton**

```bash
git add src/components/base-conocimientos/KbListSkeleton.astro
git commit -m "feat(kb): add KbListSkeleton loading component"
```

- [ ] **Step 3: Crear KbListContent**

```astro
---
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import DataTable from "@components/ui/DataTable.astro";
import DataTableHeaderCell from "@components/ui/DataTableHeaderCell.astro";
import { Icon } from "astro-icon/components";
import { resolveUrl } from "@lib/url";
import { getCleanBase } from "@lib/baseUrl";

interface Article {
  id: number;
  title: string;
  category_id: number | null;
  author_id?: number;
  content?: string;
  status_id?: number;
}

interface Category {
  id: number;
  name: string;
}

const cleanBase = getCleanBase();

let articles: Article[] = [];
let categories: Category[] = [];
let errorMsg = "";

try {
  const baseUrl = import.meta.env.INVGATE_QA_BASE_URL || "";
  const apiKey = import.meta.env.INVGATE_QA_API_KEY || "";
  const apiUser = import.meta.env.INVGATE_QA_API_USERNAME || "portalmda";

  if (baseUrl && apiKey) {
    const credentials = btoa(apiUser + ":" + apiKey);
    const headers = {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json",
    };

    const [articlesRes, categoriesRes] = await Promise.all([
      fetch(`${baseUrl}kb.articles?page=1&page_size=50`, { headers }),
      fetch(`${baseUrl}kb.categories`, { headers }),
    ]);

    if (articlesRes.ok) {
      const articlesData = await articlesRes.json();
      articles = Array.isArray(articlesData?.data) ? articlesData.data : [];
    }

    if (categoriesRes.ok) {
      const categoriesData = await categoriesRes.json();
      categories = Array.isArray(categoriesData?.data) ? categoriesData.data : [];
    }
  }
} catch (e: any) {
  console.error("[KB List] Error fetching articles:", e);
  errorMsg = "Error al cargar los artículos de InvGate.";
}

const categoryMap = new Map<number, string>();
for (const cat of categories) {
  categoryMap.set(cat.id, cat.name);
}

function formatDate(epoch?: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
---

<PageContainer>
  <PageHeader
    title="Base de Conocimientos"
    description="Artículos de la base de conocimientos de InvGate."
  />

  {errorMsg && (
    <div class="alert alert-error">
      <Icon name="boxicons:error" size={20} />
      <span>{errorMsg}</span>
    </div>
  )}

  <div class="flex justify-end">
    <a
      href={resolveUrl("/base-conocimientos/create")}
      class="btn btn-sm md:btn-md btn-primary gap-2"
    >
      <Icon name="boxicons:plus" size={16} />
      Nuevo artículo
    </a>
  </div>

  <div data-table-sort-root>
    <DataTable
      ariaLabel="Listado de artículos KB"
      headerGridClass="grid-cols-[1fr_160px_120px_120px_100px]"
      rowGridClass="grid-cols-[1fr_160px_120px_120px_100px]"
      emptyStateTitle="Sin artículos"
      emptyStateDescription="No se encontraron artículos en InvGate."
    >
      <DataTableHeaderCell sortKey="title">Título</DataTableHeaderCell>
      <DataTableHeaderCell sortKey="category">Categoría</DataTableHeaderCell>
      <DataTableHeaderCell sortKey="author">Autor</DataTableHeaderCell>
      <DataTableHeaderCell sortKey="date">Fecha</DataTableHeaderCell>
      <DataTableHeaderCell align="right">Acciones</DataTableHeaderCell>

      {articles.map((article) => {
        const categoryName = article.category_id != null
          ? categoryMap.get(article.category_id) ?? "—"
          : "—";
        const searchText = `${article.title} ${categoryName}`.toLowerCase();

        return (
          <div
            class="grid grid-cols-[1fr_160px_120px_120px_100px] items-center border-b border-base-300 px-4 py-3 hover:bg-base-200/50 transition-colors"
            data-table-row
            data-sort-title={article.title}
            data-sort-category={categoryName}
            data-sort-author={article.author_id?.toString() || ""}
            data-sort-date={article.id.toString()}
            data-search-text={searchText}
          >
            <span class="min-w-0 truncate font-medium text-base-content" data-highlight-target>
              {article.title}
            </span>
            <span class="min-w-0 truncate text-sm text-base-content/70" data-highlight-target>
              {categoryName}
            </span>
            <span class="min-w-0 truncate text-sm text-base-content/70">
              #{article.author_id || "—"}
            </span>
            <span class="min-w-0 truncate text-sm text-base-content/70 font-mono">
              #{article.id}
            </span>
            <div class="flex items-center justify-end gap-1">
              <a
                href={resolveUrl(`/base-conocimientos/${article.id}`)}
                class="btn btn-xs btn-ghost btn-square"
                title="Ver artículo"
              >
                <Icon name="boxicons:show" size={16} />
              </a>
              <a
                href={resolveUrl(`/base-conocimientos/edit/${article.id}`)}
                class="btn btn-xs btn-ghost btn-square"
                title="Editar artículo"
              >
                <Icon name="boxicons:pencil" size={16} />
              </a>
            </div>
          </div>
        );
      })}
    </DataTable>
  </div>

  <script>
    import { matchesSearchQuery, highlightSearchTargets } from "@lib/clientSearch";

    function initSearch() {
      const searchInput = document.getElementById("kb-search") as HTMLInputElement;
      if (!searchInput) return;

      searchInput.addEventListener("input", () => {
        const query = searchInput.value;
        const rows = document.querySelectorAll("[data-table-row]") as HTMLElement[];
        let visibleCount = 0;

        rows.forEach((row) => {
          const searchTexts = [row.dataset.searchText || ""];
          const matches = matchesSearchQuery(query, searchTexts);
          row.style.display = matches ? "" : "none";
          if (matches) visibleCount++;
        });

        highlightSearchTargets(document, query);
      });
    }

    document.addEventListener("DOMContentLoaded", initSearch);
    document.addEventListener("astro:page-load", initSearch);
  </script>
</PageContainer>
```

- [ ] **Step 4: Commit content**

```bash
git add src/components/base-conocimientos/KbListContent.astro
git commit -m "feat(kb): add KbListContent DataTable component"
```

---

## Task 11: Componente — KbViewContent

**Files:**
- Create: `src/components/base-conocimientos/KbViewContent.astro`

- [ ] **Step 1: Crear el componente de vista**

```astro
---
import PageContainer from "@components/ui/PageContainer.astro";
import { Icon } from "astro-icon/components";
import { resolveUrl } from "@lib/url";
import { marked } from "marked";

interface Article {
  id: number;
  title: string;
  content: string;
  category_id: number | null;
  author_id?: number;
}

interface Category {
  id: number;
  name: string;
}

interface Props {
  article: Article;
  categories: Category[];
}

const { article, categories } = Astro.props;

const category = categories.find((c) => c.id === article.category_id);
const categoryName = category?.name || "Sin categoría";

const htmlContent = marked.parse(article.content || "") as string;
---

<PageContainer>
  <div class="flex items-center gap-2 text-sm text-base-content/60">
    <a
      href={resolveUrl("/base-conocimientos")}
      class="flex items-center gap-1.5 hover:text-base-content transition-colors"
    >
      <Icon name="boxicons:chevron-left" size={16} />
      Base de Conocimientos
    </a>
    <span>/</span>
    <span class="text-base-content font-medium truncate">{article.title}</span>
  </div>

  <article class="card card-compact bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2 flex-1 min-w-0">
          <h1 class="text-2xl font-bold text-base-content tracking-tight">
            {article.title}
          </h1>
          <div class="flex flex-wrap items-center gap-3 text-sm text-base-content/60">
            <span class="badge badge-sm badge-outline">{categoryName}</span>
            {article.author_id && (
              <span class="flex items-center gap-1">
                <Icon name="boxicons:user" size={14} />
                Autor #{article.author_id}
              </span>
            )}
            <span class="flex items-center gap-1">
              <Icon name="boxicons:tag" size={14} />
              Artículo #{article.id}
            </span>
          </div>
        </div>
        <a
          href={resolveUrl(`/base-conocimientos/edit/${article.id}`)}
          class="btn btn-sm btn-ghost gap-2 shrink-0"
        >
          <Icon name="boxicons:pencil" size={16} />
          Editar
        </a>
      </div>

      <div class="divider"></div>

      <div class="prose prose-sm max-w-none text-base-content
                  prose-headings:text-base-content prose-p:text-base-content/80
                  prose-a:text-primary prose-code:text-secondary
                  prose-pre:bg-base-300 prose-pre:text-base-content
                  prose-li:text-base-content/80
                  dark:prose-invert">
        <Fragment set:html={htmlContent} />
      </div>
    </div>
  </article>
</PageContainer>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/base-conocimientos/KbViewContent.astro
git commit -m "feat(kb): add KbViewContent article renderer component"
```

---

## Task 12: Página — index.astro (listado con server:defer)

**Files:**
- Create: `src/pages/base-conocimientos/index.astro`

- [ ] **Step 1: Crear la página de listado**

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import KbListContent from "@components/base-conocimientos/KbListContent.astro";
import KbListSkeleton from "@components/base-conocimientos/KbListSkeleton.astro";
---

<BaseLayout title="Base de Conocimientos">
  <KbListContent server:defer>
    <KbListSkeleton slot="fallback" />
  </KbListContent>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/base-conocimientos/index.astro
git commit -m "feat(kb): add base-conocimientos index page with server:defer"
```

---

## Task 13: Página — create.astro (editor crear)

**Files:**
- Create: `src/pages/base-conocimientos/create.astro`

- [ ] **Step 1: Crear la página de crear artículo**

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import KbEditor from "@components/base-conocimientos/KbEditor.astro";
import AsyncFormScript from "@components/admin/ui/AsyncFormScript.astro";
import { Icon } from "astro-icon/components";
import { resolveUrl } from "@lib/url";
import { getCleanBase } from "@lib/baseUrl";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { toastResponse } from "@lib/api/toastResponse";
import { invgateQaGet, invgateQaPost } from "@lib/invgate-qa-client";
import { logAdminFromAstro } from "@lib/auditLogger";
import type { InvgateKbCategory, InvgateKbCategoriesResponse } from "@/types/invgate";

let errorMsg = "";
let categories: { id: number; name: string }[] = [];

// Fetch categories for the selector
try {
  const result = await invgateQaGet<InvgateKbCategoriesResponse>("kb.categories");
  if (result.ok && Array.isArray(result.data?.data)) {
    categories = result.data.data.map((c: InvgateKbCategory) => ({
      id: c.id,
      name: c.name,
    }));
  }
} catch (e) {
  console.error("[KB Create] Error fetching categories:", e);
}

if (Astro.request.method === "POST") {
  const isAjax = Astro.request.headers.get("accept")?.includes("application/json");
  try {
    const fd = await Astro.request.formData();
    const title = fd.get("title")?.toString().trim() || "";
    const content = fd.get("content")?.toString() || "";
    const categoryId = parseInt(fd.get("category_id")?.toString() || "0", 10);
    const authorId = Astro.locals.user?.id;

    if (!title) {
      errorMsg = "El título es obligatorio.";
    } else if (!content) {
      errorMsg = "El contenido es obligatorio.";
    } else if (!categoryId || categoryId <= 0) {
      errorMsg = "Seleccioná una categoría.";
    } else if (!authorId) {
      errorMsg = "Sesión no válida.";
    } else {
      const result = await invgateQaPost<{ article_id: number; status: string }>(
        "kb.articles",
        { title, content, category_id: categoryId, author_id: authorId },
      );

      if (!result.ok) {
        errorMsg = `Error de InvGate: ${result.message}`;
      } else {
        const articleId = result.data?.article_id;
        await logAdminFromAstro(
          Astro.locals,
          `Creó artículo KB #${articleId} "${title}" en InvGate QA`,
        );

        const toastMsg = `Artículo "${title}" publicado con éxito.`;
        if (isAjax) {
          return toastResponse({
            success: true,
            message: toastMsg,
            redirectUrl: resolveUrl(`/base-conocimientos/${articleId}`),
          });
        }
        return redirectWithToast(`/base-conocimientos/${articleId}`, toastMsg);
      }
    }
  } catch (e: any) {
    console.error("[KB Create] POST error:", e);
    errorMsg = "Error al publicar el artículo.";
  }

  if (isAjax && errorMsg) {
    return toastResponse({ success: false, error: errorMsg });
  }
}
---

<BaseLayout title="Nuevo artículo">
  <PageContainer>
    <div class="flex items-center gap-2 text-sm text-base-content/60">
      <a
        href={resolveUrl("/base-conocimientos")}
        class="flex items-center gap-1.5 hover:text-base-content transition-colors"
      >
        <Icon name="boxicons:chevron-left" size={16} />
        Base de Conocimientos
      </a>
      <span>/</span>
      <span class="text-base-content font-medium truncate">Nuevo artículo</span>
    </div>

    <PageHeader
      title="Nuevo artículo"
      description="Escribí el contenido en markdown y publicalo en InvGate."
    />

    <KbEditor
      mode="create"
      actionUrl={resolveUrl("/base-conocimientos/create")}
      categories={categories}
      errorMsg={errorMsg}
    />
  </PageContainer>
  <AsyncFormScript />
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/base-conocimientos/create.astro
git commit -m "feat(kb): add create page with EasyMDE editor"
```

---

## Task 14: Página — [id].astro (vista artículo)

**Files:**
- Create: `src/pages/base-conocimientos/[id].astro`

- [ ] **Step 1: Crear la página de vista de artículo**

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import KbViewContent from "@components/base-conocimientos/KbViewContent.astro";
import PageContainer from "@components/ui/PageContainer.astro";
import { Icon } from "astro-icon/components";
import { invgateQaGet } from "@lib/invgate-qa-client";
import type { InvgateKbArticle, InvgateKbCategory, InvgateKbCategoriesResponse } from "@/types/invgate";

interface KbArticleSingleResponse {
  status: string;
  data: InvgateKbArticle[];
}

const { id } = Astro.params;
const articleId = parseInt(id || "0", 10);

if (!articleId || articleId <= 0) {
  return Astro.redirect(`${import.meta.env.BASE_URL || "/"}base-conocimientos`);
}

let article: InvgateKbArticle | null = null;
let categories: { id: number; name: string }[] = [];

try {
  const [articleResult, categoriesResult] = await Promise.all([
    invgateQaGet<KbArticleSingleResponse>(`kb.articles?id=${articleId}`),
    invgateQaGet<InvgateKbCategoriesResponse>("kb.categories"),
  ]);

  if (articleResult.ok && Array.isArray(articleResult.data?.data) && articleResult.data.data.length > 0) {
    article = articleResult.data.data[0];
  }

  if (categoriesResult.ok && Array.isArray(categoriesResult.data?.data)) {
    categories = categoriesResult.data.data.map((c: InvgateKbCategory) => ({
      id: c.id,
      name: c.name,
    }));
  }
} catch (e) {
  console.error("[KB View] Error:", e);
}

if (!article) {
  return Astro.redirect(`${import.meta.env.BASE_URL || "/"}base-conocimientos`);
}
---

<BaseLayout title={article.title}>
  <KbViewContent article={article} categories={categories} />
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/base-conocimientos/\[id\].astro
git commit -m "feat(kb): add article view page with marked renderer"
```

---

## Task 15: Página — edit/[id].astro (editor editar)

**Files:**
- Create: `src/pages/base-conocimientos/edit/[id].astro`

- [ ] **Step 1: Crear la página de editar artículo**

```astro
---
import BaseLayout from "@layouts/BaseLayout.astro";
import PageContainer from "@components/ui/PageContainer.astro";
import PageHeader from "@components/ui/PageHeader.astro";
import KbEditor from "@components/base-conocimientos/KbEditor.astro";
import AsyncFormScript from "@components/admin/ui/AsyncFormScript.astro";
import { Icon } from "astro-icon/components";
import { resolveUrl } from "@lib/url";
import { redirectWithToast } from "@lib/api/redirectWithToast";
import { toastResponse } from "@lib/api/toastResponse";
import { invgateQaGet, invgateQaPut } from "@lib/invgate-qa-client";
import { logAdminFromAstro } from "@lib/auditLogger";
import type { InvgateKbArticle, InvgateKbCategory, InvgateKbCategoriesResponse } from "@/types/invgate";

const { id } = Astro.params;
const articleId = parseInt(id || "0", 10);

if (!articleId || articleId <= 0) {
  return Astro.redirect(`${import.meta.env.BASE_URL || "/"}base-conocimientos`);
}

let article: InvgateKbArticle | null = null;
let categories: { id: number; name: string }[] = [];
let errorMsg = "";

try {
  interface KbArticleSingleResponse {
    status: string;
    data: InvgateKbArticle[];
  }

  const [articleResult, categoriesResult] = await Promise.all([
    invgateQaGet<KbArticleSingleResponse>(`kb.articles?id=${articleId}`),
    invgateQaGet<InvgateKbCategoriesResponse>("kb.categories"),
  ]);

  if (articleResult.ok && Array.isArray(articleResult.data?.data) && articleResult.data.data.length > 0) {
    article = articleResult.data.data[0];
  }

  if (categoriesResult.ok && Array.isArray(categoriesResult.data?.data)) {
    categories = categoriesResult.data.data.map((c: InvgateKbCategory) => ({
      id: c.id,
      name: c.name,
    }));
  }
} catch (e) {
  console.error("[KB Edit] Error loading data:", e);
}

if (!article) {
  return Astro.redirect(`${import.meta.env.BASE_URL || "/"}base-conocimientos`);
}

if (Astro.request.method === "POST") {
  const isAjax = Astro.request.headers.get("accept")?.includes("application/json");
  try {
    const fd = await Astro.request.formData();
    const title = fd.get("title")?.toString().trim() || "";
    const content = fd.get("content")?.toString() || "";
    const categoryId = parseInt(fd.get("category_id")?.toString() || "0", 10);
    const authorId = Astro.locals.user?.id;

    if (!title) {
      errorMsg = "El título es obligatorio.";
    } else if (!content) {
      errorMsg = "El contenido es obligatorio.";
    } else if (!authorId) {
      errorMsg = "Sesión no válida.";
    } else {
      const body: Record<string, unknown> = {
        id: articleId,
        title,
        content,
        author_id: authorId,
      };
      if (categoryId > 0) {
        body.category_id = categoryId;
      }

      const result = await invgateQaPut<{ status: string }>("kb.articles", body);

      if (!result.ok) {
        errorMsg = `Error de InvGate: ${result.message}`;
      } else {
        await logAdminFromAstro(
          Astro.locals,
          `Actualizó artículo KB #${articleId} "${title}" en InvGate QA`,
        );

        const toastMsg = `Artículo "${title}" actualizado con éxito.`;
        if (isAjax) {
          return toastResponse({
            success: true,
            message: toastMsg,
            redirectUrl: resolveUrl(`/base-conocimientos/${articleId}`),
          });
        }
        return redirectWithToast(`/base-conocimientos/${articleId}`, toastMsg);
      }
    }
  } catch (e: any) {
    console.error("[KB Edit] POST error:", e);
    errorMsg = "Error al actualizar el artículo.";
  }

  if (isAjax && errorMsg) {
    return toastResponse({ success: false, error: errorMsg });
  }
}
---

<BaseLayout title={`Editar: ${article.title}`}>
  <PageContainer>
    <div class="flex items-center gap-2 text-sm text-base-content/60">
      <a
        href={resolveUrl("/base-conocimientos")}
        class="flex items-center gap-1.5 hover:text-base-content transition-colors"
      >
        <Icon name="boxicons:chevron-left" size={16} />
        Base de Conocimientos
      </a>
      <span>/</span>
      <a
        href={resolveUrl(`/base-conocimientos/${articleId}`)}
        class="hover:text-base-content transition-colors"
      >
        {article.title}
      </a>
      <span>/</span>
      <span class="text-base-content font-medium truncate">Editar</span>
    </div>

    <PageHeader
      title="Editar artículo"
      description="Modificá el contenido del artículo en InvGate."
    />

    <KbEditor
      mode="edit"
      actionUrl={resolveUrl(`/base-conocimientos/edit/${articleId}`)}
      categories={categories}
      initialTitle={article.title}
      initialContent={article.content || ""}
      initialCategoryId={article.category_id ?? undefined}
      articleId={articleId}
      errorMsg={errorMsg}
    />
  </PageContainer>
  <AsyncFormScript />
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/base-conocimientos/edit/\[id\].astro
git commit -m "feat(kb): add edit page with EasyMDE editor"
```

---

## Task 16: Verificación final — build y smoke test

**Files:** (ninguno nuevo)

- [ ] **Step 1: Build del proyecto**

```bash
npm run build
```
Expected: build exitoso sin errores de tipo ni de compilación.

- [ ] **Step 2: Verificar que no hay errores de TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: sin errores.

- [ ] **Step 3: Verificar que las rutas aparecen en navigation.ts**

Abrir `src/lib/navigation.ts` y confirmar que la sección `base-conocimientos` existe en `navSections` con ícono `boxicons:book-library-filled`.

- [ ] **Step 4: Commit final (si hay fix)**

```bash
git add -A
git commit -m "fix(kb): final build fixes"
```

---

## Resumen de archivos creados/modificados

| Archivo | Acción |
|---------|--------|
| `package.json` | Modificado (+easymde, +marked) |
| `src/lib/rbac.ts` | Modificado (+module permissions, +route permissions) |
| `src/lib/navigation.ts` | Modificado (+sección sidebar) |
| `src/lib/rolesMatrix.ts` | Modificado (+feature) |
| `src/pages/api/invgate/kb-categories.ts` | Creado |
| `src/pages/api/invgate/kb-articles.ts` | Creado |
| `src/pages/api/invgate/kb-article.ts` | Creado |
| `src/pages/api/invgate/kb-create.ts` | Creado |
| `src/pages/api/invgate/kb-update.ts` | Creado |
| `src/components/base-conocimientos/KbEditor.astro` | Creado |
| `src/components/base-conocimientos/KbListContent.astro` | Creado |
| `src/components/base-conocimientos/KbListSkeleton.astro` | Creado |
| `src/components/base-conocimientos/KbViewContent.astro` | Creado |
| `src/pages/base-conocimientos/index.astro` | Creado |
| `src/pages/base-conocimientos/create.astro` | Creado |
| `src/pages/base-conocimientos/[id].astro` | Creado |
| `src/pages/base-conocimientos/edit/[id].astro` | Creado |

---

## Dependencias cruzadas entre Tasks

| Task | Depende de |
|------|-----------|
| Task 2 (RBAC) | — |
| Task 3 (Navigation) | — |
| Task 4 (API categories) | Task 2 |
| Task 5 (API articles) | Task 2 |
| Task 6 (API article) | Task 2 |
| Task 7 (API create) | Task 2 |
| Task 8 (API update) | Task 2 |
| Task 9 (KbEditor) | Task 1 |
| Task 10 (KbList) | — |
| Task 11 (KbView) | Task 1 |
| Task 12 (index page) | Task 10 |
| Task 13 (create page) | Task 9, Task 7 |
| Task 14 (view page) | Task 11, Task 6 |
| Task 15 (edit page) | Task 9, Task 8, Task 6 |
| Task 16 (verification) | Todos |

Tasks 2, 3 y 1 pueden ejecutarse en paralelo. Tasks 4-8 pueden ejecutarse en paralelo tras Task 2. Tasks 9-11 pueden ejecutarse en paralelo. Tasks 12-15 dependen de sus componentes/APIs.
