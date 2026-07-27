# Especificación: Editor de Base de Conocimientos con Publicación a InvGate

**Fecha:** 2026-07-27  
**Estado:** Aprobada para implementación  
**Autor:** Portal MDA — equipo de desarrollo

---

## 1. Resumen ejecutivo

Implementar una nueva sección del portal (`/base-conocimientos`) que permita a los operadores autorizados **escribir artículos en markdown** con previsualización en tiempo real y **publicarlos directamente en la Base de Conocimientos de InvGate** mediante la API REST.

No se persiste nada localmente: el portal actúa como editor frontend y proxy de autenticación hacia la API de InvGate.

**Entorno de desarrollo:** se usará la API de InvGate QA (`INVGATE_QA_*`) para pruebas; promoción a producción (`INVGATE_*`) tras validación.

---

## 2. Alcance

### Incluye
- Listado de artículos KB desde InvGate (`GET /kb.articles`)
- Editor markdown con toolbar y preview side-by-side (`EasyMDE`)
- Creación de artículos (`POST /kb.articles` via proxy)
- Edición de artículos existentes (`PUT /kb.articles?id=X` via proxy)
- Vista de artículo renderizado (`marked`)
- Selector de categorías KB desde InvGate (`GET /kb.categories`)
- Integración con RBAC existente (escritura: `team_leader`+)

### No incluye
- Base de datos local de artículos
- Versionado/historial local
- Adjuntos/imágenes (fase futura)
- Comentarios en artículos
- Sincronización bidireccional automática

---

## 3. Arquitectura y flujo de datos

