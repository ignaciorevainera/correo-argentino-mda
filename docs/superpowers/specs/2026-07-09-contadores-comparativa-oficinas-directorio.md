# Spec: Contadores de comparativa InvGate en el Directorio de Oficinas

**Fecha:** 2026-07-09
**Estado:** Revisión

---

## Problema

Los administradores no tienen visibilidad rápida de cuántas oficinas están en MDA pero faltan en InvGate, ni viceversa, sin navegar a la sección admin `/admin/invgate/ubicaciones`. El directorio de oficinas carece de estos contadores.

Además, la vista actual de `/admin/invgate/ubicaciones` muestra `totalInvgate`, `matched`, `unmatchedInvgate` y `totalMda`, pero omite `unmatchedMda` (oficinas en MDA sin correspondencia en InvGate).

---

## Solución propuesta

1. Agregar el contador `unmatchedMda` a las estadísticas de comparación.
2. Mostrar una fila de tarjetas resumen en el directorio `/oficinas`, visible solo para admins, con los cuatro contadores clave y un botón para ir a la vista completa de comparación.
3. Agregar la tarjeta `unmatchedMda` a la vista existente de `UbicacionesContent.astro`.

---

## Cambios detallados

### 1. API — Agregar `unmatchedMda` a las estadísticas

**Archivo:** `src/lib/invgate/locationMatcher.ts`

Agregar campo `unmatchedMda` a la interfaz `LocationComparisonStats` y calcularlo como `totalMda - matched` dentro de `matchLocations()`.

```typescript
export interface LocationComparisonStats {
  totalInvgate: number;
  totalMda: number;
  matched: number;
  unmatchedInvgate: number;
  unmatchedMda: number;   // <-- nuevo
}
```

El endpoint existente `GET /api/invgate/locations` ya retorna `stats` desde el objeto cacheado, por lo que `unmatchedMda` se expone automáticamente al agregarlo a la interfaz y al cálculo.

### 2. Nuevo endpoint liviano: `GET /api/invgate/stats`

**Archivo:** `src/pages/api/invgate/stats.ts` (nuevo)

Endpoint que retorna únicamente las estadísticas (sin la tabla paginada), usando el mismo cache que `/api/invgate/locations`. Si no hay cache, dispara sincronización automática antes de responder.

**Auth:** solo `admin`.

**Response:**
```json
{
  "totalInvgate": 1542,
  "totalMda": 1480,
  "matched": 1410,
  "unmatchedInvgate": 132,
  "unmatchedMda": 70
}
```

**Razón:** `DirectorioContent` solo necesita los totales para las tarjetas. Usar el endpoint completo `/api/invgate/locations` sería sobrecargar la página con datos de tabla que no va a renderizar. El nuevo endpoint reusa el cache existente.

### 3. Directorio — Sección de contadores para admins

**Archivo:** `src/components/offices/DirectorioContent.astro`

##### 3a. Agregar fila de tarjetas de estadísticas

Después del form de filtros (línea 369 `</form>`) y antes del `office-table-wrapper` (línea 371), agregar una sección condicional visible solo para admins que:

- Haga `fetch` a `/api/invgate/stats` solo si el usuario es admin (controlado desde el servidor con `isAllowedAdmin` o desde el cliente según el rol).
- Muestre cuatro tarjetas:
  1. **Total oficinas MDA** — cantidad total de oficinas registradas en el directorio
  2. **Matcheadas** — oficinas con correspondencia en InvGate (borde verde)
  3. **Solo en MDA** — oficinas del directorio sin correspondencia en InvGate (borde amarillo/warning)
  4. **Solo en InvGate** — ubicaciones de InvGate sin oficina MDA asociada (borde rojo/error)
- Incluya un botón "Ver comparativa completa" que navegue a `/admin/invgate/ubicaciones?sync=true`.

