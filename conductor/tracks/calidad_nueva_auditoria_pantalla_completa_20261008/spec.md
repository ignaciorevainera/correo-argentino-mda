# Specification: Rediseño de Pantalla Completa: Nueva Auditoría de Calidad

## Overview
Transformar la sección de "Nueva auditoría de calidad" (`/supervision/calidad-operadores/nueva`) eliminando por completo las limitaciones residuales de su arquitectura previa tipo modal. Convertirla en una pantalla completa de evaluación asistida que aproveche todo el ancho disponible (hasta 1440px), sea completamente responsive, mantenga scroll vertical general natural sin sub-scrolls innecesarios, y establezca una jerarquía clara entre los datos de la atención, el contexto del ticket y los criterios evaluables.

---

## Functional Requirements

### 1. Estructura General y Layout
- **Contenedor Principal**: Centrado, con ancho máximo de 1440 px (`max-w-[1440px] mx-auto`), fondo general gris muy claro (`bg-base-200/50`).
- **Padding Responsive**: Padding horizontal de 32 a 48 px en escritorio (`px-8 lg:px-12`) y 16 px en móvil (`px-4`).
- **Scroll del Documento**: Scroll vertical general del documento, eliminando scrolls internos innecesarios o limitados a contenedores pequeños.
- **Elementos Sticky**: Header superior y Footer inferior con comportamiento sticky para asegurar accesibilidad a las acciones y al score en cualquier punto del scroll.

### 2. Header Superior Compacto
- **Fila Superior Unificada**:
  - Botón de retorno: "Volver a evaluaciones" o "Cancelar" con icono claro, apuntando a `/supervision/calidad-operadores`.
  - Título y Descripción: "Nueva auditoría de calidad" y subtítulo "Evaluación asistida de calidad para llamadas Wise CX, correos o autogestión InvGate".
  - Badge de Estado: "Borrador" / "Sin guardar".
  - Acciones Secundarias: Botón "Guardar borrador" y botón/modal "Ayuda o información" con guía de criterios.
  - Acción Primaria: Botón "Guardar auditoría" alineado a la derecha.
- **Sin Redundancia**: No duplicar innecesariamente botones de cancelar/guardar en áreas intermedias.

### 3. Barra de Configuración Principal
- **Tarjeta Horizontal**:
  - **Operador**: Selector ancho "Operador a evaluar" (obligatorio). Al seleccionar, muestra avatar con iniciales, nombre completo y `@username`.
  - **Periodo**: Selector de mes y año (ej: "Octubre 2026").
  - **Canal de Atención**: Segmented control con opciones *Llamada Wise*, *Mail Wise* y *Autogestión*. El canal activo utiliza un estilo visual destacado de marca/DaisyUI (`btn-primary` o fondo contrastado).
  - **Contexto Informativo**: Línea de resumen inferior: *"Configuración aplicada: N criterios · Peso total 100%"*.

### 4. Layout de Contenido en Dos Columnas
- **Distribución en Escritorio**:
  - Columna izquierda: 32–36% del ancho (`lg:w-[35%]`).
  - Columna derecha: 64–68% del ancho (`lg:w-[65%]`).
  - Gap de separación: 24 px (`gap-6`).
- **Responsive**: Transición a 1 columna fluida en tablet y mobile (`flex-col lg:flex-row`).

### 5. Columna Izquierda: Datos de la Atención
- **Tarjeta "Datos de la atención"**:
  - Número de caso / llamada con input y botón de búsqueda rápida Wise CX.
  - Número de ticket InvGate con input y botón de búsqueda rápida InvGate.
  - Fecha de atención (campo obligatorio).
  - Duración (formato mm:ss).
  - Tiempo en ringue (llamadas) o primera respuesta (mails) (formato mm:ss).
  - Agente o canal de origen / Tipo de solicitud / Prioridad cuando aplique.
  - Organización en grid de 2 columnas donde haya espacio, con campos anchos ocupando ancho completo.

