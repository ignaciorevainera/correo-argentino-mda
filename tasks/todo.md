# Plan de Trabajo - Directorio de Oficinas (Reorganización de Filtros)

## Objetivo
- Mover las pestañas (tabs) a la primera fila de la grilla de filtros.
- Mover el select de región y la barra de búsqueda a una segunda fila.
- Priorizar el ancho de la barra de búsqueda en la segunda fila.

## Tareas
- [X] En `src/pages/directorio-oficinas/index.astro`:
    - [X] Reestructurar el `<section>` de filtros para que use `flex-col` siempre. <!-- id: 21 -->
    - [X] Colocar el contenedor de `tabs` en la primera fila (ancho completo). <!-- id: 22 -->
    - [X] Colocar el `select` y el `SearchInput` en un contenedor `flex` en la segunda fila. <!-- id: 23 -->
    - [X] Ajustar las clases para que el `SearchInput` ocupe la mayor parte del espacio (ej. `flex-1` o `w-3/4`) y el `select` sea más pequeño (ej. `w-1/4` o `w-auto`). <!-- id: 24 -->
- [X] Verificar los cambios en el navegador. <!-- id: 25 -->
