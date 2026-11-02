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

### 2026-10-22 — `activeAgentCondition()` necesita el LEFT JOIN a `users`; sin el join la consulta falla en silencio

**Problema:** Al quitar un `leftJoin(users, eq(users.id, agents.userId))` que parecía no usarse en `getSampleAgent()` (la selección no devolvía columnas de `users`), el simulador de vista dejó de mostrar "Mi semana": el agente de ejemplo quedaba en `null` y el home caía al perfil base.
**Causa:** `activeAgentCondition()` (`src/lib/activeUsers.ts:14`) genera `(users.active IS NULL OR users.active = 1)`. Sin el join, SQLite no resuelve `users.active`, la consulta lanza y el `safeLoad` del home la captura devolviendo `null`: el síntoma es "no hay tarjeta", sin error visible en la UI.
**Solución:** mantener el join mientras se use `activeAgentCondition()` (quedó comentado en el código). Lo detectaron los E2E del simulador, no el build ni los tests de dominio.
**Regla:** antes de borrar un join que "no selecciona columnas", buscar si alguna condición lo referencia (`activeAgentCondition`, `activeUserCondition`). Un helper con `try/catch` vuelve invisible la falla: el test tiene que mirar el resultado, no el error.
**Archivos afectados:** src/lib/inicio/sessionAgent.ts, src/lib/activeUsers.ts

---

### 2026-10-20 — Un `<p>` dentro de un flex column se apropia del espacio libre y deja el grid sin crecer

**Problema:** En la card "Mi semana" del home, el grid de días no ocupaba el alto de la card: las celdas quedaban con su altura natural (≈112 px) y sobraba un bloque de aire de ~110 px, mientras la etiqueta de la semana (`<p>`) medía 129 px de alto con una sola línea de texto.
**Causa:** El `<p>` de la etiqueta, hijo directo de un contenedor `flex flex-col`, quedó con `flex-grow: 1` (computado `flex: 1 1 auto`) sin que ninguna regla del CSS del repo lo justificara. Competía con el `flex-1` del grid por el espacio libre y el reparto (≈112 px / ≈112 px) dejaba el grid clavado en su mínimo.
**Solución:** Fijar `flex-none` en los hijos estáticos (etiquetas, `<p>`) de un contenedor flex column, y dejar `flex-1` sólo para el bloque que debe crecer (el grid de días). Con eso el grid toma todo el alto disponible.
**Regla:** En contenedores `flex flex-col`, todo hijo que NO deba crecer lleva `flex-none`/`shrink-0` explícito: el crecimiento por defecto no es determinista y se-come el espacio del hermano con `flex-1`.
**Archivos afectados:** src/components/inicio/WeekCard.astro

---

### 2026-10-20 — `astro dev` no arranca por un literal `<!--` dentro de un `<script>` (aunque el build pase)

**Problema:** `npx astro dev` moría en el scan inicial de dependencias con `[PARSE_ERROR] Expected ) but found Unknown` señalando `virtual-module:...CalibracionContent.astro`, mientras que `npm run build` compilaba sin errores.
**Causa:** El script del componente contenía los literales `"<!-- calibrado:"` y `/<!--\s*calibrado:[^->]*-->/`. El parser de Rolldown (scan de dev) interpreta la secuencia `<!--` como apertura de comentario HTML y corta el string/regex, generando un módulo inválido. El build no usa ese scan, por eso pasaba.
**Solución:** Se escapó la secuencia sin cambiar la semántica: `"<\!-- calibrado:"` y `/<\!--\s*calibrado:[^->]*-->/` (en strings y regex, `\!` es `!`). Con eso el dev server arranca.
**Regla:** No escribir `<!--` literal dentro de bloques `<script>` de `.astro` (ni en strings, ni en regex, ni en templates): construirlo por partes o escaparlo. Si `astro dev` falla en el scan pero `astro build` pasa, buscar `<!--` en scripts.
**Archivos afectados:** src/components/admin/calidad/CalibracionContent.astro

---

### 2026-10-20 — PowerShell 5.1 se come `--` y `npm run dev -- --port` no reenvía los flags

**Problema:** `npm run dev -- --port 4329 --ignore-lock` desde PowerShell arrancó `astro dev 4329` (interpretó 4329 como subcomando) y npm avisó `Unknown cli config "--port"`.
**Causa:** PowerShell 5.1 descarta el separador `--` al invocar comandos nativos; npm recibe `--port` como configuración propia, no como argumento del script.
**Solución:** Invocar Astro directo para levantar el server a mano: `$env:ASTRO_DEV_BACKGROUND="0"; npx astro dev --port <PORT> --ignore-lock`. Desde Playwright (`cmd`) el `--` sí sobrevive, así que `playwright.config.ts` queda igual.
**Regla:** En PowerShell, para pasar flags a un script de npm usar `npx <bin>` directo o `cmd /c "npm run ... -- ..."`; no confiar en `npm run x -- --flag`.
**Archivos afectados:** ninguno (comando de desarrollo)

---

### 2026-10-19 — Etiquetas de cierre huérfanas al envolver tablas en TableShell descartan scripts cliente

**Problema:** En `/supervision/asistencia`, la tabla de operadores permanecía indefinidamente en el estado de loading ("Cargando registros..."), sin arrojar errores en consola del navegador ni en el dev server.
**Causa:** Al migrar el contenedor `<div class="min-h-75 overflow-x-auto">` a `<TableShell>` y cerrar con `</TableShell>`, no se eliminó el `</div>` original que cerraba el div anterior. Esto provocó que el siguiente `</div>` cerrara el root container del componente de manera prematura. El compilador de Astro descartó silenciosamente todo el markup posterior (incluyendo el bloque `<script>` de lógica cliente), impidiendo que la tabla se hidrate.
**Solución:** Se removió la etiqueta `</div>` huérfana redundante y se adoptó `getResolvedSearchParams` para la lectura de query params en componentes diferidos (`server:defer`).
**Regla:** Al reemplazar wrappers HTML nativos por componentes contenedores de Astro (como `TableShell`), verificar estrictamente el balanceo de etiquetas de apertura y cierre. El cierre prematuro de un componente provoca que Astro descarte los bloques `<script>` e hijos posteriores sin emitir advertencias de compilación ni errores de runtime.
**Archivos afectados:** src/components/supervision/asistencia/AsistenciaContent.astro

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

---

### 2026-05-19 — Enlaces rotos (404) al desplegar bajo subdirectorio base /mda/

**Problema:** Al acceder a secciones desde tarjetas de acceso rápido u otras partes de la interfaz, algunos hipervínculos arrojaban error 404.
**Causa:** Los hipervínculos de los componentes de interfaz reutilizables (ej: QuickAccessCard, AnnouncementBanner, CatalogAppCard, CatalogBundleBanner) no incluían de forma dinámica el prefijo de la ruta base del proyecto (`BASE_URL`), lo que rompía la navegación cuando el portal se desplegaba en un subdirectorio (ej. `/mda/`).
**Solución:** Se implementó lógica de resolución de URLs en los componentes UI para que resuelvan dinámicamente el prefijo de ruta basándose en `import.meta.env.BASE_URL`, controlando enlaces externos, esquemas de correo/teléfono y URLs que ya contaban con el prefijo.
**Regla:** Todo componente de UI que renderice enlaces internos debe resolver la URL dinámicamente con `import.meta.env.BASE_URL` para evitar rutas absolutas duras que rompan bajo subdirectorios de despliegue.
**Archivos afectados:** src/components/ui/QuickAccessCard.astro, src/components/ui/AnnouncementBanner.astro, src/pages/catalogo-aplicativos/_components/CatalogAppCard.astro, src/pages/catalogo-aplicativos/_components/CatalogBundleBanner.astro

---

### 2026-06-01 — Estilos scoped de Astro no aplican a componentes hijos ni HTML dinámico

**Problema:** Las clases CSS de chips de color (`office-type-chip-*`) y animaciones de panel de detalle definidas en la página `directorio-oficinas/index.astro` no se aplicaban visualmente, dejando los chips NIS/code sin color representativo por tipo de oficina.
**Causa:** Los estilos estaban dentro de un bloque `<style>` scoped (por defecto en Astro). Los estilos scoped solo aplican a elementos renderizados directamente en la página, no a elementos dentro de componentes hijos (`OfficeRow.astro`) ni a HTML inyectado dinámicamente vía fetch desde la API (`/api/offices`).
**Solución:** Cambiar `<style>` a `<style is:global>` para que las reglas CSS alcancen los elementos renderizados en componentes hijos y en fragmentos HTML insertados por el scroll infinito.
**Regla:** Si una página define estilos que deben aplicar a componentes Astro hijos o a HTML inyectado dinámicamente, usar `<style is:global>`. Los estilos scoped de Astro nunca cruzan la barrera de componente.
**Archivos afectados:** src/pages/directorio-oficinas/index.astro

---

### 2026-06-08 — Pérdida de contexto de ruta en componentes diferidos (server:defer) y falta de prefijo de títulos

**Problema:** Los encabezados de página (`PageHeader`) renderizados dentro de islas diferidas (`server:defer`) mostraban el título genérico "Portal" en lugar del título real del módulo, y los títulos de pestaña del navegador carecían de una estructura prefijada consistente.
**Causa:** Astro realiza peticiones secundarias independientes para renderizar islas diferidas (`server:defer`), lo que altera la propiedad `Astro.url.pathname` del servidor (ej. `/_server-islands/EnlacesContent`), impidiendo que `getSectionTitle` resuelva la sección correspondiente.
**Solución:** Se implementó la utilidad `getResolvedPathname` en `src/lib/navigation.ts` para extraer la URL original a partir de la cabecera `Referer` en las peticiones de server islands, resolviendo correctamente el título en `PageHeader.astro`. Asimismo, se modificó `BaseLayout.astro` para aplicar el prefijo `"Portal MDA | "` de manera centralizada.
**Regla:** En cualquier componente o layout que resuelva información con base en la ruta actual y sea susceptible de ser diferido, se debe resolver la ruta de origen mediante la cabecera `Referer` para conservar la consistencia de UI.
**Archivos afectados:** src/lib/navigation.ts, src/layouts/BaseLayout.astro, src/components/ui/PageHeader.astro

---

### 2026-06-09 — Pérdida de parámetros de búsqueda (searchParams) en componentes diferidos (server:defer)

**Problema:** Los filtros de búsqueda y clasificación en el directorio de oficinas no funcionaban al recargar la página, restableciendo todos los controles a sus valores por defecto.
**Causa:** Astro realiza peticiones independientes al endpoint de islas del servidor (`/_server-islands/...`) para renderizar componentes con la directiva `server:defer`, perdiendo los query parameters originales de la URL de la página.
**Solución:** Se creó e implementó la utilidad `getResolvedSearchParams` en `src/lib/navigation.ts` para extraer los parámetros de búsqueda de la cabecera `Referer` en las solicitudes a islas diferidas, y se la utilizó en `DirectorioContent.astro`.
**Regla:** Todo componente diferido (`server:defer`) que dependa de parámetros de búsqueda (`searchParams`) para filtrar o condicionar su renderizado en servidor debe recuperarlos utilizando la cabecera `Referer` con `getResolvedSearchParams` en lugar de leer directamente `Astro.url.searchParams`.
**Archivos afectados:** src/lib/navigation.ts, src/components/offices/DirectorioContent.astro

---

### 2026-06-17 — Importaciones e import.meta en la parte superior de frontmatters en Layouts de Astro

**Problema:** El empaquetador del servidor (esbuild/vite) de Astro arrojó un error de sintaxis ("Expected identifier but found '/'") al compilar la aplicación tras añadir una importación a mitad del código TypeScript del frontmatter de un layout.
**Causa:** Poner declaraciones de importación (`import`) intercaladas debajo de ejecuciones de lógica o asignaciones de variables locales en el frontmatter de Astro puede confundir al analizador sintáctico del compilador de Astro al transformar archivos `.astro`.
**Solución:** Mover todas las declaraciones `import` estrictamente al bloque superior del frontmatter de la página o layout, y preferir siempre el uso de alias absolutos (`@lib/*`) sobre rutas relativas complejas que salgan del directorio de código fuente para evitar fallos de resolución de módulos.
**Regla:** Mantener de forma rigurosa todas las declaraciones `import` agrupadas en las primeras líneas de los bloques de frontmatter (`---`) en archivos `.astro`.
**Archivos afectados:** src/layouts/BaseLayout.astro

---

### 2026-08-09 — `users.groups` de InvGate devuelve dict (objeto keyed por ID), no array

**Problema:** El endpoint `GET /api/usuarios/invgate-user` devolvía `org.groups: []`, `org.locations: []` y `org.helpdesks: []` vacíos aunque el usuario real tenía grupos/locations asignados en InvGate.
**Causa:** `users.groups` responde un ARRAY de entradas, pero dentro de cada entrada `groups`, `helpdesks` y `locations` llegan como OBJETO/dict keyed por ID (`{ "2604": { id: 2604, name: "TITEC_Telecomunicaciones" } }`), no como array. `toRefs` usa `Array.isArray()` y descarta dicts devolviendo `[]`.
**Solucion:** Verificado en vivo con `users.groups?ids[]=5566` y `users.by?email=...&exact_match=true` (users 5566, 767, 57, 600). `companies` y `*_observed` sí llegan como array (`[]`). **Aplicado:** `toRefs` en `src/pages/api/usuarios/invgate-user.ts` normaliza defensivamente tanto dict (via `Object.values()`) como array antes de mapear a refs `{ id, name }`.
**Regla:** No asumir que las colecciones de refs de InvGate (`groups`, `helpdesks`, `locations`) llegan como array: verificar el shape real y normalizar defensivamente dict y array. `toRefs` ya cubre ambos casos (ver endpoint `invgate-user`). Los endpoints `users.by` documentados como "array" pueden venir como dict keyed por id.
**Archivos afectados:** src/pages/api/usuarios/invgate-user.ts, .agents/skills/invgate-api-requests/endpoints-reference.md

### 2026-08-09 — `users.by?username=` de InvGate requiere email completo (no username bare)

**Problema:** Al buscar con `users.by?username=sdegese&exact_match=true` (username sin dominio) la API responde 200 pero con `data: []`, sin match.
**Causa:** InvGate guarda `username` como email completo (`sdegese@correoargentino.com.ar`), por lo que `username=` solo matchea si se pasa el email completo. Con `email=` o `username=` (email completo) sí matchea.
**Solucion:** Pasar siempre el email completo en la búsqueda por `users.by` (tanto `email=` como `username=`), y hacer doble búsqueda email+username como fallback.
**Regla:** Para `users.by`, buscar con el email completo (`usuario@dominio`); no intentar username bare salvo que se conozca el formato real de `username` en la instancia.
**Archivos afectados:** src/pages/api/usuarios/invgate-user.ts, .agents/skills/invgate-api-requests/endpoints-reference.md

---

### 2026-06-24 — Ausencia de colores en mapa de regiones por valores null en BD

