# 05 — Estructura de carpetas propuesta

> Estructura orientativa para la nueva aplicación. No implica crear carpetas ni mover archivos en esta etapa.

## 1. Árbol

```
.
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ error.tsx
│  │  ├─ not-found.tsx
│  │  ├─ globals.css
│  │  │
│  │  ├─ (public)/
│  │  │  ├─ layout.tsx
│  │  │  ├─ login/page.tsx
│  │  │  ├─ generador-firmas/page.tsx
│  │  │  └─ 404/page.tsx
│  │  │
│  │  ├─ (portal)/
│  │  │  ├─ layout.tsx
│  │  │  ├─ page.tsx                      # Inicio
│  │  │  ├─ titulos/
│  │  │  │  ├─ page.tsx
│  │  │  │  └─ actions.ts
│  │  │  ├─ oficinas/
│  │  │  │  ├─ page.tsx
│  │  │  │  ├─ estructura/page.tsx
│  │  │  │  ├─ estadisticas/page.tsx
│  │  │  │  ├─ estadisticas/[code]/page.tsx
│  │  │  │  ├─ create/page.tsx
│  │  │  │  └─ edit/[id]/page.tsx
│  │  │  ├─ inventario-terminales/
│  │  │  ├─ buscador-usuarios/
│  │  │  ├─ recursos/
│  │  │  │  ├─ page.tsx
│  │  │  │  ├─ aplicativos/page.tsx
│  │  │  │  └─ contactos/page.tsx
│  │  │  ├─ base-conocimiento/
│  │  │  ├─ mesas-de-ayuda/
│  │  │  ├─ automatizaciones/
│  │  │  │  ├─ page.tsx
│  │  │  │  ├─ [id]/page.tsx
│  │  │  │  └─ metricas/page.tsx
│  │  │  ├─ reportes/
│  │  │  ├─ supervision/
│  │  │  │  ├─ cronograma/page.tsx
│  │  │  │  ├─ asistencia/
│  │  │  │  ├─ calidad-operadores/
│  │  │  │  ├─ asignacion-autogestiones/
│  │  │  │  └─ autogestiones-metricas/
│  │  │  ├─ admin/
│  │  │  │  ├─ page.tsx
│  │  │  │  ├─ usuarios/
│  │  │  │  ├─ permisos/
│  │  │  │  ├─ auditoria/
│  │  │  │  ├─ papelera/
│  │  │  │  ├─ feedback/
│  │  │  │  ├─ operadores/
│  │  │  │  ├─ invgate/ubicaciones/
│  │  │  │  └─ oficinas/edificios/
│  │  │  └─ profile/
│  │  │
│  │  └─ api/
│  │     ├─ auth/
│  │     │  ├─ login/route.ts
│  │     │  └─ logout/route.ts
│  │     ├─ exports/
│  │     │  ├─ cronograma/route.ts
│  │     │  ├─ calidad/route.ts
│  │     │  └─ automatizaciones/route.ts
│  │     ├─ integrations/
│  │     │  ├─ invgate/route.ts
│  │     │  └─ webhooks/route.ts
│  │     └─ health/route.ts
│  │
│  ├─ modules/
│  │  ├─ titles/
│  │  │  ├─ titles.schema.ts
│  │  │  ├─ titles.types.ts
│  │  │  ├─ titles.policy.ts
│  │  │  ├─ titles.repository.ts
│  │  │  ├─ titles.queries.ts
│  │  │  ├─ titles.service.ts
│  │  │  ├─ components/
│  │  │  │  ├─ TitlesPage.tsx
│  │  │  │  ├─ TitlesTable.tsx
│  │  │  │  ├─ TitleForm.tsx
│  │  │  │  └─ FavoritesToggle.tsx
│  │  │  └─ index.ts
│  │  │
│  │  ├─ quality/
│  │  │  ├─ quality.schema.ts
│  │  │  ├─ quality.types.ts
│  │  │  ├─ quality.policy.ts
│  │  │  ├─ audits.repository.ts
│  │  │  ├─ parameters.repository.ts
│  │  │  ├─ summaries.repository.ts
│  │  │  ├─ quality.service.ts
│  │  │  ├─ parameters.service.ts
│  │  │  ├─ calibration.service.ts
│  │  │  ├─ ai/
│  │  │  │  ├─ evaluator.ts
│  │  │  │  ├─ council.ts
│  │  │  │  ├─ rubric-loader.ts
│  │  │  │  └─ providers/
│  │  │  ├─ components/
│  │  │  │  ├─ QualityDashboard.tsx
│  │  │  │  ├─ AuditForm/
│  │  │  │  │  ├─ AuditForm.tsx
│  │  │  │  │  ├─ ChannelSection.tsx
│  │  │  │  │  ├─ CriterionRow.tsx
│  │  │  │  │  └─ AiInspectionModal.tsx
│  │  │  │  ├─ CalibrationPanel.tsx
│  │  │  │  └─ OperatorDetails.tsx
│  │  │  └─ index.ts
│  │  │
│  │  ├─ org-directory/
│  │  ├─ inventory/
│  │  ├─ people/
│  │  ├─ knowledge-base/
│  │  ├─ resource-catalog/
│  │  ├─ helpdesk-catalog/
│  │  ├─ scheduling/
│  │  ├─ attendance/
│  │  ├─ availability/
│  │  ├─ automations/
│  │  ├─ analytics/
│  │  ├─ home/
│  │  └─ platform/
│  │
│  ├─ components/
│  │  ├─ ui/                             # shadcn/ui
│  │  │  ├─ button.tsx
│  │  │  ├─ dialog.tsx
│  │  │  ├─ table.tsx
│  │  │  └─ ...
│  │  └─ shared/
│  │     ├─ PageHeader.tsx
│  │     ├─ DataTable.tsx
│  │     ├─ EmptyState.tsx
│  │     ├─ ConfirmDialog.tsx
│  │     ├─ FormShell.tsx
│  │     └─ Toast.tsx
│  │
│  ├─ server/
│  │  ├─ auth/
│  │  │  ├─ session.ts
│  │  │  ├─ password.ts
│  │  │  ├─ provider.ts
│  │  │  ├─ guards.ts
│  │  │  └─ permissions.ts
│  │  ├─ db/
│  │  │  ├─ client.ts
│  │  │  ├─ schema/
│  │  │  └─ migrations/
│  │  ├─ integrations/
│  │  │  ├─ invgate/{client.ts,types.ts,cache.ts}
│  │  │  ├─ wisecx/
│  │  │  ├─ ldap/
│  │  │  ├─ midpoint/
│  │  │  ├─ legacy-inventory/
│  │  │  └─ ai/
│  │  ├─ security/
│  │  │  ├─ csrf.ts
│  │  │  ├─ rate-limit.ts
│  │  │  ├─ headers.ts
│  │  │  └─ encryption.ts
│  │  ├─ http/
│  │  │  ├─ handler.ts
│  │  │  ├─ responses.ts
│  │  │  └─ errors.ts
│  │  ├─ jobs/
│  │  │  ├─ runner.ts
│  │  │  └─ registry.ts
│  │  ├─ storage/
│  │  │  ├─ adapter.ts
│  │  │  └─ local.ts
│  │  └─ observability/
│  │     ├─ logger.ts
│  │     ├─ metrics.ts
│  │     └─ request-context.ts
│  │
│  ├─ shared/
│  │  ├─ types/
│  │  ├─ utils/
│  │  └─ constants/
│  └─ styles/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
│
├─ scripts/
│  ├─ sync-users.ts
│  ├─ sync-inventory.ts
│  ├─ purge-deleted.ts
│  └─ ...
│
├─ docs/
│  ├─ architecture/
│  ├─ migration/
│  ├─ adr/
│  ├─ modules/
│  └─ runbooks/
│
├─ drizzle/                    # o prisma/, según decisión
├─ public/
├─ package.json
├─ pnpm-lock.yaml
├─ next.config.ts
├─ tsconfig.json
├─ eslint.config.mjs
├─ playwright.config.ts
├─ vitest.config.ts
└─ README.md
```

