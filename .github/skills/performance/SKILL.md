---
name: performance
description: Audit and fix performance for PageSpeed 100. Use when asked to 'improve performance', 'fix PageSpeed score', 'audit Lighthouse', 'optimize Core Web Vitals', or during the final pre-deploy review.
metadata:
  author: ignacio-revainera
  version: "1.0.0"
  argument-hint: <file-pattern-or-page-to-audit>
---

## Cuando leer esta skill

Leer antes de la auditoria final del proyecto (Etapa 8) y antes de
cualquier revision en la que el usuario mencione velocidad, puntaje
de PageSpeed, Core Web Vitals o Lighthouse.

El objetivo es llegar a 100/100 en PageSpeed Insights en mobile y
desktop en las categorias Performance, Accessibility, Best Practices
y SEO.

---

## IMAGENES

Es el factor de impacto mas alto en performance.

- Usar siempre el componente Image de Astro, nunca <img> nativo
  Correcto:   <Image src={foto} alt="descripcion" width={800} height={600} />
  Incorrecto: <img src="/foto.jpg" alt="descripcion" />

- Definir siempre width y height en cada Image para evitar layout shift (CLS)

- Usar loading="lazy" en imagenes que estan debajo del fold
  <Image src={foto} alt="..." width={800} height={600} loading="lazy" />

- Usar loading="eager" solo en la imagen hero o la primera imagen visible

- Usar fetchpriority="high" en la imagen hero para que el LCP sea rapido
  <Image src={hero} alt="..." width={1200} height={600} fetchpriority="high" />

- Preferir formato WebP o AVIF. Astro convierte automaticamente si el
  source es un import local. Para imagenes externas, usar URL que sirva WebP.

- Nunca usar imagenes de fondo en CSS con background-image si son
  contenido importante. Usar <Image> en su lugar.

- Dimensionar las imagenes al tamano real en el que se muestran.
  Una imagen de 400px de ancho no necesita src de 2000px.

---

## FUENTES

- Usar siempre Fontsource, nunca Google Fonts CDN externo
  Correcto:   @import '@fontsource-variable/nombre'
  Incorrecto: <link href="https://fonts.googleapis.com/..." />

- Preferir paquetes variables (@fontsource-variable/nombre) para
  reducir el numero de archivos de fuente cargados

- En global.css, el import de Fontsource va siempre primero,
  antes de Tailwind y DaisyUI

- Agregar font-display: swap en el @font-face si se definen fuentes
  manualmente (Fontsource ya lo incluye por defecto)

- Precargar la fuente principal en el BaseLayout:
  <link rel="preload" href="/ruta/fuente.woff2" as="font" type="font/woff2" crossorigin />

- Cargar solo los pesos que realmente se usan. Si solo se usa 400 y 700,
  no importar el paquete completo.

---

## SCRIPTS Y JAVASCRIPT

- Astro genera 0 JS por defecto. No agregar JS innecesario.

- Para componentes interactivos, usar siempre client:visible como
  primera opcion. Solo usar client:load si el componente necesita
  estar activo inmediatamente al cargar la pagina.

  Correcto:   <Counter client:visible />
  Preferible: <Modal client:visible />
  Solo si es necesario: <Navbar client:load />

- Nunca agregar scripts de terceros sin evaluar su impacto.
  Google Analytics, chatbots y similares penalizan el puntaje.
  Si se agregan, hacerlo con type="text/partytown" usando la
  integracion @astrojs/partytown.

- Scripts inline: usar solo cuando no haya alternativa CSS.

---

## HTML Y ESTRUCTURA

- Un solo <h1> por pagina con el tema principal de la pagina

- Jerarquia de headings sin saltos: h1 → h2 → h3, nunca h1 → h3

- Todos los inputs del formulario asociados a un <label> mediante
  el atributo for / htmlFor

- Todos los botones con texto visible o aria-label si solo tienen icono

- Todos los iconos informativos con aria-label
  Iconos decorativos: aria-hidden="true"

- Lang en el elemento html siempre declarado
  <html lang="es">

- Meta description en todas las paginas, entre 120 y 160 caracteres

- Titulo unico en cada pagina, entre 30 y 60 caracteres

- Meta OG (og:title, og:description, og:image) en todas las paginas

- Favicon declarado en el head

---

## CSS Y TAILWIND

- Purge automatico: Tailwind en modo JIT elimina clases no usadas
  en el build. No requiere configuracion extra en Astro.

- No agregar CSS global innecesario. Todo lo que Tailwind cubre con
  clases utilitarias no debe ir en global.css.

- Animaciones con prefers-reduced-motion:
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; }
  }

---

## CONFIGURACION DE VERCEL

Agregar un archivo vercel.json en la raiz del proyecto con headers
de cache para assets estaticos:

  {
    "headers": [
      {
        "source": "/(.*)\\.(?:jpg|jpeg|png|webp|avif|svg|ico|woff2)",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "/(.*)\\.(?:js|css)",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      }
    ]
  }

---

## CHECKLIST PAGESPEED — ejecutar en orden

### Antes del deploy (en local con npm run build + npm run preview)

Imagenes:
  [ ] Todas las imagenes usan <Image> de Astro
  [ ] Todas las imagenes tienen width y height declarados
  [ ] La imagen hero tiene fetchpriority="high" y loading="eager"
  [ ] El resto de imagenes tiene loading="lazy"
  [ ] No hay imagenes de mas de 200kb en el build final

Fuentes:
  [ ] Las fuentes vienen de Fontsource, no de Google Fonts CDN
  [ ] Solo se importan los pesos que se usan en el proyecto
  [ ] El import de fuentes es el primero en global.css

JavaScript:
  [ ] No hay client:load innecesarios (usar client:visible salvo excepcion)
  [ ] No hay scripts de terceros sin @astrojs/partytown
  [ ] El build de produccion no incluye console.log

HTML:
  [ ] Un solo h1 por pagina
  [ ] Todos los inputs tienen label asociado
  [ ] Todos los botones tienen texto o aria-label
  [ ] Lang declarado en el html
  [ ] Meta description en todas las paginas
  [ ] Titulo unico en todas las paginas
  [ ] Meta OG en todas las paginas

CSS:
  [ ] No hay CSS sin usar en el bundle final
  [ ] Las animaciones respetan prefers-reduced-motion

Vercel:
  [ ] vercel.json existe con headers de cache para assets estaticos

### Despues del deploy (en produccion con la URL real)

  [ ] Correr PageSpeed Insights en la URL de produccion (mobile y desktop)
    https://pagespeed.web.dev/
  [ ] Performance >= 90 en mobile, 100 en desktop
  [ ] Accessibility = 100
  [ ] Best Practices = 100
  [ ] SEO = 100
  [ ] Reportar los issues que PageSpeed marca como criticos

---

## PROBLEMAS FRECUENTES Y SOLUCION

LCP alto (imagen hero lenta):
  Agregar fetchpriority="high" y loading="eager" a la imagen hero.
  Verificar que el formato es WebP o AVIF.

CLS (layout shift):
  Siempre definir width y height en todas las imagenes.
  Reservar espacio para fuentes con font-display: swap.

TBT alto (hilo principal bloqueado):
  Revisar scripts de terceros. Mover a Partytown.
  Reducir uso de client:load.

Accesibilidad < 100:
  Revisar contraste de colores con el tema DaisyUI activo.
  Verificar que todos los inputs tienen label.
  Verificar aria-label en botones de icono.

SEO < 100:
  Meta description faltante o fuera de rango (120-160 caracteres).
  Titulo fuera de rango (30-60 caracteres).
  Headings en orden incorrecto.