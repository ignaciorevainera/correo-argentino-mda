# Implementation Plan: Rediseño de Pantalla Completa: Nueva Auditoría de Calidad

## Phase 1: Estructura General de Pantalla, Header Sticky y Barra de Configuración
- [x] Task: Crear pruebas o validaciones para layout completo, header compacto y barra de configuración
    - [x] Definir casos de prueba en suite E2E para la página completa `/supervision/calidad-operadores/nueva`
    - [x] Verificar presencia de header compacto, badge de estado, botones de acción y barra de configuración
- [x] Task: Refactorizar contenedor general en `src/pages/supervision/calidad-operadores/nueva.astro`
    - [x] Adaptar página a pantalla completa (max 1440px, padding responsive, sin contenedor de modal restrictivo)
    - [x] Implementar scroll general natural del documento
- [x] Task: Diseñar e implementar Header Superior Compacto
    - [x] Incluir botón "Volver a evaluaciones", título, subtítulo, badge "Borrador / Sin guardar"
    - [x] Incluir acciones secundarias ("Guardar borrador", "Ayuda") y acción primaria derecha ("Guardar auditoría")
- [x] Task: Implementar Barra de Configuración Principal
    - [x] Bloque Operador: selector con avatar, nombre completo y usuario
    - [x] Bloque Periodo: selector de mes y año
    - [x] Bloque Canal de Atención: segmented control interactivo (*Llamada Wise*, *Mail Wise*, *Autogestión*) con estilo activo destacado
    - [x] Línea de contexto: cantidad de criterios y peso total (100%)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Columna Izquierda — Datos de Atención y Contexto del Ticket
- [x] Task: Crear casos de prueba para formulario de atención y contexto de ticket
    - [x] Validar inputs de llamada/caso, ticket InvGate, fecha obligatoria, duración y ringue/primera respuesta
    - [x] Validar comportamiento de tarjeta de contexto del ticket (cargado, sin ticket, acordeón)
- [x] Task: Implementar Tarjeta "Datos de la atención"
    - [x] Grid responsive de 2 columnas para inputs con botones de búsqueda rápida
    - [x] Formateo y validación de campos de tiempo (mm:ss) y fecha
- [x] Task: Implementar Tarjeta "Contexto del ticket"
    - [x] Estado visual: badge "Ticket cargado" o "Sin ticket cargado"
    - [x] Botones "Abrir en InvGate" y "Cargar datos del ticket"
    - [x] Acordeón colapsable con detalles del ticket (título, categoría, prioridad, cliente, fecha)
    - [x] Empty state informativo y compacto cuando no hay ticket cargado
- [x] Task: Conectar integraciones de búsqueda de caso/ticket existentes
    - [x] Integrar búsqueda con endpoint Wise CX e InvGate
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Columna Derecha — Score en Tiempo Real, Stepper y Tarjetas de Criterios con Notas Inline
- [x] Task: Crear casos de prueba para cálculo de score, navegación de secciones y notas inline
    - [x] Probar reactividad del score en tiempo real, pesos y barras de progreso
    - [x] Probar controles "Todos" / "Ninguno", colapso de secciones y despliegue de notas inline
- [x] Task: Implementar Tarjeta de "Score en tiempo real"
    - [x] Indicadores de criterios evaluados (X de Y), score actual y peso completado
    - [x] Barra de progreso con colores semánticos (verde, ámbar, rojo) y sin estados vacíos ambiguos
- [x] Task: Implementar Navegación de Secciones (Tabs / Stepper horizontal)
    - [x] Tabs para Interacción con el usuario, Gestión del ticket y Resumen
    - [x] Progreso por sección visible y responsive con scroll horizontal en móvil
- [x] Task: Implementar Tarjetas de Sección de Criterios
    - [x] Cabecera de tarjeta: número, nombre, peso en puntos, score actual
    - [x] Botones de cabecera: "Todos", "Ninguno", expandir/contraer sección
- [x] Task: Implementar Filas de Criterios y Notas Inline
    - [x] Checkbox/switch de cumplimiento, peso, badge de estado visual (Cumple / No cumple / N/A / Pendiente)
    - [x] Botón de nota inline que expande textarea debajo de la fila sin abrir modal
- [x] Task: Implementar Tarjeta "Resumen y observaciones"
    - [x] Puntaje proyectado, fortalezas detectadas, oportunidades de mejora
    - [x] Textarea para feedback y observaciones generales
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Footer Sticky, Validaciones y Guardado de Auditoría
- [x] Task: Crear pruebas para sticky footer y flujo de guardado
    - [x] Validar sincronización de score en el footer y habilitación de botones
    - [x] Validar llamada a `actions.saveAudit` y redirección con toast de confirmación
- [x] Task: Implementar Footer Inferior Sticky
    - [x] Barra sticky al pie con resumen de score, estado y botones de acción
- [x] Task: Implementar Validaciones Inline y Prevención de Errores
    - [x] Validación de campos obligatorios y aviso no bloqueante sobre criterios pendientes
- [x] Task: Conectar persistencia con `actions.saveAudit`
    - [x] Mapear datos del nuevo formulario a la firma esperada por el backend
    - [x] Manejo de respuesta, notificación toast y redirección
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Verificación Integral, Pruebas E2E y Cierre
- [x] Task: Ejecutar suite de pruebas unitarias (`npm run test:unit -- tests/unit`)
- [x] Task: Ejecutar suite de pruebas E2E de Playwright (`npx playwright test tests/calidad-*.spec.ts`)
- [x] Task: Ejecutar build SSR de producción para verificar manifest y assets (`npm run build`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)
