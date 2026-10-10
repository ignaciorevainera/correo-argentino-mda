# Specification: Refactor Integral UI/UX de Ficha de Operador (OperatorDetailsPanel)

## Overview
Transformar el modal y vista de ficha de operador (`OperatorDetailsPanel.astro` y su rendering interactivo en `CalidadContent.astro`) de una distribución de "página completa comprimida" con exceso de tarjetas gigantes y espacios reservados innecesarios, a una **ficha operativa compacta** organizada en tres niveles:
1. **Resumen del perfil y encabezado compacto**.
2. **Indicadores, tendencia y contexto de calidad**.
3. **Listado detallado de auditorías en acordeón único con filtros de canal**.

---

## Functional Requirements

### 1. Encabezado Compacto
- **Fila Unificada**: Nombre, avatar de iniciales, nombre de usuario (`@username`) y período de evaluación renderizados en una sola fila compacta y responsive.
- **Score Mensual Integrado**: El score mensual se integra como métrica visual protagonista dentro de la misma fila, sin ocupar una tarjeta separada tan grande.
- **Menú de Acciones Secundarias**: Las opciones de exportación (Exportar CSV e Imprimir / Exportar Reporte) se agrupan en un menú dropdown secundario accesible.
- **Acción de Cierre Estándar**: Eliminar el texto prominente "Cerrar Ficha" en el modal y sustituirlo por una acción de cierre estándar accesible (botón de cierre con icono `x` y focus visible).

### 2. Resumen de Métricas de Rendimiento
- **Cuatro Métricas Compactas**:
  1. Score vs Mes Anterior (con variación porcentual).
  2. Duración Promedio (AHT).
  3. Interacción con Usuario (Sección 1).
  4. Gestión del Ticket / Caso (Sección 2).
- **Manejo Consistente de Estados Vacíos**: Ocultar métricas sin datos o mostrar explícitamente "Sin datos" en vez de `N/A`, `--%` o `undefined`.
- **Contexto del Período**: Indicar siempre el período evaluado al que corresponden las métricas.

### 3. Tendencia y Resumen de Calidad / Áreas de Mejora
- **Distribución Responsive**: Dos columnas en desktop y una columna en mobile.
- **Tendencia Histórica**: Gráfico de tendencia de 6 meses considerando todas las auditorías registradas del operador. Si no hay datos suficientes, mostrar un estado vacío informativo en lugar de una gráfica plana de ceros.
- **Tarjeta Dinámica de Calidad**:
  - Si se detectan fallas recurrentes: titular "Áreas de Mejora Detectadas" con la lista de parámetros afectados y conteo de ocurrencias.
  - Si el rendimiento es óptimo o no hay patrones de error: cambiar dinámicamente el título y estilo a "Resumen de Calidad" con mensaje positivo ("¡Rendimiento impecable!"), evitando catalogar el éxito dentro de un bloque de fallas.

### 4. Observaciones del Mes
- Reducir significativamente la altura vertical del bloque.
- Mantener modo de lectura compacto; no reservar espacio para un bloque vacío.
- Mostrar el campo de edición bajo demanda al accionar "Editar", con placeholder accionable: *"Añadir observación del mes..."*.

### 5. Sección de Evaluaciones y Filtros
- **Prioridad Visual Operativa**: Destacar visualmente el listado de evaluaciones como contenido principal.
- **Tabs / Filtros de Canal**: Filtros por canal: *Todas*, *Llamadas Wise*, *Mails Wise*, *Autogestiones*.
- **Cuota de Evaluación Consistente**: Corregir formatos y mostrar estado consistente del progreso (ej. `1 de 12 completadas`).
- **Acción Primaria**: Mantener "Nueva Auditoría" como la única acción primaria visible para supervisores.

### 6. Auditoría Expandida en Acordeón Único
- **Cabecera Compacta**: Mostrar de forma ordenada resultado/score, duración/tiempo de respuesta, número de ticket y fecha.
- **Acordeón Exclusivo**: Comportamiento de acordeón donde solo una auditoría puede estar abierta a la vez (al expandir una auditoría se cierra automáticamente la anterior).
- **Detalle de Criterios**: Dos columnas con alto contraste (DaisyUI) y resumen por sección.
- **Semántica de Color**: Verde reservado exclusivamente para estados positivos; ámbar y rojo para fallos concretos.
- **Criterios No Evaluados**: Estado visual explícito y claro ("No evaluado" / "N/A") evitando ambigüedades.

---

## Non-Functional Requirements
- **Design Tokens**: Cumplir estrictamente con la paleta semántica de DaisyUI v5 y Tailwind CSS v4, sin colores hexadecimales hardcodeados.
- **Accesibilidad**: Navegación completa por teclado en acordeones y tabs, con atributos ARIA correspondientes.
- **Compatibilidad**: Mantener compatibilidad con los selectores requeridos por la suite de pruebas unitarias y E2E de calidad.
