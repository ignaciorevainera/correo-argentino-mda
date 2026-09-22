# CONTEXT

## Producto

Portal de la Mesa de Ayuda

## Descripcion

Portal interno para soporte corporativo logistico y postal de Correo Argentino.
Centraliza herramientas de operacion diaria para reducir tiempos de atencion,
disminuir errores de carga y mejorar la trazabilidad de casos N1/N2.

## Objetivo principal

Centralizar y agilizar tareas de operadores N1/N2 con herramientas para:

- tipificacion de tickets
- busqueda de personal
- monitoreo de terminales
- gestion de carga laboral

## Publico objetivo

Operadores N1 y N2 de mesa de ayuda interna, con foco en soporte corporativo
de operaciones logisticas y postales.

## Stack tecnologico

- **Framework:** Astro v7 (output: `server` / SSR) con adaptador `@astrojs/node` standalone
- **Estilos:** Tailwind CSS v4 + DaisyUI v5
- **Tipografia:** `Geist Variable` (UI) y `Geist Mono Variable` (datos tecnicos) via Fontsource
- **Interactividad:** React islands via `@astrojs/react`, iconos con `astro-icon` + `@iconify-json/boxicons`, `theme-change` para toggle de tema
- **Base de datos:** SQLite (`database/mda.db`) con Drizzle ORM + `better-sqlite3`
- **Autenticacion:** Sesion cookie-based (HMAC firmada), middleware en `src/middleware.ts`
- **RBAC:** 5 roles en jerarquia — `agent` < `referent` < `team_leader` < `supervisor` < `admin`
- **Testing E2E:** Playwright (`tests/`), worker 1 serial, requiere dev server en localhost:4321
- **Deploy:** PM2 con 5 procesos (Astro SSR, mda-ping-cubics, sync-legacy-inventory, sync-users, sync-office-links)

### Dependencias principales

