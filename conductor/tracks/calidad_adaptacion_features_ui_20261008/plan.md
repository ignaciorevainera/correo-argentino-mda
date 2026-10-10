# Implementation Plan: Adaptación e Integración de Features de Calidad en Refactor de UI

## Phase 1: Consolidación Git y Resolución de Conflictos Base
- [x] Task: Preparar rama de integración e incorporar commits de `origin/calidad` en `refactor/UI`
    - [x] Realizar merge controlado de `origin/calidad` en `refactor/UI`
    - [x] Resolver conflictos preservando la arquitectura modular de UI (`CalidadContent`, `NewAuditForm`, `OperatorDetailsPanel`) y la lógica de backend/scripts de `calidad`
    - [x] Ejecutar comprobación de sintaxis y tipos con TypeScript (`astro check` o `npm run build`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: fb4de88]

## Phase 2: Paridad y Adaptación de Features en Formularios (`NewAuditForm` y `AuditModal`)
- [x] Task: Integrar selector Reclamo / Novedad y cálculo dinámico de puntuación en `NewAuditForm.astro`
    - [x] Incorporar selector de modo Ticket Nuevo vs Reclamo / Novedad en llamadas y correos Wise CX
    - [x] Sincronizar cálculo de scores (sección 2 al 100% en Reclamo/Novedad) y asegurar persistencia de `is_reclamo_novedad`
- [x] Task: Integrar búsqueda directa en inputs y deep-link a InvGate
    - [x] Integrar botón de búsqueda en `#form-call-id` (Wise CX) y `#form-ticket-id` (InvGate) con soporte Enter
    - [x] Incorporar feedback de validación de operador y deep-link al ticket
- [x] Task: Integrar controles de selección masiva (Tildar / Destildar todo)
    - [x] Añadir controles por sección con feedback visual y actualización automática del score
- [x] Task: Garantizar paridad en `AuditModal.astro` para visualización y edición inline
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: 2f92d06]

## Phase 3: Integración en Barra Superior, Exportación y Panel de Operador
- [x] Task: Integrar exportación Excel (.xlsx) y CSV enriquecido en la barra superior unificada
    - [x] Conectar acciones de descarga nativa Excel multi-hoja en la barra de herramientas de `CalidadContent.astro`
    - [x] Asegurar que el botón global "Nueva Auditoría" dirija correctamente a `/supervision/calidad-operadores/nueva`
- [x] Task: Conectar `OperatorDetailsPanel.astro` con `AuditModal` para ver/editar auditorías históricas
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: e1e3da2]

## Phase 4: Verificación Integral, Pruebas y Cierre
- [x] Task: Ejecutar suite de pruebas unitarias relevantes (`npm run test:unit -- tests/unit`)
- [x] Task: Ejecutar pruebas E2E de calidad (`npx playwright test tests/calidad-*.spec.ts`)
- [x] Task: Ejecutar build SSR de producción para verificar manifest y bundles (`npm run build`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) [checkpoint: c32ede38]
