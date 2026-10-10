# Implementation Plan: Refactor Integral UI/UX de Ficha de Operador (OperatorDetailsPanel)

## Phase 1: Rediseño del Encabezado Compacto y Banda de Métricas
- [x] Task: Rediseñar estructura HTML/Astro del encabezado en `OperatorDetailsPanel.astro`
    - [x] Unificar en una sola fila compacta: avatar, nombre del operador, legajo/username (`@username`), período y score mensual principal
    - [x] Implementar menú dropdown secundario para las opciones de exportación (CSV e Imprimir)
    - [x] Sustituir "Cerrar Ficha" por botón de cierre estándar con icono accesible
- [x] Task: Implementar banda horizontal de 4 métricas compactas
    - [x] Diseñar bloque para: Score vs Mes Anterior, Duración Promedio (AHT), Interacción (S1) y Gestión (S2)
    - [x] Actualizar script en `CalidadContent.astro` para manejar estados vacíos con "Sin datos" (sin `N/A`, `--%` o `undefined`) y contexto de período
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Tendencia Histórica, Tarjeta Dinámica de Calidad y Observaciones
- [x] Task: Refactorizar visualización de Tendencia Histórica
    - [x] Calcular tendencia a partir de todas las auditorías registradas en 6 meses
    - [x] Implementar estado vacío descriptivo si no hay datos suficientes en vez de gráfica plana de ceros
- [x] Task: Implementar tarjeta dinámica de resumen de calidad / áreas de mejora
    - [x] Titular dinámicamente "Resumen de Calidad" con mensaje positivo ("¡Rendimiento impecable!") cuando no haya patrones de error
    - [x] Titular "Áreas de Mejora Detectadas" con lista y conteo cuando existan fallas frecuentes
- [x] Task: Compactar bloque de Observaciones del Mes
    - [x] Reducir altura vertical y ocultar espacios vacíos innecesarios
    - [x] Añadir placeholder accionable ("Añadir observación del mes...") y alternancia de edición bajo demanda
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Priorización de Evaluaciones (Tabs/Filtros) y Acordeón Único
- [x] Task: Reorganizar sección de evaluaciones con tabs/filtros y cuota consistente
    - [x] Implementar tabs: Todas, Llamadas Wise, Mails Wise, Autogestiones
    - [x] Formatear estado de progreso consistente (ej. `1 de 12 completadas`)
    - [x] Mantener "Nueva Auditoría" como única acción primaria visible para supervisores
- [x] Task: Rediseñar cabecera y estructura de auditorías en acordeón único
    - [x] Compactar cabecera mostrando: resultado/score, duración/respuesta, ticket y fecha
    - [x] Implementar lógica interactiva de acordeón exclusivo (máximo una auditoría abierta simultáneamente)
    - [x] Organizar criterios en 2 columnas con alto contraste DaisyUI y estado explícito para no evaluados ("No evaluado" / "N/A")
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Verificación Integral, Pruebas y Cierre
- [x] Task: Ejecutar suite de pruebas unitarias (`npm run test:unit -- tests/unit`)
- [x] Task: Ejecutar y verificar suite de pruebas E2E de Playwright (`tests/calidad-*.spec.ts`)
- [x] Task: Ejecutar build SSR de producción para verificar manifest y bundles (`npm run build`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
