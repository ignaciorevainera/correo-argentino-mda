---
description: Apply DaisyUI component usage rules. Loaded automatically for any task involving UI components in a project that uses DaisyUI. Defines when and how to consult the MCP, how to choose between components, and how to apply classes correctly without inventing or hardcoding anything.
applyTo: 'src/components/**/*.astro, src/pages/**/*.astro, src/layouts/**/*.astro'
---

## Alcance

Estas instrucciones aplican a todo trabajo de UI en proyectos que usan
DaisyUI como libreria de componentes. Complementan frontend.instructions.md
— no reemplazan. Si hay contradiccion entre ambas, esta instruccion
prevalece en lo que respecta a DaisyUI especificamente.

---

## Regla principal

Antes de escribir cualquier clase o elemento de UI, consultar el MCP
de DaisyUI. Siempre. Sin excepcion.

No importa si el componente parece obvio o si la clase parece conocida.
DaisyUI actualiza sus nombres, variantes y comportamientos entre versiones.
Una clase inventada o recordada de memoria puede no existir, estar
deprecada o comportarse diferente en v5. El MCP tiene la documentacion
de la version activa del proyecto.

---

## Flujo obligatorio antes de implementar cualquier elemento de UI

Paso 1 — Identificar la necesidad
  Describir en una frase que elemento de interfaz se necesita.
  Ejemplo: "boton de accion principal", "listado de items con icono",
  "modal de confirmacion", "formulario de login", "alerta de error".

Paso 2 — Consultar si DaisyUI ya lo tiene
  Buscar en el MCP antes de construir nada custom:

    daisyui/search_daisyui_documentation query="[nombre del elemento]"
    daisyui/search_daisyui_code query="[nombre del elemento]"

  Si DaisyUI tiene un componente que resuelve la necesidad, usarlo.
  No construir un equivalente custom. Aunque el componente de DaisyUI
  requiera ajustes visuales, siempre es el punto de partida correcto.

Paso 3 — Leer la documentacion del componente elegido
  No asumir la API del componente desde memoria. Leer el MCP:

    daisyui/fetch_daisyui_documentation url="https://daisyui.com/components/[nombre]/"

  Verificar: nombre exacto de las clases, variantes disponibles,
  modificadores de tamaño, estructura HTML requerida y ejemplos de uso.

Paso 4 — Implementar usando exactamente lo que dice el MCP
  Copiar la estructura HTML del ejemplo como base y adaptar el contenido.
  No inventar variantes. No combinar clases de distintos componentes
  sin verificar que esa combinacion esta documentada.

Paso 5 — Verificar tokens de color
  Todo color debe usar un token semantico de DaisyUI.
  Si el MCP usa bg-primary en un ejemplo, usar bg-primary — no buscar
  el valor hex equivalente y hardcodearlo.

---

## Jerarquia de decision para elementos de UI

Cuando se necesita un elemento de interfaz, recorrer esta jerarquia
en orden y detenerse en el primer nivel que resuelve la necesidad:

  Nivel 1 — Componente nativo de DaisyUI
    Si DaisyUI tiene el componente, usarlo directamente con sus clases.
    Ejemplos: btn, card, modal, alert, badge, steps, stat, table...
    → Consultar MCP, implementar con la estructura documentada.

  Nivel 2 — Composicion de componentes DaisyUI
    Si la necesidad requiere combinar dos o mas componentes de DaisyUI,
    componerlos sin modificar su estructura interna.
    Ejemplo: card con badge + avatar + btn dentro.
    → Consultar MCP de cada componente por separado.

  Nivel 3 — Componente DaisyUI con utilidades de Tailwind
    Si el componente de DaisyUI existe pero necesita ajustes de layout,
    espaciado o tipografia, agregar clases de Tailwind sobre el componente.
    Nunca sobreescribir propiedades que DaisyUI ya controla.
    Ejemplo: <div class="card gap-6 p-8"> — gap y padding sobre card.
    → Consultar MCP para entender que propiedades ya maneja DaisyUI.

  Nivel 4 — Componente custom con tokens de DaisyUI
    Solo cuando ninguno de los niveles anteriores resuelve la necesidad.
    Construir el componente desde Tailwind usando exclusivamente tokens
    semanticos de DaisyUI (bg-primary, text-base-content, border-base-300).
    → Documentar en DESIGN_SYSTEM.md como componente custom del proyecto.

  Nunca llegar al Nivel 4 sin haber descartado los anteriores.

