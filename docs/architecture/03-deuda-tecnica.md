# 03 — Registro de deuda técnica y riesgos

> Registro priorizado. Cada fila tiene evidencia verificable en el repositorio.
> **P0** = bloquea la transición a aplicación oficial. **P1** = debe resolverse antes del módulo correspondiente. **P2** = deuda a planificar.

## Resumen

| Prioridad | Cantidad | Temas |
|---|---:|---|
| P0 | 6 | Datos mock/fixture y syncs destructivos |
| P1 | 24 | Seguridad, integridad, arquitectura, tipado |
| P2 | 19 | Rendimiento, operación, pruebas, documentación |
| **Total** | **49** | |

Distribución por tipo:

| Tipo | Cantidad |
|---|---:|
| Confiabilidad de datos | 6 |
| Seguridad / autorización | 12 |
| Integridad / transacciones | 10 |
| Arquitectura / acoplamiento | 8 |
| Tipado / validación / errores | 6 |
| Rendimiento / operación / pruebas | 11 |

---

## 1. P0 — Confiabilidad de la información

| ID | Sev | Hallazgo y evidencia | Impacto | Recomendación | Fase |
|---|---|---|---|---|---|
| D-01 | 🔴 P0 | Métricas de autogestiones forzadas a mock: `AutogestionesMetricasContent.astro:17` (`\|\| true`) y `autogestiones-metricas-client.ts:216` (`mock=1`) | Supervisores ven KPIs aleatorios; el CSV exporta datos reales y no coincide | Quitar el flag; modo demo explícito, sin export, ruteado aparte | 10 |
| D-02 | 🔴 P0 | Métricas de mesas sintéticas: `lib/helpdesks/service.ts:16-23,34-63,176`; `/reportes` no muestra el badge `dataSource` (`pages/reportes/index.astro:42-68`) | Números “oficiales” generados por PRNG en cada proceso | Conectar fuente real o despublicar; propagar `dataSource` a todo consumidor | 10 |
| D-03 | 🔴 P0 | Reporte de workflows 100% fixture: `lib/workflows/service.ts:30-32`; personas ficticias en `fixtures/implementacion.ts:3-16` | Decisiones de SLA/lead time sobre datos inventados | Conectar InvGate o marcar demo y bloquear export | 10 |
| D-04 | 🔴 P0 | KPIs hardcodeados en informe de categorías: `CategoryExecutiveReport.astro:71-74,229`; `CategoryActionPlans.astro:9,13,24,39` | Dos verdades contradictorias en la misma página | Derivar de `metrics`/fixture tipado; eliminar literales | 10 |
| D-05 | 🔴 P0 | Sync InvGate marca `invgateExists=false` antes de consultar: `lib/invgate/userSync.ts:35-49` | Un corte deja toda la base como “no existe en InvGate” | Calcular set remoto primero; aplicar en transacción | 8 |
| D-06 | 🔴 P0 | Sync de ubicaciones vacía `employees.sucursal` y `employee_offices` antes de validar: `lib/invgate/locationSync.ts:18-19,29-51` | Corte diario deja la base vacía | Construir mapeo en memoria; reemplazar en una transacción | 8 |

---

## 2. Seguridad y autorización