**Problema:** El mapa de regiones y la leyenda lateral en la vista de oficinas se mostraban sin colores asignados (gris por defecto).
**Causa:** La tabla `regions` de la base de datos SQLite no tenía asignado ningún valor en la columna `color` (todos estaban en `null`).
**Solución:** Se implementó y ejecutó un script de actualización que asignó colores hex curados y representativos a las 5 regiones (`CABA`, `SUR`, `PBA-LP`, `NEA`, `NOA`). Adicionalmente, se mejoró `DirectorioContent.astro` agregando un ancho adaptativo al contenedor de controles del mapa, agregando interactividad click-to-zoom en la leyenda del mapa, y validando `map.hasLayer` antes de invocar `bringToFront()`.
**Regla:** Asegurar que los datos estructurados en bases de datos locales que determinan elementos de interfaz (como colores de mapas o leyendas) estén correctamente poblados con tokens consistentes del sistema de diseño.
**Archivos afectados:** database/mda.db, src/components/offices/DirectorioContent.astro

---

### 2026-08-23 ?" Iconos astro-icon desaparecen al clonar/eliminar filas dinamicas

**Problema:** En formularios con filas dinamicas (ej. equipos en OfficeForm), el icono trash desaparecia de todas las filas al eliminar una fila, y los clones del `<template>` salian sin icono.
**Causa:** `astro-icon` en modo default renderiza la PRIMERA aparicion de un icono como `<symbol id="ai:coleccion:nombre">` + `<use href>`, y las siguientes solo como `<use>`. Si el nodo que contiene el `<symbol>` (la primera fila SSR) se elimina del DOM, todos los `<use>` restantes quedan huerfanos y el SVG se ve vacio.
**Solucion:** Agregar `is:inline` a los Icon que viven dentro de filas clonadas/removibles, para que cada instancia embeba el path completo sin depender del symbol compartido.
**Regla:** Todo Icon dentro de un `<template>` clonado por JS o dentro de filas removibles debe usar `is:inline`. Los mesas-de-ayuda/edit.astro ya usaban esta solucion de facto (SVG crudo pegado a mano).
**Archivos afectados:** src/components/admin/OfficeForm.astro

---

### 2026-09-05 — IDs internos de InvGate difieren por instancia (QA ≠ producción) y endpoints paginados

