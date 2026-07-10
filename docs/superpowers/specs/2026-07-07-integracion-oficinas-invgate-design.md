# Integración Directorio de Oficinas ↔ InvGate — Diseño y Catálogo de Mejoras

**Tipo:** documento de investigación y diseño. No es spec de implementación.
**Audiencia:** equipo de desarrollo. Sirve para decidir qué construir y en qué orden.
**Fecha:** 2026-07-07

---

## 1. Contexto y objetivo

El Portal MDA tiene un directorio de oficinas (`/oficinas`) con 63 campos por oficina: nombre, NIS,
dirección, coordenadas, contactos, activos, terminales, etc. InvGate Service Management es el sistema de
tickets oficial de la organización. Ambos sistemas describen las mismas ubicaciones físicas (sucursales
de Correo Argentino), pero hoy no hay vínculo formal entre un registro de `offices` y un `location` de
InvGate.

Existe código de matching (`src/lib/invgate/locationMatcher.ts`) que extrae el NIS desde el nombre de
la location de InvGate (`(A0001)`) y lo cruza con `offices.code`. Esta lógica ya se usa en producción
para sincronizar `employees.sucursal`. Pero el matching **no está expuesto en UI**, no persiste el
vínculo, y no hay página de administración.

**Objetivo de este documento:**
1. Diseñar la integración entre el directorio de oficinas y las ubicaciones de InvGate
   (vínculo, indicador visual, página admin, sync de datos)
2. Catalogar mejoras posibles al directorio, con y sin datos de InvGate
3. Estimar esfuerzo por feature y proponer un roadmap de implementación

**No es objetivo:** implementar ninguna feature. Cada item aprobado tendrá su propia spec → plan → build.

---

## 2. Estado actual

### 2.1 Lo que ya existe

| Componente | Archivo | Función |
|---|---|---|
| Cliente HTTP InvGate | `src/lib/invgateClient.ts` | `invgateGet<T>(endpoint)` con Basic auth, timeout 15s |
| Parser de nombres | `src/lib/invgate/locationMatcher.ts:32` | `parseInvgateLocationName()` extrae NIS, CP, CC, address de `nombre (NIS) (CPABC) dirección` |
| Matcher NIS↔oficina | `src/lib/invgate/locationMatcher.ts:85` | `matchLocations()` cruza leaf locations con `offices.code` y devuelve `LocationMatch[]` con `matched: boolean` |
| Sync empleados | `src/lib/invgate/locationSync.ts` | `syncInvgateLocations()` actualiza `employees.sucursal` basado en match por NIS |
| Sync usuarios | `src/lib/invgate/userSync.ts` | `fullInvgateSync()` marca `employees.invgateExists` para usuarios activos de InvGate |
| Tipos TypeScript | `src/types/invgate.ts` | `InvgateLocation`, `InvgateUser`, `InvgateIncident`, `InvgateHelpdesk`, `InvgateKbArticle`, etc. |
| Registro en nav | `src/lib/navigation.ts:141` | `/admin/invgate/ubicaciones` registrado — **sin página implementada** |
| Endpoint status | `src/pages/api/admin/invgate-status.ts` | Verifica conectividad con `sd.version` |

### 2.2 Gaps concretos

1. **Sin UI de matching.** `matchLocations()` es solo una función. No hay página que muestre el resultado del cruce.
2. **Sin persistencia del vínculo.** No existe relación `offices.id → invgate location.id` en la DB.
3. **Sin indicador visual.** Las filas del directorio no muestran si una oficina tiene match en InvGate.
4. **Sin sync de datos de oficina.** Cuando un `location.name` cambia en InvGate (ej: renombran sucursal), no se refleja en `offices`.
5. **Sin trigger de refresh.** Solo se ejecuta durante `fullInvgateSync()` (sync de empleados), no como acción independiente.
6. **Sin página admin.** `/admin/invgate/ubicaciones` está en la nav pero devuelve 404.

### 2.3 Endpoints InvGate disponibles (no usados aún)