| ID | Sev | Hallazgo y evidencia | Impacto | Recomendación | Fase |
|---|---|---|---|---|---|
| S-01 | 🔴 P0 | CSRF en ~10 de 131 endpoints: `src/lib/csrf.ts:41`; ausente en CRUD admin, cronograma, asistencia, AGS y calidad | Cambio de rol/contraseña y mutaciones solo protegidas por `SameSite=Lax` | Middleware global CSRF para no-GET; excepciones firmadas; test por ruta | 4 |
| S-02 | 🟠 P1 | `/api/usuarios/net-user` solo exige sesión y enumera AD: `net-user.ts:106-108,117-119,210-294` | Perfilado de cuentas TI/administración | `requireReadAccess("usuarios")`, ownership o scope por mesa; quitar mock | 8 |
| S-03 | 🟠 P1 | `PATCH /api/usuarios/[dni]` edita interno/teléfono de cualquier empleado: `api/usuarios/[dni].ts:20-51` | Modificación de datos de terceros por `agent` | Ownership o `requireWriteAccess` para todos los campos | 8 |
| S-04 | 🟠 P1 | `/api/invgate/*` solo exige sesión: `rbac.ts:191`; tickets, comentarios, miembros | Un agente lee cualquier mesa salteando `asignacion_ag` | Gate por endpoint (`requireReadAccess`) | 9 |
| S-05 | 🟠 P1 | Mass assignment en títulos: `api/titulos/index.ts:47-55`; `[id].ts:25-35` | Escritura de campos internos (`deprecated`, `kbMatchScore`) | Zod con whitelist; DTO explícito | 6 |
| S-06 | 🟠 P1 | XSS en AGS: JSON sin escapar (`AsignacionContent.astro:1660-1661`) y sanitizado casero con `innerHTML` (`:1925-1928,3115-3122`) | JS de tickets/comentarios en el portal de supervisores | Escapar `<` en JSON; sanitizar server-side con allowlist | 9 |
| S-07 | 🟠 P1 | SSRF + DoS en audio: `api/calidad/download-audio.ts:19-27`; `ai/groqWhisper.ts:32-77` | Allowlist `includes("s3")`, redirects, buffer completo antes del límite | Hosts exactos, `redirect:"error"`, stream con corte, `attachment`/`audio/*` | 10 |
| S-08 | 🟠 P1 | Playwright en runtime: `invgate/webSession.ts:1,67-81,110`; `timelineScraper.ts:181` | Rompe `--omit=dev`, abre navegador, cookie SSO en claro | Worker separado, `headless:true`, cifrar cookie | 10 |
| S-09 | 🟠 P1 | Diagnóstico con `pm2 jlist` y config para cualquier sesión: `api/admin/sync-status.ts:27-56`; `invgate-status.ts:10-19` | Reconocimiento + spawn de shell | Admin only, cachear, quitar logs sensibles | 8 |
| S-10 | 🟠 P1 | Mutaciones por GET: `api/admin/invgate/locations/sync.ts:10-19`; `api/invgate/locations.ts:22-25` | Resync completo por prefetch/CSRF | POST + CSRF; GET idempotente | 4 |
| S-11 | 🟠 P1 | Rol por igualdad de string: `admin/feedback.astro:18`; `actions/index.ts:654,687`; `papelera/[id]/restaurar.ts:15` | Roles legacy bloqueados/inconsistentes | `normalizeRole`/`can` en un solo helper | 4 |
| S-12 | 🟡 P2 | `createDeleteHandler` sin `requiredFeature` obligatorio: `lib/api/deleteHandler.ts:51-60`; 4 endpoints | Borrado por rol no previsto | Hacer el parámetro obligatorio | 6 |

---

## 3. Integridad de datos y transacciones

| ID | Sev | Hallazgo y evidencia | Impacto | Recomendación | Fase |
|---|---|---|---|---|---|
| I-01 | 🟠 P1 | Borrar mes no borra asistencia/HE: `api/cronograma/months/index.ts:225-239`; aviso falso en `dashboard-client.ts:1934` | Huérfanos; estadísticas muestran meses borrados | Borrado en transacción o soft-delete consistente; corregir mensaje | 9 |
| I-02 | 🟠 P1 | Import “Formato B” escribe `Franco` en días vacíos y descarta horarios: `import.ts:122-154,306-334`; `dashboard-client.ts:2385-2392` | Borra planificación sin avisar | Validar archivo completo; no inferir Franco; persistir horarios | 9 |
| I-03 | 🟠 P1 | `POST` y `PUT` de cronograma duplicados (~200 líneas) y escrituras fuera de transacción: `api/cronograma/index.ts:39-254,256-483` | Commit parcial; doble mantenimiento | Un servicio `saveMonth` transaccional | 9 |
| I-04 | 🟠 P1 | `deshacerAsignacion` global: `disponibilidad.ts:1258-1265,1085,1202` | Restaura la cola de un operador arbitrario | Derivar de `assignment_history` por ticket | 9 |
| I-05 | 🟠 P1 | Sin unique en auditorías: `schema.ts:533-575`; `actions/index.ts:465-496` | Duplicados inflan promedios y cuota | Índice único parcial + aviso en UI | 10 |
| I-06 | 🟠 P1 | Pesos de calidad validados solo en cliente: `actions/index.ts:42`; `CalidadContent.astro:2833-2843` | Sección al 130% penaliza a todos | Validar suma server-side por canal/sección | 10 |
| I-07 | 🟠 P1 | `asignableAgs` no aplicado en 3 de 4 rutas: `disponibilidad.ts:674,1032-1042,1141` | Asigna a no asignables | Centralizar elegibilidad en una función | 9 |
| I-08 | 🟡 P2 | `schedules.agent_id` nullable; `employee_offices` sin FK: `schema.ts:459-484,73-85` | Overrides legacy no aplican | Backfill + NOT NULL/FK | 8 |
| I-09 | 🟡 P2 | Estado de sync en `src/data/last-sync-status.json`: `sync-legacy-inventory.ts:15`, `sync-users.ts:18` | Se pierde en deploy; escribe en `src/` | Tabla `sync_runs` o `var/` | 8 |
| I-10 | 🟡 P2 | `office_invgate_links.invgateLocationId` no unique: `schema.ts:251-270` | Duplicación de conteos | Unique + validación | 7 |

