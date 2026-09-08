# Cronograma — Mejoras de Rendimiento, UX/UI, Componentización y Copia de Imagen

**Fecha:** 2026-08-24
**Autor:** Ignacio Revainera
**Estado:** Aprobado (pendiente de implementación)

## Contexto

El módulo de Cronograma (`src/components/cronograma/`) agrupa la vista de
horarios, la rotación de guardias de fin de semana y las horas extras. Se
identificaron varias oportunidades de mejora en consistencia visual, en la
captura de imágenes al portapapeles, en la selección de texto durante la
edición, y en posibles problemas de alineación dentro de las cuadrículas
(timelines y tabla de rotación).

El objetivo de este diseño es:

1. Unificar el estilo de los botones de acción del cronograma.
2. Mejorar la captura de imagen al portapapeles (fin de semana y extras):
   agregar margen alrededor de la tabla y reducir el espacio vacío
   (formato compacto).
3. Hacer no seleccionable el texto que no debe resaltarse al editar
   (horas de extras, nombres de operadores, horarios).
4. Corregir problemas de alineación/overflow dentro de las cuadrículas.
5. Auditar y proponer mejoras de rendimiento/UX sin sobre-ingeniería.

## Hallazgos previos (auditoría)

- **Botones de copia inconsistentes:** `copy-rotation-image-btn` usa
  `btn-secondary`; `copy-overtime-image-btn` usa `btn-ghost`. El markup de
  spinner de carga y estado de éxito (`<span class="loading loading-spinner
  loading-xs">…`) está duplicado en dos handlers casi idénticos en
  `dashboard-client.ts` (líneas ~1762 y ~1821).
- **Captura sin margen ni compactado:** los targets de captura son
  `rotation-timeline-wrapper` (fin de semana) y `overtime-timeline-wrapper`
  (extras). Ambos son contenedores `overflow-x-auto` con `p-2`/`gap`
  generosos, lo que produce la imagen "pegada al borde" y con mucho espacio
  vacío que el usuario reporta.
- **Texto seleccionable molesto:** las horas dentro de las barras de extras
  (`font-mono`), los nombres de operadores (tabla de rotación y listas de
  extras) y los horarios de la grilla principal se resaltan al hacer drag/select
  durante la edición.
- **Cuadrícula de rotación:** la celda del nombre de operador es un `<td>` con
  `flex` pero sin ancho fijo de columna, y la tabla no usa `table-layout:fixed`,
  lo que puede desalinear las columnas de horas. El timeline de extras usa
  barras posicionadas en `%` absoluto y su header puede no alinearse con el
  body; además el `overflow-x-auto` con `pb-1` puede capturar el gutter de
  scroll.
- **Desplazamiento al cambiar de tab:** al conmutar entre vistas (mensual,
  diaria, grupos, pasiva) la sección completa se mueve unos píxeles y la lista
  de tabs se reacomoda, cuando sólo debería cambiar el panel de contenido.
- **Fila de resumen de cobertura mal posicionada:** al buscar/filtrar
  operadores (lo que reduce la cantidad de filas de horarios), la fila con el
  resumen de cobertura se pega a la última fila filtrada en lugar de permanecer
  fijada a la parte inferior del cronograma.
- **Iconos no filled:** la sección de cronograma mezcla iconos outlined con
  filled; el estándar del proyecto (`docs/FORM_STANDARD.md`) prioriza la
  variante `-filled` de `astro-icon`/`boxicons` para consistencia visual.

## Diseño

### 1. Componentización de botones

- Extraer un helper `cronoCopyButton` (en `lib/`, TS) que encapsule el ciclo
  completo de un botón de copia: estado de carga (spinner) → éxito
  (check + "¡Copiado!") → restauración del contenido original tras 2.5s.
  Ambos handlers (`handleCopyRotationImage`, `handleCopyOvertimeImage`) lo
  consumen, eliminando la duplicación.
- Unificar la clase base de ambos botones de copia a un mismo variant
  (evaluar `btn-secondary` como base) y agregar `select-none`.
