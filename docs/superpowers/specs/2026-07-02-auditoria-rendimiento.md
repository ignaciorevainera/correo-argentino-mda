# Auditoría — Rendimiento

**Fecha:** 2026-07-02 (8.ª pasada)
**Enfoque:** Carga de cliente, consultas DB, optimización de recursos
**Base:** Escaneo integral del proyecto

---

## Resumen

| Prioridad | Cantidad |
|-----------|----------|
| 🔴 HIGH | 4 |
| 🟡 MEDIUM | 8 |
| 🟢 LOW | 7 |

---

## P0 — Alto impacto en carga de cliente

### R1.1 🔴 React runtime ~180KB para una sola página

El framework React + ReactDOM (~181.6 KB en `dist/client/_astro/`) se carga en
TODAS las páginas porque `@astrojs/react` es una integración global. Solo se usa
en `/titulos` con `<TitlesContainer client:idle />`. Ese componente hace
búsqueda, filtro y copiado — todo factible con vanilla JS (el proyecto ya hace
esto en todas las demás páginas).

**Fix:** Reescribir `TitlesContainer` como vanilla JS. Eliminar `@astrojs/react`,
`react`, `react-dom`, `@heroicons/react`, `@types/react`, `@types/react-dom`.
**Ahorro:** ~180+ KB del bundle de cliente.
**Esfuerzo:** 2-3 h.

### R1.2 🟡 CronogramaDashboard script: 111.8KB en un solo chunk

`CronogramaDashboard.astro_astro_type_script_index_0_lang.DTsz_0D7.js` es el
chunk JS más grande. Contiene monthly view, weekly view, overtime view, pasiva
view, drawer logic, exporters, notifications — todo en un solo bundle.

**Fix:** Usar `import()` dinámico para lazy-load de sub-módulos (overtime-view,
pasiva-view) solo cuando el usuario navega a esas pestañas.
**Ahorro:** ~60-80KB en carga inicial.
**Esfuerzo:** 1-2 h.

### R1.3 🟡 BaseLayout CSS: 250.5KB en todas las páginas

`BaseLayout.DyP84lZV.css` incluye todo Tailwind v4 + DaisyUI v5 (menos componentes
excluidos).

**Fix:** Auditar qué componentes DaisyUI se usan realmente. Expandir la lista de
exclusión en `global.css`. Verificar que el JIT de Tailwind purga clases no usadas.
**Esfuerzo:** 1 h.

---

## P1 — Consultas DB ineficientes

### R2.1 🔴 `SELECT *` en tabla `agents` en 7 archivos

La tabla `agents` tiene 28 columnas incluyendo 6 JSON (`esquemaSemanal`,
`esquemaHorario`, `esquemaBreakInicio`, `esquemaBreakFin`, etc.).
`db.select().from(agents)` fetcha TODO cada vez.

| Archivo | Línea | Contexto |
|---------|-------|----------|
| `src/lib/disponibilidad.ts` | 51 | Polling cada 10s |
| `src/lib/attendance.ts` | 78 | Attendance data |
| `src/pages/api/cronograma/index.ts` | 93 | Cronograma API |
| `src/components/supervision/cronograma/CronogramaContent.astro` | 6 | SSR |
| `src/components/supervision/calidad/CalidadContent.astro` | 84 | SSR |
| `src/pages/api/cronograma/months/index.ts` | 25 | Mes creation |

**Fix:** `db.select({ id: agents.id, name: agents.name, ... })` para fetch solo
columnas necesarias. Priorizar `disponibilidad.ts` (hot path).
**Esfuerzo:** 30 min.

### R2.2 🔴 O(N×M) loops con `.find()` en attendance

`src/lib/attendance.ts` líneas 203-327: `getAttendanceData()` usa
`dbAgents.forEach()` con `dbSchedules.find()` y `dbAttendance.find()` adentro.
Para ~30 agentes y 31 días, son ~930 iteraciones cada una haciendo 2 `.find()`.

**Fix:** Pre-indexar `dbSchedules` y `dbAttendance` en `Map<key, T>` con clave
`agentName+date` y `agentId+date`. Reemplazar `.find()` por `.get()`.
Cambia O(N) a O(1).
**Esfuerzo:** 30 min.

