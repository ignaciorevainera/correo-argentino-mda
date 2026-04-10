# DESIGN SYSTEM — Mesa de Ayuda - Correo Argentino
Generado el 2026-04-10. Actualizar ante cualquier cambio de diseño.

## Stack
- Framework: Astro
- Estilos: Tailwind CSS + DaisyUI
- Tema: DaisyUI con `light` como default y `dark` por preferencia del sistema
- Contenido: MDX (Content Collections)
- Iconos: `astro-icon` con Heroicons
- Datos/Auth: Supabase + Supabase Auth
- Deploy objetivo: Vercel

## Tema activo
- Tema base activo: `light`
- Modo oscuro: disponible por `prefers-color-scheme` con tema `dark`
- Dirección visual: minimalista, utilitaria y de lectura rápida, orientada a productividad interna

## Tokens de color en uso
- `primary`: `#FFE600` (amarillo marca)
- `secondary`: `#004C97` (azul institucional)
- `accent`: `#00A4E0` (apoyo visual)
- `neutral`: `#F2F2F2` (superficies neutras)
- `info`: `#00A4E0`
- `success`: `#008040`
- `warning`: `#FFE600`
- `error`: `#E3000F`

Tokens de lineas de negocio:
- `--color-postal`: `#E3000F`
- `--color-logistica`: `#4D4D4D`
- `--color-financiero`: `#008040`

## Tipografía
- Estado actual: sans-serif del sistema (temporal)
- Objetivo de estilo: sans-serif limpia, tecnica y legible para lectura rapida en soporte
- Regla: definir familia final desde Fontsource antes del cierre visual del MVP

## Escala tipográfica usada
- Titulo principal de pagina: `text-3xl font-bold`
- Navegación y elementos globales: `text-sm`
- Texto secundario/global: `text-sm` con opacidad (`text-base-content/70`)

## Espaciado y layout
- Shell principal en 2 columnas:
  - Columna izquierda: `Sidebar` fija (`w-64`) con prioridad visual
  - Columna derecha: `TopBar` + `main` + `Footer`
- Altura minima general: `min-h-screen`
- Area de contenido: `main` con `flex-1` y `overflow-y-auto`
- Padding base de contenido: `p-6`
- Bordes de separacion: `border-base-300`

## Componentes catalogados
Globales actuales:
- `Sidebar` (navegacion lateral con iconos y estado activo)
- `TopBar` (cabecera superior)
- `Footer` (pie global)

Layout actual:
- `BaseLayout` (ensambla sidebar + topbar + main + footer)

Paginas base existentes:
- `/`
- `/titulos-tickets`
- `/documentacion`
- `/guia-soportes`
- `/buscador-usuarios`
- `/oficinas-telegrafia`
- `/cubics`
- `/configuracion`
- `/login`

## Convenciones de nomenclatura
- Rutas: kebab-case y sin tildes (ejemplo: `/oficinas-telegrafia`)
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

## Decisiones documentadas
- Se adopta `light` como tema por defecto para consistencia operativa
- El mapa de color respeta la identidad de Correo Argentino definida en contexto
- La sidebar tiene prioridad estructural y visual sobre header/footer
- El enlace activo en sidebar se marca con color `primary`
- La arquitectura inicial privilegia claridad de lectura y navegación rapida

## Pendientes
- Definir tipografia final desde Fontsource
- Diseñar variante dark propia alineada al branding
- Implementar sidebar minimizable (comportamiento tipo Gemini)
- Implementar buscador global con atajo `Ctrl+K` / `Cmd+K`
- Implementar breadcrumbs en secciones de catalogos y documentacion
- Catalogar componentes de dominio (cards, tablas, badges, filtros)
- Ejecutar revision de accesibilidad y contraste WCAG AA
