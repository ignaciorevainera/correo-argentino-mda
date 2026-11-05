# Track Specification: Ciclo de Vida Borrador / Publicado para Auditorías de Calidad

## Overview
Actualmente, las auditorías de calidad guardadas por los supervisores impactan de forma instantánea en la vista de los operadores. Este track introduce un ciclo de vida con estados (`draft` y `published`) para que las auditorías se creen como borradores privados para el equipo de supervisión y solo sean visibles para el operador una vez que el supervisor las publique formalmente (de forma individual o en lote).

---

## Functional Requirements

### 1. Esquema y Modelo de Datos
- Agregar la columna `status` (`text('status').notNull().default('draft')`) en la tabla `quality_audits` de `src/db/schema.ts`.
- Valores permitidos: `'draft'` (borrador) y `'published'` (publicada).
- Migración/alineación segura: Las auditorías históricas preexistentes quedan en `'draft'` por defecto (según lo definido por el usuario).
- Indexación adecuada para optimizar consultas de supervisión y de operador.

### 2. Guardado en Formulario (`NewAuditForm.astro`)
- El formulario mantiene un único botón de guardado ("Guardar"), que persiste siempre la auditoría en estado `'draft'`.
- El supervisor recibe feedback visual claro de que la auditoría quedó registrada como borrador.

### 3. Visualización y Gestión en Supervisión (`CalidadContent.astro` / `OperatorDetailsPanel.astro`)
- En el panel de supervisión se listan todas las auditorías (`draft` y `published`) de cada operador.
- Cada auditoría muestra un badge semántico de estado:
  - `Borrador`: badge estilo `badge-warning` o `badge-ghost` con icono de borrador/reloj.
  - `Publicado`: badge estilo `badge-success` con icono de check.
- **Acción individual de publicación**:
  - Botón "Publicar" en cada tarjeta/fila de auditoría en estado borrador.
  - Abre modal de confirmación rápida: *"¿Publicar la auditoría #ID del operador [Nombre]?"*.
- **Acción masiva / en lote de publicación**:
  - Botón en la cabecera de la ficha del operador: "Publicar pendientes del operador" (o por mes).
  - Modal de confirmación: *"¿Desea publicar N auditorías en borrador para este período?"*.
- El promedio del supervisor refleja la realidad de las evaluaciones cargadas, pero destacando cuántas están pendientes de publicación.

### 4. Visibilidad Restringida para Operadores
- En las vistas del operador (`src/components/inicio/QualityPanel.astro`, `src/lib/inicio/qualitySummary.ts`, etc.):
  - Solo se consultan y calculan auditorías con `status = 'published'`.
  - Si un operador tiene auditorías cargadas pero en `draft`, no se muestran notas, detalles ni promedios preliminares hasta que sean publicadas.

### 5. Backend & Server Actions
- Endpoint o Action seguro (`publishAudit` / `publishAuditsBatch`):
  - Verifica sesión con rol de supervisor o admin (`requireWriteAccess`).
  - Actualiza el estado a `'published'`.
  - Registra la acción en el log de auditoría administrativa (`logAdminAction`).

---

## Non-Functional Requirements
- **Testing**: Tests de dominio (`src/lib/...`) y cobertura de aislamiento de visibilidad (operador no ve borradores, supervisor sí ve ambos).
- **Design System**: Estilos semánticos DaisyUI v5 (sin hex hardcodeados).
- **Integridad DB**: Migración idempotente sin pérdida de datos en SQLite.

---

## Out of Scope
- Notificaciones externas (Slack, correo, Web Push) al momento de publicar.
- Workflow multinivel de aprobación (ej: supervisor aprueba, gerente publica).
