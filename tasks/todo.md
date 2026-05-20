# Plan de Trabajo - Eliminación de View Transitions y Unificación de Sombras

## Objetivo
- Eliminar de manera definitiva todo rastro de transiciones de vista (enrutamiento de cliente) de Astro.
- Unificar todas las sombras de contenedores utilizando únicamente `shadow-md` para consistencia visual.

## Tareas

### 1. Eliminar Enrutamiento y Eventos de Cliente (Astro Transitions)
- [x] Eliminar event listener `astro:after-swap` en `src/components/ui/ViewSwitcher.astro`
- [x] Eliminar event listener `astro:page-load` en `src/pages/supervision/calidad-operadores/index.astro`

### 2. Unificación de Sombras de Contenedores a `shadow-md`
- [x] Refactorizar componentes UI globales (`UserCard.astro`, `QuickAccessCard.astro`, `DataTable.astro`, `MasterDetailTable.astro`, `BaseLayout.astro`)
- [x] Refactorizar vistas de administración (`admin/contacts/[id].astro`, `admin/cubics/[id].astro`, `admin/offices/[id].astro`, `admin/users.astro`)
- [x] Refactorizar vistas de catálogo y recursos (`catalogo-aplicativos/_components/CatalogAppCard.astro`, `enlaces-recursos/_components/CategoryCard.astro`)
- [x] Refactorizar buscador, contactos, firmas, soportes, equipos y login (`buscador-usuarios/index.astro`, `contactos/index.astro`, `generador-firmas/_components/SignatureGenerator.astro`, `guia-soportes/index.astro`, `inventario-equipos/index.astro`, `login/index.astro`)
- [x] Refactorizar supervisión (`supervision/asignacion-autogestiones/index.astro`, `supervision/calidad-operadores/index.astro`, `components/cronograma/CronogramaDashboard.astro`)
- [x] Refactorizar títulos de tickets (`titulos-tickets/_components/Titulos.tsx`)
- [x] Refactorizar demostración (`design-system/index.astro`)

### 3. Validación y Compilación
- [x] Ejecutar validación de tipos `npx astro check`
- [x] Ejecutar compilación de producción `npm run build`
