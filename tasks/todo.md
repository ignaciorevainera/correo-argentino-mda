# Plan de Trabajo - Corrección de Títulos y Colores de Iconos

## Objetivo
- Uniformizar los títulos de las pestañas de cada vista para que solo contengan el nombre de la sección.
- Renombrar la página de inicio a "Portal MDA".
- Variar los colores de los iconos en el dashboard para evitar repeticiones.
- Reutilizar código para evitar hardcodear títulos en el layout.

## Tareas
- [x] Variar los colores de los iconos en el dashboard (`src/pages/index.astro`).
- [x] Crear sistema de inferencia de títulos en `src/lib/navigation.ts`.
- [x] Refactorizar `BaseLayout` y `PageHeader` para usar la inferencia de títulos.
- [x] Eliminar títulos hardcodeados en las páginas:
    - [x] `src/pages/buscador-usuarios/index.astro`
    - [x] `src/pages/generador-firmas/index.astro`
    - [x] `src/pages/contactos/index.astro`
    - [x] `src/pages/catalogo-aplicativos/index.astro`
    - [x] `src/pages/design-system/index.astro`
    - [x] `src/pages/enlaces-recursos/index.astro`
    - [x] `src/pages/titulos-tickets/index.astro`
    - [x] `src/pages/guia-soportes/index.astro`
    - [x] `src/pages/supervision/index.astro`
    - [x] `src/pages/supervision/cronograma/index.astro`
    - [x] `src/pages/supervision/calidad-operadores/index.astro`
    - [x] `src/pages/supervision/asignacion-autogestiones/index.astro`
    - [x] `src/pages/inventario-equipos/index.astro`
    - [x] `src/pages/directorio-oficinas/index.astro`
    - [x] `src/pages/admin/users.astro`
    - [x] `src/pages/admin/cubics/index.astro`
    - [x] `src/pages/admin/index.astro`
    - [x] `src/pages/admin/offices/index.astro`
- [x] Quitar el sufijo " | Portal Mesa de Ayuda" en páginas dinámicas:
    - [x] `src/pages/admin/offices/[id].astro`
- [x] Asegurar que la página de inicio se llame "Portal MDA".

## Cierre
- [x] Validar que no queden instancias de "Portal Mesa de Ayuda" hardcodeadas en las páginas.