Lista completa en `.agents/skills/invgate-api-requests/endpoints-reference.md`. Relevantes para el directorio:

| Endpoint | Qué devuelve | Posible uso en directorio |
|---|---|---|
| `helpdesks` | Lista de mesas de ayuda | Mostrar qué helpdesk da soporte a cada oficina |
| `helpdesksandlevels` | Jerarquía completa | Árbol de escalamiento por ubicación |
| `groups` | Grupos organizacionales | Equipos asignados a oficina |
| `locations.users` | Usuarios de una ubicación | Personal asignado a cada oficina |
| `locations.observers` | Observadores | Notificaciones por oficina |
| `incidents.by.helpdesk` | Tickets abiertos (IDs) | Contador de tickets por oficina |
| `incidents.by.agent` | Tickets de un agente | Tickets del personal de la oficina |
| `incidents.details.by.view` | Tickets con vista guardada | Dashboard de tickets filtrado |
| `timetracking` | Horas cargadas por ticket | Métricas de esfuerzo por oficina |
| `breakingnews.all` | Comunicados activos | Avisos importantes en ficha de oficina |
| `kb.articles.by.category` | Artículos de KB | KB sugerido según categoría de la oficina |
| `users.by` | Búsqueda de usuarios | Buscar personal por teléfono de oficina |
| `cis.by.id` | Configuration Items | Cruzar con `terminals` para CI matching |
| `categories` | Categorías de tickets | Tipos de incidentes por oficina |

### 2.4 Limitación crítica de InvGate

`GET /locations` solo devuelve `{ id, name, parent_id, total }`. No incluye dirección, latitud,
longitud, teléfono, email ni ningún otro dato rico.

**Importante:** `parent_id` en InvGate representa **jerarquía organizacional de ubicaciones**
(Región → Provincia → Ciudad → Sucursal). No es equivalente a `offices.parentNis`, que relaciona
oficinas del mismo tipo (una Unidad Postal depende de una Sucursal Automatizada). Son conceptos
distintos y no se mapean entre sí.

---

## 3. Diseño de integración: directorio ↔ ubicaciones InvGate

### 3.1 Matching

**Reutilizar lo existente.** `parseInvgateLocationName()` extrae el NIS del nombre de la location
(ej: `"SUCURSAL MONTE GRANDE (A0001) (A0001ABC) Av. Mitre 123"` → `nis: "A0001"`).
`matchLocations()` lo cruza con `offices.code`.

**Mejora necesaria:** el matcher actual solo funciona con NIS en paréntesis. Hay que agregar un
fallback por similitud de nombre para casos donde el formato no coincida (ej: NIS sin paréntesis,
nombre parcial). Esto se implementa como paso opcional post-match: para ubicaciones sin NIS parseable,
buscar por `displayName` normalizado contra `offices.name`.

**Filtro de leaf locations:** `matchLocations()` ya excluye ubicaciones que son padre de otras
(ubicaciones "contenedoras"). Esto es correcto — solo interesan las hojas del árbol.

### 3.2 Persistencia del vínculo

Nueva tabla: `office_invgate_links`

```sql
CREATE TABLE office_invgate_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  invgate_location_id INTEGER NOT NULL,
  invgate_parent_id INTEGER,
  invgate_display_name TEXT,
  invgate_cp TEXT,
  invgate_cc TEXT,
  invgate_address TEXT,
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(office_id)
);
```

**Datos extraídos de InvGate (solo lectura, no pisan `offices`):**

| Campo | Fuente | Ejemplo |
|---|---|---|
| `invgate_display_name` | `parseInvgateLocationName().displayName` | "SUCURSAL MONTE GRANDE" |
| `invgate_cp` | `parseInvgateLocationName().cp` | "A0001ABC" |
| `invgate_cc` | `parseInvgateLocationName().cc` | "123" |
| `invgate_address` | `parseInvgateLocationName().address` | "Av. Mitre 123" |
| `invgate_parent_id` | `location.parent_id` | `42` |

