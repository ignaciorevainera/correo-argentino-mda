# Plan de Trabajo - Agregar Columna de Dependencia (parent NIS) a las Vistas de Oficinas

## Objetivo
- Mostrar el parent NIS (oficina de la que dependen) en las vistas de Directorio de Oficinas y Administración de Oficinas.
- Permitir la edición/creación del parent NIS en el panel de administración.
- Evitar mostrar nulos en celdas sin datos (usar un indicador como un guión).

## Tareas

### 1. Actualización de Consultas y Tipos
- [x] Modificar `src/data/directorio_oficinas.ts` para agregar `parentNis` a la interfaz `OfficeDirectoryItem`.
- [x] Modificar `src/lib/officeQueries.ts` para agregar `parentNis` al resultado mapeado de `getOffices` y permitir búsquedas por él.
- [x] Modificar `src/lib/offices.ts` para mapear `parentNis` en `getAllOfficesFromDB`.

### 2. Modificaciones en el Directorio de Oficinas (Público)
- [x] Modificar `src/pages/directorio-oficinas/index.astro` para cambiar la grilla a 12 columnas e insertar la cabecera "Dependencia".
- [x] Modificar `src/components/offices/OfficeRow.astro` para actualizar la fila a 12 columnas, renderizar la insignia de `parentNis` o guión `—` si es nulo, e incluirlo en `searchText`.

### 3. Modificaciones en Administración de Oficinas (Admin)
- [x] Modificar `src/pages/admin/offices/index.astro` para actualizar la grilla e insertar la cabecera "NIS Padre" (`sortKey="parent-nis"`).
- [x] Modificar `src/components/admin/AdminOfficeRow.astro` para actualizar la grilla, renderizar la celda para `parentNis` (insignia o `—` si es nulo), agregar el atributo `data-sort-parent-nis` y actualizar `searchText`.
- [x] Modificar `src/pages/admin/offices/[id].astro` para procesar `parentNis` en `OfficeRecord` y guardado, y añadir el campo en "Datos básicos".

### 4. Validación y Pruebas
- [x] Ejecutar comprobación de tipos (`npx astro check`).
- [x] Ejecutar compilación de producción (`npm run build`).
- [x] Verificar manualmente el listado público, buscador, listado de administración, ordenamiento por NIS Padre y el guardado en el formulario.
