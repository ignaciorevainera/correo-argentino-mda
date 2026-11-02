# Especificación: Visor de Changelog y Novedades del Portal

## 1. Overview
Implementar una sección dedicada de **Changelog y Novedades del Portal** accesible en la ruta `/changelog` para todos los roles autenticados (`ALL_ROLES`: `agent`, `referent`, `team_leader`, `supervisor`, `admin`).
La información de novedades se basará en un repositorio interno de archivos Markdown estructurados en `src/config/changelog/` (cargados en tiempo de ejecución de manera segura emulando el patrón probado de `src/lib/ai/rubricsLoader.ts` y compilados en bundle con Vite/Astro), generados periódicamente a partir de resúmenes amigables obtenidos con Gemini Spark.
Se proveerá una plantilla de ejemplo (`example.md`) con bandera `draft: true` (para que el loader la ignore), una guía de Prompt (`docs/PROMPT_GEMINI_SPARK.md`) fuera del directorio de entries, renderizado sanitizado con `marked` + `sanitize-html` para prevenir XSS, y un **indicador visual discreto de novedades no leídas** en la barra de navegación (`navbar.astro` y `drawerContent.astro`).

## 2. Requisitos Funcionales

### 2.1. Almacenamiento, Parser y Seguridad de Changelogs
- **Directorio de contenido:** `src/config/changelog/`.
- **Estructura de archivos:** Archivos Markdown fechados/versionados (ej. `2026-10-20.md`, `2026-10-15.md`).
- **Metadatos frontmatter (YAML):**
  - `title`: Título amigable del release o período de novedades.
  - `date`: Fecha de publicación (formato `YYYY-MM-DD`).
  - `version`: (Opcional) Identificador de versión o etiqueta.
  - `draft`: (Booleano opcional) Si es `true`, el loader lo ignora por completo.
- **Sanitización estricta (Anti-XSS):** Todo markdown proveniente de Gemini Spark se procesa reutilizando la utilidad existente del proyecto `renderMarkdown` de `src/lib/markdown.ts` (sin duplicar allowlists ni crear dependencias extras). La allowlist estricta excluye intencionalmente el atributo `class` para prevenir ataques de UI-redressing o alteración de visibilidad; el estilo visual del contenido se gobierna exclusivamente mediante CSS scoped del portal (`<style is:global>`). Asimismo, el changelog no admite imágenes embebidas directas: cualquier tag `<img>` o sintaxis markdown de imagen sin fuente KB institucional se degrada automáticamente a un `<span>` seguro con su texto alternativo (`alt`).
- **Plantilla y Guía de Gemini Spark:**
  - `src/config/changelog/example.md` con `draft: true` y la estructura modelo.
  - `docs/PROMPT_GEMINI_SPARK.md` fuera del directorio para evitar colisiones de parseo, con instrucciones para el usuario y el prompt para Gemini Spark.

### 2.2. Navegación y Control de Acceso (RBAC)
- **Ruta principal:** `/changelog`.
- **RBAC:** Registro explícito en `routePermissions` de `src/lib/rbac.ts`: `{ path: "/changelog", roles: ALL_ROLES }`.
- **Navegación:** Registrar `/changelog` en `src/lib/navigation.ts` (Command Palette `Ctrl+K` y menú de usuario).
- **Documentación de arquitectura:** Registrar la decisión técnica de carga y sanitización en `conductor/tech-stack.md` y actualizar el sitemap en `docs/CONTEXT.md`.

### 2.3. Interfaz de Usuario y Reutilización de Componentes
- Reutilizar componentes oficiales existentes del portal:
  - `src/components/ui/PageHeader.astro` para el título y subtítulo estándar.
  - `src/components/ui/SectionCard.astro` para la encapsulación de cada versión/release del changelog.
  - `src/components/ui/SearchEmptyState.astro` para cuando no hay resultados de búsqueda o no hay entradas registradas.
- **Interactividad:** Filtro en cliente por texto/sección y marcado de lectura en `localStorage` (`portal_mda_changelog_last_read`).

### 2.4. Indicador Discreto en Navbar y Drawer
- Integración en `src/layouts/_components/navbar.astro` y `src/layouts/_components/drawerContent.astro`.
- Badge indicador discreto (`badge badge-xs badge-primary`) visible cuando la fecha más reciente de changelog sea mayor a la guardada en `localStorage`.

## 3. Requisitos No Funcionales y Calidad
- **TDD:** Agregar `src/lib/changelog/*.test.ts` a `npm run test:domain` en `package.json` y verificar ejecución explícita de las pruebas de dominio.
- **Seguridad:** Test específico contra inyecciones XSS (`<script>`, `onerror`, iframes maliciosos) en el parser.
- **E2E:** Test en Playwright `tests/changelog/changelog.spec.ts` usando `dotenv/config`, puerto dedicado `$env:PLAYWRIGHT_BASE_URL="http://localhost:4323"` y reporte HTML reproducible (`playwright show-report`).

## 4. Criterios de Aceptación
- [ ] `npm run test:domain` ejecuta y aprueba los tests de `src/lib/changelog/changelogService.test.ts`.
- [ ] La ruta `/changelog` es accesible para cualquier usuario autenticado y denegada a accesos sin sesión.
- [ ] Se previene XSS al renderizar contenido Markdown.
- [ ] El indicador del navbar se activa ante novedades no leídas y se apaga al visitar `/changelog`.
- [ ] `npm run test:unit`, `npm run test:domain` y `npm run build` pasan sin errores.
