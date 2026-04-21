---
description: Apply Astro project conventions. Loaded automatically for any task involving components, layouts, pages, images, SSR, endpoints, client directives, import aliases, or icons in an Astro project.
applyTo: '**/*.astro, astro.config.mjs, tsconfig.json, src/**/*.ts'
---

## Alcance

Estas instrucciones aplican a cualquier tarea que involucre:
- Estructura de archivos y carpetas del proyecto
- Componentes, layouts y paginas de Astro
- Directivas de cliente y manejo de interactividad
- Imagenes, fuentes y assets
- SSR y endpoints de servidor

## Estructura de archivos

Respetar siempre esta estructura:

src/
  layouts/
    BaseLayout.astro        — layout principal con head, meta y fuentes
  components/
    ui/                     — componentes atomicos: Button, Card, Badge, etc.
    sections/               — secciones completas: Hero, Features, CTA, etc.
    global/                 — Navbar, Footer y elementos globales
  lib/                      — acceso a datos y logica de negocio
  types/                    — interfaces y tipos TypeScript
  pages/                    — una archivo por ruta, sin logica de negocio

docs/
  mockups/                  — wireframes, capturas y referencias visuales
    .gitkeep                — mantener en git aunque este vacia

## Componentes

- Nombres en PascalCase: HeroSection.astro, ContactForm.astro
- Props tipadas siempre con TypeScript en el frontmatter
- Un componente por archivo
- Sin logica de negocio en componentes de UI: solo presentacion
- Usar slots de Astro para contenido dinamico cuando aplique

Ejemplo de componente bien estructurado:

  ---
  interface Props {
    title: string
    description?: string
    variant?: 'primary' | 'secondary'
  }
  const { title, description, variant = 'primary' } = Astro.props
  ---
  <div class="card bg-base-100 shadow">
    <div class="card-body">
      <h2 class="card-title">{title}</h2>
      {description && <p>{description}</p>}
    </div>
  </div>

## Directivas de cliente

Elegir la directiva correcta para cada caso:

  client:load      — interactividad necesaria inmediatamente al cargar
  client:visible   — interactividad cuando el componente entra en viewport
  client:idle      — interactividad cuando el navegador esta libre
  client:media     — interactividad segun un media query
  client:only      — componente renderizado solo en cliente, sin SSR

Preferir client:visible sobre client:load salvo que la interactividad
sea necesaria antes de que el usuario haga scroll.

## Imagenes

Usar siempre el componente Image de Astro para imagenes locales y remotas:

  ---
  import { Image } from 'astro:assets'
  ---
  <Image src={imagenLocal} alt="descripcion de la imagen" />
  <Image src="https://placehold.co/800x450" alt="descripcion" width={800} height={450} />

Nunca usar la etiqueta img directa para imagenes que Astro puede optimizar.

## BaseLayout

El BaseLayout centraliza todo lo que va en el head y define la estructura
visual de todas las paginas. Todas las paginas deben usar BaseLayout
o un layout que extienda de el.

Incluye obligatoriamente:
- meta charset y viewport
- title dinamico por pagina
- meta description dinamico por pagina
- OG tags: og:title, og:description, og:image
- Importacion de fuentes
- Configuracion del tema DaisyUI via atributo data-theme
- Navbar y Footer globales
- Estructura de columna flex que empuja el footer al fondo siempre

### Estructura obligatoria del body

El body usa flex-col con min-h-screen para que el footer siempre quede
pegado al borde inferior, incluso en paginas con poco contenido.
El main tiene flex-1 para ocupar todo el espacio disponible entre
el Navbar y el Footer.

  <body class="flex flex-col min-h-screen">
    <Navbar />
    <main class="flex-1">
      <slot />
    </main>
    <Footer />
  </body>

Nunca usar:
  <body>
    <slot />   ← el Navbar y Footer los pone cada pagina por su cuenta
  </body>

Nunca usar height fija ni padding-bottom para compensar el footer.
El patron flex-col + min-h-screen + flex-1 lo resuelve sin hacks.

