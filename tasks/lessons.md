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

### 2026-05-08 — Corrupcion accidental por sustitucion incorrecta en JSON

**Problema:** Al intentar agregar un enlace al archivo `enlaces_importantes.json`, se introdujeron cadenas incorrectas ("Paquete Argentino") en campos no relacionados, corrompiendo la integridad de otros registros.
**Causa:** El contenido de reemplazo enviado a la herramienta `replace_file_content` contenia datos erroneos (posiblemente por arrastre de contexto o error manual al redactar el bloque).
**Solucion:** Se realizo una lectura inmediata del archivo para identificar el dano y se restauro la estructura original junto con el cambio deseado.
**Regla:** Validar meticulosamente el bloque de `ReplacementContent` antes de ejecutar ediciones, especialmente en archivos de datos (JSON/YAML), para asegurar que no se incluyan sustituciones accidentales fuera del objetivo.
**Archivos afectados:** src/data/enlaces_importantes.json

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
**Archivos afectados:** ---

### 2026-04-29 — Uso de valores arbitrarios de Tailwind degrada la mantenibilidad del diseño

**Problema:** Se detectaron múltiples instancias de tamaños de texto (`text-[10px]`), colores hex (`bg-[#254888]`) y dimensiones (`w-[320px]`) hardcodeadas que rompían la consistencia visual y la compatibilidad con el modo oscuro.
**Causa:** Implementación rápida de componentes sin consultar los tokens predefinidos en `DESIGN.md` o `global.css`.
**Solucion:** Normalización masiva de clases reemplazando valores arbitrarios por tokens semánticos (ej. `text-xs`, `primary`, `secondary`, `w-80`) y variables CSS.
**Regla:** Prohibido el uso de clases arbitrarias `-[...]` para estilos que tengan equivalentes en el sistema de diseño. Priorizar siempre el uso de tokens de DaisyUI y variables definidas en el tema global.
**Archivos afectados:** src/components/UserCard.astro, src/components/cronograma/CronogramaDashboard.astro, src/pages/buscador-usuarios/index.astro, src/pages/directorio-oficinas/index.astro, src/pages/guia-soportes/index.astro, src/layouts/BaseLayout.astro, src/pages/titulos-tickets/_components/Titulos.tsx

---

### 2026-05-11 — Rechazo de push a GitHub por archivos de gran tamaño (>100MB)

**Problema:** El comando `git push` fallaba con error `pre-receive hook declined` debido a archivos ZIP en `public/descargas/aplicativos/` que superaban el límite de 100MB de GitHub.
**Causa:** Inclusión de instaladores de software de gran tamaño (250MB y 150MB) directamente en el repositorio Git sin utilizar almacenamiento de archivos grandes.
**Solución:** Se inicializó Git LFS en el repositorio y se utilizó `git lfs migrate import` para reescribir el historial local de los últimos 5 commits, moviendo los archivos ZIP a seguimiento por LFS. Luego se realizó el push con éxito.
**Regla:** Archivos binarios que superen los 100MB (o carpetas destinadas a descargas pesadas) deben gestionarse con Git LFS desde su inclusión inicial para evitar bloqueos en el push remoto.
**Archivos afectados:** public/descargas/aplicativos/*.zip, .gitattributes
