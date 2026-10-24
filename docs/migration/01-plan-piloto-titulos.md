# 01 — Plan del piloto: Títulos

> Piloto aprobado. Objetivo: validar el vertical completo (ruta → UI → servicio → repositorio → datos → tests) antes de escalar al resto de los módulos.

## 1. Por qué Títulos

| Criterio | Evaluación |
|---|---|
| Complejidad de dominio | Baja: 3 tablas, sin reglas de negocio complejas |
| Dependencias externas | Solo lectura de KB de InvGate (opcional) |
| Escrituras externas | Ninguna |
| Uso | Alto: consulta y copia diaria de títulos |
| Cobertura funcional | Listado, búsqueda, filtros, favoritos, CRUD, import/export |
| Valor de aprendizaje | Auth, RBAC, validación, paginación, CSV, auditoría, UI |
| Riesgo | Bajo |

## 2. Alcance

### Incluido

- Listado de títulos con búsqueda, filtro por categoría y orden.
- Copia de título al portapapeles.
- Favoritos por usuario.
- CRUD de títulos (`team_leader+`).
- CRUD de categorías (`team_leader+`).
- Import/export CSV.
- Matching con artículo de KB (solo lectura, opcional).
- Migración de datos existentes.
- Tests unitarios, de integración y E2E.

### Excluido

- Enriquecimiento masivo de títulos (`enrich-titles.mts`).
- Normalización histórica masiva (`normalize-titles.mts`).
- Cambios en el proceso de negocio de tipificación.
- Rediseño visual más allá del design system.
- SSO.

## 3. Comportamiento actual verificado

| Aspecto | Implementación | Evidencia |
|---|---|---|
| Listado | `GET /api/titulos` devuelve todos, sin paginación | `src/pages/api/titulos/index.ts:8-27` |
| Búsqueda | Client-side sobre el array | `src/hooks/useTitlesHook.tsx:41-43` |
| Filtro | Client-side por categoría | `useTitlesHook.tsx:43` |
| Favoritos | `GET/POST/DELETE /api/titulos/favoritos` | `useTitlesHook.tsx:206-283` |
| Alta | `POST`, spread de body, sin Zod | `api/titulos/index.ts:29-61` |
| Edición | `PUT`, spread de body, sin Zod | `api/titulos/[id].ts:10-42` |
| Borrado | Papelera + auditoría, sin validar id | `api/titulos/[id].ts:44-89` |
| Import/export | Modal + endpoints CSV | `TitlesImportExportModal.tsx`, `api/titulos/import.ts`, `export.csv.ts` |
| Permisos | `getModulePermissions("titulos")`; write `team_leader+` | `rbac.ts:286-289` |
| Categorías | Tabla `title_category` con icono y tono | `schema.ts` |
| KB | `articleOnKdb`, `articleOnKdbTitle`, `kbMatchScore` | `schema.ts` |

### Problemas que el piloto debe resolver

1. Mass assignment: `set({...body})`.
2. Falta de Zod y de límites de longitud.
3. `console.log` con sesión.
4. DELETE sin validar `id`.
5. GET sin `requireReadAccess`.
6. Sin paginación.
7. Sin E2E.
8. Favoritos con estado local optimista sin reconciliación clara.

## 4. Modelo objetivo

### 4.1 Tablas

```sql
title_category (
  id           serial primary key,
  name         varchar(120) not null unique,
  icon         varchar(80)  not null,
  tone         varchar(40)  not null
)

titles (
  id                 serial primary key,
  name               varchar(300) not null,
  category_id        int not null references title_category(id),
  route              varchar(300),
  description        text,
  article_on_kdb     varchar(40),
  article_on_kdb_title varchar(300),
  kb_match_score     numeric(4,3),
  enriched_cases     int,
  enriched_at        timestamptz,
  deprecated         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         int references users(id),
  updated_by         int references users(id)
)

title_favorites (
  user_id    int not null references users(id) on delete cascade,
  title_id   int not null references titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
)
```

Índices:

- `titles(name)` para búsqueda.
- `titles(category_id)`.
- `titles(deprecated)` si se filtra.
- `title_favorites(title_id)`.

### 4.2 Reglas

1. `name` no vacío, ≤300, normalizado con `formatTitleName`.
2. `categoryId` debe existir.
3. `deprecated` solo editable por `team_leader+`.
4. `articleOnKdb` y `kbMatchScore` son de solo lectura para la UI; los escribe el proceso de enriquecimiento.
5. Un título no se borra físicamente si está referenciado por favoritos; se puede borrar en cascada o soft delete.
6. La papelera conserva el snapshot.

## 5. Archivos objetivo

```
src/modules/titles/
├─ titles.schema.ts
├─ titles.types.ts
├─ titles.policy.ts
├─ titles.repository.ts
├─ titles.queries.ts
├─ titles.service.ts
├─ components/
│  ├─ TitlesPage.tsx
│  ├─ TitlesTable.tsx
│  ├─ TitleCard.tsx
│  ├─ TitleForm.tsx
│  ├─ TitleDrawer.tsx
│  ├─ FavoritesToggle.tsx
│  └─ ImportExportModal.tsx
├─ categories/
│  ├─ categories.repository.ts
│  ├─ categories.service.ts
│  └─ CategoriesModal.tsx
└─ index.ts

src/app/(portal)/titulos/
├─ page.tsx
├─ actions.ts
└─ loading.tsx

src/app/api/titulos/
├─ export/route.ts
└─ import/route.ts
```

## 6. Contratos

### 6.1 Schemas