**Nota sobre `invgate_parent_id`:** es el ID del padre directo en el árbol jerárquico de
ubicaciones de InvGate (ej: Ciudad → Sucursal). No tiene relación con `offices.parentNis`
(dependencia funcional entre oficinas postales). La jerarquía completa (Región → Provincia →
Ciudad → Sucursal) se obtendría caminando los `parent_id` hacia arriba, pero no se implementa
en v1.

**Por qué tabla aparte y no columnas en `offices`:**

- `offices` ya tiene 63 columnas. Agregar más acopla el schema a InvGate.
- Una tabla de link permite: historial de sync, metadata de la vinculación, desvincular sin perder datos.
- Facilita auditoría: saber cuándo fue la última sync y qué nombre tenía en InvGate en ese momento.
- Si mañana se cambia de sistema de tickets, solo se borra esta tabla.

**Alternativa considerada y descartada:** columna `invgate_location_id` en `offices`. Más simple,
pero pierde trazabilidad (no hay `last_synced_at`, no hay snapshot del nombre InvGate).

### 3.3 Indicador visual en el directorio

**Oficinas con vínculo InvGate:** cuando `office.id` tiene un registro en `office_invgate_links`,
mostrar un badge corto:

```
[icono: link] En InvGate
```

- **Ícono:** `boxicons:link` size={14}
- **Ubicación:** a la derecha del NIS, o como chip adicional debajo del nombre
- **Sin timestamp ni envejecimiento.** El badge solo indica presencia. La frescura del sync
   se muestra globalmente (ver sección 3.3a).
- **Estado según coincidencia de nombre:**
   - Si `offices.name === invgate_display_name`: `badge-success` (verde), tooltip "Presente en InvGate"
   - Si `offices.name !== invgate_display_name`: `badge-warning` (amarillo),
     tooltip "Nombre difiere de InvGate. Ver detalle expandible."

**Oficinas sin vínculo InvGate:** cuando `office.id` NO tiene registro en `office_invgate_links`,
mostrar un badge gris de ausencia:

```
[icono: link] Sin InvGate
```

- **Token:** `badge badge-ghost` (gris, sin color semántico)
- **Tooltip:** "No registrada en InvGate"
- **Misma ubicación que el badge verde.**
- **Sin efecto en el detalle expandible:** estas oficinas no tienen sección "Datos InvGate".
  Muestran sus datos existentes (contactos, información, equipos) sin cambios.

El badge se obtiene vía LEFT JOIN en `getOffices()`. En `@lib/officeQueries` se agrega
`office_invgate_links` a la query existente. La comparación `offices.name !== invgate_display_name`
se evalúa en el template. Si no hay link, se renderiza el badge gris por defecto.

**Detalle expandible — sección "Datos InvGate":** cuando una oficina tiene badge "En InvGate",
el panel expandible de la fila incluye una sección adicional. Sigue el mismo patrón visual que
las secciones existentes en `OfficeRow.astro` (Contactos, Información, Equipos):

```
┌──────────────────────────────────────────────────┐
│ [icono: data] Datos InvGate                      │  ← mismo h2 que "Contactos"/"Información"
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ CP              A0001ABC                     │ │  ← tarjeta con borde base-300,
│ │ CC              123                          │ │     bg base-100/50, shadow-sm
│ │ Dirección       Av. Mitre 123               │ │
│ │ Nombre          SUCURSAL MONTE GRANDE        │ │
│ │ Parent InvGate  SUCURSAL REGIONAL SUR        │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- **Ícono de sección:** `boxicons:data` size={16} color `text-secondary`
- **Título:** "Datos InvGate" con el mismo estilo tipográfico que "Contactos" e "Información"
  (text-xs font-bold uppercase tracking-wide text-base-content/70)
- **Tarjeta de contenido:** `rounded-lg border border-base-300 bg-base-100/50 p-3 shadow-sm`
  (misma clase que la tarjeta de Información)
- **Layout interno:** pares campo-valor en filas. Etiqueta en `text-xs font-semibold text-base-content/60`
  con ancho fijo (~100px). Valor en `text-sm text-base-content/90 font-mono` cuando sea código
  (CP, CC), `font-sans` para texto libre (dirección, nombre)
- **Orden de campos:** CP, CC, Dirección, Nombre, Parent InvGate. Este orden refleja: información
  geográfica primero, identidad después, jerarquía al final
- **Condición de renderizado:** solo si `office.id` tiene registro en `office_invgate_links`
- **NIS duplicados:** si InvGate tiene más de una location cuyo nombre parsea al mismo NIS,
  el matcher toma la primera y en el detalle se muestra un mensaje adicional al final de la
  sección: *"En InvGate se encontraron N registros con el mismo NIS. Se vinculó el primero."*
  Este mensaje solo aparece si se detectaron duplicados durante el último sync.

Esta sección se implementa al final de la Fase 1, una vez que el sync y el indicador global de
frescura estén funcionando correctamente. Ver sección 3.5 para la fuente de cada campo.

### 3.3a Indicador global de frescura en el directorio

En `DirectorioContent.astro`, por encima del formulario de filtros, mostrar un strip global
con el estado de la última sincronización:

 ```
