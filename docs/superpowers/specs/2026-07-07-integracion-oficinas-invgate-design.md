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
longitud, teléfono, email ni ningún otro dato rico. Esto significa que **la sincronización de datos
desde InvGate hacia `offices` está limitada a: nombre y jerarquía (parent_id)**. Los campos ricos
(dirección, coordenadas, contactos) seguirán siendo gestionados exclusivamente desde MDA.

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
  invgate_name TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(office_id)
);
```

**Por qué tabla aparte y no columnas en `offices`:**

- `offices` ya tiene 63 columnas. Agregar más acopla el schema a InvGate.
- Una tabla de link permite: historial de sync, metadata de la vinculación, desvincular sin perder datos.
- Facilita auditoría: saber cuándo fue la última sync y qué nombre tenía en InvGate en ese momento.
- Si mañana se cambia de sistema de tickets, solo se borra esta tabla.

**Alternativa considerada y descartada:** columna `invgate_location_id` en `offices`. Más simple,
pero pierde trazabilidad (no hay `last_synced_at`, no hay snapshot del nombre InvGate).

### 3.3 Indicador visual en el directorio

En `OfficeRow.astro`, cuando `office.id` tiene un registro en `office_invgate_links`, mostrar un badge:

```
[icono: link] Vinculado
```

- **Token:** `badge badge-success badge-sm` (o `badge-soft` si se prefiere menos saturado)
- **Ícono:** `boxicons:link` size={14}
- **Ubicación:** a la derecha del NIS, o como chip adicional debajo del nombre
- **Tooltip:** "Vinculado a InvGate — última sync: hace 3 días"

El badge se obtiene vía JOIN en `getOffices()` o consulta separada. Dado que `getOffices()` ya está
en `@lib/officeQueries`, se agrega un LEFT JOIN a `office_invgate_links` en la query existente.

### 3.4 Página admin: `/admin/invgate/ubicaciones`

**Ya registrada en `navigation.ts:141`.** Solo falta implementar la página.

**Componentes:**

1. **Tabla de matching** (componente principal)
   - Columnas: NIS, Nombre MDA, Provincia, Nombre InvGate, Parent InvGate, Estado, Última sync, Acciones
   - Estado: `matched` (verde), `unmatched_mda` (naranja: existe en MDA pero no en InvGate), `unmatched_invgate` (gris: existe en InvGate pero no en MDA)
   - Filtros: por estado, por provincia, búsqueda texto
   - Paginación client-side (son ~1500 oficinas vs ~300 locations)

2. **Botón "Sincronizar ahora"**
   - POST a `/api/admin/invgate/locations/sync`
   - Ejecuta `matchLocations()` + persiste en `office_invgate_links`
   - Devuelve stats: matched, unmatched, errores
   - Muestra toast con resultado

3. **Acciones por fila**
   - **Vincular manual:** para oficinas sin NIS parseable, el admin puede buscar y vincular manualmente una location de InvGate
   - **Desvincular:** elimina el registro de `office_invgate_links`
   - **Ver en InvGate:** link externo a la location en la UI de InvGate (si hay URL base)

4. **Sección de stats resumen**
   - Total oficinas MDA, total locations InvGate, matched, unmatched MDA, unmatched InvGate
   - Ya calculado por `matchLocations()` → `LocationComparisonStats`

**Patrón de página:** seguir el mismo que otras páginas admin (`/admin/contactos`, `/admin/usuarios`):
`PageContainer` + `PageHeader` + DataTable + botones de acción.

### 3.5 Sync de datos

**Qué datos pueden sincronizarse desde InvGate (fuente → destino):**

| Campo InvGate | Campo MDA | Confiabilidad |
|---|---|---|
| `location.name` (parseado → displayName) | `offices.name` | Alta si matchea por NIS |
| `location.parent_id` | `offices.parentNis` | Media (hay que resolver parent_id → NIS del padre) |

**Qué NO se sincroniza automáticamente:**
- `address`, `lat`, `lng`, `phone`, `email`, `manager` — InvGate no tiene estos datos.
- `offices.name` si ya fue editado manualmente en MDA — preferir no pisar.

**Estrategia: sync supervisada, no automática.**

1. El sync matchea y persiste el vínculo (tabla `office_invgate_links`).
2. En la página admin, las filas matched muestran diferencias detectadas entre `offices.name` y
   `invgate_name` con un badge de advertencia ("Nombre difiere").
3. El admin decide manualmente (checkbox por fila o "Actualizar todos") qué nombres promover desde
   InvGate hacia `offices`.
4. Esto evita el problema de: un operador edita el nombre en MDA, un sync automático lo pisa sin
   aviso, y se pierde la edición.

**Alternativa considerada y descartada:** sync automático bidireccional con last-writer-wins. Más
riesgoso (pisar ediciones manuales), más complejo (timestamp en ambos lados), y el beneficio es
marginal dado que InvGate solo tiene 2 campos útiles.

### 3.6 Trigger de sync

- **Manual:** botón "Sincronizar ahora" en la página admin. Suficiente para MVP.
- **Cron:** opcional futuro. Agregar un endpoint que se pueda llamar desde un cron job o PM2 worker.
  No es necesario en v1 porque: (a) las ubicaciones en InvGate cambian poco (son datos maestros), (b)
  el sync manual cubre el caso de uso inmediato ("acabo de crear una location en InvGate, quiero
  vincularla").
- **Webhook:** InvGate no ofrece webhooks para cambios en locations. Descartado.

### 3.7 RBAC

- **Ver badge en directorio:** todos los roles (el badge es informativo).
- **Ver página admin `/admin/invgate/ubicaciones`:** `supervisor` o superior (mismo nivel que otras
  páginas admin) — ya cubierto por `routePermissions` en `src/lib/rbac.ts` si se registra la ruta.
- **Ejecutar sync (botón "Sincronizar ahora"):** `admin` — es una mutación que afecta datos.
- **Vincular/desvincular manual:** `admin`.

---

## 4. Catálogo de mejoras posibles al directorio

Cada item incluye: descripción, esfuerzo estimado (S ≤ 1 día, M = 2-4 días, L > 4 días),
dependencias, y si requiere InvGate.

### 4.1 Mejoras sin dependencia de InvGate

| # | Feature | Descripción | Esfuerzo | Dependencias |
|---|---|---|---|---|
| 1 | **Indicador de match InvGate** | Badge en `OfficeRow` cuando la oficina está vinculada. Tooltip con última sync. | S | Tabla `office_invgate_links` + query en `getOffices()` |
| 2 | **Búsqueda fuzzy** | Reemplazar búsqueda exacta por fuzzy (Levenshtein / Fuse.js) en el search input actual. Tolera errores de tipeo en nombres de oficina. | S | Ninguna |
| 3 | **Badges de completitud** | Mostrar en cada fila íconos que indiquen si la oficina tiene: email, teléfono, coordenadas, contactos. Rojo = falta, verde = completo. | S | Ninguna |
| 4 | **Vista árbol de dependencias** | Modo alternativo (tab) donde las oficinas se muestran como árbol jerárquico: oficina padre → sucursales hijas. Expandible/colapsable. | M | Campo `parentNis` ya existe |
| 5 | **Comparación side-by-side** | Seleccionar 2+ oficinas (checkboxes) y ver comparación de sus campos en tabla horizontal. | M | Ninguna |
| 6 | **Export filtrado avanzado** | Agregar checkboxes de columnas al export actual: elegir qué campos exportar, no solo CSV completo. | S | Ruta `api/export/offices` existente |
| 7 | **Histórico de cambios por oficina** | Registrar quién editó qué campo y cuándo. Usar `audit_logs` existente o tabla nueva. Vista de historial en el panel detalle de cada oficina. | M | Schema `audit_logs` ya existe; hay que extenderlo con `entity_type` + `entity_id` |
| 8 | **Mini-dashboard en detalle** | Al expandir una fila, mostrar: total de contactos, activos, terminales; últimas ediciones; última sync InvGate. | S | Tabla de link |
| 9 | **Filtro por rango de códigos postales** | Agregar filtro "CP desde / hasta" para búsqueda geográfica sin mapa. | S | Ninguna |
| 10 | **Vista de galería / cards** | Alternativa a tabla: vista de cards con datos clave de cada oficina. Mejor para browsing visual. | M | Ninguna |

### 4.2 Mejoras con dependencia de InvGate

| # | Feature | Descripción | Esfuerzo | Dependencias InvGate |
|---|---|---|---|---|
| 11 | **Página admin vinculación** | Tabla de matching + sync manual + vincular/desvincular. Sección 3.4 de este doc. | M | Tabla `office_invgate_links` + endpoint sync |
| 12 | **Sync supervisado de campos** | Detectar diferencias nombre/parentNIS y permitir al admin promover cambios desde InvGate. Sección 3.5. | M | Feature 11 |
| 13 | **Contador de tickets abiertos** | En el detalle expandible de cada oficina, mostrar "N tickets abiertos". Usa `incidents.by.helpdesk` (IDs) + batch `GET /incidents?ids[]=` para filtrar por `location_id`. | M | Feature 11; requiere mapear helpdesk → oficina |
| 14 | **Personal asignado** | Mostrar lista de usuarios de InvGate asignados a la location de la oficina. Usa `locations.users`. | S | Feature 11; endpoint ya probado en `locationSync.ts` |
| 15 | **Breaking news por ubicación** | En el detalle de la oficina, mostrar comunicados activos (`breakingnews.all`) relevantes. | S | Feature 11 |
| 16 | **KB sugerido** | Artículos de knowledge base (`kb.articles.by.category`) sugeridos según categoría de tickets de la oficina. | M | Feature 13 (necesita categorías frecuentes) |
| 17 | **Métricas de time tracking** | Horas totales trackeadas para tickets de la oficina. Gráfico simple (barra) en el detalle. | L | Feature 13; endpoint `timetracking` con filtro por `from`/`to` |
| 18 | **Helpdesk que da soporte** | Mostrar nombre del helpdesk asociado a la oficina/location. Usa `helpdesks`. | S | Feature 11 |
| 19 | **Match con CI (Configuration Items)** | Cruzar `terminals` de MDA con `cis.by.id` de InvGate. Requiere que los CIs tengan un identificador común (hostname, serial). Investigación previa necesaria. | L | Feature 11; exploración de qué CIs existen |
| 20 | **Dashboard de SLA por oficina** | Agregar vista resumen con: % tickets dentro de SLA, tiempo medio de resolución, tickets vencidos. Datos desde `incidents.details.by.view`. | L | Feature 13; requiere vista guardada en InvGate |

---

## 5. Roadmap propuesto

### Fase 1 — Fundación (vínculo + admin page)

| Item | Esfuerzo | Prioridad |
|---|---|---|
| 1. Crear tabla `office_invgate_links` + push DB | S | P0 |
| 2. Endpoint `POST /api/admin/invgate/locations/sync` | S | P0 |
| 3. Página `/admin/invgate/ubicaciones` con tabla de matching | M | P0 |
| 4. Badge visual "Vinculado" en `OfficeRow` | S | P1 |
| 5. Botón "Sincronizar ahora" en admin page | S | P0 |

**Entregable:** el admin puede ver qué oficinas están vinculadas, forzar sync, vincular/desvincular
manualmente. El directorio muestra badge en oficinas vinculadas.

### Fase 2 — Sync supervisado + mini-dashboard

| Item | Esfuerzo | Prioridad |
|---|---|---|
| 6. Detección de diferencias nombre/parentNIS + UI de promoción | M | P1 |
| 7. Personal asignado desde `locations.users` | S | P1 |
| 8. Mini-dashboard en detalle de oficina (item 8) | S | P1 |

### Fase 3 — Datos operativos de InvGate

| Item | Esfuerzo | Prioridad |
|---|---|---|
| 9. Contador de tickets abiertos (item 13) | M | P2 |
| 10. Breaking news en ficha (item 15) | S | P2 |
| 11. Helpdesk que da soporte (item 18) | S | P2 |
| 12. KB sugerido (item 16) | M | P3 |

### Fase 4 — Mejoras sin InvGate + features avanzadas

| Item | Esfuerzo | Prioridad |
|---|---|---|
| 13. Búsqueda fuzzy (item 2) | S | P2 |
| 14. Badges de completitud (item 3) | S | P2 |
| 15. Vista árbol de dependencias (item 4) | M | P3 |
| 16. Export filtrado avanzado (item 6) | S | P3 |
| 17. Métricas SLA (item 20) | L | P3 |
| 18. Match con CI (item 19) | L | P3 |

---

## 6. Riesgos y decisiones pendientes

### Riesgos

1. **NIS duplicados en InvGate.** Dos locations con mismo NIS en el nombre → matcher toma la primera.
   Mitigación: mostrar warning en UI admin cuando se detecta ambigüedad.
2. **Oficinas MDA sin match posible.** Algunas oficinas no existen en InvGate (ej: oficinas
   administrativas que no son sucursales). El sistema debe tolerar `unmatched` sin errores.
3. **Rate limits InvGate.** Si el sync hace muchas requests, InvGate puede responder 429.
   Mitigación: ya existe `locationSync.ts` que procesa en chunks de 20 con `Promise.all`. Reutilizar
   ese patrón.
4. **Cambios de schema en InvGate.** Si InvGate cambia el formato de `location.name`, el parser de
   regex puede fallar. Mitigación: tests unitarios al parser.
5. **RBAC insuficiente.** Si la ruta `/admin/invgate/ubicaciones` no está en `routePermissions`,
   cualquier usuario autenticado podría verla. Pendiente: agregar entrada en `src/lib/rbac.ts`.

### Decisiones pendientes

1. **¿Sync automático nocturno o solo manual?** Propuesta: manual en v1. Si el equipo percibe que
   los datos se desactualizan, agregar cron en v2. Bajo costo de agregarlo después.
2. **¿Badge de "Vinculado" visible para todos los roles?** Propuesta: sí. Es información no sensible
   y útil para operadores N1/N2 que usan el directorio a diario.
3. **¿Tabla de link o columna en `offices`?** Propuesta: tabla aparte (ver sección 3.2). Si el
   equipo prefiere simplicidad, se puede cambiar a columna `invgateLocationId` en `offices`.
4. **¿Formato del esfuerzo?** Propuesta: S/M/L con equivalencia en días (S ≤ 1, M = 2-4, L > 4).

---

## 7. Próximos pasos

1. Revisar este documento y resolver decisiones pendientes.
2. Aprobar Fase 1 para implementación.
3. Invocar `writing-plans` para generar plan detallado de la Fase 1.
4. Implementar Fase 1.
5. Reunión de revisión post-Fase 1 para decidir si se avanza con Fase 2 o se re-prioriza.
