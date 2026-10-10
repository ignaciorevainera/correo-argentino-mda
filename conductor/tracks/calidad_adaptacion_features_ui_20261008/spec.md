# Specification: Adaptación e Integración de Features de Calidad en Refactor de UI

## Overview
El objetivo de este track es consolidar y adaptar las características operativas recientes desarrolladas en la rama `calidad` dentro de la nueva arquitectura de interfaz de usuario de `refactor/UI`, resolviendo conflictos de código y Git, y garantizando paridad funcional completa.

## Functional Requirements
1. **Consolidación de Ramas (Git Integration):**
   - Integrar los commits de `origin/calidad` en la rama `refactor/UI` (vía merge/rebase ordenado), resolviendo conflictos sin perder los componentes modernizados (`CalidadContent`, `NewAuditForm`, `OperatorDetailsPanel`, `FormShell`).
2. **Lógica Reclamo / Novedad:**
   - Incorporar el selector segmentado Reclamo / Novedad tanto en `NewAuditForm.astro` como en `AuditModal.astro`.
   - Soporte para cálculo diferenciado de scores (sección 2 al 100% por definición en reclamos/novedades, llamada y mail Wise CX).
   - Persistencia segura del campo `is_reclamo_novedad` en las acciones de servidor (`actions/index.ts` o endpoint de guardado).
3. **Búsqueda Unificada Directa por API en Inputs:**
   - Mantener la eliminación de tarjetas de búsqueda duplicadas; integrar botones de búsqueda directamente en los inputs `#form-call-id` (Wise CX) y `#form-ticket-id` (InvGate) con soporte para tecla `Enter`.
   - Validación de ticket InvGate por operador con advertencia si está reasignado y deep-link al ticket en InvGate habilitado cuando existe ticket cargado.
   - Reflejar esta interacción en `NewAuditForm.astro` y en `AuditModal.astro`.
4. **Controles Masivos (Tildar / Destildar Todo):**
   - Implementar botones de selección masiva por sección (Sección 1 y Sección 2) con feedback táctil/visual.
   - Sincronización automática de puntuaciones y estado al tildar o destildar en bloque.
5. **Exportación Nativa Excel (.xlsx) y CSV Enriquecido:**
   - Mantener el botón de exportación en la barra superior unificada de `CalidadContent.astro`.
   - Generación de Excel multi-hoja (hoja resumen general + hoja por operador con promedios y estilos) respetando la regla de no marcar "CUMPLE" en ítems sin score (`cumpleCell()` -> "N/A").
6. **Flujo de Usuario Diferenciado (Alta vs Edición):**
   - **Alta:** Botón global "Nueva Auditoría" en la barra superior de `CalidadContent` que navega a la página dedicada `/supervision/calidad-operadores/nueva` con `FormShell` y `NewAuditForm`.
   - **Edición / Detalle:** Visualización y edición rápida inline mediante `AuditModal` y `OperatorDetailsPanel`.

## Non-Functional Requirements
- **Design System:** Estricto cumplimiento con tokens de DaisyUI v5 y Tailwind v4; cero colores hexadecimales hardcodeados.
- **Performance & Estabilidad:** Cero fugas de memoria o re-renders innecesarios; endpoints SSR con RBAC validado.
- **Testing:** Pruebas E2E (Playwright) y unitarias (Vitest) pasando limpiamente tras la integración.

## Acceptance Criteria
- [ ] Merge / sincronización de `calidad` en `refactor/UI` limpio y verificado sin pérdida de código.
- [ ] Exportación a Excel (.xlsx) funciona desde la barra superior unificada con 0 errores y reporte exacto de cumplimiento.
- [ ] `NewAuditForm` y `AuditModal` cuentan con Reclamo/Novedad, búsqueda por API integrada y tildado masivo.
- [ ] La suite de pruebas de Calidad (`tests/calidad-*.spec.ts`) ejecuta exitosamente.

## Out of Scope
- Modificación del modelo de datos / esquema DDL de la base de datos (ya alineado en `calidad`).
- Alteración de roles o permisos RBAC más allá de los ya configurados para supervisión.