### Codigo completo del BaseLayout

  ---
  import '@styles/global.css'
  import Navbar from '@components/global/Navbar.astro'
  import Footer from '@components/global/Footer.astro'

  interface Props {
    title: string
    description: string
    ogImage?: string
  }

  const { title, description, ogImage = '/og-default.png' } = Astro.props
  ---

  <html lang="es" data-theme="nombre-del-tema">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
    </head>
    <body class="flex flex-col min-h-screen">
      <Navbar />
      <main class="flex-1">
        <slot />
      </main>
      <Footer />
    </body>
  </html>

El valor de data-theme se gestiona con theme-change (ver seccion
siguiente). El import de global.css va siempre en el BaseLayout,
nunca en paginas ni componentes individuales.

Navbar y Footer se importan SOLO en BaseLayout, nunca en paginas
individuales. Si una pagina no los necesita (ej: login a pantalla
completa), crear un layout alternativo que extienda de BaseLayout
omitiendo uno o ambos.

### Gestion del tema con theme-change

Dependencia obligatoria en todos los proyectos:

  npm install theme-change

El control del tema claro/oscuro usa theme-change junto con DaisyUI.
El atributo data-theme NO va hardcodeado en el html — lo gestiona
el script de theme-change leyendo y escribiendo localStorage.

Dos scripts obligatorios en el <head> del BaseLayout, en este orden:

  <head>
    <!-- Script 1: inline — aplica el tema guardado ANTES de que
         la pagina se renderice, evitando el flash de tema incorrecto.
         Debe ser is:inline para ejecutarse de forma sincrona. -->
    <script is:inline>
      if (localStorage.getItem("theme") === null) {
        document.documentElement.setAttribute("data-theme", "nombre-del-tema-default");
      } else {
        document.documentElement.setAttribute(
          "data-theme",
          localStorage.getItem("theme"),
        );
      }
    </script>

    <!-- Script 2: inicializa theme-change para que los botones
         con data-toggle-theme funcionen automaticamente -->
    <script>
      import { themeChange } from "theme-change";
      themeChange();
    </script>
  </head>

El primer script usa is:inline para ejecutarse de forma sincrona
antes del render — sin esto la pagina parpadea con el tema incorrecto
al cargar. El segundo script puede ser async normal.

Reemplazar "nombre-del-tema-default" con el tema definido en
DESIGN_SYSTEM.md. Si el tema aun no esta definido, usar "light".

El boton de toggle en el Navbar usa el atributo data-toggle-theme
de DaisyUI con los dos temas separados por coma:

  <button
    data-toggle-theme="light,dark"
    data-act-class="ACTIVECLASS"
    aria-label="Cambiar tema"
    type="button"
  >
    <Icon name="heroicons:contrast" />
  </button>

### Codigo completo del BaseLayout con theme-change

  ---
  import '@styles/global.css'
  import Navbar from '@components/global/Navbar.astro'
  import Footer from '@components/global/Footer.astro'

  interface Props {
    title: string
    description: string
    ogImage?: string
  }

  const { title, description, ogImage = '/og-default.png' } = Astro.props
  ---

  <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />

      <script is:inline>
        if (localStorage.getItem("theme") === null) {
          document.documentElement.setAttribute("data-theme", "light");
        } else {
          document.documentElement.setAttribute(
            "data-theme",
            localStorage.getItem("theme"),
          );
        }
      </script>
      <script>
        import { themeChange } from "theme-change";
        themeChange();
      </script>
    </head>
    <body class="flex flex-col min-h-screen">
      <Navbar />
      <main class="flex-1">
        <slot />
      </main>
      <Footer />
    </body>
  </html>

Notar que data-theme ya no esta en el elemento html — lo aplica
el script de theme-change dinamicamente. Sin ese script el atributo
no existiria hasta que el JS cargue, causando flash visual.

## Comandos utiles de Astro

  npx astro dev          — servidor de desarrollo local
  npx astro build        — construir el proyecto para produccion
  npx astro check        — verificar errores de tipos en archivos .astro
  npx astro sync         — regenerar tipos de modulos de Astro (astro:assets,
                           astro:content, etc.) despues de agregar integraciones
                           o cambiar la configuracion

