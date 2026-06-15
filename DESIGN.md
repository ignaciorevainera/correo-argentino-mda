# DESIGN

Generado el 2026-04-10. Ultima actualizacion: 2026-04-18.

## Stack

- Framework: Astro
- Estilos: Tailwind CSS + DaisyUI
- Tema: DaisyUI con `light` como default y `dark` por preferencia del sistema
- Contenido: MDX (Content Collections)
- Iconos: `astro-icon` con Boxicons (`@iconify-json/boxicons`)
- Interactividad de tema: `theme-change`
- Datos/Auth: sin base de datos y sin autenticacion
- Deploy objetivo: Vercel
- Deploy actual: sin configuracion activa en entorno productivo

## Contexto de producto (actualizado 2026-04-17)

- Producto: Portal de la Mesa de Ayuda Interna.
- Objetivo principal: centralizar y agilizar tareas de operadores N1/N2
  para tipificacion de tickets, busqueda de personal, monitoreo de
  terminales y gestion de carga laboral.
- Dominio de uso: soporte corporativo logistico y postal.

## Tema activo

- Tema base activo: `light`
- Modo oscuro: disponible por `prefers-color-scheme` con tema `dark`
- Selector global: alternancia manual `light/dark` disponible desde el layout principal
- Direccion visual: minimalista, utilitaria y de lectura rapida, orientada a productividad interna

## Paleta oficial (actualizada 2026-04-13)

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

- Acciones de copia rapida con feedback inmediato para tareas repetitivas.
- Navegacion de baja friccion, orientada a resolucion de tareas en pocos clics.

## Escala tipografica usada

- Titulo principal de pagina: `text-3xl font-bold`
- Subtitulo principal de pagina: `text-sm leading-relaxed text-base-content/70`
- Navegacion y elementos globales: `text-sm`
- Texto secundario/global: `text-sm` con opacidad (`text-base-content/70`)

## Espaciado y layout

- Shell principal en 2 columnas:
  - Columna izquierda: `Sidebar` en drawer (`is-drawer-open:w-64`, `is-drawer-close:w-15`)
  - Columna derecha: `Header` sticky + `main`
- Altura minima general: `min-h-screen`
- Area de contenido: `main` con `flex-1` y `overflow-y-auto`
- Padding base de contenido: `p-4 md:p-6`
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
  A. Busqueda maestra: omnibox/paleta/quick search con atajos. En desktop
  se muestra expandida; en mobile se contrae a icono de lupa que abre modal.
  B. Preferencias: toggle dark/light con icono dinamico que comunica estado
  actual o accion de cambio.
  C. Alertas y sistema: centro de notificaciones con badge discreto para no
  leidas y acceso rapido a ayuda/manual.

### Reglas de intervencion visual

- Jerarquia visual reducida: botones `ghost`, sin CTAs pesados en Header.
- Escalabilidad y agrupacion: usar divisores logicos entre bloques de
  herramientas (por ejemplo, busqueda separada de utilidades).
- Consistencia de temas: fondo, borde inferior, iconos y contraste dependen
  de tokens semanticos light/dark del sistema.

### Estado actual vs objetivo (trazabilidad)

- Estado actual en `BaseLayout`: Header sticky implementado con boton de drawer,
  contexto dinamico por ruta (oculto en mobile), busqueda maestra (desktop +
  trigger mobile), y toggle dark/light en la zona derecha.
- Estado actual de busqueda maestra: modal de command palette con filtro local
  y atajo `Ctrl+K` / `Cmd+K`.
- Gap vigente: falta el bloque C (alertas y sistema) en Header con badge de
  no leidas y acceso rapido a ayuda/manual.
- Estado del contrato: cumplimiento parcial-alto. Se implementaron A y B;
  queda pendiente C para cierre completo.

## Componentes catalogados

Globales actuales:

- `Sidebar` (navegacion lateral con iconos y estado activo)
- `Header` (sticky, contexto de ruta, busqueda maestra y toggle de tema)
- `CommandPalette` (integrado en `BaseLayout` como modal con filtro)

Layout actual:

- `BaseLayout` (ensambla sidebar + header + main + scripts de interaccion global)

UI reutilizable actual:

- `Button`
- `ColorSwatch`
- `CopyButton`
  - Componente canónico para copiar valores al portapapeles.
  - Variante `value`: el botón contiene el texto visible que se copia y mantiene el label estable para búsquedas con highlight.
  - Variante `link`: muestra ícono + `Copiar`, con tooltip truncado para previsualizar el enlace.
  - Variante `icon`: muestra solo el ícono de portapapeles, sin tooltip, para tablas densas donde el valor ya está visible fuera del botón.
- `DataTable`
  - Contenedor canonico para listados operativos con scroll horizontal,
    encabezado institucional y filas proyectadas por slots.
- `DataTableHeaderCell`
  - Celda de encabezado reutilizable; puede ser estatica u ordenable mediante
    `sortKey`.
- `DesignSystemSection`
- `MasterDetailTable`
  - Contenedor para tablas con fila maestra, detalle expandible y ordenamiento
    por bloques.
- `OpenExternalUrlButton`
  - Componente canónico para abrir recursos externos o salidas de flujo.
  - Variantes `icon` y `text`; la variante `text` muestra `Abrir` con ícono y la variante `icon` conserva solo el ícono para tablas densas.
- `PageHeader`
  - Bloque textual canonico para titulo y subtitulo de pagina.
  - No contiene buscadores, filtros, metricas ni acciones.
- `SearchInput`

Paginas implementadas hoy (estado real del repo):

- `/`
- `/titulos-tickets`
- `/buscador-usuarios`
- `/directorio-oficinas`
- `/guia-soportes`
- `/cronograma`
- `/cubics`
- `/mapa-sucursales`
- `/inventario-terminales`
- `/enlaces-importantes`
- `/configuracion`