---

## 4. Arquitectura y acoplamiento

| ID | Sev | Hallazgo y evidencia | Impacto | Recomendación | Fase |
|---|---|---|---|---|---|
| A-01 | 🟠 P1 | 57 `.astro` importan `@db/index` | Sin capa de servicio; no testeable | Repositorios + servicios por módulo | 3-10 |
| A-02 | 🟠 P1 | Cuatro vías de mutación (página, API, Action, script) | Validación/permisos/auditoría divergen | Una sola capa de aplicación | 3 |
| A-03 | 🟠 P1 | Cinco catálogos de rutas/roles: `navigation.ts`, `profileAccess.ts`, `rbac.ts`, `rolesMatrix.ts`, home | Cada módulo exige 3-5 ediciones | Manifiesto único de módulos | 4 |
| A-04 | 🟠 P1 | Archivos-dios: 3.676 / 3.616 / 2.703 / 2.622 / 1.807 líneas | Mantenimiento y conflictos | Descomponer por subdominio y componente | 9-10 |
| A-05 | 🟠 P1 | Lógica duplicada: cumplimiento, cola AGS (4), árbol (3), oficinas (2) | Bugs divergentes | Extraer funciones puras compartidas | 6-10 |
| A-06 | 🟠 P1 | Código muerto: `AdminOfficesContent` (879), `AdminCubicsContent` (262), `categories/metrics.ts` + `tree.ts`, `mysql2`, `exceljs` | ~1.500 líneas de ruido; export roto | Borrar o mover a `scripts/` | 3 |
| A-07 | 🟡 P2 | `server:defer` + `Astro.url.searchParams`: `AdminRecursosContent.astro:19`, `AdminContactsContent.astro:18` | Buscador pierde `q` | `getResolvedSearchParams` | 6 |
| A-08 | 🟡 P2 | Tres implementaciones del árbol: `CategoryTreeExplorer` (978), `CategoryTreeCanvas` (1.098), `categorias.astro:21-68` | Doble bundle y features divergentes | Un renderer y un origen | 10 |

---

## 5. Tipado, validación y errores

| ID | Sev | Hallazgo y evidencia | Impacto | Recomendación | Fase |
|---|---|---|---|---|---|
| T-01 | 🟠 P1 | El build no corre typecheck: `package.json:11`; `disponibilidad.ts:80,167,317` usa `schedules.agentName` inexistente | Deploy verde con tipos rotos | `tsc --noEmit`/`next build` con tipos en CI | 3 |
| T-02 | 🟠 P1 | Solo 6 archivos usan Zod; `validations.ts` en 5 lugares | Inputs libres, 500 por FK | Zod en toda frontera | 3-10 |
| T-03 | 🟠 P1 | 523 `any`, 301 `innerHTML`, 92 SQL crudo | Errores silenciosos y XSS | `no-explicit-any`, sanitización, revisión | 3-10 |
| T-04 | 🟡 P2 | JSON malformado → 500; endpoints sin catch | Mala UX y ruido | Wrapper único de errores | 5 |
| T-05 | 🟡 P2 | 38 `console.log`, algunos con sesión/PII: `api/titulos/index.ts:31-34`; `OfficeForm.astro:741-1222` | PII en logs | Logger con redacción | 5 |
| T-06 | 🟡 P2 | Código de demo/diagnóstico en bundle | Superficie innecesaria | Feature flags y exclusión de build | 3 |

