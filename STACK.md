# STACK

## Frontend
- Framework: Astro
- Estilos: Tailwind CSS + DaisyUI
- Tema DaisyUI: [El agente kickstart define esto en la sesion de diseno]
- Tipografia: [El agente kickstart define esto en la sesion de diseno]

## Base de datos
Ninguna

## Autenticacion
Ninguna

## Deploy
Sin configuracion de deploy activa

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
Ninguna

## Dependencias principales instaladas
- astro
- @astrojs/tailwind
- daisyui
- astro-icon
- @iconify-json/boxicons
- @astrojs/mdx


## Notas de configuracion
- **Modo de renderizado (Astro):** El proyecto mantiene `output: 'static'` en `astro.config.mjs`, sin adaptador de plataforma especifico.
- **Middleware:** `src/middleware.ts` permanece activo como passthrough sin protección de rutas ni validación de sesión.
- **Colecciones de Contenido (Content Collections):** Para la documentación importada de Notion, se debe definir el esquema de datos en `src/content/config.ts` utilizando Zod, asegurando que todos los archivos `.mdx` cumplan con la estructura de metadatos (título, categoría, fecha, etc.) esperada por el portal.