## 2. Responsabilidades

| Carpeta | Responsabilidad | Contiene | No contiene |
|---|---|---|---|
| `src/app` | Composición y HTTP | `page.tsx`, `layout.tsx`, `route.ts`, `actions.ts` | SQL, reglas de negocio, integraciones |
| `src/modules` | Dominio y casos de uso | schema, policy, service, repository, UI del dominio | HTTP, acceso global a DB |
| `src/components/ui` | Primitivas visuales | shadcn/ui | lógica de negocio |
| `src/components/shared` | Patrones reutilizables | PageHeader, DataTable, FormShell | dominio |
| `src/server` | Infraestructura | auth, db, integrations, security, jobs | `app`, `modules` |
| `src/shared` | Utilidades puras | tipos, formatos, constantes | DB, React, Next |
| `tests` | Pruebas | unit, integration, e2e, fixtures | código de producción |
| `scripts` | Automatización | syncs, seeds, mantenimiento | rutas |
| `docs` | Documentación | arquitectura, migración, ADR, runbooks | código |

## 3. Ejemplo de módulo simple: `titles`

### 3.1 Archivos

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
│  ├─ TitleForm.tsx
│  └─ FavoritesToggle.tsx
└─ index.ts
```

### 3.2 Contratos

```ts
// titles.schema.ts
export const createTitleSchema = z.object({
  name: z.string().min(1).max(300),
  categoryId: z.number().int().positive(),
  articleOnKdb: z.string().max(500).optional(),
});