```
┌─────────────┐     POST /api/invgate/kb-create     ┌──────────────┐
│  Portal MDA │ ───────────────────────────────────► │   InvGate    │
│  (Astro)    │                                     │  KB API      │
│             │ ◄──────── { article_id, status } ─── │              │
└─────────────┘                                     └──────────────┘
        │                                                  │
        │ GET /api/invgate/kb-articles                    │
        ▼                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  EasyMDE (vanilla JS) en páginas .astro                        │
│  - Toolbar: bold, italic, heading, list, code, link, image     │
│  - Preview side-by-side                                         │
│  - Fullscreen                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo "Crear artículo"
1. Usuario navega a `/base-conocimientos/create`
2. EasyMDE inicializado en `<textarea>` con toolbar + preview
3. Selector de categoría poblado desde `GET /api/invgate/kb-categories`
4. Usuario escribe markdown, ve preview en tiempo real
5. Click "Publicar" → `POST /api/invgate/kb-create` con `{ title, content, category_id }`
6. Proxy valida sesión, llama `POST /kb.articles` a **InvGate QA** con `author_id = usuario actual`
7. InvGate devuelve `{ article_id, status: "OK" }`
8. Redirect a `/base-conocimientos/[article_id]` con toast success

### Flujo "Editar artículo"
1. Usuario navega a `/base-conocimientos/edit/[id]`
2. `GET /api/invgate/kb-article?id=[id]` → obtiene `{ title, content, category_id }`
3. EasyMDE precargado con `content`
4. Usuario edita → "Guardar cambios" → `PUT /api/invgate/kb-update?id=[id]`
5. Redirect a vista con toast

### Flujo "Ver artículo"
1. `/base-conocimientos/[id]` → `GET /api/invgate/kb-article?id=[id]`
2. Renderiza `title` + `marked.parse(content)` en layout estándar

### Flujo "Listado"
1. `/base-conocimientos` → `GET /api/invgate/kb-articles?page=1&page_size=50` (offset pagination)
2. DataTable con columnas: Título, Categoría, Autor, Fecha, Acciones (Ver/Editar)

---

## 4. Rutas y páginas

| Ruta | Método | Descripción | Permiso |
|------|--------|-------------|---------|
| `/base-conocimientos` | GET | Listado paginado (DataTable) | `agent`+ (read) |
| `/base-conocimientos/create` | GET | Formulario editor vacío | `team_leader`+ (write) |
| `/base-conocimientos/create` | POST | Proxy create → InvGate | `team_leader`+ |
| `/base-conocimientos/[id]` | GET | Vista renderizada del artículo | `agent`+ |
| `/base-conocimientos/edit/[id]` | GET | Formulario editor precargado | `team_leader`+ |
| `/base-conocimientos/edit/[id]` | POST | Proxy update → InvGate | `team_leader`+ |

### Estructura de archivos
```
src/pages/
├── base-conocimientos/
│   ├── index.astro                    # Listado (server:defer + skeleton)
│   ├── create.astro                   # Editor crear
│   ├── [id].astro                     # Vista artículo
│   └── edit/
│       └── [id].astro                 # Editor editar
src/pages/api/invgate/
├── kb-create.ts                       # POST create
├── kb-update.ts                       # PUT update
├── kb-article.ts                      # GET single (query ?id=)
├── kb-articles.ts                     # GET list (query ?page=&page_size=)
└── kb-categories.ts                   # GET categories
src/components/base-conocimientos/
├── KbEditor.astro                     # Componente compartido EasyMDE
├── KbListContent.astro                # DataTable + skeleton
├── KbViewContent.astro                # Vista renderizada
└── KbListSkeleton.astro               # Skeleton
src/lib/invgateClient.ts               # + invgatePost, invgatePut
src/lib/navigation.ts                  # + registro sección "base-conocimientos"
src/db/schema.ts                       # (sin cambios — no hay tabla local)
```

---

## 5. API Routes (Proxy InvGate)

Todas las rutas usan las variables de entorno `INVGATE_QA_*` (QA) o `INVGATE_*` (prod) según configuración. El cliente `invgateClient.ts` expone `invgatePost` / `invgatePut` que leen la base URL y credenciales del entorno activo.

### `POST /api/invgate/kb-create`
```typescript
// Body: { title: string, content: string, category_id: number }
// Response: { article_id: number } | { error: string }
```
- Valida sesión + permiso write (`getModulePermissions("base-conocimientos", role).canWrite`)
- Llama `invgatePost("kb.articles", { title, content, category_id, author_id: user.id })` a **InvGate QA**
- Log de auditoría: `logAdminAction(user, "creó artículo KB #${article_id} en InvGate QA")`

### `PUT /api/invgate/kb-update`
```typescript
// Query: ?id=123
// Body: { title?, content?, category_id? }
// Response: { status: "OK" } | { error: string }
```
- Valida sesión + permiso write
- Llama `invgatePut("kb.articles", { id, title, content, category_id, author_id: user.id })` a **InvGate QA**
- Log de auditoría

### `GET /api/invgate/kb-article?id=123`
- Retorna artículo individual para editar/ver

### `GET /api/invgate/kb-articles?page=1&page_size=50`
- Lista paginada para DataTable (offset pagination)

### `GET /api/invgate/kb-categories`
- Array de `{ id, name }` para selector

---

## 6. Componentes UI

### `KbEditor.astro` (componente compartido)
```astro
---
// Props: initialContent?, initialTitle?, initialCategoryId?, categories[], actionUrl, method="POST", submitLabel
---
<FormField label="Título" name="title" value={initialTitle} required />
<SelectField name="category_id" options={categories} value={initialCategoryId} required />
<textarea id="kb-editor" name="content">{initialContent}</textarea>
<script>
  import EasyMDE from "easymde";
  import "easymde/dist/easymde.min.css";
  const easyMDE = new EasyMDE({
    element: document.getElementById("kb-editor"),
    toolbar: ["bold", "italic", "heading", "|", "code", "quote", "unordered-list", "ordered-list", "|", "link", "image", "|", "preview", "side-by-side", "fullscreen"],
    spellChecker: false,
    status: ["lines", "words", "cursor"],
  });
  // Botón "image" = placeholder; subida real de imágenes se hará en editor nativo InvGate (fase 2)
</script>
```

### `KbViewContent.astro`
```astro
---
// Props: article { title, content, category, author, created_at }
import { marked } from "marked";
---
<article class="prose prose-invert max-w-none">
  <h1>{article.title}</h1>
  <div class="text-sm text-base-content/60 mb-4">
    Categoría: {article.category} · Autor: {article.author} · {formatDate(article.created_at)}
  </div>
  <div class="prose-content" set:html={marked.parse(article.content)} />
