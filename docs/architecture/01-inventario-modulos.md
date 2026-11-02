# 01 — Inventario funcional de módulos

> Inventario basado en `src/pages`, `src/components`, `src/lib`, `src/db/schema.ts`, `src/actions` y `tests/`.
> No se infiere funcionalidad no presente en el código.

## Índice

1. [Inicio / home personalizado](#1-inicio--home-personalizado)
2. [Títulos](#2-títulos)
3. [Oficinas](#3-oficinas)
4. [Inventario de terminales](#4-inventario-de-terminales)
5. [Buscador de usuarios](#5-buscador-de-usuarios)
6. [Recursos, aplicativos y contactos](#6-recursos-aplicativos-y-contactos)
7. [Base de conocimiento](#7-base-de-conocimiento)
8. [Mesas de ayuda y soportes](#8-mesas-de-ayuda-y-soportes)
9. [Automatizaciones](#9-automatizaciones)
10. [Reportes y métricas](#10-reportes-y-métricas)
11. [Cronograma](#11-cronograma)
12. [Asistencia](#12-asistencia)
13. [Disponibilidad y asignación de autogestiones](#13-disponibilidad-y-asignación-de-autogestiones)
14. [Calidad de operadores](#14-calidad-de-operadores)
15. [Administración](#15-administración)
16. [Perfil](#16-perfil)
17. [Generador de firmas](#17-generador-de-firmas)
18. [Changelog](#18-changelog)
19. [Transversales](#19-transversales)

---

## Resumen

| # | Módulo | Rutas | Tablas | Integraciones | Criticidad |
|---|---|---|---|---|---|
| 1 | Inicio | `/` | `users`, `quality_*`, `feedback`, `audit_logs` | — | Alta |
| 2 | Títulos | `/titulos` | `titles`, `title_category`, `title_favorites` | InvGate KB (lectura) | Alta |
| 3 | Oficinas | `/oficinas/**`, `/admin/oficinas/edificios` | `offices`, `office_assets`, `office_invgate_links`, `regions`, `provinces` | InvGate | Alta |
| 4 | Inventario | `/inventario-terminales/**` | `terminals`, `cubics`, `cubic_assignments` | HTTP legacy, ICMP | Alta |
| 5 | Buscador | `/buscador-usuarios` | `employees`, `employee_offices` | LDAP/AD, InvGate | Crítica |
| 6 | Recursos | `/recursos/**`, `/contactos` | `resource_*`, `application*`, `contact*` | Storage local | Media |
| 7 | Base de conocimiento | `/base-conocimiento/**` | `kb_articles`, `kb_categories`, `mesas` | Storage local | Media |
| 8 | Mesas / soportes | `/mesas-de-ayuda/**` | `support_guides`, `hidden_helpdesks`, `mesas` | InvGate | Media |
| 9 | Automatizaciones | `/automatizaciones/**` | 8 tablas `automation_*` / `workflow_*` | InvGate, Mosaic | Alta |
| 10 | Reportes | `/reportes/**` | Sin tablas propias (fixtures/caché) | — | Crítica |
| 11 | Cronograma | `/supervision/cronograma` | `schedules`, `saturday_*`, `weekend_*`, `holidays`, `guardia_*` | CSV/XLSX/PNG, InvGate | Muy alta |
| 12 | Asistencia | `/supervision/asistencia/**` | `operator_attendance`, `schedules` | — | Alta |
| 13 | Disponibilidad / AGS | `/supervision/asignacion-autogestiones` | `agents`, `assignment_*`, `autogestion_rule_state` | InvGate, Wise CX | Muy alta |
| 14 | Calidad | `/supervision/calidad-operadores/**`, `/admin/calidad/calibracion` | `quality_audits`, `audit_parameters`, `audit_scores`, `monthly_summaries` | InvGate, Wise CX, Groq, OpenCode, Playwright | Muy alta |
| 15 | Administración | `/admin/**` | `users`, `sessions`, `audit_logs`, `deleted_records`, `mesas` | LDAP, InvGate, PM2 | Alta |
| 16 | Perfil | `/profile` | `users`, `employees`, `agents` | — | Baja |
| 17 | Firmas | `/generador-firmas` | — | — | Baja |
| 18 | Changelog | `/changelog` | — | git | Baja |

---

## 1. Inicio / home personalizado

**Propósito:** dashboard por perfil con resúmenes y accesos configurables.

| Aspecto | Detalle |
|---|---|
| Rutas | `/` |
| Páginas | `src/pages/index.astro` |
| Componentes | `src/components/inicio/PersonalHome.astro` (476), paneles `QualityPanel`, `QualityTeamPanel`, `AuditPanel`, `AgsPanel`, `widgets/*` |
| Endpoints | `src/pages/api/home/layout.ts` (GET/PUT) |
| Lógica | `src/lib/inicio/{homeProfile,dashboardLayout,homeSummaries,personalWeek,personalWeekLoader,qualitySummary,sessionAgent}.ts`, `src/lib/profileAccess.ts` |
| Tablas | `users.dashboard_layout` (JSON), `quality_audits`, `feedback`, `audit_logs`, `agents` |
| Permisos | Ruta pública para logueados; layout validado contra whitelist del perfil |
| Pruebas | `tests/home-personalizado.spec.ts` (26), `tests/unit/...` de layout |
| Deuda | Lógica de perfil duplicada entre `homeProfile` y `profileAccess`; widgets leen DB directo |

## 2. Títulos

**Propósito:** catálogo de títulos de ticket para copiar, buscar, favoritear e importar/exportar.

| Aspecto | Detalle |
|---|---|
| Rutas | `/titulos` |
| Páginas | `src/pages/titulos/index.astro` |
| Componentes | `TitlesContainer.tsx`, `TitlesTable`, `TitleForm`, `hooks/useTitlesHook.tsx` (467), `lib/titles/*` |
| Endpoints | `api/titulos/{index,[id],categorias,favoritos,import,export.csv}.ts` |
| Lógica | `titleFormat.ts`, `titleNormalizer.ts`, `titles/kbMatch.ts`, `titles/titleParts.ts` |
| Tablas | `titles` (525), `title_category` (7), `title_favorites` (0 en copia local) |
| Integraciones | InvGate KB para enriquecimiento (`TITLE_KB_THRESHOLD`) |
| Permisos | Lectura todos; escritura `team_leader+` (`rbac.ts:286-289`) |
| Pruebas | Solo unit de formato/match; **sin E2E** |
| Deuda | Mass assignment en `set({...body})`; `console.log` de sesión; DELETE sin validar id; sin Zod |

## 3. Oficinas

**Propósito:** directorio de sucursales, estructura de red, estadísticas, activos, vínculos InvGate y reconciliación de edificios.

| Aspecto | Detalle |
|---|---|
| Rutas | `/oficinas`, `/oficinas/estructura`, `/oficinas/estadisticas`, `/oficinas/estadisticas/[code]`, `/oficinas/create`, `/oficinas/edit/[id]`, `/admin/oficinas/edificios` |
| Componentes | `DirectorioContent` (810), `OfficeRow` (730), `AgentsTicketModal` (698), `OfficeTreeCanvas.tsx` (911), `OfficeForm` (1.148), `AdminEdificiosContent` |
| Endpoints | `api/offices/{index,search-address,branch-personnel,check-agents-ticket,create-agents-ticket}`, `api/oficinas/estadisticas`, `api/admin/offices/{create,reconcile-buildings}`, `api/export/offices` |
| Lógica | `officeQueries.ts` (297-609), `officeStats.ts`, `officeBuildingKey.ts`, `officeBuildingReconcile.ts`, `officeSiblings.ts`, `officeLayout.ts`, `offices/structure-tree.ts` |
| Tablas | `offices` (6.449; 60+ columnas), `office_assets` (752), `office_invgate_links` (3.000), `regions`, `provinces` |
| Integraciones | InvGate: incidentes por nodo, vínculos de ubicación, personal por sucursal |
| Permisos | Directorio todos; create/edit/estadísticas/estructura `admin+supervisor`; reportería `supervisor+` |
| Pruebas | 8 archivos de dominio, 4 E2E |
| Deuda | Paginación sin tope; sort `region` ordena por provincia; stats con IDs; `offices.ts` muerto; CRUD duplicado con distinta autorización |

## 4. Inventario de terminales

**Propósito:** consulta del parque de terminales, cúbics, estadísticas y exportaciones.

| Aspecto | Detalle |
|---|---|
| Rutas | `/inventario-terminales`, `/inventario-terminales/estadisticas`, `/inventario-terminales/cubics/{create,edit/[id]}` |
| Componentes | `InventarioContent` (1.237), `TerminalRow`, `VmRow`, tablas T&T/STS/Mediterránea, `cubicsLive` |
| Endpoints | `api/terminals/{index,estadisticas}`, `api/export/{terminals,cubics}` |
| Lógica | `terminalQueries.ts` (926), `terminalSnapshot.ts`, `terminalCache.ts`, `terminalStats.ts`, `terminalHelpers.ts`, `cubics.ts` (mock) |
| Tablas | `terminals` (7.918), `cubics` (23), `cubic_assignments` (4) |
| Integraciones | `scripts/sync-legacy-inventory.ts` (HTTP + UA spoof), `scripts/ping-worker.ts` (ICMP) |
| Permisos | Consulta todos; CRUD cúbics `admin+supervisor`; estadísticas `admin` |
| Pruebas | 20 E2E, 1 domain, 1 unit |
| Deuda | `limit` sin tope; agregaciones en JS; `cubics.ts` mock sin uso; estado de sync en `src/data` |

## 5. Buscador de usuarios

**Propósito:** búsqueda de personal, estado AD, perfil InvGate, tickets y edición de datos de contacto.

| Aspecto | Detalle |
|---|---|
| Rutas | `/buscador-usuarios` |
| Componentes | `BuscadorUsuariosContent` + `lib/{searchState,terminalModal,editUserModal,ticketModal,invgateSync,cardRenderer}` |
| Endpoints | `api/usuarios/{search,status,net-user,invgate-user,ad-groups-licenses,[dni],sync-invgate,create-invgate-ticket}` |
| Lógica | `employeeQueries.ts`, `ldap.ts`, `activeUsers.ts`, `invgate/normalizeUsers.ts`, `invgate/userCache.ts` |
| Tablas | `employees` (11.864), `employee_offices` (5.014), `users` |
| Integraciones | LDAP/AD (bind simple), InvGate (perfil, tickets), MidPoint (sync diario por scraping) |
| Permisos | Página todos; endpoints solo sesión; `ad-groups-licenses` admin |
| Pruebas | 4 E2E, 1 unit LDAP |
| Deuda | `net-user` expone AD a cualquier sesión; `PATCH /[dni]` sin ownership; mock en dev; sync destructivo |

## 6. Recursos, aplicativos y contactos

**Propósito:** hub de enlaces internos/externos, catálogo de aplicaciones con descargas/PDF y directorio de contactos.

| Aspecto | Detalle |
|---|---|
| Rutas | `/recursos`, `/recursos/aplicativos`, `/recursos/contactos`, `/contactos` (redirect), `/admin/recursos/**`, `/admin/aplicativos/**`, `/admin/contactos/**` |
| Componentes | `EnlacesContent`, `CatalogoContent`, `ContactosContent`, `AdminRecursosContent` (812), `AdminAplicativosContent` (789), `AdminContactsContent` (803) |
| Endpoints | `api/admin/{recursos,aplicativos,contactos}/reorder*`, `api/credentials/reveal`, `api/aplicativos/{pack-base,pdf/[id]}`, `api/admin/unassigned-users.astro` |
| Lógica | Sin servicio: Drizzle directo en `.astro`; `credentialAccess.ts`, `packBaseService.ts`, `encryption.ts`, `appFileUpload.ts`, `iconUpload.ts` |
| Tablas | `resource_categories/links`, `application_categories/applications`, `contact_categories`, `contacts`, `provider_contacts`, `office_contacts` |
| Permisos | Lectura todos; CRUD vía `/admin` (`team_leader+`); credenciales por rol/mesa |
| Pruebas | 6 E2E |
| Deuda | DB en componentes; dos rutas de alta; credenciales sin auditoría de reveal; `searchableText` inconsistente |

## 7. Base de conocimiento

**Propósito:** artículos y procedimientos por mesa, con Markdown, imágenes y categorías.

| Aspecto | Detalle |
|---|---|
| Rutas | `/base-conocimiento`, `/[id]`, `/create`, `/edit/[id]`, `/categorias` |
| Endpoints | `api/kb/upload`, `api/kb/images/[helpdeskId]/[filename]` |
| Lógica | `kb.ts` (297), `kbCategories.ts` (321), `kbImageUpload.ts`, `kbImageGc.ts`, `markdown.ts`, `sanitize.ts` |
| Tablas | `kb_articles` (1 en copia local), `kb_categories` (10), `mesas` |
| Permisos | **Solo `admin`** por decisión temporal 2026-09 (`rbac.ts:67,290-299`) |
| Pruebas | 15 E2E, incluidos sanitización, CSRF, RBAC y rate limit |
| Deuda | Acceso restringido desactualizado respecto de `CONTEXT.md`; una sola fila local limita pruebas de volumen |

**Fortaleza:** es el módulo con mejor postura de seguridad (allowlist de Markdown, magic bytes, path traversal, CSRF, rate limit).

## 8. Mesas de ayuda y soportes

**Propósito:** matriz de derivación entre mesas, guías de soporte, metadata y ocultamiento.

| Aspecto | Detalle |
|---|---|
| Rutas | `/mesas-de-ayuda`, `/mesas-de-ayuda/edit`, `/mesas-de-ayuda/asignar`, `/admin/usuarios/mesas-de-ayuda` |
| Componentes | `SoportesPublicContent`, `MesasHelpdeskContent`, `AdminSoportesContent` |
| Endpoints | `api/soportes/helpdesks/{hide,show}`, `api/support-guides/{assign,unassign}`, `api/admin/permisos/mesas/{sync,assignable}` |
| Lógica | `helpdesks/{service,metrics-engine,catalog-fixture}.ts`, `supportGuides.ts`, `permissions/mesaSync.ts`, `helpdeskAccess.ts` |
| Tablas | `support_guides` (87), `hidden_helpdesks`, `mesas` (141) |
| Integraciones | InvGate: `helpdesksandlevels` y categorías, sin caché por render |
| Permisos | Lectura todos; assign supervisor; hide admin; sync admin |
| Pruebas | 5 E2E |
| Deuda | 2 llamadas InvGate por render; carga todas las guías; `metrics-engine` sintético |

## 9. Automatizaciones

**Propósito:** seguimiento de automatizaciones de sucursal en InvGate, con etapas, progreso, cierre local y métricas.

| Aspecto | Detalle |
|---|---|
| Rutas | `/automatizaciones`, `/automatizaciones/[id]`, `/automatizaciones/metricas`, `/admin/automatizaciones/etapas/**` |
| Componentes | `_components/*` (~28 archivos, ~2.600 líneas), `MetricsContent` (770) |
| Endpoints | `api/automatizaciones/{revalidate,export.csv,metrics/export.csv,metrics/export.png,[id]/progress}`, Actions `closeAutomation`, `reopenAutomation`, `saveAutomationManualData` |
| Lógica | `src/lib/workflow/*` (31 archivos, 7.123 líneas): `resolver` (1.072), `metrics` (909), `discovery`, `stages`, `closures`, `parent-history`, `post-automation`; `invgate/automation/*` |
| Tablas | `automation_parents`, `automation_closures`, `automation_manual_data`, `automation_tracked_parents`, `automation_metrics_monthly`, `automation_activity_days`, `workflow_stages`, `workflow_stage_tickets`, `invgate_cache` |
| Integraciones | InvGate API (bulk 200, concurrencia 4), vista Mosaic |
| Permisos | Lectura todos; escritura `supervisor+` |
| Pruebas | 6 E2E, domain de métricas y workflow |
| Deuda | 7.123 líneas de dominio; acoplamiento fuerte a InvGate; sin tests de cierre/reape |

## 10. Reportes y métricas

**Propósito:** centro de métricas con árbol de categorías, flujo de mesas, workflows y reportes de oficinas/inventario.

| Aspecto | Detalle |
|---|---|
| Rutas | `/reportes`, `/reportes/categorias`, `/reportes/mesas`, `/reportes/workflows`, `/reportes/workflows/[slug]` |
| Componentes | `CategoryTreeExplorer` (978), `CategoryTreeCanvas.tsx` (1.098), `CategoryExecutiveReport`, `CategoryActionPlans`, `RefreshReportButton`, `ChartCard` (631) |
| Endpoints | `api/reportes/{categorias,mesas,workflows/[slug]}/{index,refresh,node-details,export}` |
| Lógica | `categories/{service,metrics-engine,tree-builder,metrics,tree,model-c-catalog}.ts` (2.669 líneas), `helpdesks/*`, `workflows/*`, `queryCache.ts`, `reportRefresh.ts` |
| Tablas | Sin tablas propias; usa `offices`, `terminals`, `automation_parents` y fixtures/caché |
| Permisos | **Solo `admin`** (`rbac.ts:142-145,324-327`) |
| Pruebas | 8 E2E que verifican presencia de widgets, no `dataSource` |
| Deuda | **Datos sintéticos/fixture** en mesas, workflows y KPIs de categorías; tres implementaciones del árbol |

## 11. Cronograma

**Propósito:** planificación mensual de modalidades, esquema semanal, rotación de sábados, horas extras, guardia pasiva, feriados y notas.

| Aspecto | Detalle |
|---|---|
| Rutas | `/supervision/cronograma` |
| Páginas | `supervision/cronograma/index.astro` (server island) |
| Componentes | `CronogramaDashboard` (1.807), `dashboard-client.ts` (2.622), `monthly-view.ts` (1.477), `overtime-view.ts` (687), `weekly-schedule.ts` (499), `pasiva-view.ts` (371), subcomponentes y exporters |
| Endpoints | `api/cronograma/{index,months,operators,rules,location,notes,feriados,rotation-config,rotation-groups/members,overtime/*,guardia-pasiva,import,export.png}` |
| Lógica | `cronograma/payload.ts`, `rotation.ts`, `scheduleLinks.ts` |
| Tablas | `agents`, `schedules` (4.162), `work_locations`, `saturday_rotation_config`, `agent_saturday_groups`, `weekend_overtime_config`, `weekend_overtime_shifts` (139), `holidays`, `monthly_guardia_pasiva_operator`, `weekly_guardia_pasiva_assignments` |
| Permisos | Ruta todos; escritura `team_leader+`; UI oculta a agent/referent |
| Pruebas | 16 E2E, unit y domain de rotación/payload |
| Deuda | Borrado de mes incompleto; import destructivo; POST/PUT duplicados; sin auditoría en la mayoría de mutaciones; XSS en nombres; `exporters.ts` importa `exceljs` no instalado |

## 12. Asistencia

**Propósito:** control diario de horario real vs planificado, eventualidades, cumplimiento, estadísticas y ficha anual.

| Aspecto | Detalle |
|---|---|
| Rutas | `/supervision/asistencia`, `/supervision/asistencia/estadisticas`, `/supervision/asistencia/operador/[id]` |
| Componentes | `AsistenciaContent` (1.570), `EstadisticasContent` (1.286), `attendance-client/*` |
| Endpoints | `api/asistencia/index`, `api/asistencia/operador/[id]` |
| Lógica | `attendance.ts` (495), `attendance-client/{store,dom,api,sync,utils}.ts` |
| Tablas | `operator_attendance` (2.710), `schedules`, `agents`, `users`, tablas de rotación/HE |
| Permisos | `team_leader+` (`rbac.ts:282-285`) |
| Pruebas | 5 E2E; **sin unit de `attendance.ts`** |
| Deuda | Regla de cumplimiento duplicada; métricas recalculadas en dos lugares; rango >31 días truncado en silencio |

## 13. Disponibilidad y asignación de autogestiones

**Propósito:** disponibilidad en vivo de operadores AGS, asignación round-robin/manual/masiva/pospuesta, locks, historial y reglas automáticas.

| Aspecto | Detalle |
|---|---|
| Rutas | `/supervision/asignacion-autogestiones`, `/supervision/autogestiones-metricas` |
| Componentes | `AsignacionContent` (3.616), `AutogestionesMetricasContent` (375) |
| Endpoints | `api/disponibilidad/*` (13 rutas), `api/autogestion/{cycle-status,rules/[id]/toggle,metricas/*}`, `api/ags/next` |
| Lógica | `disponibilidad.ts` (1.428), `autogestion/{rulesEngine,ruleState,autoAssignRunner,agsQueue,metricasService}.ts`, `rules/*` |
| Tablas | `agents`, `assignment_lock`, `assignment_history`, `autogestion_rule_state` |
| Integraciones | InvGate (reassign, comentario, waiting-for-date), Wise CX (presencia) |
| Permisos | Referent+ (`rbac.ts:270-274`), lock adicional |
| Pruebas | 8 unit, 2 E2E; sin tests de locks/asignación manual |
| Deuda | **Métricas mock forzadas**; deshacer global; `schedules.agentName` inexistente; CSRF ausente; XSS; rama POST muerta |

## 14. Calidad de operadores

**Propósito:** auditorías multicanal (Wise llamada/mail, autogestión InvGate), scoring ponderado, historial, cuota, coaching, calibración e IA.

| Aspecto | Detalle |
|---|---|
| Rutas | `/supervision/calidad-operadores`, `/supervision/calidad-operadores/nueva`, `/admin/calidad/calibracion` |
| Componentes | `NewAuditForm` (3.676), `CalidadContent` (2.703), `CalibracionContent` (1.548), `OperatorDetailsPanel`, `AiInspectionModal` |
| Endpoints/Actions | `api/calidad/{export-excel,fetch-metadata,ai-evaluate,download-audio,reorder-audits}`; Actions `saveAudit`, `deleteAudit`, `saveMonthSummary`, `saveParameters` |
| Lógica | `qualityCalculator.ts`, `qualityExport.ts`, `qualityMetadataFetcher.ts` (1.198), `qualityTitleMatcher.ts`, `qualityAiEvaluator.ts` (615), `ai/*` (1.569), `calidad/*` (1.762) |
| Tablas | `quality_audits` (256), `audit_parameters` (84), `audit_scores` (4.557), `monthly_summaries` |
| Integraciones | InvGate API + web scraping con Azure SSO, Wise CX, Groq Whisper, OpenCode CLI |
| Permisos | `calidad` read todos; write referent+; agente solo su ficha; calibración admin+supervisor |
| Pruebas | 8 E2E, 15 unit/domain; sin tests de `saveAudit` ni endpoints |
| Deuda | IA con parámetros estáticos distintos de DB; export inconsistente; SSRF; Playwright runtime; duplicados; pesos sin validar |

## 15. Administración

**Propósito:** usuarios, roles, participaciones, permisos de mesas, auditoría, papelera, feedback y operadores.

| Aspecto | Detalle |
|---|---|
| Rutas | `/admin`, `/admin/usuarios`, `/admin/usuarios/estadisticas`, `/admin/usuarios/mesas-de-ayuda`, `/admin/usuarios-sin-ubicacion`, `/admin/auditoria`, `/admin/papelera`, `/admin/feedback`, `/admin/permisos`, `/admin/operadores`, `/admin/invgate/ubicaciones` |
| Componentes | `AdminUsersContent` (1.344), `AdminLogsContent`, `AdminPapeleraContent`, `MesasHelpdeskContent`, `UbicacionesContent` |
| Endpoints | `admin/papelera/[id]/restaurar`, `api/admin/*` (sync-status, invgate-status, ldap-status, wise-cx-status, view-as, permisos/mesas, unassigned-users), Actions de calidad/feedback/automatizaciones |
| Lógica | `auditLogger.ts`, `rbac.ts`, `rolesMatrix.ts`, `sessionCache.ts`, `deletedRecords.ts`, `roleConfig.ts`, `getUnassignedFeedbackCount.ts` |
| Tablas | `users` (37), `sessions` (290), `audit_logs` (6.895), `deleted_records`, `feedback`, `agents`, `mesas` |
| Permisos | `/admin/usuarios|auditoria|papelera|feedback|permisos` solo admin; resto `/admin` team_leader+ |
| Pruebas | 25 E2E |
| Deuda | CSRF ausente; `sync-status` ejecuta `pm2 jlist`; deletes sin feature; auditoría fabricada; update borra mesa |

## 16. Perfil

**Propósito:** datos personales, rol/mesa, participaciones, estado y blanqueo de contraseña.

| Aspecto | Detalle |
|---|---|
| Rutas | `/profile` |
| Endpoints | `api/profile/change-password` |
| Lógica | `profileAccess.ts`, `sessionCache.ts` |
| Tablas | `users`, `employees`, `agents`, `sessions` |
| Permisos | Todos |
| Pruebas | 1 E2E |
| Deuda | `profileAccessCatalog` duplica rutas/roles |

## 17. Generador de firmas

**Propósito:** firma institucional para Outlook con preview, copia rich-text y PNG.

| Aspecto | Detalle |
|---|---|
| Rutas | `/generador-firmas` (**pública sin login**) |
| Componentes | `SignatureGenerator.astro` (628) |
| Lógica | 100% cliente |
| Integraciones | Logo fijo `public/firma.png` |
| Pruebas | 1 E2E |
| Deuda | Interpola inputs en `innerHTML` (self-XSS) |

## 18. Changelog

**Propósito:** visor de novedades por release, filtros y búsqueda.

| Aspecto | Detalle |
|---|---|
| Rutas | `/changelog` |
| Lógica | `changelog/{changelogService,changelogStats}.ts`, `src/config/changelog/*.md` |
| Integraciones | `git` (`execFileSync`) |
| Pruebas | 1 E2E + validación de changelog |
| Deuda | 2 procesos git sincrónicos por request; stats caen a 0 sin `.git` |

---

## 19. Transversales

| Transversal | Implementación | Estado |
|---|---|---|
| Autenticación | Cookie HMAC + tabla `sessions` + fingerprint | ✅ Sólida |
| Autorización | `routePermissions` + `getModulePermissions` + `helpdeskAccess` | ⚠️ Duplicada |
| CSRF | Token HMAC TTL 1 h | ⚠️ Aplicado en ~10 endpoints |
| Rate limit | En memoria | ⚠️ No distribuido |
| Auditoría | `audit_logs` + `logAdminAction` | ⚠️ Incompleta |
| Papelera | `deleted_records` | ⚠️ Parcial |
| Errores | `jsonError` + try/catch | ⚠️ Inconsistente |
| Observabilidad | Logs de consola / PM2 | 🔴 Sin métricas ni trazas |
| Configuración | `env.ts` con Zod para 2 claves | ⚠️ Mixtura `process.env`/`import.meta.env` |
| Navegación | `navigation.ts` | ⚠️ Fuente parcial |
| Storage | `EXTERNAL_STORAGE_DIR` | ⚠️ Local |
| Jobs | PM2 + scripts | ⚠️ Estado en archivos |