---

## Tokens semanticos — uso correcto

DaisyUI expone tokens semanticos que cambian automaticamente con el tema.
Usar siempre estos tokens. Nunca valores de Tailwind directos ni hex.

Tokens de fondo y superficie:
  bg-base-100      fondo principal de la pagina
  bg-base-200      fondo de cards, secciones alternadas, inputs
  bg-base-300      fondo del footer, bordes visuales, divisores
  bg-base-content  color de texto principal (usar text-base-content)

Tokens de acento y accion:
  bg-primary / text-primary / text-primary-content
  bg-secondary / text-secondary / text-secondary-content
  bg-accent / text-accent / text-accent-content
  bg-neutral / text-neutral / text-neutral-content

Tokens de estado:
  bg-info / text-info / text-info-content
  bg-success / text-success / text-success-content
  bg-warning / text-warning / text-warning-content
  bg-error / text-error / text-error-content

Uso correcto:
  <div class="bg-base-200 text-base-content">
  <button class="btn btn-primary">
  <span class="badge badge-success">

Uso incorrecto:
  <div class="bg-gray-100 text-gray-900">       ← color de Tailwind
  <button class="bg-blue-600 text-white">       ← color hardcodeado
  <span class="bg-green-500 text-white">        ← no usa tokens DaisyUI

---

## Componentes DaisyUI disponibles — consultar MCP antes de usar

Esta lista es orientativa. Los nombres exactos de clases y variantes
pueden cambiar entre versiones — siempre verificar en el MCP.

Acciones:
  btn            boton — variantes: btn-primary, btn-secondary,
                 btn-accent, btn-ghost, btn-link, btn-outline,
                 btn-success, btn-warning, btn-error, btn-info
                 tamaños: btn-xs, btn-sm, btn-md, btn-lg, btn-xl
  dropdown       menu desplegable anclado a un trigger
  modal          dialogo superpuesto — requiere checkbox o dialog HTML
  swap           alternador de dos estados con animacion
  theme-controller control de tema claro/oscuro (toggle + data-theme)

Navegacion:
  navbar         barra de navegacion — navbar-start, navbar-center, navbar-end
  breadcrumbs    ruta de navegacion jerarquica
  menu           lista de links navegables — horizontal y vertical
  pagination     navegacion entre paginas
  steps          indicador de progreso por pasos
  tabs           pestañas — tabs-bordered, tabs-lifted, tabs-boxed
  bottom-nav     navegacion inferior para mobile

Contenido:
  card           contenedor de contenido — card-body, card-title,
                 card-actions, card-compact, card-bordered, card-side
  carousel       deslizador de items
  chat           burbujas de conversacion
  collapse       acordeon expandible — collapse-arrow, collapse-plus
  diff           comparador de dos contenidos lado a lado
  table          tabla con estilos — table-zebra, table-pin-rows,
                 table-pin-cols, table-xs, table-sm, table-md, table-lg
  timeline       linea de tiempo vertical u horizontal

Feedback:
  alert          mensaje de estado — alert-info, alert-success,
                 alert-warning, alert-error
  badge          etiqueta pequeña — badge-primary, badge-sm, badge-lg,
                 badge-outline
  loading        indicador de carga — loading-spinner, loading-dots,
                 loading-ring, loading-ball, loading-bars
  progress       barra de progreso
  radial-progress circulo de progreso
  skeleton        placeholder de carga
  stat           estadistica destacada — stat-title, stat-value, stat-desc
  toast           notificacion flotante — toast-start, toast-center,
                 toast-end, toast-top, toast-middle, toast-bottom
  tooltip         descripcion al hacer hover

Datos y formularios:
  checkbox       casilla de verificacion
  file-input     selector de archivo
  input          campo de texto — input-bordered, input-sm, input-lg,
                 input-primary, input-error
  join           agrupa elementos eliminando bordes intermedios
  label          etiqueta de campo
  radio          boton de opcion
  range          slider
  rating         sistema de puntuacion con estrellas
  select         selector desplegable — select-bordered, select-sm
  textarea       area de texto
  toggle         interruptor booleano — toggle-primary, toggle-sm

