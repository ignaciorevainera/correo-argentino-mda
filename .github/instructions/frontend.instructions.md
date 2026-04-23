---
description: Apply frontend design and styling rules. Loaded automatically for any task involving UI components, Tailwind CSS, DaisyUI, typography, color tokens, responsiveness, accessibility, or visual design decisions.
applyTo: 'src/components/**/*.astro, src/styles/**/*.css, src/pages/**/*.astro'
---

## Alcance

Estas instrucciones aplican a cualquier tarea que involucre:
- Creacion o modificacion de componentes visuales
- Trabajo con Tailwind CSS o DaisyUI
- Estructura y layout de paginas
- Responsividad y accesibilidad

## Pensamiento de diseno

Antes de escribir cualquier linea de UI, responder estas preguntas:
- Proposito: que problema resuelve esta interfaz y quien la usa
- Tono: elegir una direccion estetica clara y ejecutarla con precision
  (ejemplos: minimalismo brutal, editorial, organico, luxury, retro,
  industrial, geometrico, soft/pastel, etc.)
- Diferenciacion: que hace a este diseno memorable e irrepetible

La clave no es la intensidad sino la intencionalidad. Un diseno
minimalista y uno maximalista funcionan igual de bien si se ejecutan
con coherencia interna.

## Estetica y calidad visual

### Tipografia
- Elegir fuentes con caracter que eleven la estetica del proyecto
- Evitar fuentes genericas: Arial, Inter, Roboto, system fonts
- Combinar una fuente de display distintiva con una fuente de cuerpo refinada
- La tipografia es la primera herramienta para hacer un diseno memorable

Todas las fuentes vienen obligatoriamente de Fontsource.
Nunca usar Google Fonts directamente ni CDNs externos.
El paquete variable es preferible al estandar cuando existe:

  @fontsource-variable/nombre-fuente   (preferido)
  @fontsource/nombre-fuente            (si no existe version variable)

Una vez instalado el paquete, importar en global.css antes de
cualquier otra declaracion y registrar en @theme:

  @import '@fontsource-variable/sora';

  @theme {
    --font-sans: "Sora Variable", sans-serif;
  }

Para fuentes de display adicionales:

  @import '@fontsource-variable/playfair-display';

  @theme {
    --font-sans: "Sora Variable", sans-serif;
    --font-display: "Playfair Display Variable", serif;
  }

El agente propone las fuentes, el usuario instala el paquete,
el agente configura el import y el @theme.

### Composicion espacial
- Explorar asimetria, overlap entre elementos y flujo diagonal cuando el
  contexto lo permite
- Usar espacio negativo generoso como elemento de diseno, no como vacio
- Densidad controlada cuando el contenido lo requiere
- Evitar layouts predecibles: la cuadricula existe para romperla con criterio

### Fondos y profundidad visual
- Crear atmosfera con fondos que aporten profundidad, no defaultear a
  colores solidos
- Recursos disponibles dentro del sistema de tokens de DaisyUI y Tailwind:
  gradientes entre tokens semanticos, sombras (shadow-sm hasta shadow-2xl),
  transparencias con opacity, capas con z-index
- Texturas y patrones con CSS puro cuando aportan al tono elegido
- Nunca usar valores de color fuera del sistema de tokens de DaisyUI

### Animaciones y movimiento
- Priorizar animaciones CSS puras: transition, animate-, keyframes en
  el archivo de estilos global
- Un momento de entrada bien orquestado con staggered reveals aporta mas
  que microinteracciones dispersas
- Hover states que sorprendan sin distraer
- Respetar prefers-reduced-motion en animaciones no esenciales

### Lo que nunca hacer
- Diseños genericos que podrian pertenecer a cualquier proyecto
- Gradientes purpura sobre fondo blanco y otros cliches de IA
- Patron repetido de las mismas fuentes en cada proyecto
  (Space Grotesk, Plus Jakarta Sans, etc.)
- Componentes cookie-cutter sin adaptacion al contexto especifico

## Tailwind CSS

### Escala tipografica permitida
text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl,
text-4xl, text-5xl, text-6xl, text-7xl, text-8xl, text-9xl

### Escala de espaciado
Usar siempre valores de la escala de Tailwind: 0, 1, 2, 3, 4, 5, 6, 8,
10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 80, 96.
Nunca valores arbitrarios como p-[18px] o mt-[1.3rem].

### Breakpoints permitidos
sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px).
Nunca breakpoints arbitrarios como min-[900px].

### Layout
- Max width de contenido: max-w-6xl con mx-auto px-4
- Padding de secciones: py-16 en mobile, py-24 en desktop (py-16 md:py-24)
- Gap entre elementos de grid: gap-6 o gap-8 como valores base

## DaisyUI

### Configuracion base en global.css

Todo proyecto usa esta estructura en src/styles/global.css:

  /* 1. Fuentes de Fontsource — siempre primero */
  @import '@fontsource-variable/nombre-fuente';

  /* 2. Tailwind y DaisyUI */
  @import "tailwindcss";
  @plugin "daisyui" {
    themes: light --default, dark --prefersdark;
  }

  /* 3. Variant dark para clases dark: de Tailwind con data-theme */
  @custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

  /* 4. Tokens de tema */
  @theme {
    --font-sans: "Nombre Variable", sans-serif;
  }

