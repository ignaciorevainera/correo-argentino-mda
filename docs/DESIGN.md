# DESIGN

Generado el 2026-04-10. Ultima actualizacion: 2026-07-06.

## Stack

- Framework: Astro v6 (output: `server` / SSR) con adaptador `@astrojs/node` standalone
- Estilos: Tailwind CSS v4 + DaisyUI v5
- Tipografia: `Geist Variable` (Sans) + `Geist Mono Variable` (Mono) via Fontsource
- Iconos: `astro-icon` con Boxicons (`@iconify-json/boxicons`)
- Interactividad: React islands con `@astrojs/react`, `theme-change` para toggle de tema
- Base de datos: SQLite con Drizzle ORM + `better-sqlite3`
- Autenticacion: Sesion cookie-based HMAC + RBAC (5 roles: agent, referent, team_leader, supervisor, admin)
- Deploy: Node standalone con PM2 (3 procesos: Astro SSR, ping-worker, sync-legacy-inventory)

## Contexto de producto

- Producto: Portal de la Mesa de Ayuda Interna.
- Objetivo principal: centralizar y agilizar tareas de operadores N1/N2
  para tipificacion de tickets, busqueda de personal, monitoreo de
  terminales y gestion de carga laboral.
- Dominio de uso: soporte corporativo logistico y postal.

## Tema activo

- Tema base activo: `light`
- Modo oscuro: disponible por toggle manual con persistencia en localStorage
- Selector global: boton ghost en Header que alterna light/dark
- Direccion visual: minimalista, utilitaria y de lectura rapida, orientada a productividad interna

## Paleta oficial

### Base institucional y lineas reservadas (HEX/HSL)

| Rol        | Nombre            | HEX     | HSL               | Uso                                                             |
| ---------- | ----------------- | ------- | ----------------- | --------------------------------------------------------------- |
| primary    | school-bus-yellow | #ffc72c | hsl(44 100% 59%)  | Color de marca para CTA principal y foco visual primario        |
| secondary  | steel-azure       | #254888 | hsl(219 57% 34%)  | Color institucional para acciones secundarias y navegacion      |
| logistica  | charcoal          | #54585a | hsl(200 3% 34%)   | Color reservado para etiquetas/elementos de la linea logistica  |
| financiero | forest-green      | #009639 | hsl(143 100% 29%) | Color reservado para etiquetas/elementos de la linea financiera |
| postal     | brown-red         | #a4343a | hsl(357 52% 42%)  | Color reservado para etiquetas/elementos de la linea postal     |

### Neutrales para fondos y texto (HEX/HSL)

| Token        | Nombre   | HEX     | HSL           | Uso                                           |
| ------------ | -------- | ------- | ------------- | --------------------------------------------- |
| neutral/base | platinum | #efefef | hsl(0 0% 94%) | Fondo base y superficies neutras              |
| base-content | onyx     | #0c0c0c | hsl(0 0% 5%)  | Texto principal y contenido de alto contraste |

### Mapeo activo de tokens DaisyUI

