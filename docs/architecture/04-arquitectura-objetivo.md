# 04 — Arquitectura objetivo

> Estado: **aprobada en su forma general** (monolito modular + Next.js App Router) y **condicionada** por las decisiones de Infraestructura, Seguridad y DBA listadas en la sección 9.

## 1. Decisión

Construir la nueva versión como **monolito modular** sobre **Next.js App Router + React + TypeScript**, con:

- `pnpm` como gestor de paquetes.
- Tailwind + shadcn/ui como sistema de componentes.
- Validación con Zod en toda frontera.
- Persistencia mediante repositorios por módulo y un ORM a confirmar según el motor SQL corporativo.
- Autenticación por sesión opaca en base, con interfaz de provider para SSO.
- Jobs en proceso separado, no dentro del request.
- Límites de módulo aplicados por lint, no por convención.

## 2. Por qué monolito modular

| Criterio | Evaluación |
|---|---|
| Tamaño del equipo | Un equipo pequeño/mediano; microservicios multiplicarían operación |
| Dominio | Entidades compartidas: `users`, `agents`, `offices`, `mesas` |
| Transacciones | Calidad, cronograma y AGS requieren atomicidad |
| Despliegue | Un solo artefacto, un solo runtime, un solo pipeline |
| Evolución | Permite extraer un módulo (IA, sync) sin reescribir el resto |
| Complejidad | Menor que distribuido; mayor que un MVC sin capas, pero justificada |

**No se propone** una arquitectura hexagonal completa con puertos/adaptadores por entidad. Se propone una separación pragmática en cuatro capas por módulo: esquema, política, servicio y repositorio.

## 3. Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Microservicios | Consistencia eventual, red, observabilidad distribuida y despliegues múltiples sin beneficio |
| SPA + API separada | Duplica auth, CORS, sesión y deploy; el sistema es SSR |
| Continuar en Astro y solo ordenar capas | Viable técnicamente, pero no responde a la decisión de negocio de adoptar Next.js |
| Big-bang rewrite | Alto riesgo; las reglas no documentadas se pierden |
| Serverless puro | Incompatible con SQL corporativo, jobs largos, archivos y scraping |
| BFF sobre el sistema actual | Agrega una capa sin eliminar la deuda de origen |
| Framework “full-stack” con ORM acoplado (tipo Rails) | Menor control sobre SQL corporativo y migraciones |

## 4. Capas

```
┌────────────────────────────────────────────────────────────┐
│ app/                                                        │
│  Rutas, layouts, route handlers, server actions             │
│  Responsabilidad: composición, HTTP, redirects, metadata    │
│  Prohibido: reglas de negocio, SQL, integraciones directas  │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│ modules/<dominio>/                                          │
│                                                             │
│  *.schema.ts    Zod: entrada/salida, DTOs                   │
│  *.policy.ts    Permisos del dominio (rol + mesa + scope)   │
│  *.service.ts   Casos de uso, transacciones, reglas         │
│  *.repository.ts Acceso a datos (Drizzle/SQL)               │
│  *.queries.ts   Lecturas complejas / read models            │
│  components/    UI del dominio (server + client)            │
│  index.ts       Superficie pública                          │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│ server/                                                     │
│  auth · db · integrations · security · http · jobs          │
│  observability · storage · config                           │
│  Responsabilidad: infraestructura compartida                │
│  Prohibido: conocer app/ o modules/                         │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│ shared/                                                     │
│  Tipos, utilidades puras, constantes, formateadores          │
│  Prohibido: importar server/, modules/ o app/               │
└────────────────────────────────────────────────────────────┘
```

### 4.1 Flujo de una mutación

```
Formulario (client)
  → Server Action / route handler
    → Zod parse
    → policy.can(user, action, resource)
    → service.execute(dto, actor)
      → repository.transaction(...)
        → DB
      → audit.record(...)
    → revalidatePath / redirect
```

### 4.2 Flujo de una lectura

```
page.tsx (server)
  → requireSession()
  → module.queries.list(filters)
    → repository (SQL optimizado)
  → componente server
  → isla client solo si hay interacción
```

## 5. Módulos