**Problema:** El módulo /automatizaciones (migrado de invgate-automation) traía la constante AUTOMATION_CATEGORY_ID=86 validada en QA; en producción 86 es "Impresoras (GEN) - Configuración" y la hoja real es 3023 ("Automatización de sucursal" bajo TI Tecnologia informatica » Gestión de Servicios » Mesa de Coordinación » Proyectos). Además /categories y /incidents.by.status son paginados (máx 500/page) y el volumen real (2.859 categorías, 78k tickets) rompía la asunción de una sola página y del scan completo por render.
**Causa:** Los IDs internos de InvGate no son estables entre instancias, y los shapes/paginaciones se validaron solo con el volumen chico de QA.
**Solucion:** Resolución dinámica por nombres/rutas (categoría hoja por ruta verbatim de categorías; cola de tickets por helpdesk "Mesa de Coordinación" + nivel en helpdesksandlevels con desambiguación empírica contra la categoría, override INVGATE_AUTOMATION_GROUP_ID/INVGATE_AUTOMATION_CATEGORY_ID). Discovery via /incidents.by.helpdesk del nivel (~30 tickets en producción) + filtro de categoría local + dif de padres desaparecidos (re-chequeo bulk para "Recientes"). Soporte del formato de títulos de producción "Automatización de sucursal B0091" y del formulario inicial en la description del padre (QA lo trae en el primer comentario).
**Regla:** Nunca hardcodear IDs internos de InvGate entre instancias: resolverlos por nombre/ruta verbatim o por vista configurada. Verificar paginación contra el volumen real de producción antes de asumir una sola página. Los títulos de tickets son datos: extender el parser ante formatos nuevos sin romper los anteriores.
**Archivos afectados:** src/lib/workflow/category-resolver.ts, src/lib/workflow/discovery.ts, src/lib/workflow/resolver.ts, src/lib/workflow/branch-title.ts, src/lib/invgate/automation/*, .agents/skills/invgate-api-requests/endpoints-reference.md

---

### 2026-09-05 — View transitions: tema oscuro roto tras swap y morph ausente en contenido de server islands

**Problema:** Con ClientRouter scoped a /automatizaciones: (1) al navegar al detalle el tema pasaba a oscuro (con SO en dark) y el toggle dejaba de funcionar; (2) la view transition solo se veía en el retorno al listado, no en la ida.
**Causa:** (1) El swap de Astro no re-ejecuta scripts inline idénticos y el html nuevo llega sin data-theme — sin el atributo ganaba el `--prefersdark` de daisyUI (preferencia del SO) y el toggle moría: theme-change (scripts/toggle-mode.ts) bindea listeners por-elemento y los module scripts se ejecutan una sola vez por sesión. Además nada escribía localStorage("theme"): la persistencia documentada nunca funcionó. (2) El CSS `view-transition-name` que Astro emite en el head de la página no viaja con el contenido inyectado de una server island: los items tenían el atributo de scope pero 0 reglas de nombre → sin par de morph en la ida.
**Solucion:** (1) applyTheme() + listener astro:after-swap en BaseLayout, y delegación en document que aplica y persiste el tema (data-theme + localStorage) al togglear — reemplaza el rol runtime de theme-change; toggle-mode.ts re-consulta el input vivo para aria-label/checked (observer en documentElement + after-swap). (2) view-transition-name como inline style en items del listado, header del detalle y skeleton del detalle (el inline style viaja siempre con el HTML).
**Regla:** Con ClientRouter: (a) todo estado seteado por script inline en head debe re-aplicarse en astro:after-swap; (b) los module scripts corren una vez por sesión — re-vincular listeners via lifecycle events o usar delegación en document; (c) directivas transition:* dentro de server islands requieren CSS inline (el CSS hoisted al head no alcanza el contenido inyectado).
**Archivos afectados:** src/layouts/BaseLayout.astro, scripts/toggle-mode.ts, src/pages/automatizaciones/_components/AutomationActiveList.astro, src/pages/automatizaciones/_components/AutomatizacionDetalleContent.astro, src/pages/automatizaciones/_components/AutomatizacionDetalleSkeleton.astro

---

### 2026-09-06 — Animación de `<details>` muerta por `display: flex` de DaisyUI `.card`

**Problema:** En /automatizaciones, las cards `<details>` no animaban el expandir/colapsar pese a tener el CSS nativo correcto (`::details-content` con transición de `block-size` + `interpolate-size: allow-keywords`): la altura saltaba de 54px a 171px en un solo frame.
**Causa:** DaisyUI `.card` aplica `display: flex; flex-direction: column` al `<details>`. En Chromium, un `<details>` con `display: flex` deja de interpolar la transición de `::details-content` (el pseudo-elemento pasa de `block-size: 0 / content-visibility: hidden` a `auto / visible` sin transición). Verificado en aislamiento: con `display: block` hay 18 alturas interpoladas; con `flex`, solo 2 (snap).
**Solucion:** Forzar `display: block` scopeado a las cards del listado (`details.group { display: block }` en AutomationActiveList.astro). El layout apilado summary + contenido es idéntico con block. Diagnosticado comparando computed styles de `::details-content` en la app vs variantes de aislamiento (Playwright + muestreo de altura por rAF).
**Regla:** Al animar `<details>` con `::details-content`, forzar `display: block` sobre el elemento si alguna clase (DaisyUI card u otra) le aplica flex/grid. Para diagnosticar animaciones CSS muertas: comparar computed styles del pseudo-elemento dentro de la app contra un HTML de aislamiento con las mismas reglas.
**Archivos afectados:** src/pages/automatizaciones/_components/AutomationActiveList.astro

---

### 2026-09-06 — View transitions sin morph por server islands + datos de solución y ubicación no disponibles en producción

**Problema:** En /automatizaciones/[id] el morph de view transition no arrastraba el contenido real al entrar desde el listado: el capture de la nueva página ocurría con el skeleton (el island `server:defer` resuelve DESPUÉS del capture) y luego el contenido aparecía de golpe. En producción además: (1) el bulk `/incidents?comments=1` OMITE `is_solution` (undefined; validado en vivo, hijos 77765/77775), (2) los formularios de producción NO traen la jerarquía de ubicaciones en el campo Sucursal ni el título (sin "Metro » BA » Merlo »..."), así que región/localidad quedaban null aunque el parser las soporta.
**Causa:** El ClientRouter espera el fetch del documento y captura inmediatamente; los islands se resuelven post-capture. Los shapes de producción difieren de los validados en QA (is_solution solo llega por el endpoint dedicado; la jerarquía vive en el árbol de ubicaciones de InvGate, no en el ticket).
**Solucion:** (1) Página de detalle SIN server:defer: `[id].astro` renderiza todo sincrónico con `await resolveAutomationDetail(id)` → el contenido existe al capture y el morph funciona. Mitigación de latencia: `prefetch: { prefetchAll: false, defaultStrategy: "hover" }` + `data-astro-prefetch="hover"` en "Ver detalle"/"Volver" (navegación medida: 170ms con prefetch caliente). Morph por elementos con nombres únicos por id: `automation-pretty|title|status|started|progress-${id}` (quitar el name del `li` completo, que morpheaba contra el skeleton). (2) Comentario de solución: `GET /incident.comment?request_id=` (ese endpoint SÍ trae is_solution); resolver lo consulta solo para nodos completados. (3) Región/localidad: fallback en cascada jerarquía del formulario → DB de oficinas por branchCode (`getBranchLocation`, offices.locality/county/regionId).
**Ampliación (iteración 2):** `transition:persist` NO es aplicable a server islands: el contenido inyectado no deja wrapper en el DOM (el HTML se inserta plano, sin elemento estable que persistir), así que el morph de vuelta seguía en fade. Solución final: listado TAMBIÉN sincrónico (sin server:defer) → contenido real al capture en ambas direcciones. Para hidratar UI cliente (barra de progreso) tras navegaciones del ClientRouter, usar `document.addEventListener("astro:after-swap", ...)` — el MutationObserver no dispara de forma confiable tras el swap. Progreso instantáneo en revisitas: cache en sessionStorage con TTL (el hydrate consulta cache antes de fetchear; se dispara desde astro:after-swap, que corre dentro del callback de la transición → puede formar par de morph).
**Regla:** Para morphs de view transition con datos dinámicos, el elemento ancla debe existir en el capture: o la página es SSR sincrónica, o el shell renderiza el header sin defer y el body queda diferido. No confiar en shapes de QA para producción: verificar en vivo cada campo (is_solution del bulk, jerarquía en formulario). Para datos derivados de ubicación de sucursal, la DB local de oficinas (código BXXXX) es fuente confiable.
**Archivos afectados:** src/pages/automatizaciones/[id].astro, src/pages/automatizaciones/_components/AutomatizacionDetalleContent.astro, src/pages/automatizaciones/_components/AutomationActiveList.astro, src/pages/automatizaciones/_components/AutomationTimeline.astro, src/pages/automatizaciones/_components/InitialFormDetails.astro, src/components/ui/PageHeader.astro, src/lib/workflow/resolver.ts, src/lib/workflow/branch-location.ts, src/lib/invgate/automation/incidents.ts, src/lib/invgate/automation/types.ts, astro.config.mjs

---

### 2026-09-07 � Matcher de etapas: titulos feos a mano matchean por segmento posterior al " - "

**Problema:** En /automatizaciones/[id] las etapas mostraban FALTANTE falso: tickets creados a mano titulados "AUTOMATICACION DE SUCURSAL B0168<L>\tLIBERTAD - SOLICITUD DE EQUIPAMIENTO" (columna fea de la Mesa) caian en "Sin etapa" porque el stepLabel (texto ANTES del primer " - ") era el segmento feo, no la gestion.

**Causa:** El match solo evaluaba el stepLabel; la gestion real vive en el ULTIMO segmento del titulo ("... - SOLICITUD DE EQUIPAMIENTO"). Ademas, el matching inverso por tokens (nodo subconjunto de la plantilla) matchea titulos genericos de UNA palabra: "Direccion IP - Solicitud - Automatizacion..." matcheaba "Solicitud de equipamiento" con un solo token.

**Solucion:** matchScore evalua TODOS los segmentos del titulo (split " - ") y se queda con el mejor score. El lado inverso (nodo corto, ej "Solicitud Smart Point") exige cobertura total del nodo Y al menos 2 tokens significantes matcheados contra la plantilla; un solo token generico no matchea.

**Regla:** El matching de templates contra titulos de InvGate usa los segmentos del titulo (split " - "), no solo el stepLabel. Match inverso (titulo mas corto que el matchLabel) requiere >= 2 tokens: un token generico ("Solicitud", "Solucion") nunca matchea solo.

**Archivos afectados:** src/lib/workflow/stages.ts, tests/workflow-stages.test.mjs

---

### 2026-09-10 — Workflow AUTSUC nuevo en producción: padres en el helpdesk (no en el nivel), solicitud en hijos "Instalaciones" y renombre de la categoría

**Problema:** El discovery /automatizaciones dejó de traer los tickets padres: (1) falla "No se pudo resolver la categoría", (2) "Datos de solicitud" mostraba el último comentario ("Se reasigna a nueva mesa AUTSUC") en lugar del formulario, (3) no aparecía el último caso real creado con el workflow nuevo (#79867).

**Causa:** El workflow cambió de formato: hoja renombrada a "Automatizar sucursal" (3023) bajo la misma rama Mesa de Coordinación » Proyectos; los padres del workflow nuevo (título "AUTSUC <Sucursal> (B####) <fecha>") se asignan DIRECTO al helpdesk "TI_GSM_MDC AUTSUC" (6409) sin pasar por su nivel (6410); el padre llega con description vacía y 0 comentarios — la solicitud vive en la description de los hijos vinculados "Instalaciones para AUTSUC #<id>". Además la prioridad de fuentes del initialForm (comentario primero) dejaba un comentario de reasignación encima del formulario de la description.

**Solucion:** (a) queue-resolver: sondear el helpdesk Y sus niveles, y devolver todas las colas que contengan la categoría (2026-09 conviven 6409 + 6410); discovery unifica IDs entre colas. (b) category-resolver: primera ruta por el nombre nuevo "Automatizar sucursal" (manteniendo "Automatización de sucursal" como variante) con fallback por nombre regex y desambiguación por unicidad. (c) branch-title: patrones "AUTSUC <nombre> (B####)" y "sucursal B#### - <nombre>"; dedupe del "· <nombre>" cuando el título ya lo menciona (fix "B0168 - Libertad · Libertad"). (d) resolver: description del padre primero, luego comentario, luego fallback a los hijos "Instalaciones para AUTSUC" (nuevo parser instal-form.ts extrae Sucursal/Jefe/fecha programada reutilizando parseSucursalValue). (e) stages: strip de prefijos jerarquizados "1-"/"1.1-" en el matchkey.

**Regla:** Ante cambios de mesa en InvGate: categoría y cola se revalidan por nombre (nunca IDs hardcodeados). Sondear TODAS las colas plausibles (helpdesk + niveles) porque acepta que los padres viven asignados al helpdesk sin nivel. El formulario inicial (solicitud) puede migrar de fuente (comentario → description → hijos vinculados): el parser hace fallback en cascada y nunca lanza.

**Archivos afectados:** src/lib/workflow/queue-resolver.ts, src/lib/workflow/discovery.ts, src/lib/workflow/category-resolver.ts, src/lib/workflow/branch-title.ts, src/lib/workflow/resolver.ts, src/lib/workflow/instalaciones-form.ts, src/lib/workflow/stages.ts

---

### 2026-09-15 — SSR en streaming: la sidebar emitida después del slot falta durante la carga

**Problema:** Al entrar a `/automatizaciones` (especialmente la primera vez, render frío/lento) la barra lateral no se mostraba mientras la página cargaba y aparecía recién al terminar.

**Causa:** En `BaseLayout.astro` la sidebar (`<DrawerContent>`) se renderizaba DESPUÉS de `<main><slot /></main>`. Astro SSR responde en streaming (`transfer-encoding: chunked`): el `<main>` suspende en el frontmatter de la página (`AutomatizacionesContent.astro` espera `discoverAutomations()` + `getIncidentStatuses()` de InvGate), y todo lo que va después del slot —la sidebar— recién se emite al resolver. El navegador ya había pintado head + navbar + `<main>` vacío, así que se veía el shell sin barra lateral.

**Solucion:** Mover `<DrawerContent />` ANTES de `<div class="drawer-content">` en `BaseLayout.astro`, de modo que el shell (toggle + sidebar) se emita antes de cualquier slot que pueda suspenderse. Validado que el layout queda idéntico en ≥1024px y <1024px (daisyUI coloca por grid `grid-column-start` explícito y el `input.drawer-toggle` sigue primero, así que los combinadores `~` se mantienen).

**Regla:** En layouts con SSR streaming, el chrome persistente (sidebar/navbar) debe ir ANTES del `<slot />` en el orden del DOM. Lo que se emite después de un slot con `await` lento no se pinta hasta que ese slot resuelve. Verificar midiendo el orden en el HTML servido (`<aside …drawer-side` antes de `<main>`), no solo el render caliente.

**Archivos afectados:** src/layouts/BaseLayout.astro, tests/automatizaciones-sidebar-shell.spec.ts

---

### 2026-09-15 — Primera carga de /automatizaciones: caches fríos + cadena secuencial de InvGate

**Problema:** La primera carga de `/automatizaciones` tardaba ~6.9 s. El shell ya se pintaba (fix de streaming), pero el contenido esperaba el scan completo. Con cada restart de PM2 los caches en memoria arrancan vacíos y el primer usuario paga todo.

**Causa:** `discoverAutomations()` encadena llamadas secuenciales a InvGate: `resolveAutomationCategoryId` (6 páginas de `/categories` en serie, ~1.9 s) → `resolveAutomationQueueIds` (getHelpdesks + getHelpdesksAndLevels en serie y **5 colas sondeadas en serie**, cada una 2 calls, ~3.5 s) → `incidents.by.helpdesk` → bulk. Además el discovery expiraba duro a los 5 min (el que llegaba justo pagaba ~1 s) y nada sobrevivía a un restart.

**Solucion:** (1) Paralelizar: `/categories` en batches concurrentes de 6, sondeo de colas con `Promise.all`, categoría ∥ (helpdesks + levels), chunks de `/incidents` en batches de 4. Frío 6.9 s → ~2.9 s. (2) Persistir en SQLite (`invgate_cache`) la resolución de categoría/colas, los estados y el snapshot de discovery, con TTL 24 h / 30 min. (3) Stale-while-revalidate en `discoverAutomations` (sirve snapshot y refresca en background, single-flight) y seeding de `seenParentStatuses`/`finalizedSeen` desde el snapshot para no perder "Recientes" tras un restart. (4) Pre-warm: `scripts/warm-automations.ts` corrido desde `auto-deploy.bat` post `pm2 start`. Resultado: proceso nuevo con cache persistido ~4 ms; frío real (cache vacío) ~2.9 s.

**Regla:** En módulos que agregan datos de APIs externas, separar el costo en (a) paralelizar llamadas independientes, (b) persistir las resoluciones estables cross-restart en SQLite, (c) servir stale + refrescar en background, y (d) pre-warm en el deploy. Los caches solo-en-memoria se pierden en cada restart y siempre golpean al primer usuario. El override por env debe aceptar multi-valor cuando la instancia tiene más de una cola.

**Archivos afectados:** src/lib/invgate/automation/categories.ts, src/lib/invgate/automation/incidents.ts, src/lib/invgate/automation/statuses.ts, src/lib/invgate/cache.ts, src/lib/workflow/category-resolver.ts, src/lib/workflow/queue-resolver.ts, src/lib/workflow/discovery.ts, src/db/schema.ts, scripts/warm-automations.ts, scripts/auto-deploy.bat, .env.example, tests/workflow-queue-cache.test.mjs

---

### 2026-09-15 — Cierre local de automatizaciones: caches de detalle/discovery y epoch en segundos

**Problema:** Al cerrar/reabrir un caso localmente, el detalle seguía mostrando "En curso" (sin banner) mientras que el listado ya lo reclasificaba.

**Causa:** El cierre/reopertura se persisten en SQLite y se invalidaba el cache de discovery, pero `resolveAutomationDetail` tiene su propio cache en memoria (TTL 2 min): el reload del detalle servía el resultado viejo con `closure: null`. Además `formatEpochDateTime` espera epoch en **segundos** (como InvGate); guardar `Date.now()` (ms) producía fechas absurdas (año 58676) y rompía el orden de `recentFinalized` (mezcla ms/segundos).

**Solucion:** Exportar `invalidateAutomationDetail(id)` en `resolver.ts` y llamarlo junto a `invalidateDiscoveryCache()` en las actions de cierre y reapertura. Persistir `closedAt` con `Math.floor(Date.now()/1000)` (segundos, consistente con InvGate y con el orden de finalizadas). El cierre automático al 100% se evalúa dentro del pipeline de detalle (oportunista) y limpia auto-cierres si el progreso retrocede.

**Regla:** Cuando una acción cambia estado que alimenta vistas cacheadas, invalidar TODAS las capas de cache afectadas (discovery y detalle), no solo una. Los timestamps de dominio (cierres, snapshots que conviven con datos de InvGate) se guardan en segundos para que `formatEpochDateTime` y los `sort` por fecha funcionen. Un write feature debe invalidar cache en la misma transacción lógica que persiste el cambio.

**Archivos afectados:** src/lib/workflow/closures.ts, src/lib/workflow/discovery.ts, src/lib/workflow/resolver.ts, src/actions/index.ts, src/lib/rbac.ts, src/pages/automatizaciones/_components/AutomatizacionDetalleContent.astro, src/pages/automatizaciones/_components/AutomationList.astro, src/pages/automatizaciones/[id].astro, src/db/schema.ts, tests/workflow-closures.test.mjs

---

### 2026-09-15 — Padres de automatización que desaparecen al reasignarse a otra mesa

**Problema:** Casos recién iniciados aparecían en el portal y dejaban de figurar al completarse el formulario inicial, cuando el workflow reasignaba el padre a otra mesa. Ejemplo real: `#81683/#81679/#81676` (categoría 3023) pasaron del helpdesk AUTSUC (6409/nivel 6410) al nivel 2594 (`TECO_SoporteREDN2`) y desaparecieron.

**Causa:** `discoverAutomations` listaba padres **solo** desde las colas resueltas vía `incidents.by.helpdesk`; al cambiar `assigned_group_id` el padre sale de esas colas. Peor: `reconcileVanishedParents` re-chequeaba un padre desaparecido y, si seguía activo, lo **descartaba** del seguimiento por "dejar de ser ticket de la cola".

**Solucion:** Tracking persistido de padres activos por ID (`automation_tracked_parents`). El scan une IDs de cola ∪ trackeados y fetch en un solo bulk; los activos se recuerdan y los finalizados/ausentes se podan (los finalizados alimentan "Recientes"). Se eliminó el descarte de activos. Backfill por `incidents.by.status` (status 1-4, todas las mesas, 1 call + bulk) filtrado por categoría, en deploy (`warm-automations`) y worker PM2 diario (`reconcile-automation-parents`, 04:00). Verificado: recuperó los 15 padres activos (12 en cola + 3 movidos) y los 3 reaparecieron en el portal.

**Regla:** No asumir que un ticket de un workflow permanece en la cola donde nació: los flujos lo reasignan de mesa. Trackear por identidad (id) persistida y reconciliar periódicamente por categoría (no por cola). Un "barrido por estado + filtro de categoría" sirve para backfill puntual porque `by.status` devuelve todos los IDs activos en una call. Nunca descartar del seguimiento a un ticket activo solo porque salió de la cola.

**Archivos afectados:** src/lib/workflow/tracked-parents.ts, src/lib/workflow/discovery.ts, src/db/schema.ts, scripts/reconcile-automation-parents.ts, scripts/warm-automations.ts, ecosystem.config.cjs, tests/workflow-tracked-parents.test.mjs

---

### 2026-09-26 — Morph de /automatizaciones: el `view-transition-name` inline no está en el código

**Problema:** La entrada del 2026-09-06 documenta como solución final del morph listado↔detalle el uso de `view-transition-name` inline en items del listado y header del detalle. Al analizar el módulo, `grep view-transition-name src` da 0 resultados y el historial git (un único commit del módulo) nunca lo contuvo: la navegación actual usa el fade por defecto del ClientRouter.
**Causa:** El anclaje del morph nunca llegó al código commiteado (posible pérdida al consolidar/refactorizar); el ClientRouter sigue activo solo en `/automatizaciones` (`BaseLayout.astro`).
**Solución:** No se re-implementa por ahora: queda documentado como mejora pendiente, no como bug. Si se retoma, recordar que la card destacada está duplicada en "Todas las automatizaciones" y que los nombres de transición deben ser únicos por página.
**Regla:** Cuando una entrada de lessons describe una solución de UI, verificar con `grep`/selectores que el código la contenga antes de asumirla vigente: las refactorizaciones pueden haberla removido.
**Archivos afectados:** src/layouts/BaseLayout.astro, src/pages/automatizaciones/_components/*.astro, docs/lessons.md

---

### 2026-09-26 — `npm run test:unit` (vitest) no resuelve los alias de tsconfig

**Problema:** `npm run test:unit` falla en la colección de casi todos los `tests/*.test.mjs`: vitest no interpreta los `paths` de `tsconfig.json`, así que los imports `@db/*`, `@lib/*` de los módulos de `src/` rompen (`Cannot find package '@db/index'`). Además, la mayoría de esos `.test.mjs` son scripts standalone con su propio `check()` + `process.exit(1)` (pensados para `node --import tsx tests/foo.test.mjs`), no suites vitest: vitest los marca como "sin tests".
**Causa:** El script `test:unit: vitest run` asume tests en formato vitest con alias configurados, pero el repo usa scripts `tsx` y no hay `vitest.config`.
**Solución:** Para los tests del módulo automatizaciones correr `npx tsx tests/workflow-*.test.mjs` (todos pasan). El nuevo `tests/workflow-timeline-plan.test.mjs` sigue esa misma convención. Queda pendiente (fuera de alcance) reparar `test:unit` o reemplazarlo por un runner de los scripts.
**Regla:** Antes de agregar tests, mirar cómo corren los existentes: en este repo los unit tests de workflow son scripts `tsx`, no vitest.
**Archivos afectados:** package.json, tests/workflow-*.test.mjs

---

### 2026-10-02 - Listado pegado al snapshot persistido y sin paginacion

**Problema:** Un caso cerrado en InvGate no reflejaba "Finalizado" en el portal ni con F5; recien aparecia al abrir el detalle (a veces ~15-20 min despues). Ademas, "Todas las automatizaciones" traia toda la tabla `automation_parents` y filtraba/ordenaba client-side: no escala al crecer el historial.

**Causa:** (1) `resolveAutomationDetail` servia el snapshot persistido y lo marcaba fresco en memoria **sin disparar el refresh en background**, asi que el detalle quedaba pegado hasta que vencia el TTL del persistido (15 min). (2) El listado leia la DB, que solo actualiza el scan de discovery (cache 5 min / SWR hasta 30 min) y no habia revalidacion manual; el fetch de progreso no hacia write-back del estado del padre. (3) `listAutomationParents()` devolvia todas las filas.

**Solucion:** (1) El path persistido dispara siempre `runDetailPipeline` (SWR) y el TTL default del detalle bajo a 5 min. (2) `resolveAutomationProgress` hace write-back de `status_id/updated_at/closed_at` a `automation_parents` (`upsertAutomationParentStatus`). (3) `discoverAutomationsWithMeta` expone `stale`; la vista muestra "Actualizando..." y recarga tras pegarle a `GET /api/automatizaciones/revalidate`, y hay boton "Actualizar" (`?refresh=1`) que fuerza `revalidateAutomations()`. (4) Paginacion server-side (`listAutomationParentsPage` + `listRecentAutomationParents`) con busqueda/filtro en SQL y `Pagination.astro` reutilizado; se elimino `automationListFilterClient.ts`.

**Regla:** En el modulo automatizaciones, la DB de historial es la fuente del listado: cualquier snapshot que se sirva debe poder revalidarse (boton/auto) y toda resolucion que toque un padre debe escribir de vuelta su estado mutable. La busqueda/filtro de un listado paginado va en SQL, nunca client-side sobre la pagina visible.

**Archivos afectados:** src/lib/workflow/resolver.ts, src/lib/workflow/discovery.ts, src/lib/workflow/parent-history.ts, src/lib/invgate/automation/cache-config.ts, src/pages/automatizaciones/_components/AutomatizacionesContent.astro, src/pages/api/automatizaciones/revalidate.ts, src/components/ui/Pagination.astro, src/components/ui/SearchBar.astro, tests/workflow-parent-history.test.mjs

---

### 2026-10-02 - Sucursal y registrador del detalle: un comentario debil bloqueaba el hijo Instalaciones

**Problema:** En B0177 (#81683, Francisco Alvarez) la card "Sucursal" del detalle mostraba "---" mientras que en Tribunales de Banfield (#86762) si aparecia. Inversamente, el "registrado por" aparecia en B0177 pero no en #86762 ni en B0061 (#86717).

**Causa:** (1) `parseInitialForm` devuelve un formulario "debil" (solo `otherFields`) ante cualquier linea "label: valor", y el primer comentario de #81683 era un aviso de Multitoma ("Se vincula tarea ... : #85967"). Ese resultado no-null bloqueaba el fallback `if (parsedForm === null)` al hijo "Instalaciones para AUTSUC", que es donde vive la sucursal real. (2) `initialForm.authorName` solo se resolvia cuando el form venia del primer comentario (`formSource === parentFormComment`); los forms tomados de la description del hijo quedaban sin autor.

**Solucion:** `chooseInitialForm` (`src/lib/workflow/initial-source.ts`) elige la fuente con la sucursal como senal autoritativa: description sustantiva > comentario sustantivo > hijo Instalaciones si aun no hay sucursal. El registrador cae al `creator_id` del ticket padre cuando el form no vino de un comentario. Se agrego `branchName` al detalle como fallback de presentacion en la card Sucursal. La key persistida del detalle pasa a `automation.detail.v2.` para ignorar snapshots viejos.

**Regla:** No asumir que "hay campos parseados" equivale a "hay formulario": validar sustancia (sucursal/jefe/rango IP/fecha) antes de descartar fuentes alternativas. Y todo dato que se muestra en el detalle debe poder resolverse para cualquier origen del form, no solo para el comentario.

**Archivos afectados:** src/lib/workflow/initial-source.ts, src/lib/workflow/resolver.ts, src/pages/automatizaciones/_components/InitialFormDetails.astro, src/pages/automatizaciones/_components/AutomatizacionDetalleContent.astro, tests/workflow-initial-source.test.mjs

---

### 2026-09-06 - Eliminacion del sistema de permisos DB (routeAccess/moduleAccess)

**Problema:** El sistema de permisos en DB (tablas routes/modules/route_access/module_access/permission_audit_batches) generaba riesgo mayor que su valor: escalada de privilegios via overrides, divergencia sidebar/middleware y mismatch invgateId vs mesas.id.
**Causa:** Capa de permisos dinamica con cache y resolvers para un portal donde la visibilidad depende solo de la mesa del usuario.
**Solucion:** Sistema DB eliminado (schema + dev DB). Visibilidad hardcodeada y sincronica en `isSectionVisibleSync(helpdeskName, role, href)` (src/lib/helpdeskAccess.ts), fuente unica usada por middleware, sidebar y dashboard; roles por whitelist default-deny en routePermissions.
**Regla:** No reintroducir permisos en DB para este portal: la visibilidad se define en codigo; cambios de politica = PR, no fila de tabla.
**Archivos afectados:** src/lib/helpdeskAccess.ts, src/lib/rbac.ts, src/middleware.ts, src/db/schema.ts

### 2026-09-06 - users.helpdeskName denormalizado puede quedar stale

**Problema:** El nombre de mesa guardado en users.helpdeskName puede divergir del nombre real en mesas tras un sync/rename.
**Causa:** Campo denormalizado escrito en alta/sync; no se actualiza si la mesa cambia de nombre.
**Solucion:** La sesion resuelve la mesa via LEFT JOIN users→mesas y toma el nombre de mesas.name (resolveSessionMesa en src/lib/helpdeskAccess.ts), fail-closed si la mesa esta inactiva/borrada/desconocida.
**Regla:** Nunca confiar en users.helpdeskName para autorizacion; usar siempre el join con mesas (nombre canonico).
**Archivos afectados:** src/middleware.ts, src/lib/helpdeskAccess.ts

### 2026-09-06 - Set-Content en PowerShell 5.1 corrompe UTF-8

**Problema:** Escribir archivos con Set-Content produce BOM/mojibake en contenido UTF-8 (tildes y emojis destruidos).
**Causa:** Encoding por defecto de PowerShell 5.1 (no es UTF-8 sin BOM).
**Solucion:** Usar node (fs.writeFileSync) o [IO.File]::WriteAllText con UTF8Encoding($false).
**Regla:** En scripts de automatizacion sobre este repo (Windows), nunca usar Set-Content/Out-File para textos con UTF-8.
**Archivos afectados:** scripts/*

---

### 2026-09-07 — Crash loop `TypeError: Invalid URL` (rootDir undefined) por node_modules inconsistente

**Problema:** El proceso PM2 `correo-argentino-mda` entraba en reinicio infinito (2190 restarts) con `TypeError: Invalid URL` (`code: ERR_INVALID_URL`, `input: 'undefined'`) en `deserializeManifest` de `dist/server/entry.mjs` (linea `new URL(serializedManifest.rootDir)`).
**Causa:** `npm install`/`npm audit fix` corrio con procesos PM2/Node vivos. En Windows el binario nativo `better-sqlite3.node` esta cargado en memoria por el proceso en ejecucion y no se puede reemplazar (`EBUSY/EPERM` en `prebuild-install`), dejando `node_modules` inconsistente. El build posterior serializo el manifest SSR sin `rootDir`; en runtime `new URL(undefined)` explota al boot. Vinculo extra hallado: el task programado de Windows "Auto deploy correo-argentino-mda" tenia "Iniciar en" apuntando al `.bat` (no a la carpeta) -> `ERROR_DIRECTORY` (0x10B) en el ultimo resultado.
**Solucion:** Detener todo Node/PM2 -> renombrar `node_modules` -> `npm ci` limpio -> `npm run build` -> verificar `findstr /C:"rootDir" dist\server\entry.mjs` (debe apuntar a `file:///...`) -> `pm2 start`. El deploy automatico se re-creo con `WorkingDirectory` correcto (`scripts/`) y orden corregido (`pm2 kill` antes de `npm install`).
**Regla:** Nunca ejecutar `npm install`/`npm audit fix` con procesos PM2/Node vivos (lock de modulos `.node` nativos). Despues de todo build validar `rootDir` en `dist/server/entry.mjs`; el guard `scripts/verify-build.mjs` (enchufado a `npm run build`) aborta el deploy si falta. En tasks programados, "Iniciar en" debe ser un directorio, nunca un archivo.
**Archivos afectados:** scripts/auto-deploy.bat, scripts/verify-build.mjs, package.json, dist/server/entry.mjs, AGENTS.md, docs/deploy-produccion.md

---

### 2026-09-19 — `db.transaction(async cb)` en better-sqlite3 NUNCA commitea

**Problema:** Una transaccion con callback `async` lanzaba `TypeError` (better-sqlite3 no admite promesas) y el `rollback` implicito dejaba los statements previos en **autocommit** (sin commit agrupado). Sintoma tipico: aparece un error falso y la auditoria de esa operacion queda salteada aunque los datos si se hayan escrito (o se escriban parcialmente).
**Causa:** better-sqlite3 es 100% sincronico: `db.transaction(fn)` solo maneja callbacks sincronicos. Un `async cb` devuelve una Promise, la transaccion se cierra antes de que la Promise resuelva y no hay commit.
**Solucion:** Usar callbacks **sincronicos** y statements preparados con `.run()`/`.get()`. Ejemplo: `db.transaction((items) => { for (const it of items) stmt.run(...) })`. Si hace falta async (backup, red), hacerlo FUERA y antes de la transaccion.
**Regla:** Con better-sqlite3, jamas pasar un callback `async` a `db.transaction()`; toda la logica del callback debe ser sincronica. Ver `scripts/normalize-participaciones.mts` y `src/lib/reorderHandler.ts`.
**Archivos afectados:** scripts/normalize-participaciones.mts, src/lib/reorderHandler.ts

---

### 2026-09-19 — Guards de rol: no indexar `ROLE_HIERARCHY[user.role]` con strings crudos

**Problema:** Un guard tipo `if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY.supervisor)` compilaba pero **dejaba pasar** roles con variantes legacy (`"team leader"`, `"team-leader"`, `"Referente"`, mayusculas). El indice daba `undefined` y `undefined < N === false` → bypass de la restriccion.
**Causa:** `ROLE_HIERARCHY` es `Record<Role, number>` con claves canonicas; un string crudo no-normalizado no matchea y devuelve `undefined` en runtime (TypeScript no lo detecta porque el type miente).
**Solucion:** Comparar con `can(user.role, "team_leader")` (`@lib/roleConfig`) o normalizar primero con `normalizeRole` y recien despues indexar. `can()` ya normaliza internamente.
**Regla:** Nunca indexar tablas de jerarquia/permisos con `user.role` crudo. Usar siempre `can()` o `normalizeRole()`. Aplicado en `handleReorder` (reorder team_leader+) y en el gating de participaciones.
**Archivos afectados:** src/lib/reorderHandler.ts, src/lib/roleConfig.ts, src/pages/admin/usuarios.astro

---

### 2026-09-19 — `AsyncFormScript` no bindeaba forms inyectados por islas `server:defer`

**Problema:** Formularios dentro de islas `server:defer` (p.ej. alta/edicion en `/admin/usuarios`) hacian **submit nativo**, recargando la pagina, y el handler async no corria. Aparecia "Invalid JSON response from server." en el toast cuando el form apuntaba a un endpoint JSON.
**Causa:** El script corria en `DOMContentLoaded`, pero las islas `server:defer` se inyectan **despues** de ese evento; `document.querySelectorAll("form[data-async-form]")` no las veia y nunca se les agregaba el listener.
**Solucion:** Mantener `initAsyncForms()` idempotente (guard `form.dataset.asyncFormInitialized`) y observar el DOM con `MutationObserver` (`childList: true, subtree: true`) para re-bindear forms inyectados tardiamente; re-ejecutar tambien en `astro:page-load`.
**Regla:** Todo script de binding global debe asumir que componentes `server:defer` llegan despues de `DOMContentLoaded`: usar `MutationObserver` (o `astro:page-load`) con guard de idempotencia. Ver `src/components/admin/ui/AsyncFormScript.astro`.
**Archivos afectados:** src/components/admin/ui/AsyncFormScript.astro

---

### 2026-09-21 — Accessors de Drizzle usan el nombre TS, nunca el nombre SQL

**Problema:** Un `update-user` válido devolvía `400 "Error al actualizar el usuario."` aunque los datos eran correctos. Tres tests E2E (modales de edición) y un probe directo fallaban con el error genérico del `catch`.
**Causa:** En dos selects se usó `agents.user_id` (nombre de columna SQL) en vez de `agents.userId` (nombre de la propiedad TS). En Drizzle `agents.user_id` es `undefined`, y el select lanza `Cannot convert undefined or null to object`; el `catch` genérico del handler lo enmascaraba como 400. El aislamiento se logró por bisección con `git stash` (versión commiteada → 200, working tree → 400) y un probe mínimo del accessor.
**Solucion:** Reemplazar `agents.user_id` por `agents.userId` en ambos selects. Verificado: probe directo 200, `tests/admin/` 74 passed, `vitest` 132 passed, build OK.
**Regla:** En queries Drizzle usar siempre el nombre de propiedad TS (`agents.userId`), nunca el nombre SQL (`agents.user_id`). Ante un 400 genérico de un handler, sospechar primero de un accessor undefined: probarlo aislado con `typeof` antes de teorizar sobre lógica de negocio.
**Archivos afectados:** src/pages/admin/usuarios.astro, src/pages/api/cronograma/operators.ts

---

### 2026-09-28 — `astro check` revienta con OOM por artefactos de Playwright

**Problema:** `npx astro check` terminaba con `FATAL ERROR: Ineffective mark-compacts near heap limit` (4 GB, y también con 8 GB) y ~18 MB de salida, sin llegar al resumen de errores.
**Causa:** `tsconfig.json` tiene `"include": ["**/*"]` y TypeScript **no respeta `.gitignore`**: el type-check parseaba `playwright-report/trace/*.js` (bundles minificados de varios MB generados por la corrida E2E). No era el código del feature.
**Solucion:** `tsconfig.json` → `"exclude": ["dist", "node_modules", "playwright-report", "test-results", "tmp", ".drizzle-canonical"]`. Volvió a reportar los 42 errores preexistentes del baseline.
**Regla:** Todo artefacto generado dentro del repo (reportes de Playwright, temporales, `.drizzle-canonical`) debe estar en el `exclude` de `tsconfig.json`, no solo en `.gitignore`. Ante un OOM del type-check, mirar primero el volumen de salida y si hay bundles minificados en el alcance.
**Archivos afectados:** tsconfig.json

