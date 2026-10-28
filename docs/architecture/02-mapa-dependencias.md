# 02 — Mapa de dependencias

> Objetivo: mostrar cómo se acoplan hoy los módulos y qué reglas deben reemplazar ese acoplamiento.

## 1. Flujo actual de una request

```
┌──────────────┐
│   Navegador  │
└──────┬───────┘
       │ HTTPS
┌──────▼───────┐
│ Apache :443  │  TLS + proxy
└──────┬───────┘
       │ HTTP 127.0.0.1:4321
┌──────▼───────┐
│ Express      │  static + compression
└──────┬───────┘
       │
┌──────▼───────────────────────────────────────────────┐
│ src/middleware.ts                                    │
│  sesión → rate limit → RBAC de ruta → visibilidad    │
└──────┬───────────────────────────────────────────────┘
       │
       ├──► src/pages/*.astro ─────────────┐
       ├──► src/pages/api/*.ts ────────────┤
       ├──► src/actions/index.ts ──────────┤
       │                                   ▼
       │                          src/lib/* (dominio +
       │                          casos de uso + datos +
       │                          integraciones + UI)
       │                                   │
       │                                   ▼
       │                          src/db/index.ts (Drizzle)
       │                                   │
       └──────────────────────────────► SQLite
```

## 2. Las cuatro vías de acceso a datos

| Vía | Archivos | Qué contiene | Problema |
|---|---|---|---|
| Página/componente SSR | 57 `.astro` importan `@db/index` | Consultas + render | No testeable, acoplado al esquema |
| Endpoint API | 131 archivos | Validación + permisos + consulta | Lógica duplicada |
| Astro Action | `src/actions/index.ts` (864) | Calidad, feedback, automatizaciones | Solo una parte del sistema |
| Script/worker | `scripts/*.ts` | Syncs, seeds, mantenimiento | Sin sesión ni auditoría |

**Consecuencia:** no hay un único lugar donde buscar “qué pasa cuando se crea una oficina” o “quién puede cerrar una automatización”.

## 3. Dependencias entre módulos

| Origen | Destino | Tipo | Evidencia | Riesgo |
|---|---|---|---|---|
| Calidad | InvGate web | Scraping con Playwright | `qualityAiEvaluator.ts:648` → `timelineScraper.ts:181` → `webSession.ts` | 🔴 Runtime, SSO, bloqueo |
| Calidad | Rúbricas estáticas | Archivo `src/config/ai/rubricas-calidad.md` | `ai/rubricsLoader.ts` | 🔴 IA y DB divergen |
| Calidad | Audit parameters (DB) | Lectura | `NewAuditForm`, `actions.saveAudit` | 🟠 Dos fuentes de verdad |
| Disponibilidad | InvGate | Escritura de tickets | `invgate/agsTickets.ts` | 🔴 Sin compensación |
| Disponibilidad | Wise CX | Presencia | `wise-cx-presence.ts` | 🟠 Sin timeout |
| Disponibilidad | Cronograma | `schedules` | `disponibilidad.ts:300-318` | 🟠 Columna inexistente |
| Automatizaciones | InvGate | API + Mosaic | `invgate/automation/*` | 🟠 Acoplamiento fuerte |
| Oficinas | InvGate | Incidentes + links | `officeIncidents.ts`, `officeLinkSync.ts` | 🟠 Nodos hardcodeados |
| Reportes | Fixtures | Datos estáticos | `workflows/service.ts:31`, `helpdesks/service.ts:16-23` | 🔴 Datos falsos |
| Home | Calidad/feedback/audit/AGS | Lectura local | `homeSummaries.ts` | 🟡 Cambios en cascada |
| Admin | Todos | CRUD y permisos | `AdminUsersContent`, `rbac` | 🟡 Por diseño |
| Asistencia | Cronograma | `schedules` + rotación | `attendance.ts` | 🟡 Reglas duplicadas |
| Buscador | LDAP + InvGate | Perfil y estado | `ldap.ts`, `invgate-user.ts` | 🟠 Endpoints abiertos |

## 4. Dependencias internas de `src/lib`

| Carpeta | Archivos | Líneas | Rol |
|---|---:|---:|---|
| `workflow` | 31 | 7.123 | Dominio de automatizaciones |
| `invgate` | 36 | 3.090 | Integración InvGate |
| `categories` | 15 | 2.669 | Métricas y árbol de categorías |
| `calidad` | 9 | 1.762 | Calidad |
| `ai` | 14 | 1.569 | Proveedores IA |
| `inicio` | 10 | 1.498 | Home |
| `autogestion` | 10 | 1.402 | Reglas y métricas AGS |
| `changelog` | 4 | 1.107 | Changelog |
| `deploy` | 6 | 1.154 | Guardas de deploy |
| `workflows` | 8 | 1.082 | Reportes de workflows |
| `offices` | 3 | 698 | Estructura de red |
| `helpdesks` | 6 | 606 | Métricas de mesas |
| `attendance-client` | 5 | 608 | Cliente de asistencia |
| `cronograma` | 3 | 447 | Rotación y payload |

