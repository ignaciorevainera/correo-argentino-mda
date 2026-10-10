# Specification: Refactor y Modernización del Modal de Parámetros de Calidad

## Overview
El modal actual de Configuración de Parámetros de Calidad (`parameters-modal` en `CalidadContent.astro`) permite a supervisores y administradores gestionar los criterios de evaluación y sus pesos por canal (`wise_call`, `wise_email`, `invgate_ticket`) y sección (`items` / Interacción con Usuario vs `ticket` / Gestión del Ticket).

Esta especificación rediseña dicho modal para convertirlo en un editor de criterios ordenado, ergonómico y con footer fijo, corrigiendo problemas de desborde de scroll, jerarquía visual tosca, controles de edición poco proporcionados y carencia de resumen de pesos en vivo.

## Functional Requirements
1. **Contenedor y Scroll**:
   - Altura del modal optimizada (`max-h-[85vh]` o dimensión fija proporcional) asegurando que el contenido no quede cortado y el área de criterios tenga scroll interno independiente (`overflow-y-auto`).
   - Footer inferior (`actions`) fijado visiblemente para que los botones Cancelar y Guardar Cambios nunca se desplacen fuera de la vista.
2. **Encabezado y Navegación Compacta**:
   - Agrupar selector de Canal (`join` con botones de canal) y pestañas de subsección ("Interacción con Usuario" / "Gestión del Ticket") en una cabecera limpia y compacta.
   - Estados activos contrastados usando tokens DaisyUI (`btn-primary` / `tab-active`).
   - En pantallas móviles: selector horizontal deslizable (`overflow-x-auto whitespace-nowrap`) y adaptación casi a pantalla completa.
3. **Editor de Criterios (Filas Limpias)**:
   - Filas con separación visual sutil, menos bordes pesados y mayor espacio horizontal para el nombre del criterio.
   - Campo "Nombre del criterio" expandido con ancho flexible (`flex-1`).
   - Campo "Peso" numérico compacto (`w-20`), centrado o alineado con formato claro.
   - Controles de reordenamiento: botones accesibles subir/bajar (▲ / ▼) en cada fila con `aria-label` y tooltips.
   - Eliminación segura: sustituir papelera tosca por botón discreto con tooltip; al eliminar, marcar la fila con estado "A eliminar" (estilo atenuado/soft-delete) y botón directo "Restaurar" para deshacer antes de guardar.
   - Botón contextual para agregar criterios: `+ Agregar criterio` adaptado dinámicamente según la subsección activa.
4. **Resumen de Métricas y Validación de Pesos**:
   - Resumen visual visible en la cabecera o sobre la lista: ej. `5 criterios · Peso total: 100%`.
   - Badge semántico reactivo: `badge-success` cuando la suma de pesos es 100%, o `badge-warning` con advertencia sutil cuando difiere de 100%.
   - Al guardar, validar que ningún criterio activo tenga nombre vacío. Si el peso difiere de 100%, mostrar aviso de confirmación amable antes de persistir los cambios vía `actions.saveParameters`.
5. **Accesibilidad y Feedback**:
   - Atributos `aria-label`, foco visual nítido y navegación por teclado.
   - Confirmación tras guardar y cierre fluido.

## Non-Functional Requirements
- DaisyUI v5 semantic tokens sin colores hex hardcodeados.
- Preservar compatibilidad con el endpoint backend `actions.saveParameters` y su estructura de datos.
- Respetar estándares de accesibilidad y diseño responsive mobile-first.

## Acceptance Criteria
- [x] El modal no corta su contenido en pantallas de distintas resoluciones ni esconde su footer.
- [x] Los criterios se pueden reordenar mediante botones accesibles subir/bajar (▲ / ▼).
- [x] El resumen muestra en tiempo real la cantidad de criterios activos y la suma total de pesos para el canal y pestaña seleccionados.
- [x] La eliminación marca visualmente la fila como descartada y ofrece restaurar de inmediato.
- [x] Las pruebas E2E validan la interacción del modal y la edición de parámetros.