---

## 6. Rendimiento, operación y pruebas

| ID | Sev | Hallazgo y evidencia | Impacto | Recomendación | Fase |
|---|---|---|---|---|---|
| P-01 | 🟡 P2 | Paginación sin tope: `api/offices/index.astro:12`; `api/terminals/index.astro:9-10`; `terminalQueries.ts:545-554` | Serializa todo el parque | Clamp ≤200; `GROUP BY` en SQL | 7 |
| P-02 | 🟡 P2 | InvGate sin reintentos; Wise CX sin timeout: `invgateClient.ts:15`; `wise-cx-presence.ts:218-231` | Cuelgues silenciosos | Timeout + retry con jitter + circuit breaker | 9 |
| P-03 | 🟡 P2 | `/mesas-de-ayuda` 2 llamadas InvGate sin caché por render: `SoportesPublicContent.astro:38-46` | Latencia en vista central | Caché 30 min + paginación | 8 |
| P-04 | 🟡 P2 | Changelog ejecuta 2 `git` sincrónicos por request: `changelogStats.ts:24-31` | Bloquea event loop | Snapshot precalculado | 6 |
| P-05 | 🟡 P2 | Sin request ID, métricas, trazas ni alertas | Incidentes no diagnosticables | pino + OTel + health | 5 |
| P-06 | 🟡 P2 | Rate limit y sesión en memoria: `rateLimit.ts`, `sessionCache.ts` | No escala a 2 instancias | Store compartido | 4 |
| P-07 | 🟡 P2 | `tsx`/`playwright` en `devDependencies` usados por 8 de 9 procesos: `ecosystem.config.cjs:14-80` | `npm ci --omit=dev` rompe | Mover a `dependencies` o compilar workers | 3 |
| P-08 | 🟡 P2 | 3 fallos preexistentes; sin CI | Verde no confiable | Corregir y bloquear merge | 3 |
| P-09 | 🟡 P2 | Tests change-detector: `phase4-office-banner-and-terminal-filters.test.ts:16-25`; `phase1-buttons-standardization` | Frágiles, sin valor | Reemplazar por comportamiento | 3 |
| P-10 | 🟡 P2 | Huecos: sin E2E `/titulos`; sin tests de syncs, `officeQueries`, `terminalQueries`, `attendance.ts`, locks AGS, `saveAudit` | Regresiones invisibles | Backlog de pruebas por módulo | 6-10 |
| P-11 | 🟡 P2 | Docs desactualizadas: `CONTEXT.md`, `todo.md`, `AGENTS.md` (5 vs 9 procesos) | Onboarding erróneo | Actualizar en cada release | 0 |

---

## 7. Falsos positivos y fortalezas

No deben “corregirse”:

- Sanitización de KB: `lib/markdown.ts:47-150`, `sanitize-html`, magic bytes y path traversal.
- Firma de sesión: `session.ts:19-46`.
- Default-deny de sesión y rutas: `middleware.ts:329-364`, `rbac.ts:147-206`.
- Cifrado de credenciales: `encryption.ts`, `credentialAccess.ts`.
- CSP/HSTS/nosniff: `middleware.ts:178-204`.
- Rate limit de login con IP real detrás de proxy: `clientIp.ts`.
- Validación de env crítico: `env.ts:8-11,148-161`.
- Verificación de build: `scripts/verify-build.mjs`.

## 8. Criterio de cierre por prioridad

| Prioridad | Criterio |
|---|---|
| P0 | Resuelto y verificado antes de declarar la nueva app “oficial” |
| P1 | Resuelto antes de migrar el módulo afectado; no se traslada a la nueva arquitectura |
| P2 | Registrado en el backlog con fase asignada; puede convivir con la nueva app |