┌──────────────────────────────────────────────────────────────────┐
│ [icono: refresh] InvGate sincronizado: hace 2 días                │
│ [admin] [botón: Sincronizar ahora]                               │
│                                                                  │
│ (si > 7 días): [icono: warning] InvGate sin sincronizar          │
│   desde hace 10 días. Los datos pueden estar desactualizados.    │
│ [admin] [botón: Sincronizar ahora]                               │
│                                                                  │
│ (si error en última sync): [icono: error] Error en la última     │
│   sincronización de InvGate (2026-07-05)                         │
│ [admin] [botón: Sincronizar ahora]                               │
└──────────────────────────────────────────────────────────────────┘
```

- **Token base:** `alert alert-info` con ícono `boxicons:refresh`
- **Warning (> 7 días):** `alert alert-warning` con ícono `boxicons:time`
- **Error:** `alert alert-error` con ícono `boxicons:x-circle`
- **Texto:** derivado del `last_synced_at` más reciente en `office_invgate_links`
- **Placement:** dentro del formulario de filtros, antes de los selects, o como strip
   independiente arriba del form. Depende de lo que visualmente moleste menos.
- **Datos:** el componente server (`DirectorioContent.astro`) consulta
  `SELECT MAX(last_synced_at) FROM office_invgate_links` y lo pasa al template.
- **Botón "Sincronizar ahora" (solo admin):** al final del strip, un botón `<form method="POST"`
  que envía a `/api/admin/invgate/locations/sync`. El servidor ejecuta el sync y redirige
  de vuelta al directorio con un toast de resultado. El botón se renderiza solo si
  `user.role === "admin"` (o `isAllowed("Administrar Contenido", user.role)`).

Esto reemplaza el tooltip per-office y el badge de envejecimiento. La oficina individual dice
"En InvGate" sí/no. El header global dice qué tan fresco es ese dato.

### 3.4 Página admin: `/admin/invgate/ubicaciones`

> ⏸️ **SUSPENDIDO** — no es objetivo actual. Se habilita más adelante cuando se quiera
> gestionar vínculos manualmente, ver stats detalladas o administrar excepciones de matching.
>
> El diseño propuesto original (tabla de matching, vincular/desvincular manual, stats
> resumen, botón "Sincronizar ahora") se mantiene en este doc como referencia para cuando
> se reactive.

**Ya registrada en `navigation.ts:141`** pero no se implementa en esta fase.

### 3.5 Datos complementarios de InvGate (solo lectura)

En v1 no se sincronizan campos de `offices`. No hay escritura desde InvGate hacia MDA
ni desde MDA hacia InvGate. Esto elimina todo riesgo de pisar ediciones manuales.

**Qué se muestra en cambio:** en el detalle expandible de cada oficina vinculada, se agrega
una sección "Datos InvGate" con los campos extraídos por `parseInvgateLocationName()`:

```
┌─────────────────────────────────────┐
│ Datos InvGate                       │
│                                     │
│ CP:       A0001ABC                  │
│ CC:       123                       │
│ Dirección: Av. Mitre 123            │
│ Nombre:   SUCURSAL MONTE GRANDE     │
│ Parent InvGate: SUCURSAL REGIONAL SUR     │
└─────────────────────────────────────┘
```

- **CP (código postal):** `invgate_cp` — parseado del segundo paréntesis. MDA no tiene este dato
  en `offices`, así que es información nueva.
- **CC (cost center):** `invgate_cc` — extraído de `CC_<digits>` en el nombre. Complementa los
  múltiples campos `cc_*` que ya tiene `offices` (cc_commercial, cc_operations, etc.).
- **Dirección:** `invgate_address` — texto entre `)` y `(` en el nombre de location.
  `offices.address` puede tener un valor distinto (ej: formato de otro sistema). Mostrar ambos
  permite ver discrepancia sin pisar nada.
- **Nombre:** `invgate_display_name` — nombre sin paréntesis. Si difiere de `offices.name`,
  la discrepancia es visible sin que el sistema tome partido.
- **Parent InvGate:** resuelto desde `invgate_parent_id`. Es el padre directo en el árbol
  de ubicaciones de InvGate (jerarquía organizacional). NO equivale a `offices.parentNis`
  (dependencia funcional entre oficinas postales). La jerarquía completa (Región → Provincia →
  Ciudad → Sucursal) requeriría caminar los parent_id de cada location, no se implementa en v1.

**Disección de un `location.name` de InvGate:**

```
"SUCURSAL MONTE GRANDE (A0001) (A0001ABC) Av. Mitre 123"
 └───── displayName ─────┘ └─nis─┘ └──cp───┘ └── address ──┘
```

**Qué NO se hace en v1:**
- No se escribe `invgate_display_name` en `offices.name`
- No se escribe `invgate_cp` en `offices.postal_code` (ni existe ese campo)
- No se escribe `invgate_address` en `offices.address`
- No se resuelve `invgate_parent_id` → `offices.parentNis` (son conceptos distintos)

**Discrepancia detectable en v1:** cuando `invgate_display_name !== offices.name`, el badge
"En InvGate" cambia a `badge-warning` (ver sección 3.3). No se corrige ni se alerta más allá
del color. Esto es deliberado: el usuario ve la diferencia, el detalle expandible la confirma,
y el sistema no toma partido.

**Qué se deja para v2 (si se aprueba):**
- Posibilidad de promover datos de InvGate → MDA vía checkbox en admin page (suspendida)
- Sincronización de `invgate_display_name` → `offices.name` con resolución manual

**Alternativa considerada y descartada:** sync automático bidireccional con last-writer-wins.
Riesgoso (pisar ediciones manuales), complejo, y solo 2-3 campos útiles.

### 3.6 Trigger de sync

Las ubicaciones en InvGate son datos maestros organizacionales. Cambian poco (apertura/cierre/renombre
de sucursales, quizá 1-2 por mes). Pero cuando cambian, el vínculo pierde frescura. Combinamos
tres estrategias:

1. **Cron diario (automático).** Endpoint GET `/api/admin/invgate/locations/sync` invocado por worker
   PM2 `sync-office-links` cada 24h. Corre en background. ~300 locations en batch, termina en
   segundos. Sin intervención manual, sin rate limits.

2. **Manual (botón en el directorio, solo admin).** POST al mismo endpoint, accionado desde el
   botón "Sincronizar ahora" en el indicador global de frescura (ver sección 3.3a). El servidor
   ejecuta el sync y redirige de vuelta al directorio con un toast. No requiere página admin
   separada — el botón vive en el header del directorio existente.

3. **Indicador global de frescura.** El header del directorio muestra la antigüedad del último sync
   (verde ≤ 7d, warning > 7d, error si falló). Ver sección 3.3a.

**Webhook descartado:** InvGate no expone webhooks para cambios en locations.

### 3.7 RBAC

- **Ver badge "En InvGate" en directorio:** todos los roles (informativo).
- **Ver indicador global de frescura:** todos los roles (informativo).
- **Botón "Sincronizar ahora" en el directorio:** solo `admin` (o quien tenga `isAllowed("Administrar Contenido")`)
- **Endpoint de sync (GET cron + POST manual):** ambos requieren sesión admin válida.
  El worker PM2 se autentica con una clave interna (`X-Internal-Key`) o con una sesión de
  servicio. Si no es admin, devuelve 401.
- **Página admin `/admin/invgate/ubicaciones`:** ⏸️ suspendida. Cuando se reactive:
  `supervisor` o superior para ver, `admin` para mutar.

---

## 4. Catálogo de mejoras posibles al directorio

Cada item incluye: descripción, esfuerzo estimado (S ≤ 1 día, M = 2-4 días, L > 4 días),
dependencias, y si requiere InvGate.

### 4.1 Mejoras sin dependencia de InvGate

| # | Feature | Descripción | Esfuerzo | Dependencias |
|---|---|---|---|---|
| 1 | **Vista árbol de dependencias** | Modo alternativo (tab) donde las oficinas se muestran como árbol jerárquico: oficina padre → sucursales hijas. Expandible/colapsable. | M | Campo `parentNis` ya existe |
| 2 | **Comparación side-by-side** | Seleccionar 2+ oficinas (checkboxes) y ver comparación de sus campos en tabla horizontal. | M | Ninguna |
| 3 | **Histórico de cambios por oficina** | Registrar quién editó qué campo y cuándo. Usar `audit_logs` existente o tabla nueva. Vista de historial en el panel detalle de cada oficina. | M | Schema `audit_logs` ya existe; hay que extenderlo con `entity_type` + `entity_id` |
| 4 | **Vista de galería / cards** | Alternativa a tabla: vista de cards con datos clave de cada oficina. Mejor para browsing visual. | M | Ninguna |
| 5 | **Indicador de match InvGate** | Badge en `OfficeRow` cuando la oficina está vinculada. Tooltip con última sync. | S | Tabla `office_invgate_links` + query en `getOffices()` |
| 6 | **Búsqueda fuzzy** | Reemplazar búsqueda exacta por fuzzy (Levenshtein / Fuse.js) en el search input actual. Tolera errores de tipeo en nombres de oficina. | S | Ninguna |
| 7 | **Badges de completitud** | Mostrar en cada fila íconos que indiquen si la oficina tiene: email, teléfono, coordenadas, contactos. Rojo = falta, verde = completo. | S | Ninguna |
| 8 | **Export filtrado avanzado** | Agregar checkboxes de columnas al export actual: elegir qué campos exportar, no solo CSV completo. | S | Ruta `api/export/offices` existente |
| 9 | **Mini-dashboard en detalle** | Al expandir una fila, mostrar: total de contactos, activos, terminales; últimas ediciones; última sync InvGate. | S | Tabla de link |
| 10 | **Filtro por rango de códigos postales** | Agregar filtro "CP desde / hasta" para búsqueda geográfica sin mapa. | S | Ninguna |

### 4.2 Mejoras con dependencia de InvGate

| # | Feature | Descripción | Esfuerzo | Dependencias InvGate |
|---|---|---|---|---|
| 11 | **Métricas de time tracking** | Horas totales trackeadas para tickets de la oficina. Gráfico simple (barra) en el detalle. | L | Feature 16; endpoint `timetracking` con filtro por `from`/`to` |
| 12 | **Match con CI (Configuration Items)** | Cruzar `terminals` de MDA con `cis.by.id` de InvGate. Requiere que los CIs tengan un identificador común (hostname, serial). Investigación previa necesaria. | L | Feature 14; exploración de qué CIs existen |
| 13 | **Dashboard de SLA por oficina** | Agregar vista resumen con: % tickets dentro de SLA, tiempo medio de resolución, tickets vencidos. Datos desde `incidents.details.by.view`. | L | Feature 16; requiere vista guardada en InvGate |
| 14 | **Página admin vinculación** | Tabla de matching + sync manual + vincular/desvincular. Sección 3.4 de este doc. | M | Tabla `office_invgate_links` + endpoint sync |
| 15 | **Sync supervisado de campos** | Detectar diferencias nombre/parentNIS y permitir al admin promover cambios desde InvGate. Sección 3.5. | M | Feature 14 |
| 16 | **Contador de tickets abiertos** | En el detalle expandible de cada oficina, mostrar "N tickets abiertos". Usa `incidents.by.helpdesk` (IDs) + batch `GET /incidents?ids[]=` para filtrar por `location_id`. | M | Feature 14; requiere mapear helpdesk → oficina |
| 17 | **KB sugerido** | Artículos de knowledge base (`kb.articles.by.category`) sugeridos según categoría de tickets de la oficina. | M | Feature 16 (necesita categorías frecuentes) |
| 18 | **Personal asignado** | Mostrar lista de usuarios de InvGate asignados a la location de la oficina. Usa `locations.users`. | S | Feature 14; endpoint ya probado en `locationSync.ts` |
| 19 | **Breaking news por ubicación** | En el detalle de la oficina, mostrar comunicados activos (`breakingnews.all`) relevantes. | S | Feature 14 |
| 20 | **Helpdesk que da soporte** | Mostrar nombre del helpdesk asociado a la oficina/location. Usa `helpdesks`. | S | Feature 14 |

---

## 5. Roadmap propuesto

### Fase 1 — Fundación (badge + indicador global + cron)

| # | Item | Esfuerzo | Prioridad |
|---|---|---|---|
| 1 | Crear tabla `office_invgate_links` + push DB | S | P0 |
| 2 | Endpoint `/api/admin/invgate/locations/sync` (GET cron + POST manual) | S | P0 |
| 3 | Worker PM2 `sync-office-links` que llama al endpoint cada 24h | S | P0 |
| 4 | Badge en `OfficeRow` con 3 estados: verde "En InvGate" (nombre coincide), warning "En InvGate" (nombre difiere), ghost "Sin InvGate" (sin vínculo) | S | P0 |
| 5 | Indicador global de frescura en `DirectorioContent` (sobre filtros) + botón "Sincronizar ahora" (solo admin) | S | P0 |
| 6 | Sección "Datos InvGate" en detalle expandible (CP, CC, dirección, nombre, parent InvGate). Implementada al final de la fase, después de verificar que sync y badge funcionan correctamente | M | P0 |

**Orden de implementación:** items 1-3 (infraestructura) → items 4-5 (badge 3 estados + indicador global) → verificar sync funciona → item 6 (detalle expandible con datos complementarios).

**Entregable:** el directorio muestra badge por oficina: verde "En InvGate" si nombre coincide,
warning "En InvGate" si difiere, ghost "Sin InvGate" si no hay vínculo. El header del directorio
muestra "InvGate sincronizado: hace N días" con estado verde/amarillo/rojo + botón "Sincronizar
ahora" solo para admin que refresca la página. Cron diario mantiene datos frescos. Al expandir
la fila de una oficina vinculada, sección "Datos InvGate" con CP, CC, dirección, nombre y parent
InvGate, usando el mismo estilo visual que las secciones Contactos/Información/Equipos existentes.
Si hubo NIS duplicados en el último sync, la sección muestra un mensaje de advertencia. Sin
página admin ni escritura a `offices` — solo lectura.

### Fase 2 — Sync supervisado + mini-dashboard

| # | Item | Esfuerzo | Prioridad |
|---|---|---|---|
| 7 | UI de promoción de nombre desde InvGate → MDA (checkbox en admin page) | M | P1 |
| 8 | Personal asignado desde `locations.users` | S | P1 |
| 9 | Mini-dashboard en detalle de oficina (item 9) | S | P1 |

### Fase 3 — Datos operativos de InvGate

| # | Item | Esfuerzo | Prioridad |
|---|---|---|---|
| 10 | Contador de tickets abiertos (item 16) | M | P2 |
| 11 | Breaking news en ficha (item 19) | S | P2 |
| 12 | Helpdesk que da soporte (item 20) | S | P2 |
| 13 | KB sugerido (item 17) | M | P3 |

### Fase 4 — Mejoras sin InvGate + features avanzadas

| # | Item | Esfuerzo | Prioridad |
|---|---|---|---|
| 14 | Búsqueda fuzzy (item 6) | S | P2 |
| 15 | Badges de completitud (item 7) | S | P2 |
| 16 | Vista árbol de dependencias (item 1) | M | P3 |
| 17 | Export filtrado avanzado (item 8) | S | P3 |
| 18 | Métricas SLA (item 13) | L | P3 |
| 19 | Match con CI (item 12) | L | P3 |

---

## 6. Riesgos y decisiones pendientes

### Riesgos

1. **NIS duplicados en InvGate.** Dos locations con mismo NIS en el nombre (no debería ocurrir,
   pero defensivo). El matcher toma la primera y registra el duplicado en el resultado del sync.
   Mitigación: en la sección "Datos InvGate" del detalle expandible, si se detectaron duplicados,
   se muestra un mensaje: *"En InvGate se encontraron N registros con el mismo NIS. Se vinculó
   el primero."*

2. **Oficinas MDA sin match posible.** Algunas oficinas no existen en InvGate (ej: oficinas
   administrativas que no son sucursales). El sistema debe tolerar `unmatched` sin errores.
   Mitigación: badge `badge-ghost` gris "Sin InvGate" sin afectar el resto de la fila
   (contactos, equipos, etc. siguen funcionando igual).

3. **Rate limits InvGate.** Si el sync hace muchas requests, InvGate puede responder 429.
   Mitigación: ya existe `locationSync.ts` que procesa en chunks de 20 con `Promise.all`.
   Reutilizar ese patrón. El botón manual solo está disponible para admin, el cron corre
   una vez al día — no hay escenario de abuso.

4. **Cambios de schema en InvGate.** Si InvGate cambia el formato de `location.name`, el parser
   de regex puede fallar.
   Mitigación: **tests unitarios obligatorios** para `parseInvgateLocationName()` cubriendo:
   formato actual con NIS/CP/CC/address, formato sin paréntesis, formato con solo NIS, nombres
   con caracteres especiales. Se ejecutan en CI o antes del deploy.

5. **RBAC del endpoint de sync.** El endpoint `/api/admin/invgate/locations/sync` no debe ser
   accesible sin autenticación.
   Mitigación:
   - **GET** (cron): requiere sesión admin válida igual que POST. El worker PM2 usa una
     clave interna (`X-Internal-Key`) o una sesión de servicio para autenticarse.
   - **POST** (manual botón): requiere sesión admin. Si el usuario no es admin, devuelve 401.
   Ambos casos validan `locals.user.role === "admin"` antes de ejecutar el sync.

### Decisiones pendientes

1. **¿Sync automático nocturno o solo manual?** ✅ Resuelto: cron diario como primario + botón
   "Sincronizar ahora" en el indicador global de frescura (solo admin). Sin página admin separada.
   Ver sección 3.6.
2. **¿Badge "En InvGate" visible para todos los roles?** ✅ Resuelto: sí. Es información no sensible
   y útil para cualquier rol que use el directorio.
3. **¿Indicador global de frescura visible para todos?** ✅ Resuelto: sí. Todos los roles ven el
   estado de la última sync.
4. **¿Tabla de link o columna en `offices`?** ✅ Resuelto: nueva tabla `office_invgate_links`
   (ver sección 3.2). No se agregan columnas a `offices`.
5. **¿Orden del catálogo de mejoras?** ✅ Resuelto: dentro de cada categoría (con InvGate / sin
   InvGate), los items se ordenan de más a menos complejos (L → M → S). Ver sección 4.

---

## 7. Próximos pasos

1. Revisar este documento y resolver decisiones pendientes.
2. Aprobar Fase 1 para implementación.
3. Invocar `writing-plans` para generar plan detallado de la Fase 1.
4. Implementar Fase 1.
5. Reunión de revisión post-Fase 1 para decidir si se avanza con Fase 2 o se re-prioriza.