Ejecutar astro check antes de cualquier commit que involucre cambios
en componentes o layouts.

## Configuracion base

La opcion site en astro.config.mjs es obligatoria en proyectos publicos.
Astro la usa para generar el sitemap y las URLs canonicas correctamente:

  export default defineConfig({
    site: 'https://mi-proyecto.vercel.app',
    ...
  })

Configurar con la URL de produccion real una vez que el proyecto
este desplegado en Vercel.

## Paginas

- Una pagina por archivo en src/pages/
- Sin logica de negocio ni queries directas en paginas
- Importar datos desde src/lib/
- Pasar datos a componentes via props

## Variables de entorno

- Variables publicas (accesibles en cliente): prefijo PUBLIC_
- Variables privadas (solo servidor): sin prefijo
- Nunca exponer variables privadas en componentes de cliente
- Acceder siempre via import.meta.env.NOMBRE_VARIABLE

## Alias de imports

Todos los proyectos usan estos alias definidos en tsconfig.json.
Usarlos siempre en imports. Nunca usar rutas relativas largas como
../../components o ../../../lib.

  @/*                src/*
  @components/*      src/components/*
  @layouts/*         src/layouts/*
  @lib/*             src/lib/*
  @styles/*          src/styles/*
  @assets/*          src/assets/*
  @instructions/*    .github/instructions/*

Correcto:
  import Button from '@components/ui/Button.astro'
  import { getArticles } from '@lib/articles'
  import { supabase } from '@lib/supabase/client'

Incorrecto:
  import Button from '../../components/ui/Button.astro'
  import { getArticles } from '../../../lib/articles'

Estos alias estan configurados en tsconfig.json y en astro.config.mjs.
Verificar que ambos archivos los tienen antes de usarlos.

## Iconos

Usar siempre astro-icon para iconos en cualquier componente de Astro.

  ---
  import { Icon } from 'astro-icon/components'
  ---
  <Icon name="heroicons:home" />
  <Icon name="lucide:arrow-right" />
  <Icon name="tabler:brand-github" />

Sets de iconos disponibles: heroicons, lucide, tabler.
Elegir el set mas apropiado para el proyecto y mantenerlo consistente.
No mezclar sets de iconos dentro del mismo proyecto salvo necesidad
especifica y justificada en DESIGN_SYSTEM.md.

Siempre agregar aria-label cuando el icono comunica informacion
y no tiene texto visible acompanandolo:

  <Icon name="heroicons:search" aria-label="Buscar" />

Iconos decorativos con aria-hidden:

  <Icon name="heroicons:sparkles" aria-hidden="true" />

Nunca usar emojis como iconos de interfaz.

---

## Colecciones de contenido — bases de conocimiento y documentacion

Esta seccion aplica cuando el proyecto es una base de conocimientos,
documentacion interna o sitio de contenido estructurado con multiples
categorias y articulos. Leer junto a las convenciones generales de
Astro — estas reglas las complementan, no las reemplazan.

### Cuando usar colecciones de contenido

Usar colecciones de contenido (astro:content) en lugar de paginas
.astro manuales cuando el proyecto cumple alguna de estas condiciones:

- Tiene mas de 10 articulos o documentos
- El contenido tiene estructura repetible (mismo schema de frontmatter)
- Se necesita filtrar, agrupar o paginar el contenido
- El contenido lo escriben personas no tecnicas en archivos .mdx
- Se necesita validacion de frontmatter en build time

No usar colecciones para paginas unicas con contenido custom
(home, login, dashboard) — esas siguen siendo paginas .astro normales.

### Estructura de carpetas para colecciones

Proyectos con categorias y subcategorias usan una sola coleccion
"docs" con la organizacion reflejada en la estructura de carpetas:

  src/
  ├── content/
  │   ├── config.ts               schema de la coleccion
  │   └── docs/                   toda la coleccion en una carpeta
  │       ├── hardware/
  │       │   ├── impresoras/
  │       │   │   ├── epson-l3250.mdx
  │       │   │   └── hp-laserjet.mdx
  │       │   └── redes/
  │       │       └── cisco-sg350.mdx
  │       ├── software/
  │       │   └── erp/
  │       │       └── sap-b1.mdx
  │       └── procedimientos/
  │           └── backup/
  │               └── backup-diario.mdx
  ├── layouts/
  │   ├── BaseLayout.astro
  │   └── DocsLayout.astro        layout especifico para articulos
  ├── components/
  │   ├── docs/                   componentes especificos de docs
  │   │   ├── Sidebar.astro
  │   │   ├── TableOfContents.astro
  │   │   ├── Breadcrumb.astro
  │   │   └── DocCard.astro
  │   ├── ui/
  │   └── global/
  ├── lib/
  │   ├── docs.ts                 funciones de acceso a la coleccion
  │   └── navigation.ts           construccion del arbol de navegacion
  └── pages/
      ├── index.astro             inicio — cards por categoria
      ├── [category]/
      │   └── index.astro         indice de categoria
      ├── [category]/
      │   └── [subcategory]/
      │       └── index.astro     indice de subcategoria
      └── [category]/
          └── [subcategory]/
              └── [...slug].astro articulo — captura cualquier profundidad

### Schema de la coleccion — src/content/config.ts

Definir un schema base compartido. Usar discriminatedUnion de Zod
si distintas categorias necesitan campos adicionales especificos.

  import { defineCollection, z } from 'astro:content'

  const docs = defineCollection({
    type: 'content',
    schema: z.object({
      title: z.string(),
      description: z.string(),
      category: z.string(),
      subcategory: z.string(),
      tags: z.array(z.string()).optional(),
      updatedAt: z.date().optional(),
      draft: z.boolean().default(false),
    })
  })

  export const collections = { docs }

Ejecutar npx astro sync despues de crear o modificar config.ts para
regenerar los tipos de la coleccion.

### Frontmatter obligatorio en cada archivo .mdx

Todo archivo de la coleccion debe tener como minimo:

  ---
  title: Titulo del articulo
  description: Descripcion breve para SEO y cards de navegacion
  category: hardware
  subcategory: impresoras
  draft: false
  ---

El campo draft: true excluye el articulo del build de produccion
sin necesidad de eliminarlo. Usar para contenido en progreso.

### Funciones de acceso — src/lib/docs.ts

Centralizar todo acceso a la coleccion en este archivo.
Nunca llamar a getCollection() directamente en paginas o componentes.

  import { getCollection } from 'astro:content'
  import type { CollectionEntry } from 'astro:content'

  type DocEntry = CollectionEntry<'docs'>

  // Todos los articulos publicados
  export async function getAllDocs(): Promise<DocEntry[]> {
    return getCollection('docs', ({ data }) => !data.draft)
  }

  // Articulos de una categoria
  export async function getDocsByCategory(category: string): Promise<DocEntry[]> {
    return getCollection('docs', ({ data }) =>
      data.category === category && !data.draft
    )
  }

  // Articulos de una subcategoria
  export async function getDocsBySubcategory(
    category: string,
    subcategory: string
  ): Promise<DocEntry[]> {
    return getCollection('docs', ({ data }) =>
      data.category === category &&
      data.subcategory === subcategory &&
      !data.draft
    )
  }

  // Articulo individual por slug
  export async function getDocBySlug(slug: string): Promise<DocEntry | undefined> {
    const all = await getAllDocs()
    return all.find(entry => entry.slug === slug)
  }

### Construccion del arbol de navegacion — src/lib/navigation.ts

Construir el arbol una vez y pasarlo como prop al componente Sidebar.
Nunca construirlo dentro de un componente — es logica de negocio.

  import { getAllDocs } from '@lib/docs'
  import type { CollectionEntry } from 'astro:content'

  type DocEntry = CollectionEntry<'docs'>

  export interface NavTree {
    [category: string]: {
      [subcategory: string]: DocEntry[]
    }
  }

  export async function buildNavTree(): Promise<NavTree> {
    const entries = await getAllDocs()
    const tree: NavTree = {}

    for (const entry of entries) {
      const { category, subcategory } = entry.data
      if (!tree[category]) tree[category] = {}
      if (!tree[category][subcategory]) tree[category][subcategory] = []
      tree[category][subcategory].push(entry)
    }

    return tree
  }

  // Solo la categoria activa y sus subcategorias
  export async function getActiveCategoryNav(
    activeCategory: string
  ): Promise<NavTree> {
    const full = await buildNavTree()
    return { [activeCategory]: full[activeCategory] ?? {} }
  }

  // Categorias disponibles para el menu principal
  export async function getCategories(): Promise<string[]> {
    const tree = await buildNavTree()
    return Object.keys(tree)
  }

### Breadcrumbs — src/lib/breadcrumbs.ts

Derivar el breadcrumb del entry.id sin configuracion manual.
El entry.id es la ruta relativa del archivo dentro de la coleccion:
"hardware/impresoras/epson-l3250.mdx"

  export interface Breadcrumb {
    label: string
    href: string
    isLast: boolean
  }

  export function getBreadcrumbs(entryId: string): Breadcrumb[] {
    const parts = entryId.replace(/\.mdx?$/, '').split('/')
    return parts.map((part, i) => ({
      label: formatLabel(part),
      href: '/' + parts.slice(0, i + 1).join('/'),
      isLast: i === parts.length - 1,
    }))
  }

  function formatLabel(slug: string): string {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

### Routing dinamico

Pagina de articulo — src/pages/[category]/[subcategory]/[...slug].astro

  ---
  import { getAllDocs } from '@lib/docs'
  import { buildNavTree } from '@lib/navigation'
  import { getBreadcrumbs } from '@lib/breadcrumbs'
  import DocsLayout from '@layouts/DocsLayout.astro'

  export async function getStaticPaths() {
    const entries = await getAllDocs()
    return entries.map(entry => {
      const parts = entry.slug.split('/')
      return {
        params: {
          category: parts[0],
          subcategory: parts[1],
          slug: parts.slice(2).join('/') || undefined,
        },
        props: { entry },
      }
    })
  }

  const { entry } = Astro.props
  const { Content, headings } = await entry.render()
  const { category } = entry.data

  const navTree = await buildNavTree()
  const activeNav = { [category]: navTree[category] }
  const breadcrumbs = getBreadcrumbs(entry.id)
  ---

  <DocsLayout
    title={entry.data.title}
    description={entry.data.description}
    headings={headings}
    navTree={activeNav}
    breadcrumbs={breadcrumbs}
  >
    <Content />
  </DocsLayout>

Pagina de indice de categoria — src/pages/[category]/index.astro

  ---
  import { getDocsByCategory } from '@lib/docs'
  import { getCategories } from '@lib/navigation'

  export async function getStaticPaths() {
    const categories = await getCategories()
    return categories.map(category => ({ params: { category } }))
  }

  const { category } = Astro.params
  const entries = await getDocsByCategory(category)

  // Agrupar por subcategoria para mostrar cards
  const grouped = entries.reduce((acc, entry) => {
    const sub = entry.data.subcategory
    if (!acc[sub]) acc[sub] = []
    acc[sub].push(entry)
    return acc
  }, {} as Record<string, typeof entries>)
  ---

### DocsLayout — src/layouts/DocsLayout.astro

Layout exclusivo para articulos de la coleccion. Recibe headings,
navTree y breadcrumbs como props y los distribuye a los componentes.

  ---
  interface Props {
    title: string
    description: string
    headings: { depth: number; slug: string; text: string }[]
    navTree: import('@lib/navigation').NavTree
    breadcrumbs: import('@lib/breadcrumbs').Breadcrumb[]
  }
  ---

  Layout de tres columnas:
    Columna izquierda (240px):  Sidebar con navTree
    Columna central (flex: 1):  Breadcrumb + contenido del articulo
    Columna derecha (200px):    TableOfContents con headings

  En mobile: sidebar y ToC se ocultan, el contenido ocupa el ancho completo.
  En tablet (md): solo el contenido visible, sidebar como drawer opcional.
  En desktop (lg): las tres columnas visibles simultaneamente.

### Componente Sidebar — src/components/docs/Sidebar.astro

Recibe navTree (solo la categoria activa) y la ruta actual.
Usa el elemento nativo <details> para los submenus — sin JS.
La subcategoria activa empieza abierta con el atributo open.

  - Marcar el articulo activo con aria-current="page"
  - Mostrar categorias inactivas como links colapsados sin <details>
  - El estado abierto/cerrado se determina comparando con Astro.url.pathname
  - No usar JS para el comportamiento de apertura — solo HTML nativo

### Componente TableOfContents — src/components/docs/TableOfContents.astro

Recibe el array headings del render() de Astro.
Mostrar solo headings de nivel 2 y 3 (h2 y h3).
Indentar h3 respecto a h2 con padding-left.
Los IDs en los headings los genera Astro automaticamente — no agregar
IDs manuales en el MDX.

  - Los links son anclas simples: href="#slug-del-heading"
  - El resaltado del heading activo al hacer scroll es opcional
  - Si se implementa, usar IntersectionObserver con client:idle

### Componente Breadcrumb — src/components/docs/Breadcrumb.astro

Recibe el array de breadcrumbs de getBreadcrumbs().
Usar el elemento nav con aria-label="breadcrumb" y lista ol.
El ultimo elemento no es un link — es el titulo del articulo actual.

### Busqueda con Pagefind

Para colecciones grandes agregar Pagefind para busqueda local.
Pagefind se integra como script post-build sin dependencias adicionales:

  En astro.config.mjs agregar el script de Pagefind al build:
    import pagefind from 'astro-pagefind'
    integrations: [pagefind()]

  Pagefind indexa automaticamente todo el contenido estatico del build.
  Solo funciona con paginas prerendereadas — no con SSR puro.
  Si el proyecto tiene auth con SSR, las paginas de docs deben tener
  prerender = true para que Pagefind las indexe correctamente.

### Reglas especificas para archivos .mdx

  - El frontmatter siempre al inicio del archivo, sin contenido antes
  - No usar h1 en el cuerpo del MDX — el titulo viene del frontmatter
    y el DocsLayout lo renderiza como h1
  - Empezar el contenido desde h2
  - Componentes custom importados en el frontmatter del .mdx:
      import AlertBox from '@components/docs/AlertBox.astro'
  - Imagenes dentro del MDX usando el componente Image de Astro:
      import { Image } from 'astro:assets'
      import captura from '../../assets/captura.png'

### Busqueda en tiempo real con Fuse.js

Para bases de conocimiento y proyectos con colecciones de contenido
que requieren busqueda con sugerencias mientras el usuario tipea.
Pagefind no aplica para este caso — es busqueda estatica sin sugerencias.
Fuse.js corre completamente en el cliente sin servidor ni API externa.

Instalar como dependencia del proyecto:

  npm install fuse.js

#### Paso 1 — Generar el indice en build time

Crear un endpoint estatico que Astro genera como JSON durante el build.
Nunca construir el indice en el cliente — siempre en build time.

  // src/pages/search-index.json.ts
  import type { APIRoute } from 'astro'
  import { getAllDocs } from '@lib/docs'

  export const GET: APIRoute = async () => {
    const entries = await getAllDocs()

    const index = entries.map(entry => ({
      title: entry.data.title,
      description: entry.data.description,
      category: entry.data.category,
      subcategory: entry.data.subcategory,
      tags: entry.data.tags ?? [],
      slug: entry.slug,
      url: '/' + entry.slug,
    }))

    return new Response(JSON.stringify(index), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

Esto genera /search-index.json con todos los articulos publicados.
El endpoint debe excluir articulos con draft: true — getAllDocs() ya
lo hace si esta correctamente implementada en src/lib/docs.ts.

#### Paso 2 — Configuracion de Fuse.js

Pesos recomendados para una base de conocimientos:

  const fuse = new Fuse(data, {
    keys: [
      { name: 'title',       weight: 3 },
      { name: 'description', weight: 2 },
      { name: 'tags',        weight: 2 },
      { name: 'subcategory', weight: 1 },
      { name: 'category',    weight: 1 },
    ],
    threshold: 0.35,          // 0 = exacto, 1 = cualquier resultado
    minMatchCharLength: 2,    // no buscar con menos de 2 caracteres
    includeMatches: true,     // para resaltar texto coincidente si se quiere
  })

Ajustar threshold segun el tipo de contenido:
  0.2 — busqueda estricta, menos falsos positivos
  0.35 — balance entre precision y flexibilidad (recomendado)
  0.5 — busqueda amplia, mas resultados pero menos precisos

#### Paso 3 — Componente SearchBox

El componente vive en src/components/docs/SearchBox.astro.
Usa un <script> inline de Astro — no requiere framework de UI.
El indice se carga una sola vez al enfocar el input (lazy load).

Estructura HTML obligatoria:

  <div class="relative">
    <input
      id="search-input"
      type="search"
      placeholder="Buscar..."
      class="input input-bordered w-full"
      autocomplete="off"
      aria-label="Buscar articulos"
      aria-expanded="false"
      aria-controls="search-results"
    />
    <ul
      id="search-results"
      role="listbox"
      class="hidden absolute z-50 w-full mt-1 bg-base-100
             border border-base-300 rounded-box shadow-lg
             max-h-80 overflow-y-auto"
    ></ul>
  </div>

Comportamiento obligatorio del script:

  Carga del indice:
    Fetch a /search-index.json al enfocar el input por primera vez.
    Usar { once: true } en el event listener para no repetir el fetch.
    Instanciar Fuse solo despues de recibir los datos.

  Busqueda:
    Escuchar el evento input en el campo de busqueda.
    No buscar si la query tiene menos de 2 caracteres.
    Mostrar maximo 8 resultados — no paginar en el dropdown.

  Cada resultado muestra:
    Titulo del articulo (font-medium)
    Categoria / subcategoria (text-xs, color atenuado)
    Descripcion truncada a una linea (text-xs, opcional)

  Cierre del dropdown:
    Al hacer clic fuera del componente.
    Al presionar Escape.
    Al navegar a un resultado (el link cierra naturalmente).

  Navegacion con teclado:
    ArrowDown desde el input enfoca el primer resultado.
    ArrowDown dentro de la lista pasa al siguiente resultado.
    ArrowUp en el primer resultado vuelve al input.
    ArrowUp dentro de la lista sube al resultado anterior.
    Escape cierra el dropdown y devuelve el foco al input.
    Enter en un resultado navega al articulo (comportamiento nativo del link).

  Accesibilidad:
    aria-expanded en el input refleja si el dropdown esta visible.
    role="listbox" en el ul, role="option" en cada li.
    Los links dentro de cada li son los elementos enfocables.

#### Paso 4 — Donde colocar SearchBox

En el Navbar global para que este disponible en todas las paginas:

  <!-- En src/components/global/Navbar.astro -->
  <SearchBox client:load />

client:load es correcto aqui — la barra de navegacion es visible
inmediatamente y el usuario puede querer buscar sin hacer scroll.

Para un buscador secundario dentro del DocsLayout (opcional):
  <SearchBox client:visible />

No agregar SearchBox en dos lugares del mismo layout — confunde
al usuario y duplica el fetch del indice.

#### Consideraciones para colecciones grandes

Si la coleccion supera los 500 articulos el JSON del indice puede
volverse pesado. En ese caso:

  Opcion A — Indice liviano (recomendada):
    Incluir solo title, description, category, subcategory y url.
    No incluir el contenido completo del articulo en el indice.
    El indice raramente supera los 200kb con esta configuracion.

  Opcion B — Busqueda por categoria:
    Generar un indice por categoria: /search-index/hardware.json
    Cargar solo el indice de la categoria activa segun la URL.
    Reducir el tiempo de carga inicial pero limitar la busqueda
    entre categorias.

  Nunca incluir el body completo del MDX en el indice de busqueda.
  Para busqueda de texto completo dentro de articulos usar Pagefind
  como complemento — Pagefind y Fuse.js pueden coexistir en el mismo
  proyecto con propositos distintos.

---

## Componentes globales base

Estos son los patrones base para Navbar y Footer que se usan en todos
los proyectos. El agente kickstart los usa como punto de partida en la
sesion de diseno inicial, adaptando textos, links y iconos al proyecto
especifico. No inventar versiones nuevas — partir siempre de estos.

### Navbar base

Navbar con DaisyUI usando el componente navbar, menu horizontal en
desktop y dropdown en mobile. Incluye theme controller para cambiar
entre modo claro y oscuro.

Dependencia obligatoria para el theme controller:
Seguir la documentacion oficial de DaisyUI para el tema toggle.
El atributo data-toggle-theme recibe los dos temas configurados en
global.css separados por coma: data-toggle-theme="light,dark"

Estructura base del componente:

  - navbar-start: boton de menu mobile (dropdown) + logo/nombre del sitio
  - navbar-center: navegacion horizontal (hidden en mobile, visible en xl)
  - navbar-end: acciones del usuario (auth, theme toggle, etc.)

Deteccion de link activo:

  const currentPath = Astro.url.pathname
  const isActive = (href: string) => currentPath.startsWith(href)

  Para rutas que pueden colisionar (ej: /teams y /teams-builder),
  manejar el caso especial con logica explicita antes del startsWith
  general para evitar falsos positivos.

Estado de sesion en el servidor (si el proyecto tiene auth con Supabase):

  const supabase = createAstroSupabase(Astro)
  const { data: { session } } = await supabase.auth.getSession()
  const isLoggedIn = !!session

  Si hay sesion: mostrar dropdown con avatar y opciones del usuario.
  Si no hay sesion: mostrar boton de acceso (icono de candado o similar).

Shadow al hacer scroll — script inline al final del componente:

  const header = document.getElementById('site-header')
  const toggleShadow = () => {
    if (!header) return
    const scrolled = window.scrollY > 4
    header.classList.toggle('shadow-md', scrolled)
    header.classList.toggle('shadow-none', !scrolled)
  }
  toggleShadow()
  window.addEventListener('scroll', toggleShadow, { passive: true })

Clases del header:

  <header
    id="site-header"
    class="navbar bg-base-100/90 sticky top-0 z-50 rounded-b-xl
           shadow-none backdrop-blur transition-shadow"
    role="banner"
  >

Adaptaciones por proyecto:
  - Links de navegacion: ajustar segun las paginas del proyecto
  - Logo/nombre: reemplazar por el nombre real del proyecto
  - Iconos: usar el set definido en DESIGN_SYSTEM.md
  - Auth: incluir solo si el proyecto tiene autenticacion en STACK.md
  - Tema: ajustar data-toggle-theme con los temas del proyecto

### Footer base

Footer simple centrado con copyright dinamico. Usar siempre en todos
los proyectos salvo que el cliente requiera algo diferente.

  ---
  const currentYear = new Date().getFullYear()
  ---

  <footer class="footer sm:footer-horizontal footer-center
                 bg-base-300 text-base-content p-4">
    <aside>
      <p>Copyright © {currentYear} - [Nombre del autor o empresa]</p>
    </aside>
  </footer>

Adaptaciones por proyecto:
  - Reemplazar el texto del copyright con el nombre real
  - El año es siempre dinamico con new Date().getFullYear()
  - No hardcodear el año nunca
  - Si el proyecto requiere links adicionales en el footer (redes,
    politica de privacidad, etc.) agregar una segunda columna con
    footer-horizontal, pero mantener la estructura base de DaisyUI

Ubicacion en el proyecto:
  src/components/global/Footer.astro
  src/components/global/Navbar.astro

Ambos se importan en BaseLayout.astro y no en paginas individuales.