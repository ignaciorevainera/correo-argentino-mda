# Lessons

Este archivo registra errores encontrados durante el desarrollo
y sus soluciones. El agente qa-reviewer lo actualiza despues de
cada tarea donde hubo correcciones reales del usuario.
Se lee al inicio de cada sesion para no repetir los mismos errores.

> Si la tarea fue limpia sin errores, no se agrega nada.
> No inventar entradas vacias — solo registrar lo que realmente ocurrio.

## Registro de errores y soluciones

Cada entrada sigue este formato:

---

### [fecha] — [descripcion breve del patron o error]

**Problema:** [que salio mal o que se aprendio]
**Causa:** [por que ocurrio]
**Solucion:** [como se resolvio]
**Regla:** [la regla general que se extrae para no repetirlo]
**Archivos afectados:** [lista de archivos si aplica]

---

[El agente completa esta seccion a medida que avanza el proyecto]

### 2026-04-13 — Neutral hardcodeado fuera de tokens semanticos

**Problema:** La variante `neutral` en `Button.astro` seguia usando `#F2F2F2` y `text-black`, quedando desalineada con los tokens `neutral`/`neutral-content` definidos en DaisyUI para light/dark.
**Causa:** Implementacion previa del componente con clases hardcodeadas en vez de tokens semanticos.
**Solucion:** Reemplazo minimo de la variante `neutral` para usar `bg-neutral`, `text-neutral-content` y `border-neutral`, incluyendo variantes `outline`, `ghost` y `link` en sintonia semantica.
**Regla:** No hardcodear colores en variantes semanticas; siempre consumir tokens DaisyUI para preservar consistencia entre temas.
**Archivos afectados:** src/components/ui/Button.astro

### 2026-04-17 — Contexto de ruta en Header debe ocultarse completo en mobile

**Problema:** El Header mostraba el icono del contexto de ruta en mobile, incumpliendo el contrato que exige ocultar la zona contextual para priorizar quick actions.
**Causa:** Se oculto solo el texto del contexto (`md:inline`) pero no el bloque completo de contexto.
**Solucion:** Se aplico `hidden md:flex` al contenedor de contexto en el Header para ocultar icono+texto en mobile.
**Regla:** Cuando el contrato pida ocultamiento responsive de una zona, ocultar el bloque semantico completo y no solo parte de su contenido.
**Archivos afectados:** src/layouts/BaseLayout.astro

### 2026-04-18 — Iconos SVG no deben validarse como HTMLElement en microinteracciones

**Problema:** La microinteraccion de copiado no cambiaba de icono (`copy -> check`) aunque el tooltip y el copiado funcionaban.
**Causa:** Los iconos renderizados por `astro-icon` generan nodos SVG, pero la logica los validaba con `instanceof HTMLElement`, bloqueando el toggle de clases.
**Solucion:** Cambiar las validaciones de tipo a `Element` (o `SVGElement`) antes de alternar clases de iconos.
**Regla:** En scripts que manipulan iconos SVG, no asumir `HTMLElement`; validar contra tipos compatibles con SVG para evitar fallos silenciosos de UI.
**Archivos afectados:** src/components/ui/CopyCell.astro

### 2026-04-19 — Evitar warning deprecado por execCommand tipado en scripts Astro

**Problema:** El chequeo de Astro reportaba warning por uso directo de `document.execCommand("copy")` en la pantalla de Enlaces.
**Causa:** TypeScript marca `Document.execCommand` como API deprecada cuando se invoca con el tipo nativo de `document`.
**Solucion:** Mantener fallback legacy de copiado, pero acceder a `execCommand` mediante un wrapper tipado local opcional para evitar el warning sin perder compatibilidad.
**Regla:** Si se necesita fallback legacy, encapsular APIs deprecadas en wrappers tipados locales y priorizar Clipboard API.
**Archivos afectados:** src/pages/enlaces/index.astro

### 2026-04-21 — No truncar colecciones de recursos en UI cuando el modelo es array

**Problema:** La columna de acciones en Contactos Utiles tomaba solo `contact.urls[0]`, dejando URLs adicionales invisibles aun cuando el modelo tipado y los datos incluian multiples entradas.
**Causa:** Implementacion inicial orientada a accion singular de URL en vez de iterar sobre `urls[]`.
**Solucion:** Cambiar el render para mapear todas las URLs de cada contacto y mantener por item las acciones de copiar y abrir, conservando estado vacio cuando `urls[]` esta vacio.
**Regla:** Si el contrato de datos define colecciones (`[]`), la UI debe representarlas completas salvo que exista una regla explicita de truncamiento.
**Archivos afectados:** src/pages/contactos-utiles/index.astro