---

### 2026-09-28 — `drizzle-kit push` es inviable sin TTY: usar el script de alineación

**Problema:** `npm run db:push` (y `npx drizzle-kit push --force`) fallaban con `Error: Interactive prompts require a TTY terminal`; la tabla nueva nunca se creaba.
**Causa:** `drizzle-kit push` pide confirmación interactiva aunque se pase `--force`, y este shell no tiene TTY.
**Solucion:** `npx tsx scripts/align-db-to-schema.mts`, que hace backup consistente, deriva el DDL canónico de `src/db/schema.ts`, crea/reconstruye lo desalineado y verifica paridad + `foreign_key_check` + `integrity_check` + conteos de filas.
**Regla:** En este entorno el único camino para aplicar schema es `scripts/align-db-to-schema.mts`. Antes de correrlo: backup y leer el diff que reporta (tablas faltantes / desalineadas / extra).
**Archivos afectados:** scripts/align-db-to-schema.mts, database/mda.db

---

### 2026-09-28 — Doble prefijo de base al combinar `resolveUrl` con `redirectWithToast`

**Problema:** Las mutaciones del ABM de categorías construyen su destino con `resolveUrl(...)` (que ya incluye el base) y lo pasan a `redirectWithToast`, que a su vez antepone `getBaseNoSlash()`. Con `base: "/"` no se nota; con un deploy en subdirectorio, toda redirección quedaría en `base + base + /base-conocimiento/...`.
**Causa:** Dos capas que aplican el base, y la misma de ellas lo aplica dos veces. Solo afecta a los call-sites que pasan paths **dinámicos** (los 30 literales del repo nunca lo dispararon).
**Solucion:** Pendiente en `docs/superpowers/plans/2026-09-28-kb-v2-hardening.md` (Task 1): pasar paths sin base a `redirectWithToast` y mantener la validación base-aware (`isKbReturn` / `kbReturnPrefix`) intacta, con helper puro testeado bajo `tests/unit/`.
**Regla:** Elegir **una sola** capa que aplique el base. `redirectWithToast`/`toastResponse` ya lo hacen: pasarles paths sin base y usar `resolveUrl` solo para la acción del form o para validar. Si un call-site pasa una URL dinámica a un helper de toast, revisarlo con grep.
**Archivos afectados:** src/pages/base-conocimiento/categorias.astro, src/lib/api/redirectWithToast.ts

---

### 2026-09-28 — EasyMDE: las vistas split y fullscreen desbordaban y quedaban inclicables

**Problema:** En create/edit, la vista side-by-side se salía del contenedor (quedaba cortada) y el botón de fullscreen no respondía: el header y el drawer de la app tapaban la toolbar y la primera columna de texto.
**Causa:** Tres bugs, ninguno `100vw` ni `box-sizing`: (1) EasyMDE tiene `sideBySideFullscreen: true` por defecto, así que `toggleSideBySide()` llamaba a `toggleFullScreen()` y el preview `.editor-preview-side` (fixed, 50%) se superponía; (2) `.editor-toolbar.fullscreen` (z-index 9) y `.CodeMirror-fullscreen` (8) quedaban por debajo del header (z-30) y del drawer (z-60); (3) los paneles flex del split no tenían `min-width: 0`, así que no bajaban de su min-content.
**Solucion:** `sideBySideFullscreen: false` (el fullscreen lo dispara JS, con CSS habría que pelear con `!important` y se rompería el botón), `min-width: 0` en los dos paneles, y `z-index: 70/69` para toolbar/CodeMirror/preview-side en modo fullscreen. Cubierto por `tests/kb-editor-layout.spec.ts` (6 asserts geométricos: sin scroll horizontal, panes dentro del viewport y del contenedor, sin solapamiento).
**Regla:** Al integrar un editor de terceros hay que verificar (a) los defaults no obvios del paquete leyendo su código en `node_modules`, (b) el stacking context contra el chrome propio de la app, y (c) cada modo de vista con asserts geométricos (`boundingBox`), no solo con una mirada visual. Todo item flex con contenido ancho necesita `min-width: 0`.
**Archivos afectados:** src/components/base-conocimiento/KbEditor.astro, tests/kb-editor-layout.spec.ts

---

### 2026-09-28 — Los props `Date` de un server island llegan como string

**Problema:** La vista de artículo devolvía **HTTP 500** en todas las requests con `RangeError: Invalid time value` en `KbViewContent.astro` (el `Intl.DateTimeFormat.format()` recibía el string ISO en lugar de un `Date`).
**Causa:** Astro serializa los props de los server islands con `JSON.stringify` (`node_modules/astro/dist/runtime/server/render/server-islands.js`), y un `Date` se convierte en string. En la carga directa de la página funcionaba; solo fallaba la isla diferida.
**Solucion:** Coercionar en el componente: `const d = article.updatedAt ? new Date(article.updatedAt as string | Date) : null;` y validar `Number.isNaN(d.getTime())` antes de formatear, con fallback "Sin fecha de actualización".
**Regla:** En cualquier server island, tratar los props como JSON: coaccionar `Date` y validar `NaN` antes de formatear o comparar. Un 500 que solo aparece en la isla y no en la carga directa es casi siempre este caso.
**Archivos afectados:** src/components/base-conocimiento/KbViewContent.astro

