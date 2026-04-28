# Tarea: Sustituir iconos outlined por filled

Fecha: 2026-04-28

## Descripcion

Sustituir sistemáticamente el uso de iconos Boxicons de estilo "regular" (outline) por su versión "solid" (filled) en todo el proyecto. Se utilizará la convención del paquete `@iconify-json/boxicons` instalado, que utiliza el sufijo `-filled`.

## Plan de ejecucion

- [x] **Paso 1 — Preparación**: Identificar todos los archivos que contienen referencias a `boxicons:`.
- [x] **Paso 2 — Reemplazo en Layouts**: Actualizar `src/layouts/BaseLayout.astro` para cambiar los iconos globales (sidebar, header, diálogos).
- [x] **Paso 3 — Reemplazo en Páginas**: Iterar por las vistas principales (`src/pages/*.astro`) y actualizar los iconos.
- [x] **Paso 4 — Reemplazo en Componentes**: Actualizar componentes reutilizables (`src/components/**/*.astro`) que utilicen iconos.
- [x] **Paso 5 — Reemplazo en Datos**: Actualizar archivos de datos (`src/data/*.json` o `.ts`) que contengan nombres de iconos.
- [x] **Paso 6 — Verificación**: Ejecutar `npm run build` para asegurar que todos los iconos se resuelven correctamente y realizar una inspección visual si es posible.

## Criterio de exito global

Todos los iconos que tengan una versión rellena (filled) disponible en el set de Boxicons deben mostrarse con ese estilo, manteniendo la coherencia visual en todo el portal.