El orden es obligatorio. Alterar el orden puede romper la cascada.

El @custom-variant dark permite usar clases dark: de Tailwind
sincronizadas con el sistema de temas de DaisyUI via data-theme,
en lugar de depender de la clase .dark en el html.

El tema light es el default y dark se activa con prefers-color-scheme.
Esta configuracion base aplica salvo que DESIGN_SYSTEM.md indique
un tema diferente para el proyecto.

### Aplicacion del tema

El tema se declara con data-theme en el elemento raiz del layout.
Puede aplicarse a todo el proyecto o a secciones especificas:

  <html data-theme="dark">
    <div data-theme="light">contenido siempre en light</div>
  </html>

El BaseLayout siempre tiene data-theme en el elemento html.
El valor proviene de DESIGN_SYSTEM.md una vez definido por kickstart.

### Temas disponibles de DaisyUI

Temas prefabricados que pueden usarse sin configuracion adicional:
light, dark, cupcake, bumblebee, emerald, corporate, synthwave, retro,
cyberpunk, valentine, halloween, garden, forest, aqua, lofi, pastel,
fantasy, wireframe, black, luxury, dracula, cmyk, autumn, business,
acid, lemonade, night, coffee, winter, dim, nord, sunset, caramellatte,
abyss, silk

Usar siempre un tema prefabricado hasta tener un MVP funcional.
No crear temas personalizados en fases tempranas del proyecto.

### Temas personalizados

Una vez que el proyecto tiene MVP y se requiere una identidad visual
propia que ningun tema prefabricado logra, el agente puede proponer
opciones de temas personalizados.

El agente genera el bloque de configuracion completo para pegar en
global.css, usando la misma estructura que DaisyUI theme generator:

  @plugin "daisyui/theme" {
    name: "nombre-del-tema";
    default: true;
    prefersdark: false;
    color-scheme: "light";
    --color-base-100: oklch(...);
    --color-base-200: oklch(...);
    --color-base-300: oklch(...);
    --color-base-content: oklch(...);
    --color-primary: oklch(...);
    --color-primary-content: oklch(...);
    --color-secondary: oklch(...);
    --color-secondary-content: oklch(...);
    --color-accent: oklch(...);
    --color-accent-content: oklch(...);
    --color-neutral: oklch(...);
    --color-neutral-content: oklch(...);
    --color-info: oklch(...);
    --color-info-content: oklch(...);
    --color-success: oklch(...);
    --color-success-content: oklch(...);
    --color-warning: oklch(...);
    --color-warning-content: oklch(...);
    --color-error: oklch(...);
    --color-error-content: oklch(...);
    --radius-selector: ...;
    --radius-field: ...;
    --radius-box: ...;
    --border: ...;
    --depth: ...;
    --noise: ...;
  }

Cuando el usuario pide opciones de tema personalizado, proponer
entre 2 y 3 variantes con nombre, descripcion del concepto estetico
y el bloque de configuracion completo listo para usar.
El usuario elige una, la pega en global.css y actualiza DESIGN_SYSTEM.md.

Todos los colores en formato oklch para consistencia con DaisyUI v5.
Nunca usar hex ni rgb en la definicion de temas.

### Tokens semanticos de color
Usar siempre tokens semanticos, nunca colores de Tailwind directamente:

  primary / primary-content
  secondary / secondary-content
  accent / accent-content
  neutral / neutral-content
  base-100 / base-200 / base-300 / base-content
  info / success / warning / error

Correcto: bg-primary text-primary-content
Incorrecto: bg-blue-600 text-white

### Componentes disponibles
Antes de construir algo custom, verificar si DaisyUI ya lo tiene:
btn, card, navbar, hero, footer, badge, modal, drawer, tabs, collapse,
alert, avatar, breadcrumbs, carousel, chat, countdown, diff, dropdown,
indicator, join, kbd, loading, mask, menu, mockup, pagination, progress,
radial-progress, rating, skeleton, stat, steps, swap, table, timeline,
toast, toggle, tooltip

### Variantes de componentes
Usar las variantes nativas de DaisyUI:
btn-primary, btn-secondary, btn-accent, btn-ghost, btn-outline, btn-sm,
btn-lg, card-compact, card-bordered, etc.

## Accesibilidad obligatoria

- Un solo h1 por pagina
- Jerarquia de headings sin saltos (h1 > h2 > h3, nunca h1 > h3)
- Imagenes con alt descriptivo del contenido esperado
- Imagenes decorativas con alt vacio: alt=""
- Botones con texto visible o aria-label cuando solo tienen icono
- Inputs siempre asociados a un label mediante htmlFor / for
- Elementos interactivos navegables con teclado
- Contraste minimo WCAG AA

## Responsividad

Disenar mobile-first: las clases base son para mobile, los prefijos de
breakpoint agregan comportamiento en pantallas mas grandes.

Correcto: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
Incorrecto: grid grid-cols-3 (sin considerar mobile)

## Iconos

Usar astro-icon con sets de Boxicons, Lucide o Tabler.
Nunca usar emojis como iconos de interfaz.
Siempre agregar aria-label a iconos que comuniquen informacion.
