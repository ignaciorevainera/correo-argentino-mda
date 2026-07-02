# Skeleton Loading Strategy — Design Spec

**Fecha:** 2026-07-01
**Estado:** Aprobado

## Contexto

La plataforma Correo Argentino MDA usa 28 componentes skeleton distribuidos en 19 páginas con `server:defer` y 1 página React. El tiempo de carga de datos es casi instantáneo (<500ms en la mayoría de los casos), lo que genera **flicker visual**: el skeleton aparece y desaparece antes de que el usuario pueda percibirlo, creando una experiencia visual brusca.

## Problema

1. **Flicker**: skeletons visibles por <500ms generan cortes visuales innecesarios
2. **Texto inútil**: algunos skeletons muestran texto ("Cargando...", "Preparando interfaz...") que no alcanza a leerse
3. **Mantenimiento**: 28 componentes skeleton con cobertura variable

## Objetivos

- Eliminar el flicker visual por completo
- Mantener skeletons como fallback visual para cargas lentas (>300ms)
- Remover texto de los skeletons (solo estructura visual)
- No agregar skeletons a nuevas páginas (cobertura actual es suficiente)

## Arquitectura Propuesta

### 1. Debounce CSS (no JS)

Se agrega una utility class global en `src/styles/global.css`:

```css
.skeleton-debounced {
  opacity: 0;
  animation: skeleton-fade-in 0ms 300ms forwards;
}

@keyframes skeleton-fade-in {
  to { opacity: 1; }
}
```

**Comportamiento:**
- El skeleton arranca invisible (`opacity: 0`) pero ocupa su espacio en el layout
- A los 300ms aparece (`opacity: 1`) si sigue en el DOM
- Si `server:defer` resuelve antes de 300ms, Astro reemplaza el skeleton por el contenido real → el usuario nunca ve el skeleton
- **Cero flicker, cero JavaScript**

**Respeto por `prefers-reduced-motion`:** La animación solo afecta opacidad. Es imperceptible para quien tiene configurada reducción de movimiento, pero se puede agregar guarda si es necesario.

### 2. Simplificación de Skeletons

**Regla general:** Sin texto visible, solo estructura visual con `.skeleton` de DaisyUI.

**Estado actual:**
- 24 de 28 skeletons ya cumplen esta regla (solo usan divs con `.skeleton`)
- 1 skeleton con texto: `BuscadorUsuariosSkeleton.astro` (tiene "Cargando buscador...", "Preparando interfaz...")
- 3 skeletons compartidos (`SkeletonCard`, `SkeletonTable`, `SkeletonMetric`) ya están limpios

**Cambios en BuscadorUsuariosSkeleton:**
- Reemplazar `<input placeholder="Cargando buscador...">` por un div `.skeleton` con las mismas dimensiones
- Eliminar texto "Preparando interfaz..." y spinner asociado
- Reemplazar íconos reales por placeholders `.skeleton` con las mismas dimensiones

### 3. Cobertura

No se agregan skeletons a páginas que hoy no los tienen. Las 19 páginas con `server:defer` + skeleton cubren todas las secciones con carga de datos asíncrona. Las páginas CRUD y forms cargan datos inline sin beneficio de skeleton.

| Sección | Estado |
|---------|--------|
| Admin (10 páginas) | ✅ Tienen skeleton, se actualizan con wrapper debounce |
| Públicas (7 páginas) | ✅ Tienen skeleton, se actualizan con wrapper debounce |
| Supervisión (5 páginas) | ✅ Tienen skeleton, se actualizan con wrapper debounce |
| Títulos (1 React) | ✅ Skeleton limpio, se actualiza con wrapper |
| CRUD forms (14+) | ❌ Sin skeleton, no se agregan |
| Dashboard, Login, Profile | ❌ Sin skeleton, no se agregan |
| Cronograma SPA | ⚠️ Tiene su propio patrón de loading, no se modifica |

### 4. Transiciones

Descartadas. El reemplazo del skeleton por contenido real es directo (sin animación cross-fade).

## Plan de Migración

| Paso | Archivos | Descripción |
|------|----------|-------------|
| 1 | `src/styles/global.css` | Agregar clases `.skeleton-debounced` y `@keyframes skeleton-fade-in` |
| 2 | `BuscadorUsuariosSkeleton.astro` | Remover texto, spinner, íconos reales; reemplazar por `.skeleton` estructural |
| 3 | 27 skeletons restantes | Agregar `class="skeleton-debounced"` al wrapper más externo de cada componente |
| 4 | Verificación | `npm run dev` + navegación manual en secciones clave (admin, público, supervisión, títulos) |