```ts
export const titleIdSchema = z.coerce.number().int().positive();

export const createTitleSchema = z.object({
  name: z.string().trim().min(1).max(300),
  categoryId: z.coerce.number().int().positive(),
  route: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const updateTitleSchema = createTitleSchema.partial().extend({
  id: titleIdSchema,
  deprecated: z.boolean().optional(),
});

export const listTitlesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  favorite: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
```

### 6.2 Servicios

```ts
listTitles(filters, actor): Promise<Paginated<Title>>
getTitle(id, actor): Promise<Title>
createTitle(input, actor): Promise<Title>
updateTitle(input, actor): Promise<Title>
deleteTitle(id, actor): Promise<void>
toggleFavorite(titleId, actor): Promise<{ favorite: boolean }>
importTitles(file, actor): Promise<ImportReport>
exportTitles(filters, actor): Promise<CsvStream>
```

### 6.3 Políticas

```ts
canReadTitles(actor)  // todos los logueados
canWriteTitles(actor) // team_leader+
```

### 6.4 Acciones

| Acción | Entrada | Salida | Permiso |
|---|---|---|---|
| `createTitle` | `createTitleSchema` | `Title` | `titles.write` |
| `updateTitle` | `updateTitleSchema` | `Title` | `titles.write` |
| `deleteTitle` | `id` | `void` | `titles.write` |
| `toggleFavorite` | `id` | `{ favorite }` | `titles.read` |
| `importTitles` | CSV | `ImportReport` | `titles.write` |

## 7. UI

### 7.1 Estructura

```
TitlesPage
├─ Header (título, contador, botón nuevo)
├─ Toolbar (búsqueda, filtro de categoría, favoritos, import/export)
├─ Grid de TitleCard
├─ Paginación
├─ TitleDrawer (detalle)
├─ TitleForm (crear/editar)
├─ ConfirmDialog (borrar)
└─ ImportExportModal
```

### 7.2 Reglas de UI

- Server Component para el listado inicial.
- Isla client solo para búsqueda, filtros, favoritos y modales.
- Búsqueda con debounce y actualización de URL (`q`, `category`, `page`).
- Estado vacío explícito.
- Loading skeleton.
- Error con reintento.
- Copia con feedback visual y fallback.
- Favoritos optimistas con rollback si falla.

## 8. Migración de datos

| Paso | Acción |
|---|---|
| 1 | Exportar `title_category`, `titles`, `title_favorites` |
| 2 | Validar nombres vacíos, duplicados y categorías huérfanas |
| 3 | Normalizar nombres con `formatTitleName` |
| 4 | Importar categorías primero |
| 5 | Importar títulos |
| 6 | Importar favoritos resolviendo `user_id`/`title_id` |
| 7 | Reconciliar conteos y checksums |
| 8 | Dry-run y luego apply |

Detalle en `02-migracion-datos.md`.

## 9. Pruebas

### 9.1 Unit

- `formatTitleName`.
- `titles.policy`.
- `listTitlesSchema` con entradas inválidas.
- Normalización de CSV.
- Matching KB (si se mantiene en el piloto).

### 9.2 Integración

- `createTitle` persiste y audita.
- `updateTitle` no permite mass assignment.
- `deleteTitle` crea snapshot en papelera.
- `toggleFavorite` es idempotente.
- Paginación y filtros.
- Unique de categoría.

### 9.3 E2E

| Escenario | Rol |
|---|---|
| Listar y buscar | agent |
| Copiar título | agent |
| Favoritear y desfavoritear | agent |
| Crear título | team_leader |
| Editar título | team_leader |
| Borrar título y restaurar | team_leader/admin |
| Importar CSV válido | team_leader |
| Importar CSV inválido | team_leader |
| Exportar CSV | team_leader |
| Acceso denegado a crear | agent |
| CSRF rechazado | todos |
| Búsqueda con `<script>` | todos |

## 10. Criterios de aceptación

1. Paridad funcional con `/titulos`.
2. Listado paginado y filtrable server-side.
3. Búsqueda por nombre, ruta y descripción.
4. Favoritos por usuario persistentes.
5. CRUD con validación Zod y sin mass assignment.
6. CSRF en toda mutación.
7. Auditoría en create/update/delete.
8. Papelera para delete.
9. Sin `any` en fronteras.
10. Sin acceso a DB fuera del repositorio.
11. Tests unit, integración y E2E verdes.
12. Migración reconciliada al 100%.
13. Performance: p95 < 300 ms para listado de 25.
14. Accesibilidad: teclado, foco y labels.

## 11. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| CSV histórico con formatos inconsistentes | Alta | Medio | Perfilado previo y parser tolerante con reporte |
| Duplicados de títulos | Media | Medio | Detección y decisión de negocio |
| Favoritos con usuarios inexistentes | Media | Bajo | Resolver por username; reportar huérfanos |
| Matching KB costoso | Media | Medio | Cache y límite de llamadas |
| Expectativa de “mismo look” | Alta | Bajo | Reutilizar design system y validar con usuarios |
| Dependencia de InvGate para KB | Media | Bajo | Feature flag y degradación |

## 12. Esfuerzo relativo

| Actividad | Esfuerzo |
|---|---|
| Modelo y migración | S |
| Repositorio y servicio | S-M |
| UI y acciones | M |
| Tests | M |
| Migración de datos | S |
| **Total** | **M** |

## 13. Definición de terminado

- Módulo desplegado en ambiente de prueba.
- UAT con 3 usuarios (agent, team_leader, admin).
- Datos reconciliados.
- Sin hallazgos P1 abiertos del piloto.
- Lecciones registradas para el módulo siguiente.
