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

---

# Plan de Trabajo - Componentización de Vistas con Carga Diferida (Astro server:defer)

## Objetivo
- Refactorizar todas las vistas que realizan consultas a la base de datos (públicas y de administración) para usar el patrón `server:defer` de Astro con fallbacks de esqueletos simplificados.
- Asegurar que la barra lateral (Sidebar) y el encabezado (Header) se carguen de manera instantánea y prioritaria.

## Tareas

### 1. Componentizar Supervisión (Calidad y Asignación)
- [x] Crear `src/components/supervision/calidad/CalidadSkeleton.astro`
- [x] Crear `src/components/supervision/calidad/CalidadContent.astro`
- [x] Modificar `src/pages/supervision/calidad-operadores/index.astro`
- [x] Crear `src/components/supervision/asignacion/AsignacionSkeleton.astro`
- [x] Crear `src/components/supervision/asignacion/AsignacionContent.astro`
- [x] Modificar `src/pages/supervision/asignacion-autogestiones/index.astro`
- [x] Verificar con `npx astro check` y pruebas manuales

### 2. Componentizar Guía de Soportes (Público y Admin)
- [x] Crear `src/components/soportes/SoportesPublicSkeleton.astro`
- [x] Crear `src/components/soportes/SoportesPublicContent.astro`
- [x] Modificar `src/pages/guia-soportes/index.astro`
- [x] Crear `src/components/admin/soportes/AdminSoportesSkeleton.astro`
- [x] Crear `src/components/admin/soportes/AdminSoportesContent.astro`
- [x] Modificar `src/pages/admin/soportes/index.astro`
- [x] Verificar con `npx astro check`

### 3. Componentizar Recursos y Aplicativos (Público y Admin)
- [x] Crear `src/components/enlaces/EnlacesSkeleton.astro`
- [x] Crear `src/components/enlaces/EnlacesContent.astro`
- [x] Modificar `src/pages/enlaces-recursos/index.astro`
- [x] Crear `src/components/catalogo/CatalogoSkeleton.astro`
- [x] Crear `src/components/catalogo/CatalogoContent.astro`
- [x] Modificar `src/pages/catalogo-aplicativos/index.astro`
- [x] Crear `src/components/admin/recursos/AdminRecursosSkeleton.astro`
- [x] Crear `src/components/admin/recursos/AdminRecursosContent.astro`
- [x] Modificar `src/pages/admin/recursos/index.astro`
- [x] Crear `src/components/admin/aplicativos/AdminAplicativosSkeleton.astro`
- [x] Crear `src/components/admin/aplicativos/AdminAplicativosContent.astro`
- [x] Modificar `src/pages/admin/aplicativos/index.astro`
- [x] Verificar con `npx astro check`

### 4. Componentizar Contactos (Público y Admin)
- [x] Crear `src/components/contactos/ContactosSkeleton.astro`
- [x] Crear `src/components/contactos/ContactosContent.astro`
- [x] Modificar `src/pages/contactos/index.astro`
- [x] Crear `src/components/admin/contacts/AdminContactsSkeleton.astro`
- [x] Crear `src/components/admin/contacts/AdminContactsContent.astro`
- [x] Modificar `src/pages/admin/contacts/index.astro`
- [x] Verificar con `npx astro check`

### 5. Componentizar Resto de Vistas de Administración (Usuarios, Operadores, Oficinas, Cubics, Logs)
- [x] Crear `src/components/admin/users/AdminUsersSkeleton.astro` y `AdminUsersContent.astro`
- [x] Modificar `src/pages/admin/users.astro`
- [x] Crear `src/components/admin/operadores/AdminOperadoresSkeleton.astro` y `AdminOperadoresContent.astro`
- [x] Modificar `src/pages/admin/operadores/index.astro`
- [x] Crear `src/components/admin/offices/AdminOfficesSkeleton.astro` and `AdminOfficesContent.astro`
- [x] Modificar `src/pages/admin/offices/index.astro`
- [x] Crear `src/components/admin/cubics/AdminCubicsSkeleton.astro` and `AdminCubicsContent.astro`
- [x] Modificar `src/pages/admin/cubics/index.astro`
- [x] Crear `src/components/admin/logs/AdminLogsSkeleton.astro` and `AdminLogsContent.astro`
- [x] Modificar `src/pages/admin/logs/index.astro`
- [x] Verificar con `npx astro check` y compilación total de producción `npm run build`

### 6. Componentizar Vistas de Supervisión (Cronograma, Control de Asistencia, Estadísticas)
- [x] Crear `src/components/supervision/cronograma/CronogramaSkeleton.astro` y `CronogramaContent.astro`
- [x] Modificar `src/pages/supervision/cronograma/index.astro` y `src/components/cronograma/CronogramaDashboard.astro`
- [x] Crear `src/components/supervision/asistencia/AsistenciaSkeleton.astro` y `AsistenciaContent.astro`
- [x] Modificar `src/pages/supervision/asistencia/index.astro`
- [x] Crear `src/components/supervision/asistencia/EstadisticasSkeleton.astro` y `EstadisticasContent.astro`
- [x] Modificar `src/pages/supervision/asistencia/estadisticas.astro`
- [x] Resolver errores de tipado en archivos modificados y preexistentes en `src/pages/api/asistencia/index.ts` y `src/components/supervision/calidad/CalidadContent.astro`
- [x] Verificar con `npx astro check`, compilación de producción `npm run build` y test estático `node tests/supervision-defer.test.mjs`