`src/lib` es un “cajón de sastre” con 297 archivos y 1.245 imports desde el resto del código. No tiene reglas de dependencia interna.

## 5. Duplicaciones que generan dependencias ocultas

| Lógica | Implementaciones | Consecuencia |
|---|---|---|
| Cumplimiento de asistencia | `attendance.ts:54-77` y `attendance-client/utils.ts:16-39` | Cálculos distintos entre server y cliente |
| Cola AGS | `disponibilidad.ts:686-702,1154-1160`, `agsQueue.ts:25-34`, `generalCyclicRule.ts:11-21`, `AsignacionContent.astro:137-145` | Orden de asignación divergente |
| Árbol de categorías | `CategoryTreeExplorer.astro`, `CategoryTreeCanvas.tsx`, `reportes/categorias.astro:21-68` | Tres renderers, un solo dato |
| Métricas de categorías | `categories/metrics.ts` y `categories/metrics-engine.ts` (+ dos `CategoryNode`) | Dos definiciones del mismo cálculo |
| Mapeo de oficinas | `officeQueries.getOffices` y `offices.ts` (sin uso) | Copia muerta que se mantiene |
| Incidentes InvGate | `officeIncidents.ts` y `agentsTicketDuplicates.ts` | Chunking/cache duplicados |
| Catálogo de rutas/roles | `navigation.ts`, `profileAccess.ts`, `rbac.ts`, `rolesMatrix.ts`, home | Drift real entre sidebar, permisos y home |

## 6. Puntos de acoplamiento críticos

1. **`src/db/schema.ts` como contrato global.** 60 tablas en un archivo de 1.358 líneas, importado por páginas, componentes, endpoints, Actions y scripts.
2. **`src/lib` sin fronteras.** Cualquier archivo puede importar cualquier otro; no hay `index.ts` por dominio.
3. **`rbac.ts` como única barrera, con checks ad-hoc por endpoint.** La política no vive junto al caso de uso.
4. **`middleware.ts` con lógica de negocio.** Rate limits específicos de KB, login y títulos dentro del middleware.
5. **`navigation.ts` como fuente parcial.** El sidebar se genera desde ahí, pero los permisos y el home no.
6. **Scripts que importan `src/lib`.** Los workers comparten dominio, pero no pasan por validación ni auditoría.

## 7. Regla de dependencia objetivo

```
app/ ──────────────► modules/<x>/index.ts ──────────► server/*
 │                        │                              │
 │                        ├──► server/db                 │
 │                        ├──► server/auth               │
 │                        ├──► server/integrations       │
 │                        └──► shared/*                 │
 │                                                       │
 └──► components/ui, components/shared                   │
                                                          ▼
                                                       shared/*
```

Reglas concretas:

1. `app` nunca importa `*.repository.ts`, `server/db` ni adapters.
2. `modules/<x>` solo importa otro módulo por `index.ts`.
3. `server` no importa `app` ni `modules`.
4. `shared` no importa nada del proyecto.
5. `components/ui` no importa `modules` ni `server`.
6. Solo los repositorios importan el cliente de base de datos.
7. Ningún `page.tsx` ejecuta queries.
8. Los adapters externos se consumen solo desde servicios.

Estas reglas se aplican con `eslint-plugin-boundaries` o `dependency-cruiser` y fallan el build.

## 8. Matriz de dependencias objetivo

| Módulo | Puede depender de | No puede depender de |
|---|---|---|
| `identity-access` | `shared`, `server/auth` | `quality`, `scheduling`, `automations` |
| `org-directory` | `shared`, `server/integrations/invgate` | `quality`, `scheduling` |
| `inventory` | `shared`, `server/integrations/legacy-inventory` | `quality`, `org-directory` (salvo IDs) |
| `people` | `shared`, `server/integrations/{ldap,invgate}` | `quality`, `scheduling` |
| `knowledge-base` | `shared`, `server/storage` | `quality`, `automations` |
| `resource-catalog` | `shared`, `server/storage`, `server/security` | `quality`, `scheduling` |
| `titles` | `shared`, `server/integrations/invgate` (KB) | `quality`, `automations` |
| `helpdesk-catalog` | `shared`, `server/integrations/invgate` | `quality`, `scheduling` |
| `scheduling` | `shared`, `identity-access` (agentes), `org-directory` (opcional) | `quality`, `automations` |
| `attendance` | `shared`, `scheduling` (lectura) | `quality`, `automations` |
| `availability` | `shared`, `scheduling`, `identity-access`, `server/integrations/{invgate,wisecx}` | `quality` |
| `quality` | `shared`, `identity-access`, `scheduling` (agente), `server/integrations/{invgate,wisecx,ai}` | `automations` |
| `automations` | `shared`, `server/integrations/invgate` | `quality`, `attendance` |
| `analytics` | `shared`, read models de otros módulos (solo queries) | escrituras de otros módulos |
| `home` | `shared`, `identity-access`, resúmenes de lectura | escrituras |
| `platform` | `shared`, `server/*` | `modules/*` (salvo auditoría de eventos) |

**Excepción controlada:** `analytics` puede leer tablas de varios dominios, pero solo a través de vistas/read models y sin escribir.