---

### 2026-09-28 — EasyMDE: `"image"` no abre el selector de archivos y el repo no carga FontAwesome

**Problema:** El botón de imagen del editor no sube nada (no abría el file picker) y los íconos de la toolbar salían en blanco.
**Causa:** EasyMDE 2.21.0 tiene dos botones distintos: `"image"` inserta una URL y `"upload-image"` es el que abre el picker (verificado en `node_modules/easymde/src/js/easymde.js:1499-1500,1629-1632`). Y el repo no carga FontAwesome en ningún lado, así que con `autoDownloadFontAwesome: false` las clases `fa fa-*` no renderizan nada.
**Solucion:** Toolbar con `"upload-image"` + `imageAccept` explícito, y etiquetas de texto (no emoji) para los `fa-*` en el `<style is:global>` del componente.
**Regla:** Antes de configurar un paquete de terceros, leer su fuente en `node_modules` para confirmar nombres de opciones y defaults, y verificar qué assets existen en el repo (aquí: cero FontAwesome). No asumir que un toolbar item "obvio" hace lo que el nombre sugiere.
**Archivos afectados:** src/components/base-conocimiento/KbEditor.astro

---

### 2026-09-28 — E2E contra el puerto equivocado produce fallos falsos que desvían la investigación

**Problema:** El smoke de upload daba 403 en todos los roles (team_leader y admin incluidos), y el análisis llevó a "arreglar" una restricción de RBAC que en realidad no existía.
**Causa:** El dev server corría en el puerto 4322 (wrapper de `astro dev`) mientras el probe pegaba a 4321; además `fetch` seguía redirecciones, así que un 302 del middleware aparecía como 200 de la landing y viceversa.
**Solucion:** El probe pasó a leer el puerto real (`npx astro dev status`) y a usar `redirect: "manual"`; el 403 resultó ser un 302 de middleware (denegación correcta del `agent`), y la única asimetría real era el filtro de mesa en `api/kb/upload.ts` (que se revirtió a `mesas.active`).
**Regla:** Antes de interpretar un status de E2E, confirmar en qué puerto vive el dev server (`npx astro dev status`) y usar `PLAYWRIGHT_BASE_URL`; y usar `redirect: "manual"` en cualquier assert de status para no medir la landing en lugar del handler.
**Archivos afectados:** playwright.config.ts, tests/kb-mesas-habilitadas.spec.ts

---

### 2026-09-28 — Tests que pasan por la razón equivocada

**Problema:** Varios asserts verdes que no probaban lo que decían: el guard de duplicado comparaba `name = "Accesos"` (case-sensitive) y daba verde con un `accesos` insertado; el test de preselección de categoría creaba el artículo sin categoría, así que la prioridad invertida también daba verde; `page.once("dialog", accept)` pasaba aunque el `confirm()` nunca se disparara; y `compareDocumentPosition` con `FOLLOWING` también da true cuando el editor está contenido dentro de la fila.
**Causa:** Aserts escritos contra el valor por defecto en vez de contra la diferencia que el fix introduce, y handlers de eventos registrados sin assert.
**Solucion:** (a) assertar el total de filas de la mesa + `lower(name)=lower('X')`; (b) sembrar el artículo con una categoría previa y assertar que gana la nueva; (c) flag `dialogFired` en el handler + `expect(dialogFired).toBe(true)`; (d) `following === true && containedBy === false` evaluado dentro del browser. Cada fix se validó revirtiendo el código y confirmando que el test se pone rojo.
**Regla:** Un assert debe **fallar si se revierte el fix**: probar la reversión antes de dar por verde. Los handlers de eventos (dialogs, callbacks) necesitan flag + assert. Preferir condiciones sobre conteos globales y sobre los valores normalizados que el código realmente usa.
**Archivos afectados:** tests/kb-categories.spec.ts, tests/kb-form-row.spec.ts

---

### 2026-09-28 — FKs nuevas sin `onDelete` y cascade silencioso desde `mesas`

**Problema:** `kb_categories.createdByUserId → users.id` quedó sin acción de borrado: con `PRAGMA foreign_keys = ON`, borrar un usuario que creó categorías falla. Y `kb_articles.helpdesk_id` / `kb_categories.helpdesk_id` cascadean desde `mesas`, que no está en `deletedRecords`: un "eliminar mesa" futuro se llevaría artículos y categorías sin aviso ni snapshot.
**Causa:** La tabla se agregó siguiendo el patrón de `kb_articles` sin decidir explícitamente la política de borrado del padre, y sin verificar que el soft-delete del repo cubriera las entidades hijas.
**Solucion:** `onDelete: "cascade"` en `helpdeskId` (necesario: sin él, los caminos de limpieza de tests que borran mesas fallaban), aplicado con el script de alineación; y detección de que el cascade desde `mesas` es una trampa armada → guard en `tests/unit/security/` que falle si algún path de producción hace `delete(mesas)` (pendiente en el plan de hardening, Task 4 y Task 7).
**Regla:** Al agregar una FK, elegir y documentar la acción (`set null` > `cascade`) y verificar que el borrado del padre esté cubierto por snapshot/papelera. Si el padre se borra en algún flujo futuro, el cascade tiene que ser intencional y visible.
**Archivos afectados:** src/db/schema.ts

---

### 2026-09-28 — Un campo que deja de ser texto libre exige backfill de los valores previos

**Problema:** Al pasar la categoría de texto libre a `<select>` con catálogo, quedaron artículos con valores sin fila en `kb_categories` (hay al menos uno: categoría "Prueba" en la mesa 2509). El ABM itera el catálogo, así que ese valor quedó **invisible** ahí (no se puede renombrar ni borrar) pero visible en el listado de artículos y como opción extra en el formulario de edición; y al cambiar la categoría se pierde sin rastro en la auditoría.
**Causa:** El plan cubrió el alta/edición nueva pero no la migración de los datos previos, ni un estado visible para lo no catalogado.
**Solución:** Resuelto en #135 y script de backfill idempotente (`scripts/backfill-kb-categories.mts`) con edición explícita de categorías sin avisos obsoletos de sin catalogar.
**Regla:** Cuando un campo deja de ser texto libre, el plan debe incluir el backfill idempotente de los valores existentes y un estado visible para lo que no quedó catalogado. Un `<select>` es sugerencia: la frontera de confianza es el POST, y aun así el dato viejo no puede desaparecer en silencio.
**Archivos afectados:** src/lib/kb.ts, src/pages/base-conocimiento/categorias.astro

---

### 2026-09-28 — Seed-on-read con `count == 0` crea invariantes implícitas

**Problema:** La siembra de las 5 categorías por defecto solo corre cuando el catálogo de la mesa está vacío (en `listCategories` y en `createCategory`). Consecuencias no obvias: una mesa nunca puede tener exactamente una categoría, y borrar las cinco defaults las hace resucitar en la siguiente lectura del catálogo. Ninguna de las dos reglas estaba testeada ni documentada.
**Causa:** Se cambió la siembra "en cada lectura" (5 inserts `ON CONFLICT DO NOTHING` por request) por un gate `count == 0`, lo cual es correcto en performance pero convierte el estado vacío en un disparador de reglas de negocio.
**Solucion:** Se aceptó la semántica y se congeló con tests de caracterización (uno por regla) más una prueba de mutación que demuestra que pueden fallar (pendiente en el plan de hardening, Task 8), y quedó documentada en `docs/CONTEXT.md`.
**Regla:** Un seed-on-read con condición de vacío es un invariante de negocio, no un detalle de implementación: si tiene semántica (no puede quedar vacío, no puede tener uno solo), va con tests que la congelen o con una bandera explícita de "ya sembrado".
**Archivos afectado:** src/lib/kbCategories.ts

---

### 2026-09-28 — Forms fuera de `/api/` quedan sin rate limit

**Problema:** El rate limit del middleware solo se aplica a paths bajo `/api/`, así que los tres POST del ABM de categorías (alta, renombre, baja) son ilimitados: un `team_leader` puede spamear escrituras en bucle sin ninguna traba.
**Causa:** El rate limiter se concibió para endpoints API; las páginas de gestión hacen POST directo a sí mismas.
**Solucion:** Límite dedicado (`RATE_LIMITS.kbCategoryWrite`, 20/min) por bucket de usuario (`kb-write:u:<id>`) aplicado a esa ruta de escritura desde la rama dedicada de `applyRateLimit` en el middleware, con E2E que corta exactamente en el límite (request 21) y que prueba que un segundo usuario no hereda el corte. El path sale de `KB_CATEGORIAS_PATH` (`@lib/kbRedirects`), no de un literal.
**Regla:** Cada superficie de escritura (incluidas las páginas de gestión con POST) necesita un límite: si no está bajo `/api/`, hay que agregarla explícitamente al middleware.
**Archivos afectados:** src/middleware.ts, src/lib/rateLimit.ts, src/pages/base-conocimiento/categorias.astro

---

### 2026-09-28 — Un guard por igualdad exacta de ruta se evade con un slash final

**Problema:** El rate limit comparaba `relativePath === "/base-conocimiento/categorias"` y `=== "/login"`, pero Astro routea con `trailingSlash: "ignore"`: `POST /base-conocimiento/categorias/` y `POST /login/` ejecutan el mismo handler sin pasar por ningún guard. Medido antes del fix: 25 POST autenticados al path con slash final, 0 throttled (y 14 al de login, 0 throttled).
**Causa:** `url.pathname` conserva el slash final y la comparación era por igualdad exacta; nadie normalizó el path antes de comparar, así que el guard protegía solo una de las dos escrituras de la misma URL.
**Solucion:** Normalizar una sola vez en `getRelativePath` (strip de trailing slash, conservando `/`) y comparar siempre contra el valor normalizado: `/x` y `/x/` caen en el mismo bucket. E2E que llena la venta entera por el alias con slash y exige que la ruta canónica corte en la request siguiente. Comprobado además que la normalización no altera el resto del middleware: `hasPermission` compara por `startsWith` y `isSectionVisibleSync` ya hace `replace(/\/+$/, "")`.
**Regla:** Normalizar el path de la request (strip de trailing slash) antes de comparar contra rutas, porque Astro routea con `trailingSlash: 'ignore'` y un slash final evita cualquier guard por igualdad exacta.
**Archivos afectados:** src/middleware.ts, tests/kb-categorias-rate-limit.spec.ts

---

### 2026-09-28 — Un fix puede dejar código muerto en un export público

**Problema:** Al mover el conteo de artículos "en uso" dentro de la transacción de `deleteCategory` para que fuera atómico, `countArticlesWithCategory` quedó sin ningún caller en todo el repo: código muerto que el plan declaraba como parte de la API pública.
**Causa:** El fix inlineó el paso que consumía el helper, sin revisar el contrato de exports del módulo.
**Solucion:** `countArticlesWithCategory(helpdeskId, name, executor = db)` acepta el handle de transacción y lo consume `deleteCategory` dentro de la tx (sin cambios de comportamiento y sin código muerto).
**Regla:** Después de cada fix, re-leer el contrato público del módulo (exports que el plan define) y hacer grep de callers: un fix que "simplifica" puede dejar sin uso algo que otro consumidor esperaba.
**Archivos afectados:** src/lib/kbCategories.ts

---

### 2026-09-28 — `scripts/backup-db.bat`: rutas hardcodeadas y éxito falso

**Problema:** El script de backup tenía rutas absolutas `C:\Projects\correo-argentino-mda\...` (funcionan solo en la máquina de prod) y, si la copia fallaba, igual imprimía "Copia de seguridad completada".
**Causa:** Script escrito para un path fijo y sin verificación del resultado de `copy`.
**Solucion:** Rutas relativas al script (`%~dp0..\database\mda.db` y destino hermano), `exit /b 1` si falta el origen o si `copy` falla, y el mensaje de éxito solo después de verificar.
**Regla:** Los scripts de ops deben resolverse desde su propia ubicación y fallar con código de salida distinto de 0: nunca informar éxito sin comprobar el resultado.
**Archivos afectados:** scripts/backup-db.bat

---

### 2026-09-29 — Const reordenada en frontmatter Astro rompe el SSR (TDZ) y el build no lo detecta

**Problema:** Al agregar el fallback de íconos, `src/pages/admin/recursos/enlace/create.astro` quedó con `const hasSavedIcon = iconExists(link.iconPath);` en la línea 18, antes de `let link = {...}` en la línea 23. La ruta `/admin/recursos/enlace/create` devolvía HTTP 500 con título de página "ReferenceError" (h1 = 0).
**Causa:** Temporal Dead Zone: `link` se referenciaba en el inicializador de una `const` declarada antes de su propio `let`. `npm run build` + `scripts/verify-build.mjs` terminan OK porque el error es de ejecución en SSR, no de compilación.
**Solucion:** Mover el `const hasSavedIcon = iconExists(link.iconPath);` debajo del bloque POST (después de toda mutación de `link`), reutilizando la variable más abajo. Semántica intacta: `link.iconPath` no se reasigna tras su declaración.
**Regla:** En frontmatter Astro, cualquier valor derivado debe declararse después de las variables que consume. El build y `verify-build.mjs` no detectan errores de runtime SSR: un TDZ o un `undefined` solo se ve con un smoke test por ruta (200 + h1 presente). Agregar la ruta nueva a un test E2E de rutas.
**Archivos afectados:** src/pages/admin/recursos/enlace/create.astro, tests/ui/elementos-rotos-regression.spec.ts

---

### 2026-09-29 — Quitar una clase DaisyUI v4 puede romper hooks JS que la usaban como selector

**Problema:** Al purgar las clases muertas de DaisyUI v4 quedó un campo de formulario sin su hook de JS: el contenedor había perdido la clase que el script usaba para identificar la fila, y las validaciones de ese campo dejaron de disparar.
**Causa:** El JS hacía `input.closest(".form-control")` (u otra clase del markup viejo) como ancla; la clase era "invisible" para el CSS pero funcionalmente era un selector.
**Solucion:** Reemplazar la dependencia de clase por un atributo de datos explícito (`<div class="sm:col-span-2" data-field>` + `input.closest("[data-field]")`), inmune a futuros cambios de clase.
**Regla:** Antes de borrar una clase del markup, hacer grep de la clase en `src/**/*.ts`/`*.tsx`/`.astro` como selector (`closest(`, `querySelector`, `classList`). Los hooks de DOM deben anclarse a atributos `data-*`, no a clases de estilo.
**Archivos afectados:** src/components/supervision/calidad/CalidadContent.astro

---

### 2026-09-29 — Builds concurrentes corrompen `dist/` aunque `verify-build` pase