### R2.3 🟡 Sin índices en columnas frecuentemente consultadas — RESUELTO

| Tabla | Índices agregados | Columnas |
|-------|-------------------|----------|
| `schedules` | 2 | `agentName`, `date` |
| `operatorAttendance` | 2 | `(agentId, date)` compound + `date` |
| `terminals` | 1 | `nis` |
| `qualityAudits` | 1 | `month` |

**Fix:** Agregados 6 índices vía Drizzle en `src/db/schema.ts`. Aplicados con `npm run db:push`.

### R2.4 🟡 `getDisponibilidadHoy()` sin caché — cada 10 segundos

`src/lib/disponibilidad.ts` línea 42: llamada cada 10 segundos desde el polling.
Cada llamada fetcha TODOS los agentes (28 cols + 6 JSON) y TODOS los schedules
de hoy.

**Fix:** Caché en memoria con TTL de 5-10 segundos (variable de módulo con timestamp).
**Esfuerzo:** 15 min.

### R2.5 🟡 CronogramaContent carga TODOS los schedules sin filtro

`src/components/supervision/cronograma/CronogramaContent.astro` línea 23:
`db.select().from(schedules)` — fetcha TODOS los registros históricos.

**Fix:** `.where(like(schedules.date, \`${currentMonth}-%\`))`.
**Esfuerzo:** 5 min.

### R2.6 🟡 `getOffices()` fetcha TODOS los officeAssets por request — RESUELTO

`src/lib/officeQueries.ts` líneas 175-182: en cada request paginada de oficinas,
se fetchan TODOS los hostnames de `officeAssets` para un Set de deduplicación.

**Fix:** Cache module-level con TTL de 60s. Se agrega `manualHostnamesCache` + timestamp. La query solo se ejecuta cuando el cache expira.

### R2.7 🟡 Doble query para `hasMore` en terminals

`src/lib/terminalQueries.ts` líneas 253, 295-296: después de fetchear la página,
segunda query con `limit(1).offset(offset + limit)` para verificar si hay más.

**Fix:** Fetch `limit + 1` filas y cortar, o usar COUNT como `officeQueries.ts`.
**Esfuerzo:** 10 min.

### R2.8 🟡 Export endpoints cargan tablas enteras en memoria

`src/pages/api/export/offices.ts` (50+ columnas) y `src/pages/api/export/terminals.ts`.

**Fix:** Streaming o mínimo seleccionar solo columnas del CSV.
**Esfuerzo:** 30 min.

### R2.9 🟡 Generación de mes: N queries individuales sin transacción

`src/pages/api/cronograma/months/index.ts` líneas 25-66: loop por cada agente
con DELETE + INSERT individual. ~60 queries para ~30 agentes.

**Fix:** Wrap en `db.transaction()`. Batch deletes con `inArray()`.
**Esfuerzo:** 30 min.

---

## P2 — Optimización de recursos

### R8.1 🟡 `setInterval` nunca limpiados — memory leaks

| Archivo | Línea | Intervalo | Limpieza |
|---------|-------|-----------|----------|
| `SyncDashboard.astro` | 359 | cada 30s | ❌ NUNCA |
| `AsignacionContent.astro` | 904 | cada 1s | ❌ NUNCA |
| `AsignacionContent.astro` | 1804 | cada 10s | ❌ NUNCA |

**Fix:** Guardar IDs y limpiar en `astro:before-swap`.
**Esfuerzo:** 30 min.

### R5.2 🟡 0 páginas usan `prerender`

Candidatos:
- `/login` — form HTML estático (POST handler puede seguir server)
- `/generador-firmas` — puramente client-side
- `/titulos` — fetch de Google Sheets client-side

**Fix:** Agregar `export const prerender = true`.
**Esfuerzo:** 30 min.

### R1.4 🟢 Leaflet desde CDN sin tree-shaking — RESUELTO

`src/components/offices/DirectorioContent.astro` línea 575: `unpkg.com/leaflet`.

