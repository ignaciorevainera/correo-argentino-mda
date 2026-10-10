# Plan de Implementación: Refactor UI de Calidad

## Fase 1: Nueva Sección de Creación de Auditorías (`/supervision/calidad-operadores/nueva`)
- [x] Task: Crear página `/supervision/calidad-operadores/nueva.astro` con `BaseLayout` y `FormShell.astro` [6153e6b]
  - [x] Diseñar el layout amplio de la página con `FormShell` según estándar corporativo (`docs/FORM_STANDARD.md`)
  - [x] Implementar soporte para preselección de operador y mes mediante parámetros en la URL (`?agentId=...&month=...`)
- [x] Task: Migrar y adaptar el formulario de auditoría desde `AuditModal.astro` [6153e6b]
  - [x] Modularizar el formulario en un componente dedicado (`NewAuditForm.astro`) aprovechando el ancho completo de pantalla
  - [x] Disponer ergonómicamente los selectores de canal, buscador dual (Wise CX / InvGate), metadatos, reproductor de llamadas y matriz de parámetros
  - [x] Conectar la acción de guardado con `/api/calidad/save-audit`, manejo de errores y redirección con toast a `/supervision/calidad-operadores`
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Fase 2: Barra Superior Unificada y Grilla de Operadores
- [x] Task: Implementar la nueva barra superior en `CalidadContent.astro` [003e7a5]
  - [x] Colocar el buscador interactivo (`SearchBar.astro`) en el extremo izquierdo
  - [x] Agrupar en el extremo derecho el selector de mes, el botón de configuración de parámetros y el botón principal "Nueva auditoría"
- [x] Task: Construir la cuadrícula responsive de operadores [003e7a5]
  - [x] Reemplazar la barra lateral por un contenedor `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4`
  - [x] Crear la tarjeta de operador con avatar (iniciales), nombre completo, insignia de excelencia, username (`@legajo`), badge de score global y conteo mensual (`X / 12 auditorías`)
  - [x] Implementar filtrado en tiempo real en la grilla mediante el buscador de texto y gestionar el estado vacío (`SearchEmptyState`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Fase 3: Detalle del Operador (Modal para Supervisores y Vista Directa para Operadores)
- [x] Task: Encapsular `operator-details-panel` dentro de un modal interactivo para supervisores [003e7a5]
  - [x] Configurar el diálogo modal de DaisyUI (`#operator-details-modal`) con scroll vertical y botón de cierre/backdrop
  - [x] Vincular el clic de cada tarjeta en la grilla para popular y abrir el modal del operador correspondiente
  - [x] Configurar el botón "Nueva auditoría" del modal para redirigir a `/supervision/calidad-operadores/nueva?agentId=${id}&month=${month}`
- [x] Task: Habilitar vista directa en pantalla completa para usuarios con rol `agent` [003e7a5]
  - [x] Renderizar directamente el panel de detalles para operadores sin pasar por la grilla ni modal
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Fase 4: Pruebas E2E y Verificación Integral
- [x] Task: Implementar prueba E2E en Playwright (`tests/calidad-ui-refactor.spec.ts`) [003e7a5]
  - [x] Validar visualización de la barra superior y filtrado en vivo de tarjetas en la grilla
  - [x] Validar apertura y visualización del modal al hacer clic en un operador
  - [x] Validar navegación a la nueva sección `/supervision/calidad-operadores/nueva` y preselección de operador
  - [x] Validar vista directa para usuarios con rol `agent`
- [x] Task: Verificación de build y estilos [003e7a5]
  - [x] Ejecutar `npm run build` para asegurar integridad del SSR y ausencia de regresiones
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