- **Referencia de estilo:** usar como fuente canónica las clases y tokens de
  `@src/components/ui/ActionButton.astro` (y componentes UI similares). Su
  `baseClass` es
  `btn ${sizeClass} btn-soft ${color} gap-1.5 font-bold uppercase tracking-wider text-tiny`.
  Los botones de acción del cronograma (copiar, exportar, importar, etc.)
  deben seguir estos mismos tokens para mantener consistencia con el resto del
  portal; migrar los botones de copia a `ActionButton.astro` cuando aplique.
- Donde el cronograma use botones inline con estilos dispersos, alinearlos a
  los tokens de `ActionButton.astro` en vez de inventar una clase `.crono-btn`.
  No se reescriben modales ya estandarizados (`FormShell`/`ActionConfirm`).

### 2. Copia de imagen (fin de semana + extras) — Enfoque A: clone offscreen

- `exportAsClipboardImage` (en `lib/exporters.ts`) acepta opciones
  `{ padding?: number, compact?: boolean }`.
- Al copiar: clonar el nodo target, montarlo en el body fuera de pantalla
  dentro de un contenedor con la clase `.export-capture` que aplica:
  - `padding` (≈16px) alrededor → respiro / no pegado al borde.
  - overrides de compactado vía CSS: celdas `p-2`→`p-1`, `gap-3`→`gap-1.5`,
    `gap-2`→`gap-1`, line-heights más ajustados, márgenes de sección reducidos.
- html2canvas captura el clone; luego se descarta el nodo. La UI en vivo no se
  altera y el margen es confiable (no depende del `overflow-x-auto` del
  contenedor vivo).
- Se aplica a `rotation-timeline-wrapper` (fin de semana) y
  `overtime-timeline-wrapper` (extras) pasándoles `{ padding: 16, compact: true }`.

### 3. Texto no seleccionable

- Agregar `user-select: none` (`select-none` de Tailwind) a:
  - Horas dentro de las barras de extras (`font-mono` en
    `overtime-timeline-bar`).
  - Nombres de operadores en la tabla de rotación y en las listas de extras.
  - Horarios ("horarios") en la grilla principal de cronograma.
- Esto mejora la experiencia al editar (drag/select sin resaltar texto
  irrelevante). No afecta accesibilidad de controles interactivos.

### 4. Corrección de cuadrículas

- **Tabla de rotación:** aplicar `table-layout: fixed`; fijar ancho de la
  columna de operador; sanear la celda nombre (`flex` dentro de `<td>` con
  ancho controlado) para evitar desalineación de columnas de horas.
- **Timeline de extras:** verificar y fijar alineación header↔body (mismo
  ancho de referencia para posicionamiento `%`); excluir el gutter de scroll
  del `overflow-x-auto` en la captura.
- Auditoría general de alineación/overflow durante la implementación; corregir
  lo que se confirme como bug real.

### 5b. Corrección de desplazamiento al cambiar de tab

- **Síntoma:** al cambiar entre vistas (mensual, diaria, grupos, pasiva, etc.)
  la sección completa de cronograma se desplaza unos píxeles; la lista de tabs
  se mueve o cambia aunque debería ser un componente separado de la vista.
- **Causa probable (auditar al implementar):** el cambio de vista altera la
  altura del contenido o hace aparecer/desaparecer un scrollbar, lo que
  reacomoda el flex-column y empuja la barra de tabs; o bien el estado
  `active` del tab cambia su box-model (borde/peso de fuente) y la barra
  cambia de alto.
- **Fix:** estabilizar la barra de tabs para que no dependa del contenido:
  - Reservar altura/espacio estable en el área de contenido (p.ej.
    `min-height` o contenedor con altura controlada) para que el cambio de
    vista no reacomode la página.
  - Evitar el salto por scrollbar con `scrollbar-gutter: stable` o reservando
    el espacio del scroll en el contenedor de la vista.
  - Asegurar que el tab activo no cambie el tamaño de la barra (box-model
    constante: mismo borde en reposo y activo, o usar `outline`/`ring` en vez
    de borde que sume píxeles).