**Comportamiento:**
- Las tarjetas se cargan asincrónicamente (no bloquean el renderizado de la tabla).
- Mientras carga, muestra skeleton/placeholder.
- Si la API falla, muestra un estado de error discreto (no bloquea el uso del directorio).
- El link a la comparativa completa abre con `?sync=true` para garantizar datos frescos.

#### 3c. Ajustes de layout

Las tarjetas deben ser compactas y no competir visualmente con los filtros ni la tabla. Usar el mismo estilo de tarjetas que `UbicacionesContent.astro` (`.card.bg-base-100.shadow.border.border-base-200.p-4`) pero en una sola fila horizontal con scroll si es necesario en mobile.

### 4. UbicacionesContent — Agregar tarjeta unmatchedMda

**Archivo:** `src/components/admin/invgate/UbicacionesContent.astro`

Agregar una quinta tarjeta de estadísticas después de "Total MDA" (línea 116):

```astro
<div class="card bg-base-100 shadow border border-base-200 p-4 border-l-4 border-l-warning">
  <span class="text-xs font-semibold uppercase tracking-wider text-base-content/60">Solo en MDA</span>
  <span class="text-2xl font-bold mt-1 text-warning">{stats.unmatchedMda}</span>
</div>
```

Cambiar el grid de `lg:grid-cols-4` a `lg:grid-cols-5`.

Renombrar "Sin match" a "Solo en InvGate" para consistencia con la nomenclatura nueva (más clara: "Solo en MDA" / "Solo en InvGate").

---

## Archivos afectados

| Archivo | Acción |
|---|---|
| `src/lib/invgate/locationMatcher.ts` | Agregar `unmatchedMda` a interfaz y cálculo |
| `src/pages/api/invgate/stats.ts` | **Nuevo** — endpoint liviano de solo estadísticas |
| `src/components/offices/DirectorioContent.astro` | Agregar sección de tarjetas + link a comparativa. **Conservar** botón "Sincronizar ahora" existente. |
| `src/components/admin/invgate/UbicacionesContent.astro` | Agregar 5ta tarjeta `unmatchedMda`; renombrar "Sin match" a "Solo en InvGate" |

**No se requieren cambios de DB, RBAC ni navegación.**

---

## Riesgos / Consideraciones

- **Cache compartido:** `stats.ts` y `locations.ts` comparten la misma variable `cachedComparison` en memoria del proceso Node. Si un endpoint pisa el cache del otro, no hay problema porque ambos usan la misma fuente (InvGate + DB). Pero si el proceso se reinicia, el cache se pierde y ambos endpoints dispararán sync en el primer request.
- **Carga inicial del directorio:** `DirectorioContent` ya es pesado (consulta de oficinas + conteos + provincias + regiones + zonas). Agregar un fetch cliente a `/api/invgate/stats` no agrega carga al SSR porque es asincrónico post-render.
- **Permisos:** El endpoint `/api/invgate/stats` hereda la misma restricción `admin` que `/api/invgate/locations`. Un usuario no-admin que intente acceder recibirá 403. Las tarjetas en el directorio deben condicionarse por rol en el servidor para ni siquiera intentar el fetch si no es admin.

---

## Criterios de aceptación

- [ ] `GET /api/invgate/locations` incluye `unmatchedMda` en `stats`.
- [ ] `GET /api/invgate/stats` retorna solo el objeto `stats` con los cinco campos.
- [ ] En `/oficinas`, los admins ven una fila de tarjetas con: Total MDA, Matcheadas, Solo en MDA, Solo en InvGate.
- [ ] Las tarjetas incluyen un botón/link "Ver comparativa completa" que navega a `/admin/invgate/ubicaciones?sync=true`.
- [ ] El botón "Sincronizar ahora" existente en el directorio se conserva intacto.
- [ ] En `/admin/invgate/ubicaciones`, la grilla de stats ahora tiene 5 columnas incluyendo "Solo en MDA".
- [ ] El label "Sin match" fue renombrado a "Solo en InvGate".
- [ ] Usuarios no-admin no ven las tarjetas ni pueden acceder al endpoint de stats.