**Problema:** Durante la ejecución de tareas en paralelo, `dist/` quedó inconsistente: el server crasheaba con `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...dist\server\chunks\index_DXRJYlsl.mjs' imported from '...dist\server\chunks\server_DeMlMPoP.mjs'`.
**Causa:** Dos `npm run build` solapados escribieron `dist/` a la vez; el segundo build mezcló chunks del primero. `scripts/verify-build.mjs` validó `rootDir` (OK) pero no la integridad del grafo de chunks.
**Solucion:** `npx astro preview stop`, borrar/rehacer un único `npm run build` limpio (32 `index_*.mjs` presentes) y volver a levantar.
**Regla:** Nunca correr dos builds en paralelo sobre el mismo `dist/`. `verify-build.mjs` es un guard parcial (rootDir), no una validación de integridad: si el server arranca con `ERR_MODULE_NOT_FOUND` sobre un chunk, es síntoma de build solapado → rebuild limpio.
**Archivos afectados:** dist/server/chunks/*

---

### 2026-09-29 — Con adapter `mode:"middleware"` el entry de prod es `./server.mjs`, y `astro preview` no sirve `dist/client`

**Problema:** Al intentar validar el export a PNG contra el build de producción, `node dist/server/entry.mjs` salía con código 0 sin imprimir nada, y `astro preview` devolvía `200 text/html` para todos los `/_astro/*.{css,js,woff2}` (el fallback SSR en vez del archivo estático).
**Causa:** Dos hechos del setup: (1) `@astrojs/node` está en `mode: "middleware"`, así que `dist/server/entry.mjs` es un módulo export, no un servidor; el entry real es `./server.mjs` de la raíz (lo que corre PM2 en `ecosystem.config.cjs`). (2) El daemon de `astro preview` no resolvió el handler estático de `dist/client` en esta máquina.
**Solucion:** Para validar prod local: levantar `node server.mjs` con `HOST`/`PORT` (validar que el puerto esté libre). Para assets estáticos, verificar contra `dist/client/_astro` directamente o contra el server real, no contra `astro preview`.
**Regla:** Con adapter `mode:"middleware"`, no ejecutar `dist/server/entry.mjs` como servidor: el entry es `./server.mjs`. No usar `astro preview` como referencia de que los assets estáticos funcionan; validar contra el server de PM2 o `dist/client`.
**Archivos afectados:** astro.config.mjs, server.mjs, ecosystem.config.cjs

---

### 2026-09-29 — Un error de import dinámico dev-only (Vite) no siempre es un bug del feature

**Problema:** El visor del cronograma mostraba en consola `Failed to preload html-to-image: TypeError: Failed to fetch dynamically imported module`, y se asumió que el export a imagen estaba roto en producción.
**Causa:** El dev server de Vite servía un 504 de dependencia optimizada fuera de fecha (dep-optimize). No era un problema del código: el build emitía el warning `[INEFFECTIVE_DYNAMIC_IMPORT]` porque `exporters.ts` se importa también estáticamente por `copyButton.ts`, así que el módulo queda inlinado en el mismo chunk.
**Solucion:** Verificar contra el bundle real: grep de la firma `html-to-image` en `dist/client/_astro/*.js` → está presente en `CronogramaDashboard.astro_astro_type_script_index_0_lang.BL03K4Fl.js`. Feature OK; sin cambios de código.
**Regla:** Antes de "arreglar" un error dev-only de import dinámico/preload, confirmar el feature contra el bundle de producción (`dist/client/_astro`). Un warning `INEFFECTIVE_DYNAMIC_IMPORT` explica que el módulo no tiene chunk propio y viaja en el chunk del importador.
**Archivos afectados:** src/components/cronograma/lib/exporters.ts, src/components/cronograma/lib/dashboard-client.ts

---

### 2026-09-29 — `Start-Process` + `Start-Sleep` en el mismo comando mata el dev server; y `PORT` no propaga

**Problema:** Al arrancar procesos en segundo plano con `Start-Process` seguido de `Start-Sleep` en el mismo comando, el dev server moría; y arrancar `node server.mjs` con `$env:PORT` terminó ocupando el `4321` del dev server (el env var no llegó al hijo), dejando el entorno contaminado.
**Causa:** El timeout del tool mata el árbol de procesos del comando, incluyendo el hijo lanzado con `Start-Process`. `Start-Process` no hereda de forma fiable las variables de entorno fijadas con `$env:` en la misma sesión de PowerShell.
**Solucion:** Lanzar el dev server detached en su **propio** comando: `Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx astro dev --port 4321 > ... 2>&1" -WorkingDirectory <repo> -WindowStyle Hidden`, y verificar en un **segundo** comando. Para propagar env vars, pasar el entorno explícito (`psi.EnvironmentVariables`) o un `cmd /c "set PORT=... && node ..."` (PowerShell 5.1 no soporta `&&`).

**Dos trampas adicionales, descubiertas el 2026-10-06 al correr la suite E2E en un puerto libre:**

1. El **destino del redirect va entre comillas**: `> "%TEMP%\astro.log" 2>&1`. Sin las comillas, si la ruta tiene un espacio (en esta máquina `%TEMP%` tiene uno), `cmd` corta la ruta y el comando muere sin dejar error.
2. **PowerShell 5.1 rechaza `cmd /c` posicional dentro de `Start-Process`** (`No se encuentra ningún parámetro de posición`). Hay que pasar `-ArgumentList "/c","..."` con el `/c` dentro del arreglo de argumentos; `cmd /c "…"` a secas o con el operador de llamada `&` sí funcionan, la trampa es del `-ArgumentList`.

**Regla:** Nunca combinar `Start-Process` con `Start-Sleep` en un mismo comando para un servidor de larga vida: el timeout del tool se lleva el proceso. Antes de arrancar, **verificar qué puerto está libre**: `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 4321,4322 } | Select-Object LocalPort,OwningProcess` — en esta máquina el 4321 lo ocupa a veces otro proyecto local (`seguimiento-gimnasio`), y hasta la mañana del 2026-10-06, 28 asserts de `tests/admin/rbac.spec.ts` comparaban contra el puerto literal, así que correr la suite en un puerto alternativo no producía una señal válida.
**Regla (limpieza):** al terminar, **matar solo el proceso verificado**: leer el `CommandLine` con `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` y confirmar que corresponde a este repo y a este puerto antes del `Stop-Process`, o correr `npx astro dev stop` con el mismo `-WorkingDirectory` (Astro 7 lo soporta). Un `Stop-Process` sin verificar puede tumbar el dev server de otro proyecto local que comparte la máquina.
**Archivos afectados:** —

### 2026-09-28 - Los endpoints de filtro de InvGate ignoran parametros en silencio (causa del timeout al crear ticket de agentes)

**Problema:** Al hacer clic en "Crear Ticket" (oficinas de tipo TELEGRAFIA) la verificacion de duplicados tardaba ~32s y Terminaba en timeout. El endpoint `GET /api/offices/check-agents-ticket` recorria el set global de tickets abiertos de InvGate (status 2-5 = 3791 tickets, ~5MB de JSON) paginando `incidents.by.status` de a 200 y luego bajando los objetos completos con `incidents?ids[]` en chunks de 500.
**Causa:** Tres trampas de la API, todas silenciosas (no dan error, devuelven 200 con datos sin filtrar):

- `incidents.by.status` **ignora `location_id` y `status_ids[]` combinado**: `?status_ids[]=2&3&4&5&limit=200&location_id=6109` devuelve `total: 3791`, identico a la request sin `location_id`. El "fast path" por location era dead code: hacia el mismo escaneo global.
- Requests de 500 ids a `incidents?ids[]` tardan ~10.5s y tocan el abort de 15s de `invgateRequest` (`src/lib/invgateClient.ts:18`) -> `!ok` -> "No se pudieron obtener los detalles de los tickets." Con chunks de 200 la misma llamada baja a ~1.7-3.4s.
- Solo 25 de 3791 tickets (0.66%) coincidian con las categorias 257/2625 o el regex de titulo. 99.3% de los bytes descargados se descartaba.
- `incidents.by.helpdesk?helpdesk_id=X&limit=500` es el unico eje que **si** acota: devuelve el nodo entero en una llamada (0.25-0.9s), pero ignora `limit`/`page_key`/`location_id`/`status_ids[]`, solo cubre estados 1-4 (el 5/Cerrado nunca aparece) y **devuelve sets truncados si se llama en paralelo** (6 workers sobre 141 nodos devolvieron <=29 ids donde en serie eran 63, perdiendo los tickets buscados).
  **Solucion:** Reescribi la consulta como "nodos chicos + detalle": resolver el `location_id` desde la DB local (`office_invgate_links`), llamar `incidents.by.helpdesk` **secuencialmente** por cada nodo de la jerarquia telegrafia (2510, 5995, 5994), unir los IDs y bajar los objetos completos con `incidents?ids[]` en chunks de 200. Cache en memoria de 60s keyed por `location_id` + dedupe de requests concurrentes. Cliente: `AbortController` de 30s en el fetch de duplicados con toast propio. Resultado medido: 3.5-5.6s en frio, 79-320ms con cache caliente (antes ~32s y error).
  **Regla:** En InvGate, ningun endpoint de listado acepta un filtro y lo ignora en silencio, asi que **verificar siempre el `total` devuelto contra el esperado antes de confiar en el filtro**. Para acortar el set de candidatos priorizar el eje `incidents.by.helpdesk` (nodo) por sobre `by.status` (global). `by.helpdesk` solo esta completo si se llama en serie. Los chunks de `incidents?ids[]` deben ir de <=200 ids para no cruzar el timeout de 15s.
  **Decision de negocio:** el chequeo de duplicados ahora considera **solo estados abiertos (1-4)**; un ticket ya Cerrado no bloquea la creacion. Esto se explicita en el modal ("Solo se consideran tickets abiertos. Los ya cerrados no bloquean la creacion.").
  **Archivos afectados:** src/lib/agentsTicketDuplicates.ts, src/pages/api/offices/check-agents-ticket.ts, src/lib/telegrafiaTicket.ts, src/components/offices/AgentsTicketModal.astro, tests/offices/agents-ticket-duplicate-check.spec.ts, .agents/skills/invgate-api-requests/SKILL.md, .agents/skills/invgate-api-requests/endpoints-reference.md

---

### 2026-09-28 - Los botones DaisyUI no pueden cambiar de label al hacer loading (CLS)

**Problema:** Al verificar duplicados, el boton "Verificar y crear" (oficinas TELEGRAFIA) cambiaba de tamano mientras consultaba InvGate: el handler hacia `btn.innerHTML = '<span class="loading ..."></span> Verificando...'`. Medido en el E2E: la caja del boton pasaba de **169px a 148px de ancho**, y como el boton es `flex-1` entre 3 (Cancelar / Crear sin verificar / Verificar y crear), el hermano `flex-1` se compensaba y toda la barra de acciones saltaba. En mobile el problema era peor: el label "Verificando..." no entra en el ancho repartido y envuelve a 2 lineas, asi que el boton crecia de alto.
**Causa:** El texto del label es parte de la caja del boton. Cambiarlo durante el loading cambia sus metricas intrinsecas; y con `flex: 1 1 0%` el `min-width: auto` de un flex item tambien depende del min-content del texto. Los dos efectos son layout shift (CLS) y ningun breakpoint los evita.
**Solucion:** El label y el spinner se apilan en la **misma celda de un grid** (`<span data-btn-content class="grid place-items-center">`, los dos con `col-start-1 row-start-1`) y se cruzan por `opacity` en vez de uno al lado del otro. Consecuencias: (a) ninguno de los dos entra ni sale del flujo, asi que la caja del boton es identica en los dos estados sin `min-width` magico ni medicion por JS; (b) la celda la dimensiona el label, que es mas ancho que el spinner, asi que **en idle no queda ningun hueco reservado**; (c) el label nunca se borra, ni en loading, asi que el nombre accesible del boton es estable y se comunica el estado con `aria-busy` (ademas el boton se deshabilita durante la operacion). La transicion es `duration-150` con `motion-reduce:transition-none`. La misma estructura se aplico a `#confirm-create-ticket-btn`, que ademas cambia de label entre "Crear Ticket" y "Crear de todos modos": su texto vive en un `<span data-btn-label>` que se actualiza con `textContent` (nunca `innerHTML`, que borraria el spinner).
**Intento descartado (y por que):** reservar el ancho con un slot de spinner siempre visible (`invisible`/`visibility`) evita el CLS pero deja un hueco vacio al lado del label en el boton que no esta trabajando: el espacio se ve, solo que en lugar de con un spinner tiene nada. Se midio: **28px de ancho reservado** en `#confirm-agents-ticket-btn`. Ademas `invisible` no se puede transicionar, asi que no hay crossfade.
**Regla:** En un boton DaisyUI el loading **reemplaza** al label, no se suma al lado: apilalos en la misma celda de grid y cruzalos por `opacity`. El loading no puede agregar ni quitar texto (cambiar el texto muta las metricas intrinsecas del boton y, con `flex-1`, desplaza a los hermanos). Si el label tiene que cambiar por semantica (no por loading), va en un span propio y se actualiza con `textContent`. Al testear un boton con loading hay que cubrir **dos** propiedades: (1) caja bilateral estable (`abs(despues - antes) <= 1px`; una comparacion unilateral del tipo "solo que no crezca" deja pasar el caso real, que aqui era un encogimiento de 21px) y (2) `ancho(data-btn-content) - ancho(data-btn-label) <= 1px` en idle, que es lo que detecta el hueco reservado (un `flex` con `gap` en vez de grid lo rompe). Ojo: sacar las clases `col-start-1 row-start-1` sin cambiar el contenedor **no** reproduce el fallo, porque el spinner cae a la fila de abajo y el ancho no cambia. Para poder observar el estado busy sin esperar a InvGate, el spec estira la respuesta con `page.route(...CHECK_ENDPOINT...)` + `route.continue()`; las opacidades se afirman con `toHaveCSS("opacity", ...)`, no con `toBeVisible()`, porque Playwright considera visible a un elemento con `opacity: 0`.
**Archivos afectados:** src/components/offices/AgentsTicketModal.astro, tests/offices/agents-ticket-duplicate-check.spec.ts
---

### 2026-09-21 — HTTPS detrás de proxy: adapter en modo middleware ignora X-Forwarded-Proto

**Problema:** Al habilitar TLS en Apache (redirect 80→443 + proxy a Astro) aparecían dos fallas silenciosas: (1) los self-fetch server-side a `Astro.url.origin` (`UbicacionesContent.astro`, `rows.astro`) habrían salido por Apache en http y fallado la validación TLS de Node contra la CA corporativa; (2) la cookie de sesión quedaba sin flag `Secure` (hardcodeado `false`).
**Causa:** `@astrojs/node` 11.x en modo `middleware` construye el Request tomando el protocolo solo de `req.socket.encrypted` (`astro/dist/core/app/node.js`), ignorando `X-Forwarded-Proto`. Detrás del proxy el socket es HTTP → `Astro.url.origin` = `http://`. Además el flag `Secure` no era configurable y `import.meta.env` (build-time) podía pisar el env de runtime de PM2.
**Solucion:** Helper `getInternalOrigin()` (`@lib/internalOrigin`): `INTERNAL_ORIGIN` o default `http://127.0.0.1:${PORT||4321}` para self-fetch directo a Express; `SESSION_COOKIE_SECURE` con runtime-first (`process.env` || `import.meta.env`) seteados en `ecosystem.config.cjs`; `site` a `https://mda.correo.local`; runbook de Apache 443 en `docs/deploy-produccion.md` §5.3.
**Regla:** En modo middleware detrás de un proxy TLS no confiar en `Astro.url.origin`/`protocol` para self-fetch: ir directo al loopback. Los flags de seguridad por env deben priorizar runtime (`process.env`) sobre build-time (`import.meta.env`) para poder cambiarse sin rebuild. Material de certificados nunca al repo.
**Archivos afectados:** src/lib/internalOrigin.ts, src/lib/session.ts, src/components/admin/invgate/UbicacionesContent.astro, src/pages/api/invgate/locations/rows.astro, astro.config.mjs, ecosystem.config.cjs, docs/deploy-produccion.md, .env.example, .gitignore, AGENTS.md

---

### 2026-09-30 — `html-to-image` volcó ~17 KB de estilos por nodo: SVG de 101 MB imposible de decodificar

**Problema:** Los 3 botones de imagen del cronograma fallaban: el "Exportar Imagen (PNG)" mostraba "Hubo un error al generar la imagen" y no bajaba nada; los botones de copia podían devolver una imagen en blanco. La consola mostraba `Error generating image: [object Event]`.
**Causa:** `html-to-image` construye un `data:image/svg+xml` con el estilo computado COMPLETO de cada nodo (~17.5 KB por nodo: Chrome expone ~340 propiedades). La tabla mensual (~2.900 nodos) serializaba **101.065.860 chars (~101 MB)**; Chrome no decodifica un data URL de ese tamaño y el `<img>` interno falla con un `Event`. `skipFonts: true` solo ahorraba ~40 KB: el problema es el volumen de estilos, no las fuentes. Medido con una sesión real en dev: los dos botones de copia chicos funcionaban (SVG 2.7-3.0 MB) pero escalan igual con más datos.
**Solucion:** El export mensual se renderiza server-side: `GET /api/cronograma/export.png?month=YYYY-MM` construye un SVG determinístico con `buildCronogramaSvg` (`src/components/cronograma/lib/exportSvg.ts`, función pura) y lo rasteriza con `@resvg/resvg-js` (fuentes del sistema). El cliente descarga el blob. Los botones de copia siguen con `html-to-image` pero capturando la clase `exporting-image` en el CLON, no en la card visible (el parpadeo era esa mutación del DOM vivo).
**Regla:** `html-to-image` no sirve para capturar DOM grande: su costo es lineal en nodos (≈17 KB de estilos por nodo) y Chrome corta el data URL mucho antes de que termine. Para capturas grandes o de un mes completo, renderizar server-side desde los datos. Todo builder de SVG/imagen debe tener un test de tamaño máximo (el unit test exige < 400 KB para 40 operadores × 31 días).
**Archivos afectados:** src/components/cronograma/lib/exportSvg.ts, src/pages/api/cronograma/export.png.ts, src/components/cronograma/lib/exporters.ts, src/components/cronograma/lib/dashboard-client.ts, src/components/cronograma/CronogramaDashboard.astro, tests/unit/cronograma-export-svg.test.ts, tests/cronograma/export-image.spec.ts

---

### 2026-09-30 — Cambiar `astro.config.mjs` con el dev server vivo deja deps optimizadas obsoletas

**Problema:** Tras agregar `vite.ssr.external` en `astro.config.mjs`, el flujo de copiar imagen falló en dev con `504 (Outdated Optimize Dep)` sobre URLs `.../node_modules/.vite/deps/*.js?v=...`, y el import dinámico de `html-to-image` lanzó `TypeError: Failed to fetch dynamically imported module`. Un test E2E falló por este motivo y no por el código.
**Causa:** Vite pre-bundlea dependencias en `node_modules/.vite`; si la config de Vite cambia mientras el server corre, los `?v=` hashes quedan viejos y no se regeneran solos.
**Solucion:** Reiniciar el dev server; si persiste, borrar `node_modules/.vite` antes de relanzarlo.
**Regla:** Después de tocar `astro.config.mjs` (config de Vite) o instalar/quitar dependencias, reiniciar el dev server (o borrar `node_modules/.vite`). Un `504` + import dinámico roto en dev casi siempre es esto, no el código.
**Archivos afectados:** astro.config.mjs

---

### 2026-09-30 — Un spec Playwright sin `dotenv/config` pasa vacíamente (cookie no valida → `/login`)

**Problema:** Un spec E2E nuevo que usa `tests/helpers/auth.ts` reportó 12/12 verde cuando el plan preveía 4 fallos. Ninguna aserción se estaba ejercitando sobre la ruta real: todas redirigían a `/login`.
**Causa:** faltaba `import "dotenv/config";` al inicio del spec. Sin esa línea, `process.env.SESSION_SECRET` es `undefined` en el proceso de Playwright, `signSessionId()` firma con el fallback `"fallback-secret-do-not-use-in-prod"`, que no coincide con el `SESSION_SECRET` que el dev server lee de `.env`. El middleware rechaza la cookie, redirige a `/login`, y en `/login` las aserciones (pocos elementos, un `h1`) se cumplen por vacuidad.
**Solucion:** agregar `import "dotenv/config";` y, en el cuerpo del test, `expect(new URL(page.url()).pathname).toBe(route)` después del `goto`, para que el redirect falle de inmediato en vez de producir un falso positivo.
**Regla:** Todo spec E2E que use `tests/helpers/auth.ts` debe (1) importar `dotenv/config` y (2) verificar el pathname tras navegar. Un test que "pasa" cuando debería fallar probablemente corre sobre `/login` (sesión no autenticada), no sobre la ruta objetivo.
**Archivos afectados:** tests/helpers/auth.ts, tests/ui/*.spec.ts

---

### 2026-10-01 — Dos escalas de z-index conviviendo: los overlays de `/titulos` quedaron por debajo del header

**Problema:** El panel lateral que abre "Ver más" en `/titulos` se desplegaba tapado por debajo del header. El modal de edición (`z-40`) y el de confirmación de borrado (`z-50`) tenían el mismo defecto, aunque todavía no se había reportado.
**Causa:** Conviven dos escalas de capas. El layout creció hasta `z-[150]` (navbar sticky), `z-[160]` (sidebar), `z-200` (modales de la app) y `z-[250]` (toasts), pero los overlays de `src/components/titulos/**` quedaron en la escala vieja `z-40`/`z-50`, escrita antes de que el header tuviera z-index alto. Al ser el header `sticky` y `z-[150]`, cualquier panel con `z < 150` pinta físicamente por debajo.
**Solucion:** Subir los overlays al tier de modal de la app: panel/form `z-200` y backdrop `z-[190]` (encima del sidebar `160`, debajo del panel). Verificación en vivo con `getComputedStyle().zIndex` + `document.elementFromPoint()` sobre la franja del header, más 2 tests E2E nuevos.
**Regla:** Capas fijas de este repo: contenido `z-0..z-50`, header `z-[150]`, sidebar `z-[160]`, overlays/paneles `z-[190]`/`z-200`, toasts `z-[250]`. Antes de agregar un elemento `fixed`/`sticky`, comparar su z contra `z-[150]`: si es menor, el header lo tapa. Toda regresión de capa se verifica con `elementFromPoint`, no a ojo.
**Archivos afectados:** src/components/titulos/TitleDrawer.tsx, src/components/titulos/TitleModal.tsx, src/components/titulos/TitleConfirmModal.tsx, src/layouts/_components/navbar.astro, tests/ui/elementos-rotos-regression.spec.ts

---

### 2026-10-01 — El self-fetch interno rompía la sesión: el fingerprint de User-Agent la borraba y el export daba 502

**Problema:** `GET /api/cronograma/export.png` devolvía 502 en uso real ("Hubo un error al generar la imagen") y, como efecto colateral, el usuario quedaba deslogueado. El log del dev server mostraba `[302] /api/cronograma` seguido de `[502] /api/cronograma/export.png`.
**Causa:** `computeFingerprint()` liga la sesión al sha256 del `User-Agent` (`src/lib/sessionFingerprint.ts`) y el middleware **elimina la sesión** y redirige a `/login` cuando no coincide (`src/middleware.ts:198-211`). El endpoint obtiene los datos con un self-fetch por loopback (`getInternalOrigin()`) que reenviaba **solo la cookie**; al llegar sin el UA del navegador (Node/undici), el fingerprint no coincidía, el middleware borraba la sesión, el self-fetch recibía 302 y el endpoint respondía 502. Los tests E2E no lo detectaban porque `tests/helpers/auth.ts` crea sesiones con `fingerprint = NULL` y `isFingerprintValid(null, ...)` siempre pasa: ningún test ejercitaba una sesión con fingerprint real.
**Solucion:** Helper `getInternalFetchHeaders(request)` en `src/lib/internalOrigin.ts` que reenvía `cookie` **+ `user-agent`**; usado por el endpoint de export y por los otros dos self-fetch (`admin/invgate/UbicacionesContent.astro`, `api/invgate/locations/rows.astro`), que tenían el mismo bug latente. Test E2E nuevo que setea `fingerprint = computeFingerprint(navigator.userAgent)` en la sesión de prueba (rojo antes, verde después) y verifica que la sesión sigue viva tras exportar.
**Regla:** Todo self-fetch server-side por loopback debe usar `getInternalFetchHeaders(Astro.request)` (cookie + user-agent), no solo la cookie: el middleware invalida la sesión si el UA no coincide. Los tests que crean sesiones a mano deben setear el `fingerprint` para no pasar de largo este control. Un 502 de un endpoint con self-fetch + usuario deslogueado ⇒ sospechar del fingerprint.
**Archivos afectados:** src/lib/internalOrigin.ts, src/pages/api/cronograma/export.png.ts, src/components/admin/invgate/UbicacionesContent.astro, src/pages/api/invgate/locations/rows.astro, tests/cronograma/export-image.spec.ts

---

### 2026-10-02 — Assets hasheados de Astro no sirven en contenido guardado fuera de la app

**Problema:** El HTML de la firma institucional que se copiaba al portapapeles referenciaba el logo como `/_astro/firma.<hash>.png`. Las firmas ya guardadas en Outlook mostraban el logo roto: la URL cambia en cada build (hash de Vite), así que tras el siguiente deploy el archivo `/_astro/firma.<hash>.png` dejaba de existir.
**Causa:** Astro/Vite hashea los assets importados (`import logo from "@assets/firma.png"`), generando un nombre con hash que cambia por build. Cualquier contenido que el usuario guarda fuera de la app (la firma en Outlook, un HTML exportado) queda apuntando a una URL efímera.
**Solucion:** Mover el logo a `public/firma.png` (ruta fija, sin hash, servida por `express.static("dist/client")` antes del SSR) y armar la URL absoluta en el cliente con `new URL(getCleanBase() + "firma.png", window.location.origin)`. El HTML copiado usa esa URL absoluta estable.
**Regla:** Ningún contenido que el usuario guarde fuera de la app debe referenciar `/_astro/...` ni un asset importado: usar `public/` + URL absoluta estable. Ojo: `server.mjs` sirve `public/` con `immutable`/`maxAge: "1y"`, así que cambiar el logo requiere un nombre de archivo nuevo (ej. `firma-v2.png`) o servir ese archivo con `max-age=0, must-revalidate` (si no, los clientes no lo revalidan ni con recarga forzada).
**Archivos afectados:** public/firma.png, src/components/generador-firmas/SignatureGenerator.astro, src/pages/generador-firmas/index.astro, tests/generador-firmas/copy-signature.spec.ts

---

### 2026-10-02 — `astro dev` bloquea subrecursos cross-origin: el logo de la firma no se puede validar en desarrollo

**Problema:** Al copiar la firma visual y pegarla en Outlook durante el desarrollo, el logo aparecía roto, aunque `/firma.png` existía y respondía 200 en el navegador. El log de `npm run dev` mostraba: `[WARN] [router] Blocked cross-origin request to /firma.png (Sec-Fetch-Site: cross-site, Sec-Fetch-Mode: no-cors). Cross-origin subresource requests are not allowed on the dev server for security reasons.`
**Causa:** El cliente que pega (Outlook/WebView) pide el logo como subrecurso cross-site (`Sec-Fetch-Mode: no-cors`, con `Referer` externo). El router del **dev server** de Astro rechaza subrecursos cross-origin por seguridad. En producción el archivo lo sirve `express.static("dist/client")` (`server.mjs`) sin ese chequeo. Además el dev server puede escuchar solo en IPv6 (`[::1]:4321`): `http://127.0.0.1:4321` da ECONNREFUSED y algunos clientes (Outlook) resuelven `localhost` a IPv4.
**Solucion:** Validar la carga del logo con un build de producción (`npm run build` + `node -r dotenv/config server.mjs` con un `PORT` propio), no con `astro dev`. Verificado: con el server de producción la misma petición cross-site devuelve `200 image/png` y Outlook muestra el logo. Para pruebas locales con clientes externos, levantar el dev server con `--host 127.0.0.1`.
**Regla:** Ningún asset que un tercero (Outlook, un cliente de correo, otra app) deba bajar por URL se puede verificar en `astro dev`: el dev server bloquea subrecursos cross-origin y puede quedar IPv6-only. Probar en modo producción/preview.
**Archivos afectados:** public/firma.png, server.mjs, docs/lessons.md

---

### 2026-10-05 - Un miss en `/_astro/*` cae al handler SSR y responde HTML: el error de MIME `text/html`

**Problema:** En produccion (`https://mda.correo.local`) la consola del navegador reporto `Refused to apply style from 'https://mda.correo.local/_astro/BaseLayout.ZAHcvL_6.css' because its MIME type ('text/html') is not a supported stylesheet MIME type`, con la pagina sin estilos. El mismo mecanismo alcanza a cualquier `/_astro/*.js|*.woff2|*.svg`, no solo a los `.css`.
**Causa:** Dos fallas encadenadas. (1) **Desalineacion de `dist`**: el HTML que genera el proceso de Node en memoria referencia un hash de build que ya no existe en `dist/client/_astro`. El navegador pedia `BaseLayout.ZAHcvL_6.css`; en disco solo estaba `BaseLayout.4TrmIHSh.css`, que es la unica referencia que aparece en `dist/server/entry.mjs`. El hash `ZAHcvL_6` no existia en ningun lado del repo. La desalineacion se produce cuando se corre `npm run build` con PM2 vivo, o con dos builds simultaneos (mismo patron que la entrada del 2026-09-29). Evidencia adicional medida: `dist/server/entry.mjs` referenciaba 87 archivos de `_astro/` y **20 faltaban** en `dist/client` (chunks `.js` de `PasswordField`, `DataTable`, `MasterDetailTable`, `MultiSelectField`, `profile`, `aboutProjectModal`, etc.). (2) **`server.mjs` no tiene guarda para `/_astro/*`**: el orden es `express.static("dist/client")` y despues `app.use(ssrHandler)`, sin ninguna rama que corte el path. Un miss en el static cae al handler SSR de Astro, que responde la pagina 404 en HTML con `Content-Type: text/html`. Por eso un `.css` sale como `text/html`. La causa (2) es la que convierte un desalineo silencioso en un error de MIME imposible de diagnosticar desde el sintoma.
**Solucion:** Rebuild limpio con PM2 detenido antes (`pm2 kill` + `taskkill /F /IM node.exe`, borrar `dist/`, `npm run build`, `pm2 start ecosystem.config.cjs`), todo desde una **PowerShell elevada como Administrador**. `verify-build.mjs` **no** detecta esto: solo hace un regex de `rootDir` en el primer `.mjs` que lo contiene, asi que pasa en verde sobre un `dist` corrupto. Chequeo de integridad que hay que correr a mano: extraer los `_astro/<file>` de `dist/server/entry.mjs` y exigir que todos existan en `dist/client`.
**Regla:** Un `Content-Type` inesperado en un asset con hash (`.css`, `.js`, `.woff2`) no es un problema del asset: es un **404 disfrazado de HTML** porque el request cayo al SSR. El sintoma real es el desalineamiento de `dist`, y se diagnostica comparando los `_astro/` que referencia `dist/server/entry.mjs` contra los que existen en `dist/client/_astro` (esperado: 0 faltantes). Dos reglas de prevention: (a) **nunca** buildear con PM2 vivo, y nunca dos builds a la vez; (b) toda validacion de assets hasheados se hace contra `dist/client/_astro` o contra el server real de PM2, **nunca** contra `astro preview` (en `mode: "middleware"` no sirve `dist/client` y devuelve `200 text/html` para todo `/_astro/*`). El guard que falta: `verify-build.mjs` deberia validar el grafo de assets ademas de `rootDir`, y `server.mjs` deberia devolver `404` en vez de caer al SSR para `/_astro/*`.
**Archivos afectados:** server.mjs, scripts/verify-build.mjs, docs/deploy-produccion.md

---

### 2026-10-05 - PM2: `connect EPERM \\.\pipe\rpc.sock` cuando la consola no es Administrador

**Problema:** En el servidor, `pm2 stop all` fallo con `connect EPERM \\.\pipe\rpc.sock`, seguido de `[PM2] Spawning PM2 daemon with pm2_home=C:\Users\Otomasi\.pm2` y un `Unhandled 'error' event` con `errno: -4048, code: 'EPERM', syscall: 'connect'`. Ningun subcomando de PM2 respondia.
**Causa:** La consola desde la que se operaba **no estaba elevada como Administrador**. El stack lo dice: PM2 no encuentra el daemon, intenta spawnear uno nuevo, y el daemon nuevo tampoco puede abrir el named pipe. La ACL de `\\.\pipe\rpc.sock` no concede `connect` a un token sin admin. Causa secundaria posible: daemon muerto con un `rpc.sock` huerfano en `%USERPROFILE%\.pm2`. Es el mismo token de ADMIN que dispara el otro EPERM del repo (`npm install` con procesos Node vivos -> `EBUSY/EPERM` sobre `better-sqlite3.node`), pero en un recurso distinto.
**Solucion:** Ejecutar **toda** operacion de deploy y de PM2 desde una PowerShell elevada. Verificacion de elevacion antes de empezar: `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)` tiene que devolver `True`. Con admin: `pm2 kill` + `taskkill /F /IM node.exe`, borrar `%USERPROFILE%\.pm2\rpc.sock` huerfano, `npm run build`, `pm2 start ecosystem.config.cjs`, `pm2 save`. Borrar el archivo del pipe **no** resuelve el problema si la consola sigue sin admin.
**Regla:** **PowerShell como Administrador no es una recomendacion, es un requisito** para deploy, build y cualquier comando `pm2` en el servidor. Sin elevacion: `pm2` tira EPERM sobre el named pipe, `npm install` deja `node_modules` inconsistente si queda algun Node vivo, y `taskkill /F /IM node.exe` puede no alcanzar procesos de otro usuario. El daemon de PM2 debe arrancarse **una sola vez, desde la consola elevada del usuario real del servicio**, y operarse siempre desde una consola con la misma elevacion: daemon de SYSTEM (o de otro usuario) mas consola sin admin deja PM2 inutilizable. La tarea programada de Windows que corre `scripts/auto-deploy.bat` debe tener _Ejecutar con privilegios mas altos_ habilitado y "Iniciar en" apuntando a la **carpeta**, no al `.bat` (eso daba `ERROR_DIRECTORY` 0x10B). Con PM2 caido, Apache devuelve 503: es el sintoma esperado, revisar PM2 antes de sospechar del proxy.
**Archivos afectados:** scripts/auto-deploy.bat, ecosystem.config.cjs, docs/deploy-produccion.md

---

### 2026-10-05 - El backdrop de daisyUI necesita un `<button>` que ocupe toda la grilla: `sr-only` lo rompe en silencio

**Problema:** Ningun modal cerraba al hacer clic afuera. El `<form method="dialog" class="modal-backdrop">` estaba, y el clic nunca cerraba el `<dialog>`.
**Causa:** daisyUI 5 define `.modal-backdrop` como `{ color:#0000; z-index:-1; grid-row-start:1; grid-column-start:1; place-self:stretch stretch; display:grid }`. Todo el area del backdrop es el grid, y la unica forma de cerrarlo es que el `<button>` **interior sea el grid item que se estira a toda la celda**: el clic cae en el boton, y el boton sumbitea el `form method="dialog"`, que cierra el dialog. `Modal.astro` usaba `<button class="sr-only">`, y `sr-only` de Tailwind es `position:absolute; width:1px; height:1px; clip-path:...` -> el boton deja de estirarse, el clic cae en el `<form>`, y **un clic sobre un form no lo submite**: nada pasaba, sin error de consola. Ningun modal del repo lo delata porque todos usaban el mismo componente. El sintoma es "no hace nada", no un 500.
**Solucion:** Boton que llena la celda, con la etiqueta accessible adentro y **sin atributo `type`** (default `submit` dentro del form): `<button class="h-full w-full p-0"><span class="sr-only">Cerrar</span></button>`. No poner `type="submit"`: los specs existentes usan `modal.locator('button[type="submit"]')` señalar el submit real y el atributo explicito los vuelve strict-mode ambiguousos. Ademas `#create_office_modal` (`UbicacionesContent.astro`, `<dialog>` a mano sin `Modal.astro`) **no tenia backdrop**: le falto el form completo.
**Regla:** El cierre por clic-afuera de un `<dialog>` con daisyUI depende de un detalle de layout, no de JS: el `<button>` del backdrop tiene que ser un grid item estirado. Si se le pone cualquier clase que lo saque del flujo (`sr-only`, `absolute`, `hidden`, `w-px`), el backdrop **deja de cerrar y no rompe nada visiblemente**. Al agregar o revisar un `<dialog>`, la checklist es: (a) `<form method="dialog" class="modal-backdrop">` presente, (b) `<button>` interior sin `sr-only`/`absolute`, (c) sin `type="submit"` explicito para no chocar con selectores de submit, (d) un solo control de cierre por modal (X en el header + Cancelar duplican la accion). Verificar con E2E, no a ojo: `tests/ui/modal-close.spec.ts`.
**Archivos afectados:** src/components/ui/Modal.astro, src/components/admin/invgate/UbicacionesContent.astro, src/components/ui/ActionCancelButton.astro, src/components/ui/FormShell.astro, src/components/ui/modals/feedbackModal.astro, tests/ui/modal-close.spec.ts

---

### 2026-10-05 — `getServerEnv` (lectura dinámica de env) devuelve `""` en el build de producción

**Problema:** Al llevar la rama de automatizaciones/títulos al servidor, los datos cargaban pero los enlaces derivados de env quedaban vacíos: "Abrir en InvGate" se renderizaba como `<button disabled>` (o `<a href="">`), los nodos no mostraban su botón, y el `invgateBase` de `/titulos` quedaba vacío (link de KB roto). En `astro dev` funcionaba.
**Causa:** `getServerEnv(key)` (`src/lib/invgate/automation/env.ts`) leía **primero** `import.meta.env` con acceso **dinámico** (`import.meta.env[key]`). Vite/Rolldown solo inyecta en el objeto `import.meta.env` del bundle SSR las claves referenciadas **estáticamente** (`import.meta.env.X`); una lectura dinámica recibe un objeto vacío. El fallback `process.env[key]` tampoco servía: `server.mjs` no cargaba `.env` (no había `import "dotenv/config"`) y `ecosystem.config.cjs` no inyecta las `INVGATE_*`, así que `process.env` no tenía nada en runtime. En dev `import.meta.env` es un objeto vivo con todo el `.env`. El motor de la API (`invgateClient.getEnv`) sí tenía `INVGATE_BASE_URL`/`INVGATE_API_KEY` inyectadas en build (se referencian estáticamente en otros módulos), por eso la API respondía y solo fallaban los valores derivados: la asimetría "los datos llegan, los links no".
**Solucion:** (1) `server.mjs` importa `dotenv/config` como primera línea, para poblar `process.env` en runtime; (2) todos los helpers de env con lectura dinámica pasan a **runtime-first** (`process.env[key] || import.meta.env?.[key]`), el patrón ya usado por `SESSION_COOKIE_SECURE` (`src/lib/session.ts`): `src/lib/invgate/automation/env.ts`, `invgateClient.ts`, `invgate-qa-client.ts`, `wise-cx-client.ts` y `invgate/metrics.ts`. Verificado con `npx tsx` (con dotenv: `deriveInvGateUiUrl(12345)` devuelve la URL completa) y arrancando `node server.mjs` en un puerto propio (200).
**Regla:** Ningún helper de env de servidor debe leer `import.meta.env` dinámicamente como fuente primaria: o se lee una clave estática, o se usa runtime-first con `dotenv` cargado en `server.mjs`. `astro dev` no reproduce este bug; hay que validar en el build de producción. Toda rama que agregue un helper de env debe cargar `.env` en runtime, no depender de la inyección de build de Vite.
**Archivos afectados:** server.mjs, src/lib/invgate/automation/env.ts, src/lib/invgateClient.ts, src/lib/invgate-qa-client.ts, src/lib/wise-cx-client.ts, src/lib/invgate/metrics.ts

---

### 2026-10-09 - Delta de métricas: comparar cohortes con la MISMA definición, no creation vs close-date

**Problema:** Los badges de tendencia (↑↓) de `/automatizaciones/metricas` comparaban poblaciones distintas: el KPI actual ("Finalizadas", "Tiempo de ciclo", "Cumplimiento") se calculaba sobre la **cohorte por `created_at`**, pero el período anterior (`computePeriod`) filtraba por **fecha de cierre**. El delta podía dar resultados sin sentido (subir/bajar con datos que no son equivalentes).
**Causa:** Dos implementaciones de "período" con criterios distintos conviviendo. `computeAutomationMetrics` filtra `cohort = createdAt ∈ ventana` y deriva `finalized/leadTime/sla` de esa cohorte; `computePeriod` filtraba `!active && closedAt ∈ ventana`. Solo `created` era consistente.
**Solucion:** `computePeriod` arma la cohorte por `createdAt` y calcula `created/finalized/medianLeadDays/onTimeRate` sobre esa cohorte (misma semántica que el período actual). Se extrajeron helpers (`isOnTime`, `collectLeadDays`, `buildSla`) para no duplicar la lógica en tres lugares.
**Regla:** Cuando una métrica tiene "actual" y "anterior", ambas deben usar **la misma definición de período**. Si se elige cohorte por creación, el anterior también; mezclar ejes (creación vs cierre) produce deltas inválidos. Extraer el cálculo compartido a un helper para que no vuelvan a divergir.
**Archivos afectados:** src/lib/workflow/metrics.ts, tests/workflow-metrics.test.mjs

---

### 2026-10-09 - Tailwind `shadow-none` NO quita la sombra de un `.btn` de daisyUI (usar `--btn-shadow`/`--btn-inset`)

**Problema:** Los botones del toggle de vista y "Ver detalle" seguían mostrando sombra pese a tener `shadow-none`. El botón de `AccionConfirmButton`/`btn` de daisyUI calcula `box-shadow: var(--btn-inset) inset, var(--btn-shadow)`, y esa declaración vive en una capa (`@layer daisyui...`) que gana sobre la utilidad `shadow-none` de Tailwind.
**Causa:** Orden de capas: la utilidad `shadow-none` de Tailwind no pisa la `box-shadow` de daisyUI, que usa variables propias (`--btn-shadow`, `--btn-inset`) en vez del `box-shadow` "de usuario".
**Solucion:** Neutralizar las variables en una utilidad propia: `@utility acc-flat { --btn-shadow: 0 0 0 0 rgb(0 0 0 / 0); --btn-inset: 0 0 0 0 rgb(0 0 0 / 0); }` y aplicarla al botón.
**Regla:** Para quitar la sombra/borde interno de un `.btn` de daisyUI, no usar `shadow-none`: setear `--btn-shadow` y `--btn-inset` a cero. Vale para cualquier override de un estilo de daisyUI que use variables `--btn-*`.
**Archivos afectados:** src/styles/global.css, src/pages/automatizaciones/_components/AutomationCard.astro, src/pages/automatizaciones/_components/AutomatizacionesContent.astro

---

### 2026-10-09 - Tailwind v4: clases propias con variantes (`group-open:`, `hover:`) requieren `@utility`

**Problema:** Al querer aplicar el acento del módulo con variantes (`group-open:acc-surface`, `hover:acc-text`), una clase definida como CSS plano (`.acc-surface { … }`) **no** genera la variante: Tailwind solo prefija utilidades registradas.
**Causa:** Tailwind v4 genera variantes únicamente para `@utility`, no para selectores CSS arbitrarios.
**Solucion:** Definir las clases de acento con `@utility` (`@utility acc-surface { … }`) en `global.css`; así `group-open:acc-surface`, `hover:acc-text`, etc. se generan. Las variables de tema (`--acc-bg`/`--acc-fg`) se definen en una clase normal (`.acc` + `[data-theme="dark"] .acc`).
**Regla:** Si una clase propia necesita usarse con variantes de Tailwind (`hover:`, `group-open:`, `dark:`, responsive), declararla con `@utility`, no como selector plano.
**Archivos afectados:** src/styles/global.css

---

### 2026-10-12 — Un nombre de icono inexistente en `astro-icon` rompe el render, no el build

**Problema:** El island de estadísticas de oficinas y su página de detalle fallaban en runtime con `500` en la API y un body truncado `"An error occurred."` (HTTP 200) en el render, mientras `npx tsc --noEmit` y `npm run build` pasaban limpios y `[verify-build]` daba OK. El error no aparecía en la consola del shell donde corría `npm run dev`.
**Causa:** Dos KPI usaban nombres que no existen en `@iconify-json/boxicons`: `user-account` (Personal) y `error-circle` (Incidentes). `astro-icon` resuelve el icono **en el momento del render** contra el set instalado, así que el fallo es de runtime: ni el type-check ni el build lo ven porque el nombre viaja como string. En `astro dev` el error se pierde de la consola del proceso (el build de dev corre como daemon) y el síntoma en el navegador es una pagina rota con status 200, no un error explícito.
**Solución:** Reemplazar por nombres válidos verificados contra `node_modules/@iconify-json/boxicons/icons.json` (`user-account` → `user-circle`, `error-circle` → `bug-alt`). El diagnóstico salió de leer los logs del daemon con `npx astro dev logs` (JSON por línea), que sí muestra el stack del render. Quedó cubierto por `tests/oficinas-estadisticas.spec.ts` (11/11).
**Regla:** Todo `name` pasado a `<Icon>` tiene que existir en el set instalado; `tsc` y `astro build` **no** lo validan, solo el render. Antes de dar por buena una pantalla con iconos nuevos, verificar cada nombre contra `@iconify-json/boxicons/icons.json` y cubrirla con un E2E que cargue la pagina (un test que solo mira `status` pasa igual: el render roto sale `200`). En `astro dev`, los errores de render **no** se ven en la consola del shell: se leen con `npx astro dev logs`.
**Archivos afectados:** src/components/offices/stats/OficinasEstadisticasContent.astro, src/components/offices/stats/OficinaDetalleContent.astro, tests/oficinas-estadisticas.spec.ts
