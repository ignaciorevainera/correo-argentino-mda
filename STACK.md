# STACK

## Frontend
- Framework: Astro (output: 'server' / SSR)
- Estilos: Tailwind CSS v4 + DaisyUI v5
- Tema DaisyUI: `light` como predeterminado con soporte para tema `dark` y alternancia manual/sistema
- Tipografia: `Geist Variable` (Sans) y `Geist Mono Variable` (Monoespaciada) cargadas localmente

## Base de datos
- Motor: SQLite (archivo local `src/db/sqlite.db`)
- ORM: Drizzle ORM (`drizzle-orm` y `drizzle-kit`)

## Autenticacion
- Ninguna (se mantiene el middleware passthrough)

## Deploy
- Adaptador SSR: `@astrojs/node` en modo `standalone` para entornos basados en Node.js corporativos

## Skills activas en este proyecto
Siempre activas:
- components
- content-collections
- content-replacement
- feature-structure
- forms
- performance
- find-skills

## Variables de entorno necesarias
Ninguna (la base de datos SQLite y las rutas son de resolución local/corporativa)

## Dependencias principales instaladas
- `astro` (v6)
- `tailwindcss` (v4) + `@tailwindcss/vite`
- `daisyui` (v5)
- `drizzle-orm` & `drizzle-kit`
- `better-sqlite3`
- `@astrojs/node` (adaptador SSR)
- `@astrojs/react` & `react` (para islas interactivas específicas)
- `astro-icon` + `@iconify-json/boxicons`
- `@fontsource-variable/geist` & `@fontsource-variable/geist-mono`
- `theme-change`

## Notas de configuracion
- **Modo de renderizado (Astro):** El proyecto está configurado con `output: 'server'` utilizando el adaptador Node.js en modo standalone.
- **Middleware:** `src/middleware.ts` actúa como passthrough sin protección de rutas ni validación de sesión activa.
- **Base de Datos:** Inicialización, migraciones y población de datos mediante Drizzle Kit y los scripts tsx correspondientes ubicados en `scripts/`.