**Fix:** Instalado `leaflet` como dependencia npm. CSS importado estáticamente en el frontmatter (~13KB). JS cargado con `await import("leaflet")` dentro de `initializeMap()`, solo cuando el usuario cambia a la vista de mapa (~150KB lazy). Se eliminaron tags CDN. `@types/leaflet` en devDependencies.

### R1.5 🟢 `topojson-client` no lazy-loaded — RESUELTO

`src/components/offices/DirectorioContent.astro` línea 581: importado en `<script>`.

**Fix:** Se movió a `await import("topojson-client")` dentro de `initializeMap()`, solo se carga cuando el usuario cambia a la vista de mapa.

### R2.10 🟢 Middleware fetcha password hash en cada request

`src/middleware.ts` líneas 43-53: `select()` de users trae TODAS las columnas.

**Fix:** `db.select({ id: users.id, username: users.username, role: users.role })`.
**Esfuerzo:** 15 min.

### R6.3 🟢 `theme-change` — VERIFICADO: en uso

`package.json` línea 39: `theme-change` se importa en `scripts/toggle-mode.ts` línea 1 y se usa en `BaseLayout.astro` para el toggle de modo oscuro del header. El escaneo inicial no lo detectó porque el import está en un archivo `.ts` fuera de `src/`.

**Resolución:** Verificado — se mantiene. Sin cambios necesarios.

### R6.4 🟢 `@astrojs/check` en dependencies Y devDependencies — RESUELTO

`package.json` líneas 17, 44: duplicado.

**Fix:** Se eliminó de `dependencies`, queda solo en `devDependencies`.

---

## Plan de Acción — Rendimiento

| Prioridad | ID | Hallazgo | Esfuerzo | Ahorro/Impacto |
|-----------|-----|----------|----------|----------------|
| **P0** | R1.1 | 🔴 Eliminar React (~180KB) | 2-3 h | ~180KB bundle |
| **P0** | R1.2 | 🟡 Lazy-load CronogramaDashboard | 1-2 h | ~60-80KB bundle |
| **P0** | R1.3 | 🟡 Reducir CSS global | 1 h | ~50KB+ bundle |
| **P1** | R2.1 | 🔴 SELECT * en agents (7 archivos) | 30 min | CPU + memoria |
| **P1** | R2.2 | 🔴 O(N×M) loops attendance | 30 min | Performance |
| **P1** | R2.3 | 🟡 Índices DB faltantes | ✅ Resuelto — 6 índices agregados | Query speed |
| **P1** | R2.4 | 🟡 Caché disponibilidad | 15 min | DB pressure |
| **P1** | R2.5 | 🟡 Filtrar schedules SSR | 5 min | Data size |
| **P1** | R2.6 | 🟡 Caché officeAssets | ✅ Resuelto — cache 60s TTL | 1 query/req |
| **P1** | R2.7 | 🟡 Doble query terminals | 10 min | 2x query cost |
| **P1** | R2.8 | 🟡 Export endpoints memoria | 30 min | Memory |
| **P1** | R2.9 | 🟡 Mes sin transacción | 30 min | Atomicity |
| **P2** | R8.1 | 🟡 setInterval leaks | 30 min | Memory |
| **P2** | R5.2 | 🟡 prerender candidatos | 30 min | Server load |
| **P2** | R1.4 | 🟢 Leaflet CDN → self-host | ✅ Resuelto — import dinámico | Dependency |
| **P2** | R1.5 | 🟢 topojson lazy load | ✅ Resuelto — import() dinámico | JS |
| **P2** | R2.10 | 🟢 Middleware select columns | 15 min | Security+perf |
| **P2** | R6.3 | 🟢 theme-change sin uso | ✅ Resuelto — en uso | Dependency |
| **P2** | R6.4 | 🟢 @astrojs/check duplicado | ✅ Resuelto — movido a devDeps | Dependency |

**Total esfuerzo estimado:** ~10-14 h.
**Ahorro estimado:** ~300KB+ de bundle, reducción significativa de queries DB.

### Leyenda

- **P0:** Alto impacto en carga de cliente.
- **P1:** Consultas DB ineficientes.
- **P2:** Optimización de recursos.
