# Tarea: Implementar vista Contactos Utiles por categorias

Fecha: 2026-04-21

## Descripcion

Implementar desde cero una vista de categorias de contactos con acordeon de
apertura multiple, tabla interna responsive por categoria, celdas interactivas
para copiar telefonos/correos/URLs y feedback visual temporal de exito
(check + estilos success por 2s), respetando el sistema visual de DaisyUI,
la jerarquia solicitada y la operatividad de mesa de ayuda, en una ruta nueva
dedicada dentro de pages.

## Definicion de navegacion propuesta

- Ruta canonica: /contactos-utiles
- Archivo de pagina: src/pages/contactos-utiles/index.astro
- Label visible en sidebar: Contactos utiles
- Icono de sidebar: heroicons:phone
- Ubicacion en sidebar: seccion General, debajo de Guia de soportes y encima de
  Enlaces importantes
- Acceso rapido en dashboard: card Contactos utiles junto al bloque de modulos
  operativos principales

## Riesgos identificados

- Riesgo de integracion de ruta nueva: si no se registra correctamente en
  sidebar y accesos rapidos, puede quedar implementada pero no descubrible para
  el usuario.
- Riesgo de colision entre eventos de fila y eventos de elementos copiables:
  si no se hace stopPropagation correctamente, se pueden disparar acciones no
  deseadas al copiar.
- Riesgo de regresion responsive en mobile por tabla ancha; sin contenedor con
  overflow-x interno el layout puede romperse.
- Riesgo de inconsistencia visual por no mapear bien tonos/iconos por categoria
  (icono, fondo y badge deben mantener coherencia tematica).
- Riesgo de accesibilidad en el acordeon y tooltips (teclado, foco visible,
  labels de iconos y estado de feedback).

## Plan de ejecucion

[x] Paso 1 — ui-designer: definir contrato funcional final de la vista y fijar
su ruta canonica como nueva pagina dedicada
(src/pages/contactos-utiles/index.astro), sin reutilizar
src/pages/directorio-oficinas/index.astro, y definir el impacto de
navegacion global.
Criterio de exito: la ruta nueva queda definida de forma explicita y
consistente con sitemap/navegacion, sin conflictos con Directorio de
oficinas, y con posicion/label/icono alineados a la definicion de
navegacion propuesta.

[x] Paso 2 — ui-designer: modelar la estructura de datos de contactos por
categoria (proveedor, servicio, telefonos[], correos[], urls[]), creando
tipado en src/types y fuente de datos local en src/data para soportar
multiples valores por celda y estado vacio de URLs.
Criterio de exito: el modelo admite todas las variantes de la especificacion
sin hardcode ad-hoc en el template.

[x] Paso 3 — ui-designer: construir componente(s) de UI reutilizable(s) para la
vista (acordeon de categorias + tabla de contactos) siguiendo DaisyUI-first,
usando estructura de tarjeta con borde/sombra suave, trigger con icono
tematico, titulo, badge de cantidad y panel con divisor superior.
Criterio de exito: el acordeon permite apertura multiple simultanea y cada
categoria renderiza cabecera y panel segun la anatomia pedida.

[x] Paso 4 — ui-designer: implementar la tabla interna por categoria con
encabezado tecnico (uppercase + tracking), anchos 30/25/25/20,
alineacion derecha en acciones y contenedor overflow-x-auto para mobile.
Criterio de exito: la tabla conserva legibilidad y estructura en desktop y
mobile sin desbordar el layout global.

[x] Paso 5 — ui-designer: implementar celdas interactivas de telefonos/correos
con items apilables, icono identificador en bloque redondeado, tipografia
monoespaciada, hover con relleno del bloque y aparicion suave del icono de
copiado por item.
Criterio de exito: cada dato individual es clickeable y muestra
microinteraccion visual consistente sin afectar otros elementos de la fila.

[x] Paso 6 — ui-designer: implementar columna de acciones (copiar URL + abrir
enlace externo), incluyendo estado vacio en cursiva cuando no hay URL, y
tooltip nativo DaisyUI para previsualizar la URL exacta en fuente mono.
Criterio de exito: la accion de copia y la de apertura externa conviven sin
conflicto, y el tooltip muestra la URL correcta con buen contraste.

[x] Paso 7 — ui-designer: implementar logica de portapapeles y feedback local
temporal (check con animacion pop/zoom, clases success y reset automatico
a 2000ms) para telefonos, correos y boton de copiar URL, priorizando
Clipboard API y fallback legacy encapsulado.
Criterio de exito: todos los puntos de copiado muestran feedback inmediato,
recuperan estado base en 2s y no generan warnings de tipado.

[x] Paso 8 — qa-reviewer: ejecutar revision integral de fidelidad visual,
accesibilidad basica, interacciones de copiado, comportamiento responsive y
validacion tecnica (astro check/build), documentando hallazgos en
tasks/lessons.md si aparecen correcciones reales.
Criterio de exito: QA aprueba la tarea sin regresiones bloqueantes y deja
la vista lista para cierre, incluyendo validacion de la nueva ruta en la
navegacion del portal.

## Agentes involucrados

- ui-designer
- qa-reviewer

## Criterio de exito global

La vista Contactos Utiles queda operativa con acordeon multiabierto,
cabeceras tematicas por categoria, tabla responsive de 4 columnas,
copiado rapido en telefonos/correos/URLs con feedback visual de exito,
tooltip de previsualizacion de URL y consistencia completa con el sistema
de diseno del proyecto.

## Resultado de revision — 2026-04-21

### Aprobado

- Fidelidad funcional validada en [src/pages/contactos-utiles/index.astro](src/pages/contactos-utiles/index.astro): acordeon multiabierto, tabla 30/25/25/20, hover en filas y celdas interactivas, estado vacio de URL y feedback de copiado a 2000ms.
- Navegacion integrada correctamente en sidebar y dashboard hacia /contactos-utiles en [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro) y [src/pages/index.astro](src/pages/index.astro).
- Accesibilidad basica cubierta: labels en acciones icon-only, foco visible en controles de copiado y semantica de headings coherente en la pagina.
- Validacion tecnica superada: `npm run build` y `npx astro check` completan sin errores.
- Se corrigio durante QA un gap menor de fidelidad: renderizado de multiples URLs por contacto en columna Acciones de [src/pages/contactos-utiles/index.astro](src/pages/contactos-utiles/index.astro).

### Requiere correccion

- Sin observaciones bloqueantes en el alcance de Contactos Utiles.

### Bloqueantes para completar la tarea

- Ninguno.
