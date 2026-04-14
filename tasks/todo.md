# Tarea: Ajustar token neutral en DaisyUI
Fecha: 2026-04-13

## Descripcion
Actualizar el token semantico neutral para que no reutilice el mismo color que los fondos y textos base en light y dark, manteniendo coherencia con la paleta institucional y contraste legible.

## Riesgos identificados
- Regresion de contraste en componentes que usan btn-neutral, badge-neutral o superficies bg-neutral.
- Inconsistencia documental si se cambia global.css sin reflejar el mapeo en DESIGN_SYSTEM.md.
- Conflicto visual con colores reservados de linea de negocio si neutral queda demasiado cercano a logistica.

## Plan de ejecucion

[x] Paso 1 — ui-designer: redefinir neutral y neutral-content en ambos bloques DaisyUI (light y dark) con valores distintos de base-100 y base-content.
    Criterio de exito: en src/styles/global.css neutral y neutral-content de light/dark quedan actualizados y ya no coinciden con los neutrales base actuales.

[x] Paso 2 — ui-designer: sincronizar la documentacion del mapeo semantico en DESIGN_SYSTEM.md con los nuevos valores de neutral.
    Criterio de exito: DESIGN_SYSTEM.md refleja los nuevos valores neutral y mantiene las reglas semanticas del proyecto.

[x] Paso 3 — qa-reviewer: validar contraste y consistencia visual en componentes neutral de modo light y dark y cerrar la tarea.
    Criterio de exito: chequeo visual sin regresiones evidentes, verificacion tecnica en verde y convenciones cumplidas.

## Agentes involucrados
- ui-designer
- qa-reviewer

## Criterio de exito global
El token neutral queda diferenciado de los neutrales base en ambos temas, la UI mantiene contraste utilizable y la documentacion de diseno queda alineada con la implementacion.

## Resultado de revision — 2026-04-13

### Aprobado
- Se confirmo en src/styles/global.css que `neutral` y `neutral-content` quedaron en light `#4a4d4f / #f2f2f3` y en dark `#cacdce / #191a1a`.
- Se verifico que `base-100` y `base-content` se mantienen en light `#efefef / #0c0c0c` y en dark `#191a1a / #efefef` sin alteraciones.
- Se ejecuto validacion tecnica con `npm run astro -- check` y `npm run build`: ambos comandos finalizaron sin errores.
- Se corrigio un riesgo real de consistencia semantica en src/components/ui/Button.astro, reemplazando neutral hardcodeado por tokens DaisyUI (`bg-neutral`, `text-neutral-content`, `border-neutral`).

### Requiere correccion
- Ninguna en el alcance de esta tarea.

### Bloqueantes para completar la tarea
- Ninguno.