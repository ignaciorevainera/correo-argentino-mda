# Technology Stack: Portal MDA

## Core Technologies
- **Runtime Environment:** Node.js (>= 22.12.0) with native ECMAScript Modules (ESM).
- **Primary Language:** TypeScript (v5.9.3) in strict mode.
- **Web Framework:** Astro v7 (v7.3.2) configured with Server-Side Rendering (`output: "server"`) and `@astrojs/node` standalone adapter.
- **Frontend Islands:** React 19 (`@astrojs/react`) reserved strictly for complex interactive components.
- **Styling & Design System:** Tailwind CSS v4 (`@tailwindcss/vite`) + DaisyUI v5 (`daisyui`). Zero custom hex colors; strictly DaisyUI semantic tokens.
- **Typography & Icons:** Geist Sans Variable & Geist Mono Variable via Fontsource; `astro-icon` with Boxicons (`@iconify-json/boxicons`).
- **Database & Persistence:** SQLite (`database/mda.db`) managed via `better-sqlite3` and Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Validation:** Zod (`zod`, `drizzle-zod`).

## Security & Architecture
- **Authentication:** HMAC-signed session cookies managed via `src/middleware.ts`.
- **Role-Based Access Control (RBAC):** Strict 5-tier hierarchy (`agent` < `referent` < `team_leader` < `supervisor` < `admin`) defined in `src/lib/rbac.ts` and `src/lib/helpdeskAccess.ts`.
- **CSRF & Rate Limiting:** Signed session token verification (`src/lib/csrf.ts`) and memory rate limiters for mutating routes.
- **Encryption:** AES-256-GCM (`ENCRYPTION_KEY`) for sensitive credentials and tokens.

## External Services & Integrations
- **Ticketing & Service Desk:** InvGate Service Management REST API (`INVGATE_BASE_URL`).
- **Contact Center & Telephony:** Wise CX REST API (`WISE_CX_BASE_URL`).
- **Corporate Directory:** Active Directory / LDAP authentication via `ldapjs`.
- **Geographic & Mapping:** Leaflet and `topojson-client` for postal office visualization.
- **Hardware Monitoring:** ICMP Ping via `ping` for cubic and terminal health verification.

## Testing & Quality Assurance
- **End-to-End Testing (Primary):** Playwright (`@playwright/test`) running serially (1 worker) against local Astro SSR (`http://localhost:4321`).
- **Unit Testing:** Vitest (`vitest`) for standalone business logic and migration helper verification.
- **Linting & Formatting:** Prettier with Astro and Tailwind plugins; TypeScript type checking via `astro check`.

## Deployment & Operations
- **Process Manager:** PM2 managing 5 background processes (`ecosystem.config.cjs`):
  1. `correo-argentino-mda` (Astro SSR application)
  2. `mda-ping-cubics`
  3. `sync-legacy-inventory`
  4. `sync-users`
  5. `sync-office-links`
- **Automation Scripts:** `scripts/auto-deploy.bat` y `scripts/safe-deploy.mts` (despliegue transaccional con lockfile, pre-flight en copia de DB, guardia de schema estricta, smoke test HTTP y rollback automático); hook `scripts/git-hooks/pre-push` (`npm run prepare`).
- **Changelog & Content Loading (2026-10-20):**
  - Almacenamiento de notas de cambios en archivos Markdown bajo `src/config/changelog/`.
  - Carga resiliente en servidor con resolución de candidatos (`../../config/changelog`, `src/config/changelog`, `dist/config/changelog`), tomando en cuenta que en producción el despliegue incluye el repositorio completo.
  - Parseo de frontmatter YAML mediante la dependencia `yaml` (`yaml: ^2.3.0`), declarada explícitamente en `dependencies` porque el servidor la importa directo en runtime (`src/lib/changelog/changelogService.ts`).
  - Deduplicación cronológica automática de commits (en orden histórico ascendente) descartando repeticiones en releases posteriores y filtrando releases que queden vacías.
  - Cache en memoria por directorio (`Map<string, ChangelogEntry[]>`) para evitar lecturas de disco redundantes en el renderizado global de navbar, sin acoplar o contaminar ejecuciones con directorios temporales en tests.
  - Procesamiento seguro reutilizando exclusivamente `renderMarkdown()` de `src/lib/markdown.ts` (marked + sanitize-html sin atributo `class` para evitar UI-redressing y con degradación segura de imágenes no autorizadas a `<span>`).
  - **Excepción de Server Islands en `/changelog`:** Se renderiza directamente en servidor sin `server:defer` porque la fuente de datos es completamente local (archivos Markdown en disco procesados con cache en memoria a nivel de proceso), con tiempo de ejecución sub-milisegundo y cero I/O remoto. Diferir el contenido agregaría un viaje de red innecesario (`/_server-islands/...`) y riesgo de Cumulative Layout Shift (CLS) sin aportar mejora a la primera pintura.
