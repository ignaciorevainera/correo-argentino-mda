---
description: Apply Context7 consultation rules. Loaded automatically for any task that involves installing, updating or using a library, framework or package. Defines when and how to use context7/resolve-library-id and context7/query-docs before writing code that depends on external dependencies.
applyTo: 'package.json, **/*.astro, **/*.ts, **/*.tsx'
---

## Por qué consultar Context7

El conocimiento del agente sobre una librería proviene de su entrenamiento
y puede estar desactualizado respecto a la versión instalada en el proyecto.
Context7 provee documentación técnica actualizada de la versión activa de
cada librería, no de la versión que el agente recuerda.

Consecuencias de NO consultar Context7:
- Usar métodos deprecados que generan warnings o errores silenciosos
- Instalar una versión incorrecta o incompatible con el stack actual
- Aplicar patrones de configuración de versiones anteriores
- Perder features nuevas que simplifican la implementación

---

## Cuándo consultar Context7

### Siempre — sin excepción

Antes de instalar cualquier dependencia nueva:
  Verificar la versión más reciente y si hay breaking changes
  respecto a las otras dependencias del proyecto.

Antes de usar la API de cualquier librería del stack:
  Confirmar que el método, opción o patrón que se va a usar
  existe en la versión instalada y sigue siendo el recomendado.

### Librerias que siempre requieren consulta

  Framework y build:
    astro · @astrojs/tailwind · @astrojs/react · @astrojs/vercel

  Estilos:
    tailwindcss · daisyui · theme-change

  Autenticación:
    better-auth · @clerk/astro · @supabase/supabase-js (auth)

  Base de datos:
    @supabase/supabase-js · drizzle-orm · @vercel/postgres

  Testing:
    vitest · @playwright/test

  Formularios y validación:
    react-hook-form · zod · @hookform/resolvers

  Content y MDX:
    astro:content · @astrojs/mdx

  Miscelánea con API no trivial:
    fuse.js · next-themes · lucide-react (cuando se usan composables)

### No es necesario consultar Context7 para

  Utilidades sin API compleja:
    clsx · tailwind-merge · date-fns (funciones simples)
    @fontsource-variable/* (solo imports de CSS)
    @iconify-json/* (solo assets estáticos)

---

## Flujo de consulta

### Paso 1 — Obtener el ID de la librería

  context7/resolve-library-id query="nombre-de-la-libreria"

El query debe ser el nombre exacto del paquete npm o un término
descriptivo si no se conoce el nombre exacto:

  query="supabase javascript client"    → encuentra @supabase/supabase-js
  query="astro framework"               → encuentra astro
  query="tailwind css"                  → encuentra tailwindcss
  query="better auth"                   → encuentra better-auth

### Paso 2 — Consultar la documentación

  context7/query-docs libraryId="[id-del-paso-1]" query="[consulta-especifica]"

El query debe ser específico — no consultar "documentation" en general
sino el aspecto concreto que se necesita:

  Instalación y configuración:
    query="installation setup configuration"
    query="getting started astro integration"

  Versión actual:
    query="latest version release notes"
    query="migration guide v4 to v5"

  API específica:
    query="select filter join query builder"
    query="session management cookies server side"
    query="test fixtures authentication setup"

  Breaking changes:
    query="breaking changes deprecated methods"
    query="migration guide version upgrade"

### Paso 3 — Aplicar lo que devuelve el MCP

Usar la versión, sintaxis y patrones que Context7 devuelve —
no los que el agente tenía en memoria. Si hay discrepancia entre
lo que el agente recordaba y lo que devuelve Context7, Context7
tiene la razón. Documentar la diferencia en tasks/lessons.md si
el cambio puede afectar otras partes del proyecto.

---

## Consultas antes de instalar una dependencia

Cuando el plan incluye instalar una dependencia nueva, consultar
antes de escribir el comando de instalación:

  # Verificar versión actual y compatibilidad
  context7/resolve-library-id query="nombre-libreria"
  context7/query-docs libraryId="[id]" query="latest version peer dependencies"

Verificar especialmente:
  - ¿La versión más reciente es compatible con la versión de Astro del proyecto?
  - ¿Hay peer dependencies que también necesitan actualizarse?
  - ¿El paquete requiere configuración adicional en astro.config.mjs?

Luego instalar con la versión específica si hay riesgo de incompatibilidad:
  npm install nombre-libreria@version-especifica

O con la versión más reciente si la compatibilidad está confirmada:
  npm install nombre-libreria

---

## Ejemplos de consultas por librería

### Astro
  context7/resolve-library-id query="astro"
  context7/query-docs libraryId="[id]" query="content collections getCollection render"
  context7/query-docs libraryId="[id]" query="server endpoints APIRoute"
  context7/query-docs libraryId="[id]" query="middleware session auth"
  context7/query-docs libraryId="[id]" query="image optimization component"

### DaisyUI
  context7/resolve-library-id query="daisyui"
  context7/query-docs libraryId="[id]" query="theme configuration v5"
  context7/query-docs libraryId="[id]" query="component modal dialog v5"
  (Complementar siempre con el MCP dedicado de DaisyUI para componentes)

### Supabase JS
  context7/resolve-library-id query="supabase-js"
  context7/query-docs libraryId="[id]" query="select filter from table"
  context7/query-docs libraryId="[id]" query="auth session server side"
  context7/query-docs libraryId="[id]" query="realtime subscription"

### Better Auth
  context7/resolve-library-id query="better-auth"
  context7/query-docs libraryId="[id]" query="astro integration setup"
  context7/query-docs libraryId="[id]" query="session middleware protection"

### Vitest
  context7/resolve-library-id query="vitest"
  context7/query-docs libraryId="[id]" query="configuration setup mock"
  context7/query-docs libraryId="[id]" query="describe it expect matchers"

### Playwright
  context7/resolve-library-id query="playwright"
  context7/query-docs libraryId="[id]" query="test fixtures page navigation"
  context7/query-docs libraryId="[id]" query="authentication setup cookies"