# STACK

## Frontend
- Framework: Astro
- Estilos: Tailwind CSS + DaisyUI
- Tema DaisyUI: [El agente kickstart define esto en la sesion de diseno]
- Tipografia: [El agente kickstart define esto en la sesion de diseno]

## Base de datos
Supabase

## Autenticacion
Supabase Auth

## Deploy
Vercel

## Skills activas en este proyecto
Siempre activas:
- auth-supabase
- components
- content-collections
- content-replacement
- feature-structure
- forms
- performance
- vercel-deploy
- supabase
- supabase-postgres-best-practices
- find-skills

## Variables de entorno necesarias
[SUPABASE_URL]
[SUPABASE_KEY]

## Dependencias principales instaladas
- astro
- @astrojs/tailwind
- daisyui
- astro-icon
- @iconify-json/heroicons
- @supabase/supabase-js
- @astrojs/mdx


## Notas de configuracion
- **Modo de renderizado (Astro):** Dado que el sitio mezcla contenido público 100% estático y rutas privadas que requieren validación de usuario (Buscador, Oficinas, Cubics), el archivo `astro.config.mjs` debe configurarse con **`output: 'hybrid'`** (o `server`). Esto permite mantener la velocidad estática para la documentación, pero habilitar el Server-Side Rendering (SSR) necesario para chequear las cookies de sesión de Supabase en las rutas protegidas.
- **Middleware de Autenticación:** Se debe implementar un archivo `src/middleware.ts` en Astro para interceptar las peticiones. Si un usuario intenta acceder a `/buscador-usuarios`, `/oficinas-telegrafia` o `/cubics` sin una sesión válida de Supabase, el middleware debe redirigirlo automáticamente a la página de login (`/login`).
- **Colecciones de Contenido (Content Collections):** Para la documentación importada de Notion, se debe definir el esquema de datos en `src/content/config.ts` utilizando Zod, asegurando que todos los archivos `.mdx` cumplan con la estructura de metadatos (título, categoría, fecha, etc.) esperada por el portal.
- **Variables de Entorno:** El agente asume que el archivo `.env` o `.env.local` ya posee las claves `SUPABASE_URL` y `SUPABASE_KEY`. Las consultas a Supabase desde el cliente deben usar exclusivamente estas variables públicas.
