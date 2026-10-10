# Implementation Plan: Refactor y Modernización del Modal de Parámetros de Calidad

## Phase 1: Estructura, Layout Shell y Header Compacto
- [x] Task: Rediseñar contenedor del modal (`parameters-modal`) en `CalidadContent.astro` para altura controlada (`max-h-[85vh]`), scroll interno independiente y footer fijo
- [x] Task: Unificar cabecera compacta con selector de Canal horizontal responsive (`overflow-x-auto` en móvil) y selector de pestañas con estados activos contrastados
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Editor de Criterios, Reordenamiento y Acciones de Fila
- [x] Task: Rediseñar markup de filas de criterios (`renderParameterRow`) con nombre expandido, peso numérico compacto (`w-20`), controles accesibles subir/bajar (▲/▼) y botón de eliminación discreto
- [x] Task: Implementar lógica de reordenamiento de criterios (swap en array `localParams`) y eliminación suave con estado "A eliminar" y botón "Restaurar"
- [x] Task: Configurar botón contextual `+ Agregar criterio` adaptativo según la subsección activa
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Resumen Dinámico de Pesos, Validación y Feedback
- [x] Task: Implementar componente/badge de resumen en vivo (`X criterios · Peso total: Y%`) con estilos semánticos (`success` si 100%, `warning` accesible si != 100%)
- [x] Task: Conectar validaciones al guardar en `actions.saveParameters`: impedir nombres vacíos, alertar amigablemente si el peso total difiere de 100% y mostrar feedback adecuado
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Verificación E2E y Accesibilidad
- [x] Task: Crear suite de pruebas E2E con Playwright (`tests/calidad-parameters-modal.spec.ts`) cubriendo apertura del modal, edición de peso, reordenamiento, resumen dinámico y guardado
- [x] Task: Verificar compilación completa (`npm run build`) y comportamiento responsive / accesibilidad
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