Roadmap funcional objetivo (11 vistas):

| Vista                    | Ruta objetivo            | Estado actual | Nota operativa                                    |
| ------------------------ | ------------------------ | ------------- | ------------------------------------------------- |
| Dashboard principal      | `/`                      | Implementada  | Iterar widgets segun foco N1/N2                   |
| Titulos de tickets       | `/titulos-tickets`       | Implementada  | Mantener agilidad de copia                        |
| Buscador de usuarios     | `/buscador-usuarios`     | Implementada  | Definir criterios finales de acceso               |
| Directorio de oficinas   | `/directorio-oficinas`   | Implementada  | Consolidar datos operativos definitivos           |
| Guia de soportes         | `/guia-soportes`         | Implementada  | Completar cobertura funcional por area            |
| Cronograma               | `/cronograma`            | Implementada  | Definir origen de datos y reglas de actualizacion |
| Cubics                   | `/cubics`                | Implementada  | Evolucionar a monitoreo operativo                 |
| Mapa de sucursales       | `/mapa-sucursales`       | Implementada  | Integrar fuente de datos geografica final         |
| Inventario de terminales | `/inventario-terminales` | Implementada  | Definir estructura y ciclo de actualizacion       |
| Enlaces importantes      | `/enlaces-importantes`   | Implementada  | Curar enlaces oficiales y responsables            |
| Configuracion            | `/configuracion`         | Implementada  | Ajustar preferencias finales de usuario           |

Nota de trazabilidad: las 11 vistas objetivo ya existen a nivel de rutas.
El gap actual es de madurez funcional de contenido y no de estructura de navegacion.

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

## Patrones prohibidos

- Valores arbitrarios de Tailwind (ejemplo: `mt-[13px]`)
- Estilos inline
- Colores hardcodeados en componentes (usar tokens semanticos)
- Animaciones lentas o decorativas que afecten la velocidad de uso
- Secciones no justificadas por el briefing funcional

## Reglas de intervencion de UI

1. Mantener consistencia modular visual en contenedores, tarjetas y
   composicion limpia de contenido.
2. Si se agrega una ruta o vista nueva, registrar la ruta en el orquestador
   principal y en la navegacion dinamica (sidebar y topbar cuando aplique).
   Estado actual: `src/layouts/BaseLayout.astro` concentra el arreglo `navItems`.
3. Todo componente nuevo debe usar referencias semanticas de color (tokens
   DaisyUI o variables del sistema), para integracion automatica con temas.

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
- Las rutas nuevas deben pasar por el orquestador de `navItems` en BaseLayout

## Pendientes

- Completar bloque C del Header: alertas/sistema con badge de no leidas y acceso a ayuda/manual.
- Diseñar y documentar la variante dark propia alineada al branding (hoy existe dark funcional base).
- Implementar sidebar minimizable persistente (comportamiento tipo Gemini) con estado recordado.
- Implementar breadcrumbs en secciones de catalogos para orientacion de navegacion.
- Catalogar componentes de dominio (cards, tablas, badges, filtros) con criterios de uso por contexto.
- Ejecutar revision de accesibilidad y contraste WCAG AA sobre rutas operativas.

## 5) Iconos (`Icon`)

Uso recomendado:

- Siempre utilice el atributo `size={24}` (ures/valores numéricos) en los componentes `<Icon />` de `astro-icon` para definir el tamaño del ícono.
- Evite usar clases de Tailwind como `w-5`, `h-5`, `size-5` o sus variantes responsivas para controlar el tamaño del ícono.
- Si necesita tamaños diferentes, ajuste el valor del atributo `size` (por ejemplo, `size={32}`).
- Las clases pueden seguir utilizándose para otros estilos (color, margen, etc.), pero no deben incluir utilidades de ancho/alto o `size-`.

## Estandarización del Sistema de Diseño (Actualizado 2026-06-14)

### 1. Border Radius
Se han mapeado las clases por defecto de Tailwind CSS en `@theme` directamente a las variables dinámicas de DaisyUI v4. Esto garantiza que todos los bordes se adapten automáticamente a la semántica del tema activo (claro u oscuro):
- **Pequeño (`rounded-xs`, `rounded-sm`)** -> Mapeados a `var(--radius-selector)` (badges, toggles, checkboxes, etc.)
- **Mediano (`rounded-md`, `rounded-lg`)** -> Mapeados a `var(--radius-field)` (botones, entradas, campos, selectores, pestañas, etc.)
- **Grande (`rounded-xl`, `rounded-2xl`, `rounded-3xl`)** -> Mapeados a `var(--radius-box)` (tarjetas, modales, alertas, etc.)

### 2. Tipografías Semánticas (Evitar Brackets)
Para evitar la dispersión de valores de texto fijos con brackets (`text-[9px]`, etc.), se han registrado los siguientes tokens tipográficos en `@theme`:
- `text-small`: `11px` (utilizado en identificadores compactos, ej. avatares).
- `text-xxs`: `10px` (utilizado en etiquetas secundarias, metadatos y subtítulos densos).
- `text-tiny`: `9px` (utilizado en celdas y barras de Gantt).
- `text-micro`: `8px` (utilizado en subtítulos de KPIs y leyendas muy pequeñas).

### 3. Sombras Semánticas
Se han estandarizado las siguientes utilidades de sombras en el tema global:
- `shadow-glow-success`: Brillo ambiental verde para estado de conexión en vivo de operadores.
- `shadow-glow-warning`: Brillo ambiental amarillo para estado de break en vivo de operadores.
- `shadow-table-edge`: Sombra de corte y delimitación para tablas operativas con scroll y columnas fijas.

