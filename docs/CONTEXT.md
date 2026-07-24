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

- **Framework:** Astro v6 (output: `server` / SSR) con adaptador `@astrojs/node` standalone
- **Estilos:** Tailwind CSS v4 + DaisyUI v5
- **Tipografia:** `Geist Variable` (UI) y `Geist Mono Variable` (datos tecnicos) via Fontsource
- **Interactividad:** React islands via `@astrojs/react`, iconos con `astro-icon` + `@iconify-json/boxicons`, `theme-change` para toggle de tema
- **Base de datos:** SQLite (`database/mda.db`) con Drizzle ORM + `better-sqlite3`
- **Autenticacion:** Sesion cookie-based (HMAC firmada), middleware en `src/middleware.ts`
- **RBAC:** 5 roles en jerarquia — `agent` < `referent` < `team_leader` < `supervisor` < `admin`
- **Testing E2E:** Playwright (`tests/`), worker 1 serial, requiere dev server en localhost:4321
- **Deploy:** PM2 con 3 procesos (Astro SSR, ping-worker, sync-legacy-inventory)

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

| Role          | Nivel | Acceso tipico                                   |
| ------------- | ----- | ----------------------------------------------- |
| `agent`       | 1     | Operador N1/N2, vistas operativas basicas       |
| `referent`    | 2     | Referente, puede ver mas datos                  |
| `team_leader` | 3     | Lider de equipo, gestion de operadores          |
| `supervisor`  | 4     | Supervisor, paneles de supervision y calidad     |
| `admin`       | 5     | Administracion completa, CRUD y auditoria       |

### Mecanismos de control

- **Middleware:** `src/middleware.ts` — verifica sesion activa via cookie HMAC, adjunta `locals.user` y `locals.role`
- **Rutas protegidas:** Config en `src/lib/rbac.ts` — `routePermissions` y `hasPermission(href, role)`
- **Permisos por modulo:** `src/lib/rolesMatrix.ts` — `isAllowed(feature, role)`: 16 features con read/write/viewAll/viewComments/viewTotals
- **API routes:** `requireWriteAccess(locals)` / `requireReadAccess(locals)` desde `src/lib/rbac-middleware.ts`
- **Template checks:** `can(user.role, "admin")` desde `@lib/roleConfig.ts` o `hasPermission(href, userRole)` desde `@lib/rbac.ts`

---

## Convenciones de codigo obligatorias

Estas reglas deben seguirse en TODA contribucion al codigo. Ignorarlas produce errores conocidos.
Ver `docs/lessons.md` para el historial de errores y sus soluciones.

### 1. URL base — SIEMPRE usar `@lib/baseUrl`

```typescript
import { getCleanBase, getBaseNoSlash } from "@lib/baseUrl"
const cleanBase = getCleanBase()     // con trailing slash: "/mda/"
const baseNoSlash = getBaseNoSlash() // sin trailing slash: "/mda"
```

- `cleanBase` se concatena con `api/...` → `` `${cleanBase}api/oficinas` ``
- `baseNoSlash` se concatena con paths → `` `${baseNoSlash}/oficinas` ``
- **NUNCA** hacer `const base = import.meta.env.BASE_URL || "/"` inline
- **NUNCA** hardcodear paths como `/api/...` sin anteponer `cleanBase`

### 2. Resolucion de URLs — `@lib/url.ts`

```typescript
import { resolveUrl } from "@lib/url"
resolveUrl("/oficinas") // → "/mda/oficinas"
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
import { getResolvedPathname, getResolvedSearchParams } from "@lib/navigation"
const resolvedPath = getResolvedPathname(Astro.request, Astro.url)
const resolvedParams = getResolvedSearchParams(Astro.request, Astro.url)
```

### 4. Toast system

Los toasts se comunican via query params en redirects del servidor:

```
?toast_msg=Operacion+exitosa&toast_type=success
```

`toast_type` admite: `success`, `error`, `warning`, `info`.

En API routes, usar helpers de `@lib/api/`:
```typescript
import { toastResponse } from "@lib/api/toastResponse"
import { redirectWithToast } from "@lib/api/redirectWithToast"
```

En cliente:
```typescript
import { showToast } from "@lib/toastClient"
showToast("Mensaje", "success")
```

### 5. Auditoria en CRUDs

Toda mutation admin DEBE llamar a `logAdminAction()` o `logAdminFromAstro()`:

```typescript
import { logAdminAction, logAdminFromAstro } from "@lib/auditLogger"
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

| # | Ruta                        | Descripcion                                              |
| - | --------------------------- | -------------------------------------------------------- |
| 1 | `/`                         | Dashboard principal con acceso rapido por rol            |
| 2 | `/titulos`                  | Tipificacion de tickets con copia rapida                 |
| 3 | `/mesas-de-ayuda`           | Matriz de derivacion por tema y area de soporte          |
| 4 | `/buscador-usuarios`        | Busqueda de personal y validacion de usuarios            |
| 5 | `/generador-firmas`         | Creador de firmas institucionales                        |
| 6 | `/contactos`                | Directorio de numeros y correos utiles                   |
| 7 | `/recursos`                 | Hub de accesos a recursos externos e internos            |
| 8 | `/recursos/aplicativos`     | Catalogo de aplicativos con descargas                    |
| 9 | `/oficinas`                 | Directorio de oficinas, activos de red y datos tecnicos  |
| 10 | `/inventario-terminales`    | Consulta y estado del parque de terminales               |

### Supervision (sub-rutas)

| Ruta                                   | Descripcion                                     |
| -------------------------------------- | ----------------------------------------------- |
| `/supervision`                         | Redirecciona al dashboard                       |
| `/supervision/cronograma`              | Gestion de cronograma y horarios                |
| `/supervision/asistencia`              | Control de asistencia y cumplimiento            |
| `/supervision/asignacion-autogestiones` | Asignacion Round-Robin de autogestiones        |
| `/supervision/calidad-operadores`      | Auditoria y puntuacion de calidad               |

### Administracion (sub-rutas)

| Ruta                       | Descripcion                               |
| -------------------------- | ----------------------------------------- |
| `/admin`                   | Dashboard admin con resumen de sistema    |
| `/admin/usuarios`          | CRUD de usuarios del sistema              |
| `/admin/contactos`         | CRUD de contactos y categorias            |
| `/admin/recursos`          | CRUD de enlaces y categorias              |
| `/admin/auditoria`         | Logs de auditoria                         |
| `/admin/operadores`        | CRUD de operadores N1/N2                  |
| `/admin/aplicativos`       | CRUD de aplicativos del catalogo          |
| `/admin/invgate/ubicaciones` | Mapeo de ubicaciones InvGate            |
| `/admin/feedback`          | Formulario de feedback                    |

### Otras rutas

| Ruta        | Descripcion                   |
| ----------- | ----------------------------- |
| `/login`    | Inicio de sesion              |
| `/logout`   | Cierre de sesion              |
| `/profile`  | Perfil de usuario             |

---

## Estado actual del Header

| Aspecto                          | Objetivo                                                                    | Estado actual                                | Gap        |
| -------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | ---------- |
| Rol estructural                  | Header critico para orientacion global y quick actions                      | Barra global unificada                       | Cerrado    |
| Comportamiento base              | Sticky, delgado y minimamente invasivo                                      | Sticky + responsive activo                   | Cerrado    |
| Zona izquierda                   | Nombre dinamico de ruta; oculto en mobile                                   | Titulo dinamico, oculto en mobile            | Cerrado    |
| Zona derecha A (busqueda)        | Command palette con atajo Ctrl+K                                            | Modal operativo con Ctrl+K                   | Cerrado    |
| Zona derecha B (preferencias)    | Toggle dark/light con icono dinamico                                        | Swap icon con persistencia                   | Cerrado    |
| Zona derecha C (alertas/sistema) | Dialogo "Acerca del proyecto" con version y autores                         | Modal implementado                           | Cerrado    |
| Jerarquia visual                 | Botones ghost, divisores, tokens semanticos light/dark                      | Estructura limpia con tokens                 | Cerrado    |

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

| Proceso               | Puerto | Descripcion                                          |
| --------------------- | ------ | ---------------------------------------------------- |
| Astro SSR             | 4321   | Servidor principal (node dist/server/entry.mjs)      |
| ping-worker           | —      | ICMP ping segmentado a cubics (batch 5→3, 3min gap)  |
| sync-legacy-inventory | —      | Sincroniza inventario de terminales desde PHP externo |

### Scripts clave (`scripts/`)

| Script                              | Descripcion                                          |
| ----------------------------------- | ---------------------------------------------------- |
| `auto-deploy.bat`                   | git pull → npm install → build → pm2 restart         |
| `backup-db.bat`                     | Copia `database/mda.db` con timestamp                |
| `ping-worker.ts`                    | Worker PM2 de ping a cubics                          |
| `sync-legacy-inventory.ts`          | Worker PM2 de sincronizacion de inventario           |
| `sync-users.ts`                     | Sincronizacion de empleados via MidPoint             |
| `toggle-mode.ts`                    | Script de alternancia de tema light/dark             |

### Base de datos

- Motor: SQLite, archivo `database/mda.db` (gitignored)
- ORM: Drizzle ORM con `drizzle-kit` para push/studio
- Schema: `src/db/schema.ts` — tablas, relaciones, tipos
- Config: `drizzle.config.ts` (sqlite dialect, schema `./src/db/schema.ts`, out `./drizzle`)
- Conexion: `src/db/index.ts` via `better-sqlite3`
- Despues de cambios de schema, ejecutar `npm run db:push`
- Para explorar datos: `npm run db:studio`
---

## Estado del proyecto

- Las vistas operativas principales estan implementadas y funcionales en produccion.
- Sistema de autenticacion con RBAC activo y middleware de sesion.
- Base de datos SQLite con Drizzle ORM conectada y operativa.
- Contrato del Header global completamente implementado y cerrado (sin gaps).
- Infraestructura PM2 con 3 procesos activa en produccion.
- Testing E2E con Playwright disponible para validacion regresiva.
- Convenciones de codigo documentadas en este archivo y en `docs/DESIGN.md`.
- Errores historicos y sus soluciones registrados en `docs/lessons.md`.