- No debe moverse la lista de tabs ni el layout general al conmutar vistas;
  sólo el panel de contenido.

### 1b. Iconos `-filled` en toda la sección

- El proyecto estandariza el uso de la variante `filled` de los iconos
  (`astro-icon` con `boxicons:*-filled`, según `docs/FORM_STANDARD.md`).
- Auditar los iconos de la sección de cronograma (tabs, botones de acción,
  modales, timelines, drawer) y migrar los outlined a su variante `-filled`
  correspondiente para mantener coherencia con el resto del portal.
- Aplica tanto a los iconos nuevos (botones unificados) como a los existentes
  que hoy usen la forma outlined.

### 5c. Fila de resumen de cobertura fijada al fondo

- **Síntoma:** al filtrar/buscar operadores, las filas de horarios se reducen y
  la fila de resumen de cobertura queda adyacente a la última fila filtrada en
  vez de estar anclada a la parte inferior del contenedor del cronograma.
- **Fix:** separar la fila de resumen del flujo de las filas de datos.
  - Opción A (recomendada): convertir la fila de resumen en un elemento
    `sticky bottom-0` (o footer fuera del scroll del cuerpo de filas) dentro
    del contenedor con `min-h-full`, de modo que siempre quede al fondo
    visible del cronograma sin importar cuántas filas haya.
  - Opción B: ubicar el resumen como footer del card contenedor, fuera del
    `overflow` de la lista de filas.
- Debe mantenerse visible y al fondo aunque el filtro deje 0 o pocas filas.

### 5. Rendimiento / UX (auditoría y propuesta mínima)

- Revisar listeners de `cronograma:data-changed` / `cronograma:rules-changed`
  que provoquen re-render completo innecesario; proponer actualización
  dirigida del DOM o debounce donde aplique.
- Los `import()` dinámicos ya existen (lazy load de vistas); mantenerlos.
- **YAGNI:** no introducir virtualización ni refactors grandes salvo que la
  auditoría confirme un cuello de botella concreto. El entregable es una
  propuesta documentada de mejoras mínimas.

## Flujo de datos (copia de imagen)

```
click copy-btn
  └─ cronoCopyButton helper (spinner on)
       └─ exportAsClipboardImage(target, { padding, compact })
            ├─ clonar target → .export-capture (offscreen)
            ├─ html2canvas(clone) → dataURL → blob → ClipboardItem
            └─ remover clone
  └─ cronoCopyButton helper (success "¡Copiado!", restore 2.5s)
```

## Manejo de errores

- Mantener el fallback existente: si `navigator.clipboard.write` /
  `ClipboardItem` no está disponible (contexto no seguro/HTTP), descargar PNG
  y avisar con `showToast` warning.
- Restaurar siempre el contenido/original del botón y remover el clone aunque
  falle la captura (`finally`).

## Testing

- Manual: copiar fin de semana y extras → verificar margen y formato compacto.
- Manual: seleccionar/dragguear sobre horas, nombres y horarios → confirmar
  que no se resalta el texto.
- Manual: revisar alineación de columnas en tabla de rotación y timeline de
  extras.
- Manual: cambiar entre todas las tabs (mensual/diaria/grupos/pasiva) y
  confirmar que la barra de tabs y el layout NO se desplazan, sólo el contenido.
- Manual: filtrar/buscar operadores hasta dejar pocas filas y confirmar que la
  fila de resumen de cobertura queda fijada al fondo del cronograma, no pegada
  a la última fila.
- Manual: revisar iconos de la sección y confirmar uso consistente de la
  variante `-filled`.
- Regresión: los botones de copia mantienen feedback de carga/éxito.
- (Opcional) Playwright smoke test si el harness lo permite sin mayor costo.

## Fuera de alcance

- Reescritura de modales ya estandarizados.
- Nuevas funcionalidades del cronograma.
- Cambios de esquema de BD.