**Runtime:** `astro`, `tailwindcss`, `daisyui`, `drizzle-orm`, `better-sqlite3`, `@astrojs/node`, `@astrojs/react`, `react`/`react-dom`, `astro-icon`, `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `bcryptjs`, `zod`, `drizzle-zod`, `theme-change`, `leaflet`, `ldapjs`, `csv-parse`, `html-to-image`, `topojson-client`, `ping`

**Dev:** `@playwright/test`, `drizzle-kit`, `typescript`, `@iconify-json/boxicons`, `@types/better-sqlite3`, `@types/react`, `cheerio`, `dotenv`

### Variables de entorno requeridas

```
SESSION_SECRET              — 64-char hex para firmar cookies de sesion
ENCRYPTION_KEY              — 32-char hex para AES-256-GCM de credenciales
INVGATE_API_KEY             — API key de InvGate Service Management
INVGATE_BASE_URL            — URL base de InvGate API
INVGATE_API_USERNAME        — Usuario para autenticacion InvGate
INVGATE_QA_API_KEY          — API key de InvGate QA (test environment)
INVGATE_QA_BASE_URL         — URL base de InvGate QA (servidor separado)
INVGATE_QA_API_USERNAME     — Usuario para autenticacion InvGate QA
WISE_CX_API_KEY             — API key de Wise CX
WISE_CX_BASE_URL            — URL base de Wise CX API
WISE_CX_API_USER            — Usuario para autenticacion Wise CX
EXTERNAL_STORAGE_DIR        — Directorio raiz para archivos subidos (apps, iconos, PDFs)
```

Copiar `.env.example` a `.env` y llenar valores. **Nunca committear `.env`.**

---

## Autenticacion y RBAC

### Roles (jerarquia ascendente)

| Role          | Nivel | Acceso tipico                                |
| ------------- | ----- | -------------------------------------------- |
| `agent`       | 1     | Operador N1/N2, vistas operativas basicas    |
| `referent`    | 2     | Referente, puede ver mas datos               |
| `team_leader` | 3     | Lider de equipo, gestion de operadores       |
| `supervisor`  | 4     | Supervisor, paneles de supervision y calidad |
| `admin`       | 5     | Administracion completa, CRUD y auditoria    |

### Mecanismos de control

- **Middleware:** `src/middleware.ts` — verifica sesion activa via cookie HMAC, adjunta `locals.user` y `locals.role`
- **Rutas protegidas (rol):** `src/lib/rbac.ts` — `routePermissions` (whitelist default-deny, incluye `/_actions`) y `hasPermission(href, role)`
- **Visibilidad por mesa (fuente unica):** `isSectionVisibleSync(helpdeskName, role, href)` en `src/lib/helpdeskAccess.ts` — sincronica, sin capa DB de permisos (el sistema DB routeAccess/moduleAccess fue eliminado). Usada por middleware, sidebar y dashboard. Admin short-circuit a allow.
- **Politica admin:** `/admin/usuarios`, `/admin/usuarios/mesas-de-ayuda`, `/admin/feedback`, `/admin/auditoria` admin-only por whitelist hardcoded. `/admin/permisos` ya no tiene pagina: es un redirect 302 a `/admin/usuarios/mesas-de-ayuda` (sigue en la whitelist admin-only para que el middleware permita resolver el redirect).
- **Mesa obligatoria:** al crear usuario se exige mesa activa; nombre canonico desde `mesas.name`. Mesa inactiva/borrada/desconocida → fail-closed (`resolveSessionMesa`): usuario queda "sin mesa" (solo paginas comunes) hasta reasignacion.
- **Banner de `/admin/usuarios`:** solo se muestra para usuarios con **mesa inactiva** (`mesas.active = false`), fail-closed, con cap de 20 + contador de restantes. Los usuarios sin mesa (`helpdeskId` NULL) o con mesa huerfana NO se listan (siguen fail-closed y visibles en la tabla con su badge).
- **Participaciones:** gating por mesa **canonica**: el selector de participaciones (y el alta/update-user) resuelve la mesa via `LEFT JOIN users→mesas` (`mesas.name`) con fallback al denormalizado `users.helpdeskName` solo si el join no resuelve (usuario huerfano); luego `mesaHasParticipaciones`. Solo mesas en `PARTICIPATION_HELPDESK_NAMES` (hoy MDA TI). El supervisor no figura: `enCronograma` forzado a `false` server-side (`normalizeRole`).
- **Edición de usuario (modal único):** `/admin/usuarios` usa un solo modal "Editar usuario" que postea `action=update-user` y edita en una única transacción síncrona: rol, mesa de ayuda (canónica desde `mesas.name`), `users.username`, `agents.name` y los 4 flags de participación. Renombrar el nombre visible ya no toca `schedules` (B2: el vínculo es por id). La fila `agents` se resuelve por `lower(username)` y se crea si falta (self-heal). Colisiones de `users.username`/`agents.name` se detectan dentro de la tx con mensaje específico. Mesa no participativa ⇒ flags a false; supervisor ⇒ `enCronograma=false`. La contraseña se blanquea con el CTA separado (`reset-password`). Snapshot leído dentro de la tx (sin TOCTOU).
- **Vínculo de horarios 100% por ID:** `schedules.agentId` → `agents.id` → `agents.userId` → `users.id` (FKs nullable, `onDelete: set null`). `schedules.agentName` fue eliminada (Plan B2): el cliente manda `agentId`; el servidor acepta `agentName` solo como clave de resolución contra `agents.name` (nombres únicos) para compatibilidad. Los 4 lectores y todos los writers usan id. El rename de un operador ya no toca `schedules`. La regeneración de meses borra por `agentId`. Los flags de participación son solo visibilidad. `agents` es el **perfil de operador** (puede existir sin usuario de portal, `username` NULL): guarda configuración de horarios, ubicación, notas y capacidades.
  - **Orden de migración en prod (obligatorio antes de que align/`db:push` dropee `agent_name`):** (1) backup, (2) `npx tsx scripts/link-orphan-schedules.mts` dry-run, (3) `--apply` (vincula huérfanos), (4) `npx tsx scripts/align-db-to-schema.mts`, (5) restart PM2. Si se dropea la columna antes de aplicar la reconciliación, los huérfanos quedan invisibles para los lectores id-only. Nunca correr `--apply` sin dry-run revisado.
- **`/admin/usuarios/mesas-de-ayuda`:** gestion de mesas — sync InvGate (CSRF + rate-limit, devuelve `affectedUsers` con banner de reasignacion en `/admin/usuarios`), toggle `Asignable` por mesa (endpoint `POST /api/admin/permisos/mesas/assignable`, auditado) y resumen read-only de visibilidad. El resumen evalua **ambas capas** (`isSectionVisibleSync` ∧ `hasPermission`) para un rol `agent`, asi que refleja el acceso real (p.ej. `/admin` sale ✗ para agentes MDA TI). El endpoint rechaza 400 si se intenta deshabilitar MDA TI.
- **`mesas.assignable`:** curacion manual (separada de `active`, que es el ciclo de vida del sync de InvGate). Solo mesas `active=1 AND (assignable=1 OR name='TI_GSM_MDA TI')` aparecen en el select de mesa al alta/editar usuario; el server re-valida lo mismo. **MDA TI esta exenta**: siempre asignable y no deshabilitable. Tras la migracion queda todo en `false`; `scripts/seed-assignable-mesas.mts` (dry-run por defecto, `--apply` con backup WAL-safe, idempotente) marca `true` las mesas historicamente permitidas (`ALLOWED_HELPDESK_NAMES`).
- **Base de conocimiento:** `/base-conocimiento` ALL_ROLES; el contenido futuro se filtrara por `helpdeskId`. Actualmente **oculta de la UI** (sin sección en el sidebar ni en el resumen de `/admin/usuarios/mesas-de-ayuda`), pero la ruta sigue activa por URL directa. Se volverá a mostrar cuando se agreguen artículos.
- **Tabla descriptiva por rol:** `src/lib/rolesMatrix.ts` — `isAllowed(feature, role)` alimenta la tabla comparativa de `/admin/usuarios` y el gating de UI. **NO es la fuente de verdad**: la matriz real vive en `rbac.ts` (`getModulePermissions` + `routePermissions`) y `helpdeskAccess.ts` (por mesa). Solo modela la capa de rol. `tests/unit/roles-matrix-consistency.test.ts` cubre el anti-drift.
- **API routes:** `requireWriteAccess(locals, module)` / `requireReadAccess(locals, module)` desde `src/lib/rbac-middleware.ts`.
- **Guards puntuales (mas alla del module-level):** `PATCH /api/usuarios/[dni]` y `GET /api/usuarios/ad-groups-licenses` son admin-only; el reorder de aplicativos/recursos/contactos (y sus categorias) exige `team_leader+` (`can(role, "team_leader")` dentro de `handleReorder`, porque `/api/admin` esta en la whitelist ALL_ROLES); `/api/profile/*` esta en la whitelist ALL_ROLES y cada endpoint se auto-guarda (401 sin sesion, p.ej. `change-password`).
- **Template checks:** `can(user.role, "admin")` desde `@lib/roleConfig.ts` o `hasPermission(href, userRole)` desde `@lib/rbac.ts`

---

## Papelera de borrado recuperable

- Toda delete de CRUD admin crea snapshot en `deleted_records` (fila padre; oficinas/cubics además hijos) vía `createDeleteHandler` o `deleteWithSnapshot` (`@lib/deletedRecords.ts`). El snapshot es atómico: si falla, no se borra nada.
- Restauración admin-only en `/admin/papelera`; registry tipado `RESTORE_REGISTRY` — agregar ahí nuevas entidades restaurables. Únicos en conflicto se renombran con sufijo ` (restaurado)`.
- Purga: proceso PM2 `purge-deleted-records` (04:00 diaria, retención 90d, `scripts/purge-deleted.ts`). Los registros restaurados quedan como histórico permanente.
- Entidades nuevas con delete: si usan `createDeleteHandler` el snapshot padre es automático (`genericSnapshot: true` default); para snapshot con hijos usar `deleteWithSnapshot` + `genericSnapshot: false` + entrada en `RESTORE_REGISTRY` si deben ser restaurables.
- Spec: `docs/superpowers/specs/2026-08-28-papelera-deleted-records-design.md`.

---

## Convenciones de codigo obligatorias

Estas reglas deben seguirse en TODA contribucion al codigo. Ignorarlas produce errores conocidos.
Ver `docs/lessons.md` para el historial de errores y sus soluciones.

### 1. URL base — SIEMPRE usar `@lib/baseUrl`

```typescript
import { getCleanBase, getBaseNoSlash } from "@lib/baseUrl";
const cleanBase = getCleanBase(); // con trailing slash: "/mda/"
const baseNoSlash = getBaseNoSlash(); // sin trailing slash: "/mda"
```

- `cleanBase` se concatena con `api/...` → `` `${cleanBase}api/oficinas` ``
- `baseNoSlash` se concatena con paths → `` `${baseNoSlash}/oficinas` ``
- **NUNCA** hacer `const base = import.meta.env.BASE_URL || "/"` inline
- **NUNCA** hardcodear paths como `/api/...` sin anteponer `cleanBase`

### 2. Resolucion de URLs — `@lib/url.ts`

```typescript
import { resolveUrl } from "@lib/url";
resolveUrl("/oficinas"); // → "/mda/oficinas"
```

Pasa URLs absolutas (http, mailto, tel) intactas.

### 3. Server Islands — `server:defer` + skeleton

Toda pagina de listado/contenido usa este patron:

```astro
<DirectorioContent server:defer />
<DirectorioSkeleton slot="fallback" />
```

**Regla critica:** En componentes diferidos, `Astro.url.pathname` y `Astro.url.searchParams` apuntan a `/_server-islands/...` (pierden la URL real). Usar siempre los helpers de `@lib/navigation.ts`:

```typescript
import { getResolvedPathname, getResolvedSearchParams } from "@lib/navigation";
const resolvedPath = getResolvedPathname(Astro.request, Astro.url);
const resolvedParams = getResolvedSearchParams(Astro.request, Astro.url);
```

### 4. Toast system

Los toasts se comunican via query params en redirects del servidor:

```
?toast_msg=Operacion+exitosa&toast_type=success
```

`toast_type` admite: `success`, `error`, `warning`, `info`.

En API routes, usar helpers de `@lib/api/`:

```typescript
import { toastResponse } from "@lib/api/toastResponse";
import { redirectWithToast } from "@lib/api/redirectWithToast";
```

En cliente:

```typescript
import { showToast } from "@lib/toastClient";
showToast("Mensaje", "success");
```

### 5. Auditoria en CRUDs

Toda mutation admin DEBE llamar a `logAdminAction()` o `logAdminFromAstro()`:

```typescript
import { logAdminAction, logAdminFromAstro } from "@lib/auditLogger";
```

Los templates de mensajes estan en `@lib/auditDictionary.ts`.

### 6. Formularios — componentes de `@components/ui/forms/`

Usar siempre: `FormField`, `SelectField`, `FormTextarea`, `PasswordField`.
Cada uno acepta `value`, `placeholder`, `helpText`, `required`, `size`, y opciones de icono.

### 7. DataTable + DataTableHeaderCell

- Para listados operativos: `<DataTable>` con `<DataTableHeaderCell sortKey="...">`
- Ordenamiento client-side: envolver en `<div data-table-sort-root>`
- Filas: `<tr data-table-row data-sort-columna="valor">`
- Ciclo de orden: ascendente → descendente → orden original
- Master-detail: usar `MasterDetailTable` con `data-master-detail-sort-item`

### 8. PageContainer

Toda pagina debe envolver su contenido en `<PageContainer>` para padding consistente.

### 9. Iconos — `size` numerico, nunca clases de dimension

```astro
<Icon name="boxicons:check" size={24} />
```

**NUNCA** usar `w-5 h-5 size-5` u otras clases de dimension en iconos.
Las clases de color, margen, etc. siguen siendo validas.

### 10. Colores — nunca hex hardcodeado

Usar exclusivamente tokens DaisyUI: `primary`, `secondary`, `accent`, `info`, `success`, `warning`, `error`, `neutral`, `base-100`, `base-content`, `base-300`.

Ver paleta completa en `docs/DESIGN.md`.

### 11. Astro scoped styles

Los estilos scoped `<style>` de Astro **no cruzan** la barrera de componentes hijos ni aplican a HTML inyectado dinamicamente. Para estilos que deban alcanzar hijos o markup dinamico, usar `<style is:global>`.

### 12. Estructura de pagina

```
BaseLayout (flex flex-col min-h-screen)
  └── PageContainer
        ├── PageHeader (titulo + descripcion inferidos de navigation.ts)
        └── <contenido de la pagina>
```

`PageHeader` resuelve el titulo automaticamente via `getSectionTitle()` + `getResolvedPathname()`.

### 13. API routes (endpoints en `src/pages/api/`)

- Devolver siempre `jsonResponse(data, status?)` / `jsonError(msg, status?)` desde `@lib/apiResponse`. En produccion envolver errores internos con `sanitizeError(err)` para no filtrar detalles.
- Control de acceso: invocar `requireWriteAccess(locals, "modulo")` / `requireReadAccess(locals, "modulo")` desde `@lib/rbac-middleware`. Retorna `null` si OK, o un `Response` 401/403 si denegado — hacer `return denied` temprano.
- El nombre de modulo (`"cronograma"`, `"asistencia"`, `"usuarios"`, `"asignacion_ag"`, etc.) debe coincidir con `getModulePermissions` en `src/lib/rbac.ts`.
- Toda mutacion debe auditar con `logAdminFromAstro(locals, msg)` (`@lib/auditLogger`).
- Reordenamiento masivo: usar `handleReorder(request, locals, table, auditMsg)` desde `@lib/reorderHandler` (ya hace transaccion + auditoria).
- Escrituras batch: envolver en `db.transaction(tx => { ... })` de Drizzle. Validar siempre el body antes de tocar la DB.

---

## Sistema de diseno y UX aprobado

### Tipografia y legibilidad

- UI operativa: `Geist Variable` como `--font-sans`
- Datos tecnicos (IPs, rutas, IDs): `Geist Mono Variable` como `--font-mono`
- Carga: Fontsource importado en `BaseLayout.astro`, preload de variantes latinas woff2

### Tema y color

- Soporte nativo claro/oscuro con selector global y persistencia (`theme-change`)
- Acentos institucionales: amarillo (`primary` / school-bus-yellow) y azul (`secondary` / steel-azure)
- Estados semanticos consistentes: info, success, warning, error

### Interaccion operativa

- Botones de copia rapida al portapapeles con feedback inmediato (`CopyButton`)
- Interacciones de baja friccion, sin ruido visual ni animaciones pesadas
- Navegacion orientada a resolver tareas en pocos clics

### Lenguaje de interfaz

- Idioma principal: espanol
- Estilo de escritura: sentence case para titulos y textos de UI
- Rutas: kebab-case sin tildes

---

## Sitemap funcional (actual)

### Vistas operativas

| #   | Ruta                     | Descripcion                                             |
| --- | ------------------------ | ------------------------------------------------------- |
| 1   | `/`                      | Dashboard principal con acceso rapido por rol           |
| 2   | `/titulos`               | Tipificacion de tickets con copia rapida                |
| 3   | `/mesas-de-ayuda`        | Matriz de derivacion por tema y area de soporte         |
| 4   | `/buscador-usuarios`     | Busqueda de personal y validacion de usuarios           |
| 5   | `/generador-firmas`      | Creador de firmas institucionales                       |
| 6   | `/contactos`             | Directorio de numeros y correos utiles                  |
| 7   | `/recursos`              | Hub de accesos a recursos externos e internos           |
| 8   | `/recursos/aplicativos`  | Catalogo de aplicativos con descargas                   |
| 9   | `/oficinas`              | Directorio de oficinas, activos de red y datos tecnicos |
| 10  | `/inventario-terminales` | Consulta y estado del parque de terminales              |

### Supervision (sub-rutas)

| Ruta                                    | Descripcion                             |
| --------------------------------------- | --------------------------------------- |
| `/supervision`                          | Redirecciona al dashboard               |
| `/supervision/cronograma`               | Gestion de cronograma, horarios y ubicaciones |
| `/supervision/asistencia`               | Control de asistencia y cumplimiento    |
| `/supervision/asignacion-autogestiones` | Asignacion Round-Robin de autogestiones |
| `/supervision/calidad-operadores`       | Auditoria y puntuacion de calidad       |

### Administracion (sub-rutas)

| Ruta                         | Descripcion                            |
| ---------------------------- | -------------------------------------- |
| `/admin`                     | Dashboard admin con resumen de sistema |
| `/admin/usuarios`            | CRUD de usuarios + participaciones (enCronograma, asignableCubic, incluidoCalidad, asignableAgs) |
| `/admin/contactos`           | CRUD de contactos y categorias         |
| `/admin/recursos`            | CRUD de enlaces y categorias           |
| `/admin/auditoria`           | Logs de auditoria                      |
| `/admin/aplicativos`         | CRUD de aplicativos del catalogo       |
| `/admin/invgate/ubicaciones` | Mapeo de ubicaciones InvGate           |
| `/admin/usuarios/mesas-de-ayuda` | Mesas: sync InvGate + toggle asignable + resumen read-only de visibilidad |
| `/admin/permisos`            | Redirect 302 a `/admin/usuarios/mesas-de-ayuda` |
| `/admin/feedback`            | Formulario de feedback                 |

### Otras rutas

| Ruta       | Descripcion       |
| ---------- | ----------------- |
| `/login`   | Inicio de sesion  |
| `/logout`  | Cierre de sesion  |
| `/profile` | Perfil de usuario |
| `/base-conocimiento` | Base de conocimiento por mesa (ALL_ROLES). Oculta de la UI por ahora; ruta activa por URL directa |

---

## Estado actual del Header

| Aspecto                          | Objetivo                                               | Estado actual                     | Gap     |
| -------------------------------- | ------------------------------------------------------ | --------------------------------- | ------- |
| Rol estructural                  | Header critico para orientacion global y quick actions | Barra global unificada            | Cerrado |
| Comportamiento base              | Sticky, delgado y minimamente invasivo                 | Sticky + responsive activo        | Cerrado |
| Zona izquierda                   | Nombre dinamico de ruta; oculto en mobile              | Titulo dinamico, oculto en mobile | Cerrado |
| Zona derecha A (busqueda)        | Command palette con atajo Ctrl+K                       | Modal operativo con Ctrl+K        | Cerrado |
| Zona derecha B (preferencias)    | Toggle dark/light con icono dinamico                   | Swap icon con persistencia        | Cerrado |
| Zona derecha C (alertas/sistema) | Dialogo "Acerca del proyecto" con version y autores    | Modal implementado                | Cerrado |
| Jerarquia visual                 | Botones ghost, divisores, tokens semanticos light/dark | Estructura limpia con tokens      | Cerrado |

---

## Reglas de intervencion

1. Mantener consistencia modular visual en contenedores, tarjetas y limpieza de interfaz.
2. Si se agrega una ruta o vista nueva, registrarla en `@lib/navigation.ts` para propagacion automatica a sidebar, header y command palette.
3. Componentes nuevos deben usar tokens semanticos de color (DaisyUI), nunca hex hardcodeado.
4. Toda pantalla de gestion CRUD debe invocar `logAdminAction()` / `logAdminFromAstro()` (`@lib/auditLogger`).
5. En paginas con contenido diferido, usar `server:defer` + skeleton + helpers de `@lib/navigation.ts` para resolver pathname/searchParams.
6. Construir URLs internas siempre con `getCleanBase()` + path relativo, nunca con literales `/api/...`.
7. Usar icónos siempre con `size={24}` numerico, nunca clases de dimension.

---

## Infraestructura y operacion

### PM2 Ecosystem (`ecosystem.config.cjs`)

| Proceso               | Puerto | Descripcion                                           |
| --------------------- | ------ | ----------------------------------------------------- |
| Astro SSR             | 4321   | Servidor principal (node dist/server/entry.mjs)       |
| mda-ping-cubics       | —      | ICMP ping segmentado a cubics (batch 5→3, 3min gap)   |
| sync-legacy-inventory | —      | Sincroniza inventario de terminales desde PHP externo |
| sync-users            | —      | Sincronizacion de empleados via MidPoint (cron 02:00) |
| sync-office-links     | —      | Sincronizacion de enlaces de oficinas (cron 03:00)    |

### Scripts clave (`scripts/`)

| Script                     | Descripcion                                               |
| -------------------------- | --------------------------------------------------------- |
| `auto-deploy.bat`          | git pull → pm2 kill → npm install → build (verify) → pm2 start |
| `backup-db.bat`            | Copia `database/mda.db` con timestamp                     |
| `verify-build.mjs`         | Guard post-build: valida `rootDir` en `dist/server/entry.mjs` |
| `ping-worker.ts`           | Worker PM2 de ping a cubics                               |
| `sync-legacy-inventory.ts` | Worker PM2 de sincronizacion de inventario                |
| `sync-users.ts`            | Sincronizacion de empleados via MidPoint                  |
| `toggle-mode.ts`           | Script de alternancia de tema light/dark                  |

### Base de datos

- Motor: SQLite, archivo `database/mda.db` (gitignored)
- ORM: Drizzle ORM con `drizzle-kit` para push/studio
- Schema: `src/db/schema.ts` — tablas, relaciones, tipos
- Config: `drizzle.config.ts` (sqlite dialect, schema `./src/db/schema.ts`, out `./drizzle`)
- Conexion: `src/db/index.ts` via `better-sqlite3`
- Despues de cambios de schema, ejecutar `npm run db:push`
- Deploy en prod: correr `scripts/align-db-to-schema.mts` (hace backup) antes del restart de PM2; `drizzle-kit push` debe quedar limpio ("No changes detected")
- Las tablas de permisos DB (routes, modules, route_access, module_access, permission_audit_batches) fueron eliminadas de schema y DB
- Para explorar datos: `npm run db:studio`

---

## Estado del proyecto

- Las vistas operativas principales estan implementadas y funcionales en produccion.
- Sistema de autenticacion con RBAC activo y middleware de sesion.
- Base de datos SQLite con Drizzle ORM conectada y operativa.
- Contrato del Header global completamente implementado y cerrado (sin gaps).
- Infraestructura PM2 con 5 procesos activa en produccion.
- Testing E2E con Playwright disponible para validacion regresiva.
- Convenciones de codigo documentadas en este archivo y en `docs/DESIGN.md`.
- Errores historicos y sus soluciones registrados en `docs/lessons.md`.