| Token DaisyUI | Valor final                                                                           | Regla de uso                                                                       |
| ------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| primary       | school-bus-yellow base (#ffc72c)                                                      | Siempre color principal de marca                                                   |
| secondary     | steel-azure base (#254888)                                                            | Siempre color secundario institucional                                             |
| accent        | #3a6ea5                                                                               | Apoyo visual y destacados, similar al eje azul pero distinto de colores reservados |
| neutral       | light: #4a4d4f / #f2f2f3 (neutral-content), dark: #cacdce / #191a1a (neutral-content) | Superficies y estados no criticos; complementario de base-\*                       |
| info          | #2879a8                                                                               | Estado informativo, similar a institucional sin reutilizar secondary               |
| success       | #068444                                                                               | Estado de exito, similar a financiero sin reutilizar forest-green reservado        |
| warning       | #e2ad1f                                                                               | Estado de advertencia, similar al rango amarillo sin reutilizar primary            |
| error         | #b3474d                                                                               | Estado de error, similar a postal sin reutilizar brown-red reservado               |

Nota: `base-100` y `base-content` se mantienen anclados a platinum/onyx por tema (light: #efefef/#0c0c0c, dark: #191a1a/#efefef). `neutral` y `neutral-content` son complementarios y no reemplazan el fondo/texto base.

### Escalas 50-950 exactas por familia

#### school-bus-yellow

| Escala | HEX     |
| ------ | ------- |
| 50     | #fff8e5 |
| 100    | #fff1cc |
| 200    | #ffe499 |
| 300    | #ffd666 |
| 400    | #ffc933 |
| 500    | #ffbb00 |
| 600    | #cc9600 |
| 700    | #997000 |
| 800    | #664b00 |
| 900    | #332500 |
| 950    | #241a00 |

#### steel-azure

| Escala | HEX     |
| ------ | ------- |
| 50     | #ebf0fa |
| 100    | #d7e1f4 |
| 200    | #afc3e9 |
| 300    | #87a5de |
| 400    | #5f88d3 |
| 500    | #376ac8 |
| 600    | #2c55a0 |
| 700    | #213f78 |
| 800    | #162a50 |
| 900    | #0b1528 |
| 950    | #080f1c |

#### forest-green

| Escala | HEX     |
| ------ | ------- |
| 50     | #e5ffef |
| 100    | #ccffe0 |
| 200    | #99ffc0 |
| 300    | #66ffa1 |
| 400    | #33ff81 |
| 500    | #00ff62 |
| 600    | #00cc4e |
| 700    | #00993b |
| 800    | #006627 |
| 900    | #003314 |
| 950    | #00240e |

#### charcoal

| Escala | HEX     |
| ------ | ------- |
| 50     | #f2f2f3 |
| 100    | #e5e6e6 |
| 200    | #cacdce |
| 300    | #b0b3b5 |
| 400    | #969a9c |
| 500    | #7c8183 |
| 600    | #636769 |
| 700    | #4a4d4f |
| 800    | #313435 |
| 900    | #191a1a |
| 950    | #111212 |

#### brown-red

| Escala | HEX     |
| ------ | ------- |
| 50     | #f9ecec |
| 100    | #f3d8da |
| 200    | #e7b1b4 |
| 300    | #da8b8f |
| 400    | #ce6469 |
| 500    | #c23d44 |
| 600    | #9b3136 |
| 700    | #742529 |
| 800    | #4e181b |
| 900    | #270c0e |
| 950    | #1b0909 |

### Nota explicita de convivencia: base institucional vs escala 50-950

Los valores base institucionales y las escalas 50-950 conviven con roles distintos.

| Familia           | Base institucional (fija) | Escala 500 (fuente oficial) |
| ----------------- | ------------------------- | --------------------------- |
| school-bus-yellow | #ffc72c                   | #ffbb00                     |
| steel-azure       | #254888                   | #376ac8                     |
| forest-green      | #009639                   | #00ff62                     |
| charcoal          | #54585a                   | #7c8183                     |
| brown-red         | #a4343a                   | #c23d44                     |

Resolucion aplicada en codigo:

1. Los tokens semanticos DaisyUI `primary` y `secondary` usan siempre la base institucional fija.
2. Las variables `--color-*-50` a `--color-*-950` usan exactamente la escala oficial del usuario.
3. Las lineas reservadas (`institucional`, `postal`, `financiero`, `logistica`) siguen ancladas a sus bases institucionales.

### Reglas de uso para evitar ambiguedades

1. Los colores de linea (`institucional`, `postal`, `financiero`, `logistica`) son reservados para clasificacion de negocio (badges, tags, filtros y chips por area), no para estados semanticos.
2. Los estados semanticos (`info`, `success`, `warning`, `error`, `neutral`) se usan solo para feedback de sistema, alertas y validaciones; deben ser similares al lenguaje visual de marca pero nunca iguales a un color reservado.
3. `primary` queda fijado en school-bus-yellow y `secondary` en steel-azure para todo el producto; no se intercambian por contexto de pagina.
4. `accent` se usa para apoyo visual y enfasis secundario (links destacados, iconografia o fondos de apoyo), nunca para reemplazar `primary` ni para estados.
5. En componentes, se consumen tokens semanticos DaisyUI o variables de `@theme`; no se hardcodean HEX dentro del markup.

## Mini guia de implementacion de tokens (DaisyUI)

### Regla rapida para elegir token

- `primary`: accion principal de la pantalla o del bloque (un foco principal por contexto).
- `secondary`: accion alternativa o de segundo orden, sin competir con `primary`.
- `accent`: enfasis visual complementario (apoyo, destacado leve o identificacion visual no critica).
- `info`, `success`, `warning`, `error`: feedback semantico del sistema (estado, validacion y resultado).
- Regla transversal: no mezclar colores reservados de linea (`institucional`, `postal`, `financiero`, `logistica`) con estados semanticos.

### 1) Boton (`btn`)

Uso recomendado:

- Usar `btn btn-primary` para la accion principal: guardar, confirmar, crear.
- Usar `btn btn-secondary` para acciones alternativas: volver, cancelar, cerrar.
- Usar `btn btn-accent` para acciones de apoyo: ver detalle, abrir ayuda, acciones no prioritarias.
- Reservar `btn-info`, `btn-success`, `btn-warning`, `btn-error` para acciones estrictamente ligadas a estado del sistema (casos puntuales).

Snippet listo para copiar:

```html
<div class="flex flex-wrap gap-2">
  <button class="btn btn-primary">Guardar cambios</button>
  <button class="btn btn-secondary">Volver</button>
  <button class="btn btn-accent">Ver ayuda</button>
</div>
```

Anti-patron:

- No usar `btn-error` o `btn-warning` como CTA principal de una pantalla sin relacion directa con un estado semantico.

### 2) Badge (`badge`)

Uso recomendado:

- Usar `badge-primary`, `badge-secondary` y `badge-accent` para clasificacion visual o contexto de contenido.
- Usar `badge-info`, `badge-success`, `badge-warning`, `badge-error` para representar estado de un item o proceso.
- En listados mixtos, mantener consistente la semantica: un mismo estado siempre usa el mismo token.

Snippet listo para copiar:

```html
<div class="flex flex-wrap gap-2">
  <span class="badge badge-primary">Ticket</span>
  <span class="badge badge-secondary">Oficina</span>
  <span class="badge badge-accent">Interno</span>
  <span class="badge badge-success">Operativo</span>
</div>
```

Anti-patron:

- No usar colores reservados de linea como sustituto de `badge-success`/`badge-error` para marcar estado tecnico.

### 3) Alert (`alert`)

Uso recomendado:

- `alert-info`: informacion relevante sin bloqueo.
- `alert-success`: confirmacion de accion completada.
- `alert-warning`: riesgo recuperable o dato a revisar.
- `alert-error`: fallo bloqueante o accion rechazada.
- Para alertas, priorizar siempre tokens semanticos; `primary/secondary/accent` no reemplazan esta semantica.

Snippet listo para copiar:

```html
<div role="alert" class="alert alert-warning">
  <span>Revisa la IP ingresada antes de continuar.</span>
</div>
```

Anti-patron:

- No comunicar errores con estilos de marca (`primary`, `secondary`, `accent`) porque se pierde claridad semantica.

### 4) Card (`card`)

Uso recomendado:

- Construir tarjetas sobre `bg-base-100` y `card-body` para mantener legibilidad.
- Usar `primary/secondary/accent` en elementos internos (acciones, destacados, etiquetas).
- Usar `info/success/warning/error` solo en subcomponentes de estado dentro de la card (badge o alert), no en toda la superficie.

Snippet listo para copiar:

```html
<div class="card bg-base-100 shadow-sm">
  <div class="card-body">
    <div class="flex items-center justify-between gap-2">
      <h3 class="card-title">Sincronizacion de oficinas</h3>
      <span class="badge badge-info">En curso</span>
    </div>
    <p>Ultima ejecucion: hace 2 minutos.</p>
    <div class="card-actions justify-end">
      <button class="btn btn-primary btn-sm">Ver detalle</button>
      <button class="btn btn-secondary btn-sm">Historial</button>
    </div>
  </div>
</div>
```

Anti-patron:

- No pintar toda la card con color de estado para indicar un resultado; usar badge o alert dentro de la card.

### 5) Encabezado de pagina (`PageHeader`)

Uso recomendado:

- Usar `PageHeader` para el bloque textual inicial de cada pagina: titulo
  principal y subtitulo breve.
- Mantener buscadores, filtros, metricas y acciones fuera de este componente;
  pertenecen al layout de cada vista.
- El titulo usa `text-3xl font-bold tracking-tight text-base-content` y la
  descripcion usa `text-sm leading-relaxed text-base-content/70`.

Anti-patron:

- No agregar slots ni comportamiento interactivo al encabezado textual.

### 6) Tabla operativa (`DataTable`)

Uso recomendado:

- Usar `DataTable` para listados operativos con filas densas, metadata tecnica,
  iconografia y acciones por fila.
- El encabezado debe usar siempre `secondary` como fondo institucional, texto
  `secondary-content`, negrita y uppercase para reforzar lectura por columnas.
- Las columnas textuales clave pueden ser ordenables con `DataTableHeaderCell`
  y `data-sort-*` en cada fila. El ciclo de orden es ascendente, descendente y
  retorno al orden original.
- Mantener `overflow-x-auto` como respuesta responsive para preservar densidad
  de datos sin duplicar la estructura como tarjetas.

Anti-patron:

- No implementar ordenamiento ad hoc por pagina cuando el listado pueda usar el
  contrato `data-table-sort-root` / `data-table-row`.

### 7) Tabla master-detail (`MasterDetailTable`)

Uso recomendado:

- Usar `MasterDetailTable` para listados con fila maestra, detalle expandible y
  agrupaciones visuales, como el directorio de oficinas.
- Reutilizar `DataTableHeaderCell` para sostener el encabezado institucional y
  el mismo affordance de ordenamiento.
- El ordenamiento debe mover bloques completos mediante
  `data-master-detail-sort-item`, preservando el panel de detalle junto a su
  fila maestra.
- En vistas agrupadas, conservar los headers de grupo y ordenar los items dentro
  de cada grupo; en vistas por tipo, el listado puede comportarse como tabla
  plana.

## Tipografia

- UI principal: `Geist Variable` (Fontsource) como `--font-sans`.
- Datos tecnicos: `Geist Mono Variable` (Fontsource) como `--font-mono`.
- Regla de idioma: espanol en sentence case para titulos y microcopy.
- Estado: tokens tipograficos definidos en `src/styles/global.css`.
- Carga: Fontsource se importa en `src/layouts/BaseLayout.astro` y se hace `preload` de las variantes latinas `woff2` de `Geist Variable` y `Geist Mono Variable` para reducir FOUT en el primer render.

## Interaccion operativa

- Acciones de copia rapida con feedback inmediato para tareas repetitivas (`CopyButton`).
- Navegacion de baja friccion, orientada a resolucion de tareas en pocos clics.

## Escala tipografica usada

- Titulo principal de pagina: `text-3xl font-bold`
- Subtitulo principal de pagina: `text-sm leading-relaxed text-base-content/70`
- Navegacion y elementos globales: `text-sm`
- Texto secundario/global: `text-sm` con opacidad (`text-base-content/70`)

## Espaciado y layout

- Shell principal en 2 columnas:
  - Columna izquierda: `Sidebar` en drawer (`is-drawer-open:w-64`, `is-drawer-close:w-15`)
  - Columna derecha: `Header` sticky + `main` dentro de `PageContainer`
- Altura minima general: `min-h-screen`
- Area de contenido: `main` con `flex-1` y `overflow-y-auto`
- Padding base de contenido: `p-4 md:p-6` (via `PageContainer`)
- Bordes de separacion: `border-base-300`

## Contrato de Barra Superior (Header/TopBar)

### Concepto

- El Header es un componente estructural critico: epicentro de orientacion
  global y quick actions.
- Debe ser delgado, minimamente invasivo y sticky siempre.

### Estructura por zonas

- Zona izquierda (contexto): nombre dinamico de la ruta/pantalla activa.
  En mobile esta etiqueta se oculta para priorizar herramientas.
- Zona derecha (herramientas globales), orden izquierda a derecha:
  A. Busqueda maestra: command palette con atajo `Ctrl+K` / `Cmd+K`.
     En desktop se muestra expandida; en mobile se contrae a icono de lupa.
  B. Preferencias: toggle dark/light con icono dinamico que comunica estado actual.
  C. Alertas y sistema: modal "Acerca del proyecto" con datos de version y autores.

### Reglas de intervencion visual

- Jerarquia visual reducida: botones `ghost`, sin CTAs pesados en Header.
- Escalabilidad y agrupacion: usar divisores logicos entre bloques de herramientas.
- Consistencia de temas: fondo, borde inferior, iconos y contraste dependen de tokens semanticos.

### Estado actual

Todas las zonas del Header estan implementadas y cerradas:
- Zona A: Command palette operativa con modal y atajo Ctrl+K/Cmd+K.
- Zona B: Swap icon de tema integrado con persistencia en localStorage.
- Zona C: Modal "Acerca del proyecto" con datos del equipo, version y año.
- Sin gaps pendientes.

## Componentes catalogados

### Globales estructurales

- `Sidebar` — navegacion lateral con iconos, estado activo, ancho colapsable (64px/256px)
- `Header` — sticky, contexto de ruta, command palette, toggle de tema y modal "Acerca de"
- `CommandPalette` — modal de busqueda con atajo `Ctrl+K`/`Cmd+K`, filtro local
- `BaseLayout` — ensambla Sidebar + Header + main + PageContainer + scripts globales

### Page structure

- `PageContainer` — wrapper de contenido con padding consistente (`p-4 md:p-6`)
- `PageHeader` — bloque textual canonico: titulo + subtitulo. Sin slots interactivos.
  Resuelve titulo automaticamente desde `@lib/navigation.ts` via `getSectionTitle()` + `getResolvedPathname()`.

### Data display

- `DataTable` — contenedor canonico para listados operativos con scroll horizontal y encabezado institucional
- `DataTableHeaderCell` — celda de encabezado reutilizable, estatica u ordenable via `sortKey`
- `MasterDetailTable` — tabla con fila maestra, detalle expandible y ordenamiento por bloques
- `FilterTabsBox` — tabs de filtro por categoria
- `FilterButtonBar` — barra de botones de filtro
- `StatsCard` — tarjeta de metrica/estadistica con icono y valor
- `ViewSwitcher` — alternancia entre vistas (tarjetas/tabla)
- `SearchBar` / `HeroSearchBar` — barras de busqueda con icono
- `SearchEmptyState` — estado vacio con icono y mensaje
- `MonthSelect` — selector de mes/ano
- `SortDropdown` — dropdown de ordenamiento
- `Pagination` — paginacion navegable con numeros de pagina

### Forms (`@components/ui/forms/`)

- `FormField` — input generico con icono opcional, sizing `sm`/`xs`, help text y required indicator
- `SelectField` — dropdown con array `options` o slot para `<option>` personalizados
- `FormTextarea` — textarea con `rows` configurable (default 4)
- `PasswordField` — password con confirmacion, validacion de requisitos (8+ chars, mayuscula, minuscula, numero) y feedback visual en tiempo real
- `FormLegend` — wrapper `<legend>` con clase `fieldset-legend`

### Action buttons

Familia de botones de accion para CRUDs, todas con icono y tooltip:

- `ActionButton` — generico
- `ActionCancelButton` — cancelar/volver
- `ActionConfirmButton` — confirmar/aceptar
- `ActionDeleteButton` — eliminar
- `ActionEditButton` — editar
- `ActionInfoButton` — informacion
- `ActionNetUserButton` — consultar usuario de red
- `ActionPasswordButton` — cambio de contrasena
- `ActionRoleButton` — cambio de rol
- `AddCategoryButton` — agregar categoria
- `AddEntityButton` — agregar entidad generico

### Modals

- `Modal` — modal generico reutilizable
- `aboutProjectModal` — dialogo "Acerca del proyecto" con version, autores, año
- `commandPaletteModal` — paleta de comandos con atajo Ctrl+K
- `feedbackModal` — formulario de feedback de usuario
- `DeleteCategoryModal` — confirmacion de eliminacion de categoria

### UI Utilities

- `CopyButton` — copia al portapapeles. **3 variantes:**
  - `value`: boton con texto visible que se copia, label estable para busquedas con highlight
  - `link`: icono + `Copiar`, con tooltip truncado para previsualizar el enlace
  - `icon`: solo icono de clipboard, sin tooltip, para tablas densas
- `OpenExternalUrlButton` — abre recurso externo. **2 variantes:**
  - `text`: "Abrir" + icono
  - `icon`: solo icono (para tablas densas)
- `QuickAccessCard` — tarjeta de acceso rapido en dashboard
- `SectionCard` — tarjeta de seccion agrupada
- `AnnouncementBanner` — banner de anuncios
- `ColorSwatch` — muestra de color
- `ToastContainer` — contenedor de notificaciones toast animadas
- `GithubLink` — enlace a repositorio

### Skeletons (`@components/ui/skeletons/`)

- `SkeletonCard` — placeholder de tarjeta
- `SkeletonMetric` — placeholder de metrica
- `SkeletonTable` — placeholder de tabla con filas y columnas

### Domain components

- Componentes especificos de cada modulo en `_components/` dentro de la carpeta de cada pagina.

## Paginas implementadas (rutas actuales)

### Vistas operativas

| Ruta                        | Descripcion                                              |
| --------------------------- | -------------------------------------------------------- |
| `/`                         | Dashboard principal con acceso rapido por rol            |
| `/titulos`                  | Tipificacion de tickets con copia rapida                 |
| `/soportes`                 | Matriz de derivacion por tema y area de soporte          |
| `/usuarios`                 | Busqueda de personal y validacion de usuarios            |
| `/generador-firmas`         | Creador de firmas institucionales                        |
| `/contactos`                | Directorio de numeros y correos utiles                   |
| `/recursos`                 | Hub de accesos a recursos externos e internos            |
| `/recursos/aplicativos`     | Catalogo de aplicativos con descargas                    |
| `/oficinas`                 | Directorio de oficinas, activos de red y datos tecnicos  |
| `/inventario-terminales`    | Consulta y estado del parque de terminales               |

### Supervision

| Ruta                                   | Descripcion                                     |
| -------------------------------------- | ----------------------------------------------- |
| `/supervision`                         | Redirecciona al dashboard                       |
| `/supervision/cronograma`              | Gestion de cronograma y horarios                |
| `/supervision/asistencia`              | Control de asistencia y cumplimiento            |
| `/supervision/asignacion-autogestiones` | Asignacion Round-Robin de autogestiones        |
| `/supervision/calidad-operadores`      | Auditoria y puntuacion de calidad               |

### Administracion

| Ruta                       | Descripcion                               |
| -------------------------- | ----------------------------------------- |
| `/admin`                   | Dashboard admin con resumen de sistema    |
| `/admin/usuarios`          | CRUD de usuarios del sistema              |
| `/admin/contactos`         | CRUD de contactos y categorias            |
| `/admin/recursos`          | CRUD de enlaces y categorias              |
| `/admin/auditoria`         | Logs de auditoria                         |
| `/admin/operadores`        | CRUD de operadores N1/N2                  |
| `/admin/aplicativos`       | CRUD de aplicativos del catalogo          |
| `/admin/invgate/ubicaciones` | Mapeo de ubicaciones InvGate            |

### Otras rutas

| Ruta        | Descripcion                   |
| ----------- | ----------------------------- |
| `/login`    | Inicio de sesion              |
| `/logout`   | Cierre de sesion              |
| `/profile`  | Perfil de usuario             |

## Convenciones de nomenclatura

- Rutas: kebab-case y sin tildes (ejemplo: `/directorio-oficinas`)
- Textos visibles en UI: español correcto con acentos
- Componentes Astro: PascalCase
- Alias de importacion activos:
  - `@/*`
  - `@components/*`
  - `@db/*`
  - `@content/*`
  - `@layouts/*`
  - `@pages/*`
  - `@styles/*`
  - `@lib/*`
  - `@types/*`

## Convenciones de codigo

(Ver tambien el listado completo en `docs/CONTEXT.md` — seccion "Convenciones de codigo obligatorias")

### URL base — siempre `@lib/baseUrl`

```typescript
import { getCleanBase, getBaseNoSlash } from "@lib/baseUrl"
const cleanBase = getCleanBase()     // "/mda/"
const baseNoSlash = getBaseNoSlash() // "/mda"
```

NUNCA hacer `const base = import.meta.env.BASE_URL || "/"` inline.

### Server Islands — `server:defer` + skeleton

```astro
<ContentComponent server:defer />
<SkeletonComponent slot="fallback" />
```

En componentes diferidos, usar `getResolvedPathname()` y `getResolvedSearchParams()` de `@lib/navigation.ts` para recuperar la URL original via header `Referer`.

### Toast system

Redirects llevan `?toast_msg=...&toast_type=success|error|warning|info`.
En cliente: `showToast(msg, type)` desde `@lib/toastClient.ts`.
En API: `toastResponse()` / `redirectWithToast()` desde `@lib/api/`.

### Auditoria

Toda mutation admin llama a `logAdminAction()` o `logAdminFromAstro()` (`@lib/auditLogger.ts`). Templates en `@lib/auditDictionary.ts`.

### Iconos

```astro
<Icon name="boxicons:check" size={24} />
```

Siempre `size` numerico. NUNCA `w-5 h-5 size-5`.

## Patrones prohibidos

- Valores arbitrarios de Tailwind (ejemplo: `mt-[13px]`, `text-[10px]`, `bg-[#254888]`)
- Estilos inline
- Colores hardcodeados en componentes (usar tokens semanticos)
- `const base = import.meta.env.BASE_URL || "/"` inline
- Dimensiones en iconos via clases (`w-5`, `h-5`, `size-5`)
- Animaciones lentas o decorativas que afecten la velocidad de uso
- Secciones no justificadas por el briefing funcional

## Reglas de intervencion de UI

1. Mantener consistencia modular visual en contenedores, tarjetas y composicion limpia de contenido.
2. Si se agrega una ruta o vista nueva, registrarla en `@lib/navigation.ts` para propagacion automatica a sidebar, header y command palette.
3. Todo componente nuevo debe usar referencias semanticas de color (tokens DaisyUI), nunca hex hardcodeado.
4. Toda pantalla CRUD debe invocar `logAdminAction()` / `logAdminFromAstro()`.
5. En paginas con contenido diferido (`server:defer`), usar skeleton + helpers de `@lib/navigation.ts` para pathname/searchParams.
6. Construir URLs internas con `getCleanBase()` + path relativo, nunca literales.

## Decisiones documentadas

- Se adopta `light` como tema por defecto para consistencia operativa
- `primary` queda fijo en school-bus-yellow y `secondary` en steel-azure
- Los colores reservados por linea de negocio no se reutilizan como semanticos
- Los semanticos (`info/success/warning/error/neutral`) son similares al lenguaje de marca, pero no iguales a institucional/postal/financiero/logistica
- `platinum` y `onyx` se establecen como neutrales base para superficies y texto
- Header y sidebar forman una doble capa de navegacion: el Header concentra orientacion global y quick actions; la sidebar concentra navegacion seccional
- El enlace activo en sidebar se marca con color `primary`
- La arquitectura inicial privilegia claridad de lectura y navegacion rapida
- El portal mantiene sentence case en espanol para texto visible
- Las rutas nuevas deben pasar por `@lib/navigation.ts`
- Los iconos se usan con `size={24}` numerico, no clases de dimension

## Estandarización del Sistema de Diseño

### 1. Border Radius

Se han mapeado las clases por defecto de Tailwind CSS en `@theme` directamente a las variables dinamicas de DaisyUI v5. Esto garantiza que todos los bordes se adapten automaticamente a la semantica del tema activo (claro u oscuro):

- **Pequeño (`rounded-xs`, `rounded-sm`)** → Mapeados a `var(--radius-selector)` (badges, toggles, checkboxes, etc.)
- **Mediano (`rounded-md`, `rounded-lg`)** → Mapeados a `var(--radius-field)` (botones, entradas, campos, selectores, pestañas, etc.)
- **Grande (`rounded-xl`, `rounded-2xl`, `rounded-3xl`)** → Mapeados a `var(--radius-box)` (tarjetas, modales, alertas, etc.)

### 2. Tipografías Semánticas (Evitar Brackets)

Para evitar la dispersion de valores de texto fijos con brackets (`text-[9px]`, etc.), se han registrado los siguientes tokens tipograficos en `@theme`:

- `text-small`: `11px` (utilizado en identificadores compactos, ej. avatares)
- `text-xxs`: `10px` (utilizado en etiquetas secundarias, metadatos y subtitulos densos)
- `text-tiny`: `9px` (utilizado en celdas y barras de Gantt)
- `text-micro`: `8px` (utilizado en subtitulos de KPIs y leyendas muy pequeñas)

### 3. Sombras Semánticas

Se han estandarizado las siguientes utilidades de sombras en el tema global:

- `shadow-glow-success`: Brillo ambiental verde para estado de conexion en vivo de operadores
- `shadow-glow-warning`: Brillo ambiental amarillo para estado de break en vivo de operadores
- `shadow-table-edge`: Sombra de corte y delimitacion para tablas operativas con scroll y columnas fijas

## Pendientes

- Catalogar componentes de dominio (cards, tablas, badges, filtros) con criterios de uso por contexto.
- Ejecutar revision de accesibilidad y contraste WCAG AA sobre rutas operativas.
- Disenar y documentar la variante dark propia alineada al branding (hoy existe dark funcional base).
- Implementar sidebar minimizable persistente (comportamiento tipo Gemini) con estado recordado.
- Implementar breadcrumbs en secciones de catalogos para orientacion de navegacion.
