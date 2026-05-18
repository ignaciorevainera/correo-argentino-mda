# Plan de Trabajo - Búsqueda global en Admin de Oficinas

## Objetivo
- Integrar el componente `SearchInput` en la vista de administración de oficinas (`src/pages/admin/offices/index.astro`).
- Implementar la lógica de cliente para filtrar y resaltar resultados en vivo mientras el usuario escribe, reutilizando `@lib/searchUtils`.
- Mejorar la experiencia de usuario reemplazando la necesidad de usar "Ctrl+F".

## Tareas
- [X] En `src/pages/admin/offices/index.astro`:
    - [X] Importar el componente `SearchInput`. <!-- id: 26 -->
    - [X] Modificar el "Toolbar" (donde está el título y el botón de nueva sucursal) para incluir la barra de búsqueda alineada correctamente de forma responsiva. <!-- id: 27 -->
    - [X] Agregar el ID `office-count-badge` al contador de oficinas para actualizarlo dinámicamente. <!-- id: 28 -->
    - [X] Agregar un atributo `data-search-text` a cada fila (`<article data-table-row>`) que contenga todos los textos relevantes concatenados (código, nombre, tipo, región). <!-- id: 29 -->
    - [X] Agregar el atributo `data-search-target` a los elementos internos de la fila cuyo texto debe resaltarse al coincidir con la búsqueda. <!-- id: 30 -->
    - [X] Crear un estado vacío (`empty state`) específico para "No se encontraron resultados de búsqueda", distinto del estado vacío general cuando no hay oficinas en la base de datos. <!-- id: 31 -->
    - [X] Agregar un bloque `<script>` que: <!-- id: 32 -->
        - [X] Importe `matchesSearchQuery` y `highlightSearchTargets` de `@lib/searchUtils`. <!-- id: 33 -->
        - [X] Escuche el evento `input` del `SearchInput`. <!-- id: 34 -->
        - [X] Filtre las filas en tiempo real y aplique el resaltado con `highlightSearchTargets`. <!-- id: 35 -->
        - [X] Muestre/oculte el estado vacío de búsqueda según la cantidad de filas visibles. <!-- id: 36 -->
        - [X] Actualice el contador de oficinas en el badge superior. <!-- id: 37 -->
- [ ] Verificar funcionamiento abriendo el navegador en `/admin/offices` y probando distintas consultas. (Pendiente de verificación manual ya que el subagente fue omitido). <!-- id: 38 -->