export const listTitlesSchema = z.object({
  q: z.string().max(100).optional(),
  categoryId: z.number().int().positive().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
```

```ts
// titles.policy.ts
export function canReadTitles(actor: Actor) {
  return true;
}

export function canWriteTitles(actor: Actor) {
  return hasRole(actor, "team_leader");
}
```

```ts
// titles.service.ts
export async function createTitle(input: unknown, actor: Actor) {
  if (!canWriteTitles(actor)) throw new AppError("FORBIDDEN");
  const dto = createTitleSchema.parse(input);
  return db.transaction(async (tx) => {
    const title = await titlesRepository.create(tx, dto);
    await audit.record(tx, {
      actorId: actor.id,
      action: "titles.create",
      entity: "title",
      entityId: title.id,
    });
    return title;
  });
}
```

```ts
// titles/index.ts
export { createTitle, updateTitle, deleteTitle, toggleFavorite } from "./titles.service";
export { listTitles } from "./titles.queries";
export { canReadTitles, canWriteTitles } from "./titles.policy";
export type { Title, TitleFilters } from "./titles.types";
```

### 3.3 Ruta

```tsx
// src/app/(portal)/titulos/page.tsx
import { requireSession } from "@/server/auth/guards";
import { canWriteTitles, listTitles, TitlesPage } from "@/modules/titles";

export default async function Page({ searchParams }) {
  const actor = await requireSession();
  const filters = listTitlesSchema.parse(await searchParams);
  const data = await listTitles(filters, actor);
  return <TitlesPage initial={data} canWrite={canWriteTitles(actor)} />;
}
```

## 4. Ejemplo de módulo complejo: `quality`

### 4.1 Archivos

```
src/modules/quality/
├─ quality.schema.ts
├─ quality.types.ts
├─ quality.policy.ts
├─ audits.repository.ts
├─ parameters.repository.ts
├─ summaries.repository.ts
├─ quality.service.ts
├─ parameters.service.ts
├─ calibration.service.ts
├─ ai/
│  ├─ evaluator.ts
│  ├─ council.ts
│  ├─ rubric-loader.ts
│  └─ providers/
├─ components/
│  ├─ QualityDashboard.tsx
│  ├─ AuditForm/
│  │  ├─ AuditForm.tsx
│  │  ├─ ChannelSection.tsx
│  │  ├─ CriterionRow.tsx
│  │  └─ AiInspectionModal.tsx
│  ├─ CalibrationPanel.tsx
│  └─ OperatorDetails.tsx
└─ index.ts
```

### 4.2 Reglas del módulo

1. `AuditForm` no conoce Drizzle: recibe parámetros activos y devuelve un DTO validado.
2. La IA recibe los mismos parámetros que el formulario, desde el repositorio, no desde un archivo estático.
3. `saveAudit` valida suma de pesos, canal, sección y duplicados antes de insertar.
4. `calibration` es un servicio de solo lectura sobre snapshots.
5. Los proveedores de IA están detrás de una interfaz y un feature flag.
6. La descarga de audio valida host, tamaño, tipo y redirects.

### 4.3 Submódulos internos

| Submódulo | Archivos | Responsabilidad |
|---|---|---|
| Auditorías | `audits.repository.ts`, `quality.service.ts` | CRUD y scoring |
| Parámetros | `parameters.repository.ts`, `parameters.service.ts` | Pesos, secciones, canales |
| Resúmenes | `summaries.repository.ts` | Mensuales y coaching |
| Calibración | `calibration.service.ts` | Ground truth vs IA |
| IA | `ai/*` | Evaluación, rúbricas, proveedores |

## 5. Mapa de rutas actual → nueva

| Ruta actual | Segmento nuevo | Módulo |
|---|---|---|
| `/` | `(portal)/page.tsx` | `home` |
| `/titulos` | `(portal)/titulos` | `titles` |
| `/oficinas/**` | `(portal)/oficinas/**` | `org-directory` |
| `/inventario-terminales/**` | `(portal)/inventario-terminales/**` | `inventory` |
| `/buscador-usuarios` | `(portal)/buscador-usuarios` | `people` |
| `/recursos/**` | `(portal)/recursos/**` | `resource-catalog` |
| `/base-conocimiento/**` | `(portal)/base-conocimiento/**` | `knowledge-base` |
| `/mesas-de-ayuda/**` | `(portal)/mesas-de-ayuda/**` | `helpdesk-catalog` |
| `/automatizaciones/**` | `(portal)/automatizaciones/**` | `automations` |
| `/reportes/**` | `(portal)/reportes/**` | `analytics` |
| `/supervision/cronograma` | `(portal)/supervision/cronograma` | `scheduling` |
| `/supervision/asistencia/**` | `(portal)/supervision/asistencia/**` | `attendance` |
| `/supervision/asignacion-autogestiones` | `(portal)/supervision/asignacion-autogestiones` | `availability` |
| `/supervision/calidad-operadores/**` | `(portal)/supervision/calidad-operadores/**` | `quality` |
| `/admin/**` | `(portal)/admin/**` | `platform` + `identity-access` |
| `/profile` | `(portal)/profile` | `identity-access` |
| `/login` | `(public)/login` | `identity-access` |
| `/generador-firmas` | `(public)/generador-firmas` | `platform` |
| `/changelog` | `(portal)/changelog` | `platform` |

## 6. Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Módulo | kebab-case | `org-directory` |
| Archivo de dominio | `<module>.<layer>.ts` | `titles.service.ts` |
| Componente | PascalCase | `TitlesTable.tsx` |
| Hook | `use<Name>` | `useTitleFilters.ts` |
| Schema | `<entity>Schema` | `createTitleSchema` |
| Servicio | verbo + entidad | `createTitle` |
| Repositorio | sustantivo + acción | `titlesRepository.findMany` |
| Política | `can<Action><Entity>` | `canWriteTitles` |
| Error | `<DOMAIN>_<REASON>` | `TITLES_DUPLICATE` |
| Test | `<module>.<layer>.test.ts` | `titles.service.test.ts` |

## 7. Reglas de importación

```
app        → modules/*/index, components/ui, server/http, server/auth/guards, shared
modules/x  → server/{db,auth,security,integrations,storage}, shared, modules/y/index
server     → shared, server/db
shared     → (nada del proyecto)
components/ui → shared/utils
```

Prohibido:

- `app` → `modules/*/*.repository.ts`
- `modules/x` → `modules/y/*` (salvo `index.ts`)
- `server` → `modules/*` o `app/*`
- `components` → `server/db`
- cualquier `page.tsx` → cliente de base de datos
- cualquier `route.ts` → regla de negocio

Estas reglas se aplican con `eslint-plugin-boundaries` y `dependency-cruiser`. El detalle está en `06-convenciones-y-limites.md`.