| Módulo | Responsabilidad | Entidades | Depende de |
|---|---|---|---|
| `identity-access` | Login, sesión, usuarios, roles, mesas, permisos, view-as | `users`, `sessions`, `mesas` | `server/auth`, `server/security` |
| `org-directory` | Oficinas, regiones, provincias, estructura, edificios, activos, links | `offices`, `office_assets`, `office_invgate_links`, `regions`, `provinces` | `server/integrations/invgate` |
| `inventory` | Terminales, cúbics, snapshots, sync legacy | `terminals`, `cubics`, `cubic_assignments` | `server/integrations/legacy-inventory` |
| `people` | Empleados, sucursales, AD/LDAP, perfil InvGate | `employees`, `employee_offices` | `server/integrations/{ldap,invgate}` |
| `knowledge-base` | Artículos, categorías, imágenes, Markdown | `kb_articles`, `kb_categories` | `server/storage` |
| `resource-catalog` | Enlaces, aplicaciones, contactos, credenciales, PDFs | `resource_*`, `application*`, `contact*` | `server/storage`, `server/security` |
| `titles` | Títulos, categorías, favoritos, KB matching | `titles`, `title_category`, `title_favorites` | `server/integrations/invgate` (lectura) |
| `helpdesk-catalog` | Mesas, guías, ocultamiento, matriz de derivación | `support_guides`, `hidden_helpdesks`, `mesas` | `server/integrations/invgate` |
| `scheduling` | Cronograma, rotación, HE, guardia, feriados, import/export | `schedules`, `saturday_*`, `weekend_*`, `holidays`, `guardia_*` | `identity-access` |
| `attendance` | Asistencia, cumplimiento, estadísticas, ficha anual | `operator_attendance` | `scheduling` (lectura) |
| `availability` | Cola AGS, asignación, locks, reglas, historial | `agents`, `assignment_*`, `autogestion_rule_state` | `scheduling`, `server/integrations/{invgate,wisecx}` |
| `quality` | Auditorías, parámetros, scores, resúmenes, calibración, IA | `quality_*`, `audit_*`, `monthly_summaries` | `identity-access`, `server/integrations/{invgate,wisecx,ai}` |
| `automations` | Workflows de sucursal, etapas, progreso, cierres, métricas | `automation_*`, `workflow_*` | `server/integrations/invgate` |
| `analytics` | Read models de categorías, mesas, workflows, oficinas | Vistas/materializaciones | Read models (sin escrituras) |
| `home` | Perfiles, widgets, layout, resúmenes | `users.dashboard_layout` | Lecturas de otros módulos |
| `platform` | Auditoría, papelera, feedback, changelog, configuración | `audit_logs`, `deleted_records`, `feedback` | `server/*` |
| `integrations` | Adapters InvGate, Wise CX, LDAP, MidPoint, legacy, IA | Caché y contratos | `server/*` |

## 6. Decisiones transversales

### 6.1 Autenticación

**Ahora:** sesión opaca en base + cookie `HttpOnly`, `Secure`, `SameSite=Lax`.

- ID aleatorio de 256 bits, firmado o no según diseño final.
- Rotación al iniciar sesión.
- TTL absoluto e inactividad.
- Fingerprint de `user-agent`; IP opcional detrás de proxy confiable.
- Logout invalida en DB.
- Contraseñas con Argon2id si el entorno lo permite; si no, bcrypt con costo ≥12.

**Después:** interfaz `AuthProvider` para Entra ID / OIDC. No se implementa SSO hasta que Seguridad lo apruebe.

### 6.2 Autorización

Un único manifiesto:

```ts
// server/auth/permissions.ts
export const permissions = {
  titles: {
    read: ["agent", "referent", "team_leader", "supervisor", "admin"],
    write: ["team_leader", "supervisor", "admin"],
  },
  quality: {
    read: ["agent", "referent", "team_leader", "supervisor", "admin"],
    write: ["referent", "team_leader", "supervisor", "admin"],
    viewAll: ["referent", "team_leader", "supervisor", "admin"],
  },
} as const;
```

Reglas:

- `can(actor, "titles.write")`.
- Scope por mesa para módulos que lo requieran.
- `admin` no revocable.
- Prohibido comparar strings de rol en páginas o endpoints.
- El manifiesto genera sidebar, guards y documentación.

### 6.3 Validación

- Zod en route handlers, Server Actions, jobs y adapters.
- `parse` en la frontera; el servicio recibe DTO tipado.
- Prohibido `set({...body})`.
- Validación de salida para respuestas de integraciones.
- Errores de validación → 422 con detalle por campo.

### 6.4 Acceso a datos

- Un cliente por proceso.
- Repositorios por módulo; sin SQL en `app` ni en componentes.
- Transacciones en servicios.
- Consultas de reporte en `*.queries.ts` o vistas.
- Sin `SELECT *` en endpoints públicos.
- Paginación obligatoria con tope.