### Detalle de wrapper por tipo de componente

Los skeletons `.astro` existentes usan distintos wrappers principales:

- **SkeletonCard.astro**: el wrapper es un `<div class="card ...">` → agregar `skeleton-debounced`
- **SkeletonTable.astro**: el wrapper es un `<div class="bg-base-100 ...">` → agregar `skeleton-debounced`
- **SkeletonMetric.astro**: el wrapper es un `<div class="grid ...">` → agregar `skeleton-debounced`
- **Page-specific skeletons**: wrapper suele ser `<PageContainer>` o `<div>` principal → agregar `skeleton-debounced`
- **TitleCardSkeleton.tsx** (React): wrapper es `<section className="grid ...">` → agregar `className="skeleton-debounced"` o merge de clases

## Criterios de Éxito

1. Navegar a cualquier página con `server:defer` → sin flicker de skeleton en cargas normales
2. Forzar carga lenta (simular con throttle en DevTools → Slow 3G) → skeleton aparece a los ~300ms
3. Ningún skeleton muestra texto visible
4. Los skeletons mantienen la estructura visual del contenido real (cards, tablas, métricas)
5. `npm run build` exitoso sin errores
6. `npx playwright test` exitoso (sin cambios en tests existentes)

## Archivos Afectados

**Modificar (CSS):**
- `src/styles/global.css`

**Modificar (contenido, 1 archivo):**
- `src/components/buscador-usuarios/BuscadorUsuariosSkeleton.astro`

**Modificar (agregar wrapper debounce, 27 archivos):**
- `src/components/ui/skeletons/SkeletonCard.astro`
- `src/components/ui/skeletons/SkeletonTable.astro`
- `src/components/ui/skeletons/SkeletonMetric.astro`
- `src/components/admin/users/AdminUsersSkeleton.astro`
- `src/components/admin/operadores/AdminOperadoresSkeleton.astro`
- `src/components/admin/contacts/AdminContactsSkeleton.astro`
- `src/components/admin/recursos/AdminRecursosSkeleton.astro`
- `src/components/admin/aplicativos/AdminAplicativosSkeleton.astro`
- `src/components/admin/offices/AdminOfficesSkeleton.astro`
- `src/components/admin/soportes/AdminSoportesSkeleton.astro`
- `src/components/admin/cubics/AdminCubicsSkeleton.astro`
- `src/components/admin/logs/AdminLogsSkeleton.astro`
- `src/components/admin/invgate/UbicacionesSkeleton.astro`
- `src/components/contactos/ContactosSkeleton.astro`
- `src/components/offices/DirectorioSkeleton.astro`
- `src/components/inventario/InventarioSkeleton.astro`
- `src/components/enlaces/EnlacesSkeleton.astro`
- `src/components/catalogo/CatalogoSkeleton.astro`
- `src/components/soportes/SoportesPublicSkeleton.astro`
- `src/components/supervision/calidad/CalidadSkeleton.astro`
- `src/components/supervision/asignacion/AsignacionSkeleton.astro`
- `src/components/supervision/asistencia/AsistenciaSkeleton.astro`
- `src/components/supervision/asistencia/EstadisticasSkeleton.astro`
- `src/components/supervision/cronograma/CronogramaSkeleton.astro`
- `src/components/cronograma/subcomponents/DailyTableSkeleton.astro`
- `src/components/cronograma/subcomponents/MonthlyTableSkeleton.astro`
- `src/pages/titulos/_components/TitleCardSkeleton.tsx`

## Especificaciones Técnicas Adicionales

### Caso especial: TitleCardSkeleton.tsx (React)

Es el único skeleton React. Se le agrega `skeleton-debounced` como clase CSS de la misma forma. Como es un componente React, la clase se aplica en `className`. No requiere manejo especial de estado — la clase CSS aplica el debounce automáticamente.

### Caso especial: componentes con múltiples wrappers

Algunos skeletons envuelven su contenido en grids o layouts que deben mantener su estructura durante el estado de carga. La clase `skeleton-debounced` se aplica AL wrapper más externo del contenido del skeleton — no al `PageContainer` ni a elementos estructurales de layout que estén fuera del contenido reemplazable por el server island.

### Consideraciones de `prefers-reduced-motion`

Dado que la animación solo cambia `opacity` de 0 a 1, no hay movimiento que pueda causar molestia. DaisyUI ya desactiva la animación shimmer del `.skeleton` cuando `prefers-reduced-motion: reduce` está activo. No se requiere manejo adicional.
