# 00 — Estado actual

> Commit auditado: `d9834795` · Fecha: 2026-10-23 · Análisis estático.

## 1. Resumen

El Portal MDA es una aplicación interna de la Mesa de Ayuda de Correo Argentino. Está construida como monolito SSR con Astro, React y SQLite, y corre en producción sobre Windows Server con PM2 y Apache como proxy TLS.

Es un sistema maduro en funcionalidad y inmaduro en límites arquitectónicos: los módulos existen como carpetas, pero no como contratos. La consecuencia principal es que el dominio, el acceso a datos y la presentación están mezclados en páginas, componentes, endpoints, Actions y scripts.

## 2. Stack verificado

| Componente | Versión / modo | Evidencia |
|---|---|---|
| Astro | `^7.3.2`, `output: "server"` | `package.json:50`, `astro.config.mjs:55` |
| Adapter | `@astrojs/node` 11.1.2, modo `middleware` | `astro.config.mjs:63-65` |
| React | 19.2.5 | `package.json:70-71` |
| TypeScript | 5.9.3, `strict` | `package.json:98`, `tsconfig.json` |
| Tailwind | 4.2.2 | `package.json:73` |
| DaisyUI | 5.7.16 | `package.json:74` |
| Iconos | `astro-icon` + boxicons | `package.json:51`, `astro.config.mjs:56` |
| Base de datos | SQLite `database/mda.db` | `src/db/index.ts:6` |
| Driver | `better-sqlite3` 12.10 | `package.json:53` |
| ORM | Drizzle 0.45.2 | `package.json:59` |
| Validación | Zod 4.4.3 (6 archivos) | `package.json:76` |
| Sesión | cookie HMAC + tabla `sessions` | `src/lib/session.ts`, `src/middleware.ts` |
| IA | Groq Whisper + OpenCode CLI | `src/lib/ai/*` |
| Integraciones | InvGate REST, InvGate web, Wise CX, LDAP, MidPoint, inventario legacy, ICMP | `src/lib/invgate/*`, `scripts/*` |
| Servidor | Express 5 + `compression` | `server.mjs` |
| Procesos | PM2, 9 apps | `ecosystem.config.cjs` |
| Proxy | Apache XAMPP, TLS en `:443` | `AGENTS.md`, `docs/deploy-produccion.md` |
| Node | `>=22.12.0` | `package.json:5-7` |
| Tests | Vitest, `node:test`, Playwright | `vitest.config.ts`, `playwright.config.ts` |
| CI | No existe | sin `.github/` ni pipeline |

### 2.1 Runtime

```
Cliente
  │ HTTPS 443
  ▼
Apache (TLS, proxy)
  │ HTTP 127.0.0.1:4321
  ▼
Express (server.mjs: static + compression)
  │
  ▼
Astro SSR (dist/server/entry.mjs)

PM2:
  ├─ correo-argentino-mda        (SSR)
  ├─ mda-ping-cubics             (loop ICMP)
  ├─ sync-legacy-inventory       (cron 05:00 y 17:00)
  ├─ sync-users                  (cron 02:00)
  ├─ sync-office-links           (cron 03:00)
  ├─ purge-deleted-records       (cron 04:00)
  ├─ mda-auto-assign             (loop 10 min)
  ├─ reconcile-automation-parents (cron 04:00)
  └─ snapshot-automation-metrics (cron 04:05)
```

`AGENTS.md` documenta 5 procesos; el archivo real define 9.

## 3. Tamaño y forma

| Métrica | Valor |
|---|---:|
| Archivos en `src/` | 867 |
| Páginas Astro | 109 |
| Endpoints API | 131 |
| Componentes | 265 |
| Archivos en `src/lib/` | 297 |
| Tablas | 60 |
| Migraciones Drizzle | 4 |
| Specs E2E | 146 |
| Tests unit (Vitest) | 103 |
| Tests de dominio (`node:test`) | 57 archivos |
| Commits | 2.540 |
| Entradas en `docs/lessons.md` | 84 |
| `any` | 523 |
| `innerHTML` | 301 |
| `set:html` | 11 |
| SQL crudo (`sql\``) | 92 |
| `.astro` que importan la DB | 57 |
| Endpoints con CSRF | ~10 de 131 |

### 3.1 Archivos más grandes

| Líneas | Archivo |
|---:|---|
| 3.676 | `src/components/supervision/calidad/NewAuditForm.astro` |
| 3.616 | `src/components/supervision/asignacion/AsignacionContent.astro` |
| 2.703 | `src/components/supervision/calidad/CalidadContent.astro` |
| 2.622 | `src/components/cronograma/lib/dashboard-client.ts` |
| 1.807 | `src/components/cronograma/CronogramaDashboard.astro` |
| 1.570 | `src/components/supervision/asistencia/AsistenciaContent.astro` |
| 1.548 | `src/components/admin/calidad/CalibracionContent.astro` |
| 1.477 | `src/components/cronograma/lib/monthly-view.ts` |
| 1.428 | `src/lib/disponibilidad.ts` |
| 1.358 | `src/db/schema.ts` |

## 4. Organización real del código

```
src/pages/*.astro ─────┐
src/components/*.astro ─┼──> src/lib/* ──> src/db/index.ts ──> SQLite
src/pages/api/*.ts ────┤
src/actions/index.ts ──┘
scripts/*.ts ─────────────> src/lib/* ──> src/db/index.ts

src/middleware.ts ──> session + RBAC + rate limit + CSP
```

No existe una capa de aplicación formal. `src/lib` contiene, sin distinción:

- dominio puro (`cronograma/rotation.ts`, `officeBuildingKey.ts`);
- casos de uso (`disponibilidad.ts`, `attendance.ts`);
- acceso a datos (`officeQueries.ts`, `terminalQueries.ts`);
- integraciones (`invgate/*`, `ldap.ts`, `wise-cx-client.ts`);
- utilidades de UI (`clientTableSort.ts`, `toastClient.ts`).

### 4.1 Cuatro vías de mutación

| Vía | Ejemplo | Validación | Permisos | Auditoría |
|---|---|---|---|---|
| Página SSR con POST | `src/pages/admin/usuarios.astro` | Ad-hoc | `rbac` de ruta | Parcial |
| Endpoint API | `src/pages/api/cronograma/index.ts` | Ad-hoc | `require*Access` | Parcial |
| Astro Action | `src/actions/index.ts` | Zod | `require*Access` | Parcial |
| Script/worker | `scripts/sync-users.ts` | Ad-hoc | Sin sesión | No |

## 5. Datos

- SQLite en `database/mda.db` (gitignored), WAL, `foreign_keys=ON`.
- 60 tablas, 4 migraciones Drizzle. La evolución real se aplica con `scripts/align-db-to-schema.mts`.
- La copia local tiene ~20 MB y es de desarrollo:
  - `employees`: 11.864
  - `terminals`: 7.918
  - `audit_logs`: 6.895
  - `offices`: 6.449
  - `schedules`: 4.162
  - `quality_audits`: 256
  - `assignment_history`: 0
  - `title_favorites`: 0
  - `automation_parents`: 22

Estos volúmenes no representan producción.

### 5.1 Deuda de esquema confirmada

| Problema | Evidencia |
|---|---|
| Sin unique en auditorías por llamada/ticket | `src/db/schema.ts:533-575` |
| `schedules.agent_id` nullable | `src/db/schema.ts:459-484` |
| `employee_offices` sin FK a `employees` | `src/db/schema.ts:73-85` |
| `office_invgate_links.invgateLocationId` no unique | `src/db/schema.ts:251-270` |
| Migraciones incompletas para 60 tablas | `drizzle/` (4 archivos) |

## 6. Autenticación y autorización

### 6.1 Lo que está bien

- Cookie `session_id` firmada con HMAC-SHA256 y comparación `timingSafeEqual` (`src/lib/session.ts:19-46`).
- Sesión en base con expiración y fingerprint de `user-agent` (`src/lib/sessionFingerprint.ts`).
- Default-deny de sesión para páginas y `/api/**` (`src/middleware.ts:329-350`).
- Default-deny de rutas: toda ruta nueva debe declararse en `routePermissions` (`src/lib/rbac.ts:147-206`).
- Contraseñas con bcrypt (`bcryptjs`).
- Credenciales cifradas con AES-256-GCM (`src/lib/encryption.ts`).
- Rate limit de login, API y KB en `middleware.ts:51-176`.
- CSP, HSTS, `nosniff`, `X-Frame-Options`, `frame-ancestors` (`middleware.ts:178-204`).

### 6.2 Lo que falla

- CSRF solo en ~10 endpoints; el resto depende de `SameSite=Lax`.
- Autorización por prefijo de ruta + checks ad-hoc; no hay una política única por acción.
- Endpoints de InvGate y AD que solo exigen sesión.
- Cinco catálogos de rutas/roles que pueden divergir: `navigation.ts`, `profileAccess.ts`, `rbac.ts`, `rolesMatrix.ts`, accesos del home.
- Rate limit y caché de sesión en memoria: no soportan más de una instancia.

## 7. Pruebas

| Nivel | Volumen | Observación |
|---|---:|---|
| E2E Playwright | 146 specs | Serial, `workers: 1`, reporte HTML + traces |
| Unit Vitest | 103 | `tests/unit/**` |
| Dominio `node:test` | 57 archivos | Lista explícita en `package.json:33` |

Limitaciones:

- 3 fallos preexistentes en `test:unit`, documentados en `AGENTS.md`.
- No hay CI.
- El build no ejecuta `astro check`.
- Hay tests que validan texto fuente de `.astro` (change-detectors).
- Rutas críticas sin cobertura: `/titulos` (E2E), syncs, `officeQueries`, `terminalQueries`, `attendance.ts`, locks AGS, `saveAudit`.

## 8. Documentación y drift

| Documento | Drift confirmado |
|---|---|
| `docs/CONTEXT.md` | Sitemap sin `/reportes`, `/inventario-terminales/estadisticas`, `/admin/operadores`; KB descrita como `ALL_ROLES` cuando el código la restringe a `admin` |
| `docs/todo.md` | Referencia `/directorio-oficinas`, `/admin/offices`, `/catalogo-aplicativos`, rutas inexistentes |
| `AGENTS.md` | “5 processes” vs 9 reales |
| `docs/architecture.md` | Describe capas ideales, no la dispersión actual |

## 9. Balance

### Fortalezas

1. Funcionalidad amplia y en uso real.
2. Base de seguridad mejor que la media de un sistema interno.
3. Cultura de documentación operativa y de lecciones aprendidas.
4. Suite E2E extensa y reproducible.
5. Separación conceptual por carpetas en `src/lib`.

### Debilidades

1. Datos mock/fixture presentados como reales.
2. Perímetro de seguridad inconsistente.
3. Ausencia de capa de servicio y de límites de módulo.
4. Sin barrera de tipos ni CI.
5. Archivos-dios y lógica duplicada.
6. Dependencias de runtime en `devDependencies`.
7. Documentación desactualizada en puntos críticos.

## 10. Método y limitaciones

- Análisis estático de código y configuración.
- No se ejecutó build, `astro check`, tests, E2E ni análisis de dependencias.
- No se accedió a producción ni a Infraestructura/Seguridad/DBA.
- No se midió performance.
- Los hallazgos marcados ⚠️ requieren validación en runtime.