### 6.5 Integraciones

- Un adapter por proveedor con interfaz tipada.
- Timeout, retry con jitter, circuit breaker y caché con TTL.
- Errores normalizados (`IntegrationError`).
- Sin scraping en el request path.
- Contratos cubiertos por tests con fixtures grabados.
- Secretos desde entorno, nunca en código.

### 6.6 Errores

- `AppError` con `code`, `httpStatus`, `userMessage`, `cause`.
- Wrapper único para route handlers y actions.
- `error.tsx` y `not-found.tsx` por segmento.
- Nunca exponer stack ni SQL al cliente.
- Ver `09-observabilidad-y-errores.md`.

### 6.7 Observabilidad

- Logs JSON con `requestId`, `userId`, `module`, `action`, `durationMs`.
- Redacción de PII y secretos.
- Métricas de requests, errores, jobs e integraciones.
- Health check de app y dependencias.
- Auditoría funcional separada de logs técnicos.

### 6.8 Configuración

- Zod al arranque; fallo rápido en producción.
- `.env.example` completo y versionado.
- Sin `import.meta.env` para secretos.
- Secretos por entorno o vault corporativo.
- Feature flags explícitos (`AI_ENABLED`, `DEMO_DATA`).

### 6.9 Jobs

- Proceso worker separado que importa servicios, no rutas.
- Scheduler externo (Task Scheduler, cron, PM2) o cola.
- Tabla `job_runs` con inicio, fin, estado, error y métricas.
- Idempotencia por clave de negocio.
- Sin jobs largos dentro de Next.

### 6.10 Almacenamiento

- Interfaz `StorageAdapter`.
- Local solo en desarrollo.
- Producción: UNC/S3/objeto corporativo.
- Validación por magic bytes, límite de tamaño y nombres opacos.
- PDFs y credenciales con control de acceso.

## 7. Estructura de despliegue (propuesta, sujeta a Infra)

### Opción A — Node persistente + NGINX (recomendada)

```
NGINX :443
  ├─ /_next/static → cache inmutable
  ├─ /api/*        → Next :3000
  └─ /*            → Next :3000
Worker Node (jobs)
DB corporativa
Storage corporativo
```

Ventajas: compatible con el modelo actual, pooling simple, jobs locales, sin vendor lock-in.

### Opción B — Contenedores

Misma topología, con imágenes separadas para web y worker. Requiere orquestación y registry corporativo.

### Opción C — Serverless

No recomendada mientras haya SQL corporativo, archivos y jobs largos. Si se impone, requiere repensar pooling, sesión, rate limit y workers.

## 8. No objetivos

- Microservicios.
- GraphQL.
- Multi-tenant.
- Tiempo real por WebSocket (salvo necesidad concreta).
- Reescritura de la UI con un design system nuevo.
- Migración de datos en el mismo release que el código.
- IA generativa sin aprobación de Seguridad.

## 9. Decisiones pendientes

| # | Decisión | Dueño | Bloquea |
|---|---|---|---|
| 1 | Motor SQL | Infra/DBA | Fases 1, 3, 8+ |
| 2 | Hosting/SO | Infra | Fases 1, 3, 13 |
| 3 | SSO | Seguridad/Identidad | Fase 4 |
| 4 | IA y datos | Seguridad/Legal | Fase 10 |
| 5 | InvGate API vs scraping | Integraciones | Fases 9-10 |
| 6 | Wise CX wallboard | Integraciones | Fase 9 |
| 7 | Storage | Infra | Fases 5, 8 |
| 8 | Secrets | Seguridad | Fases 1, 3 |
| 9 | Backups/RPO/RTO | Infra | Fases 11-13 |
| 10 | CI/CD | DevOps | Fase 3 |
| 11 | Multi-instancia | Infra | Fases 4-5 |
| 12 | Versión Next/React | Arquitectura | Fase 3 |

## 10. Criterios de aceptación de la arquitectura

1. Un módulo nuevo se puede agregar sin tocar `app` más que en su ruta.
2. Ningún `page.tsx` importa un repositorio.
3. Ningún módulo importa otro por ruta interna.
4. El lint falla si se viola una regla de dependencia.
5. Un caso de uso se testea sin HTTP ni DB real (con repositorio mockeado).
6. Un repositorio se testea contra el motor real.
7. Toda mutación pasa por política, validación y auditoría.
8. Toda integración tiene timeout, retry y contrato.
9. El sistema arranca sin variables opcionales y falla claro sin las críticas.
10. El build falla si hay errores de tipo.