### 6. Columna Izquierda: Contexto del Ticket
- **Tarjeta "Contexto del ticket"**:
  - Badge de estado: "Ticket cargado" o "Sin ticket cargado".
  - Acciones rápidas: Botón "Abrir en InvGate" (enlace externo directo) y botón "Cargar datos del ticket".
  - Resumen colapsable mediante acordeón: Título, Categoría, Prioridad, Cliente/Solicitante, Fecha de creación.
  - Empty state compacto y descriptivo cuando no hay datos de ticket cargados.

### 7. Columna Derecha: Tarjeta de Score en Tiempo Real
- **Tarjeta "Score en tiempo real"**:
  - Progreso general: "Criterios evaluados: X de Y", "Score actual: Z%", "Peso completado: W%".
  - Indicadores por sección: Interacción con el usuario y Gestión del ticket.
  - Barra de progreso horizontal con semántica de color: Verde (≥80%), Ámbar (60–79%), Rojo (<60%).
  - Valores consistentes: Nunca mostrar `undefined`, `--%` o `N/A` sin contexto; utilizar "Sin datos" o "Pendiente".

### 8. Navegación de Secciones (Tabs / Stepper)
- **Barra de Secciones**:
  - Tabs horizontales: *1. Interacción con el usuario*, *2. Gestión del ticket*, *3. Resumen y observaciones*.
  - Cada tab indica el progreso (ej. `8/9 completados`) y score de la sección.
  - Visible en escritorio y desplazable horizontalmente en móvil (`overflow-x-auto`).

### 9. Sección de Criterios (Tarjetas Independientes)
- **Tarjetas por Sección**:
  - Cabecera con número, nombre, descripción breve, peso total de puntos y score actual de la sección.
  - Acciones de cabecera: Controles rápidos "Todos", "Ninguno" y botón expandir/contraer sección.

### 10. Filas de Criterios
- **Diseño de Cada Criterio**:
  - Checkbox o interruptor de estado a la izquierda.
  - Nombre del criterio con tipografía legible.
  - Peso del criterio visible (ej: `-3%`, `-5%`).
  - Badge de estado visual: *Cumple*, *No cumple*, *No aplica*, *Pendiente*.
  - Acción "Agregar nota" / icono de comentario para desplegar nota inline sin abrir modales.

### 11. Notas por Criterio Inline
- **Textarea Expandible**:
  - Se despliega debajo de la fila del criterio correspondiente.
  - Placeholder: *"Escribe una observación sobre este criterio…"*.
  - Mantiene la nota visible y accesible si ya contiene texto.

### 12. Resumen y Observaciones Generales
- **Tarjeta Final**:
  - Puntaje final proyectado.
  - Fortalezas detectadas (resumen de criterios óptimos).
  - Oportunidades de mejora detectadas (resumen de descuentos/fallas).
  - Textarea para feedback y observaciones generales de la auditoría.

### 13. Footer Inferior Sticky
- **Barra Inferior Fija**:
  - Resumen compacto de score y estado (ej: *"87% · Buen desempeño"*).
  - Botón "Cancelar" / retorno.
  - Botón "Guardar borrador".
  - Botón primario "Guardar auditoría", habilitado al completar los campos obligatorios.

### 14. Atajos, Accesibilidad y Ergonomía
- Navegación por teclado accesible en controles y acordeones.
- Labels asociados a todos los inputs y contrastes según estándares WCAG AA.

### 15. Validaciones y Feedback
- Validación inline de campos obligatorios (operador, fecha, llamada/ticket).
- Confirmación visual no bloqueante si hay criterios pendientes antes de guardar.
- Feedback inmediato al guardar mediante toast/notificación y redirección limpia a la lista de auditorías.

---

## Non-Functional Requirements
- **Tokens y Estilos**: Uso exclusivo de DaisyUI v5 y Tailwind CSS v4 (`bg-base-100`, `bg-base-200`, `primary`, etc.). Cero colores hexadecimales hardcodeados.
- **Rendimiento**: Renderizado eficiente en Astro SSR con interactividad ligera client-side para score y acordeones.
- **Compatibilidad con Backend**: Conservar compatibilidad plena con la acción `actions.saveAudit` y sus esquemas de validación de base de datos (`mda.db`).
