# Especificación Funcional: Refactor UI de Calidad

## 1. Overview
Modernización integral de la experiencia y arquitectura visual del módulo de Calidad (`/supervision/calidad-operadores`):
- Sustitución de la lista lateral compacta y el panel derecho por una **grilla responsive de operadores**.
- **Barra superior unificada:** buscador instantáneo a la izquierda; selector de mes, configuración de parámetros y botón principal de **Nueva auditoría** a la derecha.
- **Detalle del operador segmentado por rol:**
  - **Supervisores / Administradores:** Al hacer clic en un operador de la grilla, se abre un **Modal amplio** con toda la información de `operator-details-panel` (historial, métricas, promedios por canal, reproductor de llamadas y tickets InvGate).
  - **Operadores (rol `agent`):** Acceso directo en pantalla completa a su propio panel de detalle, sin pasar por la grilla multi-operador ni requerir apertura de modal.
- **Nueva sección dedicada de auditorías (`/supervision/calidad-operadores/nueva`):**
  - Migración del formulario de auditoría (`audit-modal-container`) a una página completa con `FormShell` (`docs/FORM_STANDARD.md`), optimizando el espacio disponible para el buscador dual, matrices de puntuación, reproductor de audio e inspección de tickets.

---

## 2. Requerimientos Funcionales

### 2.1 Barra Superior Unificada
- **Izquierda:** Buscador en vivo (`SearchBar.astro`) para filtrar operadores en la grilla por nombre o `@username`.
- **Derecha:**
  - Selector de período mensual con navegación por botones (mes previo / siguiente).
  - Botón "Parámetros" (para roles supervisores/admin).
  - Botón principal "Nueva auditoría" (estilo `btn-primary`), que navega a `/supervision/calidad-operadores/nueva`.

### 2.2 Grilla de Operadores (Supervisores / Admin)
- Layout responsive en cuadrícula (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4`).
- Tarjeta interactiva por cada operador con:
  - Avatar con iniciales del operador.
  - Nombre completo con insignia de excelencia (`boxicons:badge-check`) si score >= 90%.
  - Usuario/legajo corporativo (`@username`).
  - Badge de puntaje global del mes con colores semánticos (`success`, `warning`, `error`).
  - Conteo de auditorías mensuales (ej. `X / 12 auditorías`).
- Estado vacío cuando la búsqueda no arroje resultados (`SearchEmptyState`).

### 2.3 Detalle del Operador (`operator-details-panel`)
- **Supervisores:** Modal amplio (`#operator-details-modal`) abierto dinámicamente al pulsar sobre la tarjeta del operador. Contiene:
  - Header con datos del operador, botón de exportación CSV y botón "Nueva auditoría" con preselección del operador (`?agentId=...`).
  - Promedios por canal (Llamadas, Mails, Tickets) y estadísticas del período.
  - Lista de auditorías evaluadas con reproductor de grabaciones Wise CX, metadatos y deducciones de parámetros.
  - Botón de cierre y cierre con tecla Escape o backdrop.
- **Operadores (`agent`):** Visualización directa en pantalla completa de su propio panel de desempeño y auditorías recibidas.

### 2.4 Sección Dedicada de Creación de Auditorías (`/supervision/calidad-operadores/nueva`)
- Página independiente construida con `BaseLayout` y `FormShell.astro`.
- Preselección automática de operador y mes si se reciben parámetros en la URL (`?agentId=...&month=...`).
- Distribución ergonómica en pantalla completa:
  - Selector de operador y tipo de canal (Llamada Wise CX, Mail Wise CX, Ticket InvGate).
  - Buscador dual y autocompletado de metadatos (tickets, llamadas, tiempos de respuesta).
  - Reproductor de audio integrado para grabaciones de llamadas.
  - Matriz de parámetros y criterios de calidad con cálculo dinámico del puntaje final en tiempo real.
  - Áreas de observaciones y devoluciones.
- Acciones de Guardar y Cancelar integradas al pie del shell. Guardado exitoso envía toast y redirige a la vista principal.

---

## 3. Requerimientos No Funcionales
- **Design System:** Estricto cumplimiento de DaisyUI v5 y tokens semánticos (sin colores hex arbitrarios).
- **Responsive:** Adaptación fluida desde pantallas móviles hasta monitores de escritorio.
- **RBAC:** Preservación de seguridad de roles (los operadores no pueden crear auditorías ni ver datos ajenos).
- **Performance:** Filtrado instantáneo en la grilla sin peticiones de red adicionales.

---

## 4. Criterios de Aceptación
1. La barra superior contiene buscador a la izquierda y selector de mes + parámetros + nueva auditoría a la derecha.
2. Cada tarjeta de operador muestra iniciales, nombre, username, score global y conteo `X/12`.
3. Al hacer clic en un operador (como supervisor), se abre el modal con sus detalles y auditorías previas.
4. Un usuario con rol `agent` ve directamente su propio panel de rendimiento sin modal ni grilla.
5. El botón "Nueva auditoría" (barra superior y modal del operador) redirige a `/supervision/calidad-operadores/nueva`.
6. La página `/supervision/calidad-operadores/nueva` renderiza el formulario ampliado y guarda correctamente las auditorías en la base de datos.

---

## 5. Fuera de Alcance (Out of Scope)
- Modificación del esquema de base de datos o lógica de cálculo de puntajes (`@lib/qualityCalculator`).
- Alteraciones en las APIs de integración con Wise CX o InvGate.
