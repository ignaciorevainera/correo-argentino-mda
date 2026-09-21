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