Layout:
  artboard       contenedor con dimensiones de dispositivo para mockups
  divider        separador horizontal o vertical — divider-vertical
  drawer         panel lateral deslizable
  hero           seccion destacada de pagina — hero-content, hero-overlay
  indicator      elemento con badge superpuesto
  mask           aplica formas como mascara a imagenes
  stack           apila elementos con superposicion

Mockup:
  mockup-browser  navegador de browser
  mockup-code     bloque de codigo
  mockup-phone    dispositivo movil
  mockup-window   ventana de aplicacion

Extras visuales:
  avatar         imagen de perfil — avatar-group, avatar-online,
                 avatar-offline, avatar-placeholder
  countdown      contador numerico animado
  kbd            tecla de teclado
  link           enlace con subrayado semantico

---

## Modificadores de tamaño — escala consistente

DaisyUI usa sufijos consistentes para tamaño en la mayoria de componentes.
Siempre verificar en el MCP cuales aplican al componente especifico:

  -xs    extra pequeno
  -sm    pequeno
  -md    mediano (default en la mayoria)
  -lg    grande
  -xl    extra grande (no disponible en todos)

Ejemplos verificados:
  btn-sm · btn-md · btn-lg · btn-xl
  input-sm · input-md · input-lg
  badge-sm · badge-md · badge-lg
  table-xs · table-sm · table-md · table-lg

---

## Estructura HTML requerida por DaisyUI

Algunos componentes requieren una estructura HTML especifica para
funcionar correctamente. No se puede usar la clase sola en un div
generico — el marcado importa.

Consultar siempre el MCP para verificar la estructura. Ejemplos comunes:

Modal (requiere dialog nativo en v5):
  <button onclick="mi_modal.showModal()">Abrir</button>
  <dialog id="mi_modal" class="modal">
    <div class="modal-box">
      <h3>Titulo</h3>
      <p>Contenido</p>
      <div class="modal-action">
        <form method="dialog">
          <button class="btn">Cerrar</button>
        </form>
      </div>
    </div>
  </dialog>

Collapse (requiere checkbox o details/summary):
  <div class="collapse collapse-arrow bg-base-200">
    <input type="checkbox" />
    <div class="collapse-title">Pregunta</div>
    <div class="collapse-content">Respuesta</div>
  </div>

Dropdown (requiere tabindex y posicionamiento):
  <div class="dropdown">
    <div tabindex="0" role="button" class="btn">Abrir</div>
    <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box">
      <li><a>Item 1</a></li>
    </ul>
  </div>

Navbar (requiere estructura de tres zonas):
  <div class="navbar bg-base-100">
    <div class="navbar-start">...</div>
    <div class="navbar-center">...</div>
    <div class="navbar-end">...</div>
  </div>

Cuando el MCP muestra una estructura HTML especifica en el ejemplo,
esa estructura es obligatoria — no simplificarla ni reorganizarla.

---

## Combinacion de clases — reglas

Solo combinar clases que pertenezcan al mismo componente o que sean
utilidades de Tailwind documentadas como compatibles.

Correcto:
  <button class="btn btn-primary btn-sm">
  <div class="card card-compact card-bordered">
  <span class="badge badge-success badge-outline">

Incorrecto — mezclar clases de componentes distintos:
  <button class="btn card">              ← btn y card no se mezclan
  <div class="navbar hero">             ← componentes incompatibles

Incorrecto — inventar variantes no documentadas:
  <button class="btn btn-danger">       ← no existe, es btn-error
  <div class="card card-lg">            ← no existe ese modificador
  <span class="badge badge-round">      ← no existe

Cuando se necesita un estilo que ningun token o variante de DaisyUI
cubre, usar utilidades de Tailwind encima del componente DaisyUI.
Nunca inventar clases DaisyUI para cubrir esa necesidad.

---

## Actualizaciones al DESIGN_SYSTEM.md

Cuando se elige un componente DaisyUI nuevo para el proyecto,
registrarlo en la tabla de componentes catalogados de DESIGN_SYSTEM.md
con el nombre del archivo, las props principales y las variantes en uso.
Esto evita que distintos agentes elijan soluciones diferentes para el
mismo patron visual en distintas sesiones.