</article>
```

---

## 7. Dependencias nuevas

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `easymde` | `^2.18.0` | Editor markdown vanilla JS |
| `marked` | `^14.0.0` | Markdown → HTML sanitizado |

**Nota:** EasyMDE incluye CodeMirror 5. Se carga via `<script>` en el componente Astro, sin necesidad de isla React.

---

## 8. RBAC y permisos

| Acción | Módulo | Roles permitidos |
|--------|--------|------------------|
| Ver listado | `base-conocimientos` | `agent`, `referent`, `team_leader`, `supervisor`, `admin` |
| Ver artículo | `base-conocimientos` | `agent`+ |
| Crear artículo | `base-conocimientos` | `team_leader`, `supervisor`, `admin` |
| Editar artículo | `base-conocimientos` | `team_leader`, `supervisor`, `admin` |

En `src/lib/rbac.ts` → `modulePermissions["base-conocimientos"]`:
```typescript
"base-conocimientos": {
  canRead: ["agent", "referent", "team_leader", "supervisor", "admin"],
  canWrite: ["team_leader", "supervisor", "admin"],
}
```

En `src/lib/rbac.ts` → `routePermissions`:
```typescript
"/base-conocimientos/create": ["team_leader", "supervisor", "admin"],
"/base-conocimientos/edit/**": ["team_leader", "supervisor", "admin"],
```

---

## 9. Auditoría

Toda mutación (create/update) invoca:
```typescript
import { logAdminFromAstro } from "@lib/auditLogger";
await logAdminFromAstro(Astro.locals, `creó/actualizó artículo KB #${id} en InvGate`);
```

---

## 10. Manejo de errores

| Escenario | Respuesta |
|-----------|-----------|
| InvGate 401/403 | Toast error "Sesión InvGate expirada" + log |
| InvGate 428 (precondition) | Toast error "Parámetros inválidos" + log |
| InvGate 5xx | Toast error "Error en InvGate, reintente" + log |
| Validación local falla | Toast error + no envía a InvGate |
| Red falla | Toast error "Error de red" |

Usar helpers `@lib/api/toastResponse` y `redirectWithToast`.

---

## 11. Navegación y UI global

- Registro en `src/lib/navigation.ts` → **nueva sección "Base de Conocimientos"** en sidebar
- Ícono: `boxicons:book-library-filled`
- Command Palette (Ctrl+K) → entradas "Nuevo artículo KB", "Ver base de conocimientos"
- DataTable con búsqueda client-side (`@lib/clientSearch`)

---

## 12. Testing (E2E Playwright)

| Test | Descripción |
|------|-------------|
| `kb-list-loads` | Listado carga y muestra artículos desde InvGate |
| `kb-create-flow` | Login team_leader → create → editor → publish → redirect a vista |
| `kb-edit-flow` | Login team_leader → edit existente → save → cambios reflejados |
| `kb-view-render` | Artículo renderiza markdown correctamente (headings, lists, code) |
| `kb-rbac-block` | Agent no ve botón crear; team_leader sí |

---

## 13. Consideraciones de seguridad

- Sanitización HTML en vista: `marked` con `sanitize: true` (o DOMPurify si se requieren tags extra)
- `author_id` siempre tomado de `locals.user.id` — no del formulario
- Validación Zod en API routes para `title` (1-200 chars), `content` (non-empty), `category_id` (positive int)
- Rate limit básico en proxy (opcional, middleware existente)

---

## 14. Próximos pasos tras aprobación

1. **Spec review** — usuario valida este documento
2. **Writing-plans** — generar plan de implementación detallado
3. **Implementación** — seguir plan paso a paso
4. **Verification** — `npm run build`, `npx playwright test`, `npm run db:push` (sin cambios schema)

---

## 15. Preguntas abiertas / Decisiones pendientes

- [x] **Entorno InvGate**: Usar **QA** (`INVGATE_QA_API_KEY`, `INVGATE_QA_BASE_URL`) para desarrollo/testing; producción usa variables sin sufijo QA
- [x] **Sección en nav**: Nueva sección **"Base de Conocimientos"** en sidebar con ícono `bx-book-content`
- [x] **Límites de caracteres**: Sin límite (InvGate no documenta límite)
- [x] **Imágenes**: Botón "image" en EasyMDE como **placeholder**; subida real en editor nativo InvGate (fase 2)
- [x] **Paginación**: Offset (`page` / `page_size`) — compatible con InvGate KB API

---