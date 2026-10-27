# Portal MDA — Agent Guide

## Testing policy

- **Never** write unit tests after writing the code.
- **Prefer E2E tests as the only testing mechanism.** Use them to verify complex functionality. After E2E runs, produce a verifiable, reproducible artifact: Playwright HTML report + traces (`playwright show-report`, trace viewer).
- When testing a system in isolation, **FIRST** write all the ways it could fail, **THEN** write the code.

### Test quality (when implementing with TDD)

- Tautological tests are harmful.
- Change-detector tests are harmful.
- Do not create regression tests for bug fixes without a genuine gap in behavior testing.

## General workflow

- **Read docs first** before writing code: `docs/DESIGN.md` (visual system), `docs/CONTEXT.md` (conventions, infra), `docs/lessons.md` (known errors)
- **MCP tools have priority** over built-in equivalents when available. Use MCPs for: browser automation (Playwright MCP), docs (Context7 MCP, Astro docs MCP), external API queries
- **When you need to search docs** for a library/framework/API, use Context7 CLI (`ctx7`) — never guess API signatures or rely on training data
- **Keep outputs minimal**: no preamble/postamble, no code explanations unless asked
- **Never commit** unless explicitly requested

## Issue tracking (hallazgos no bloqueantes)

- **Al|TYP de implementación**, si encontrás un hallazgo **no bloqueante** (bug latente, deuda técnica, riesgo, inconsistencia) o una **oportunidad de mejora** que no vale bloquear el trabajo actual: **no lo fixes en el acto ni lo dejes solo en el chat** — registralo como issue.
- Usar la skill global **`managing-github-issues`** (`skill` tool, nombre `managing-github-issues`) para redactar/decomponer/actualizar/cerrar issues. Nunca improvisar formato.
- Crear/actualizar la issue **con el MCP `github`** (`github_issue_write`, `github_search_issues`, `github_issue_read`), nunca con `gh` CLI ni web. Buscar duplicados antes de crear.
- Las issues funcionan como **registro acumulado del proyecto**: contexto, evidencia (paths, líneas), impacto y criterio de aceptación. Se resuelven **cuando se planifique**, no por enganche.
- **Labels: conjunto cerrado, siempre en inglés.** Catálogo completo: `bug`, `enhancement`, `refactor`, `test`, `style`, `performance`, `documentation`, `chore`, `ui/ux`, `database`, `architecture`, `security`, `high-priority`, `epic`, `tech-debt`, `finding`. **No crear labels nuevas**; si el trabajo no encaja, proponé nombre + color + descripción y esperá OK. Equivalencias de nombres ya fuera de circulación: `hallazgo` → `finding`, `deuda-tecnica` → `tech-debt`, `mejora` → `enhancement` (eliminada por redundante). Severidad explícita en el título o label cuando aplique.
- **Nunca commitear** código para "dejar el fix de paso" si no fue pedido — issue primero, fix después planificado.

## Quick start

- `npm run dev` — dev server (port 4321)
- `npm run build` — Astro SSR build (`dist/`)
- `npm run db:push` — push Drizzle schema to SQLite
- `npm run db:studio` — Drizzle Studio GUI
- `npm run buildings:reconcile` — releva/unifica oficinas del mismo edificio (dry-run por defecto; `--apply` + `CONFIRMAR` para escribir). Equivalente web: `/admin/oficinas/edificios` (solo admin).
- **Never run `npm install`/`npm audit fix` while PM2/Node processes are alive.** On Windows, native `.node` modules in use (e.g. `better-sqlite3.node`) can't be replaced (`EBUSY/EPERM`) → `node_modules` stays inconsistent → the next build ships a broken SSR manifest. `pm2 kill` (or stop the processes) before installing.
- **After `git pull` that changes `package.json`/`package-lock.json` (e.g. Astro upgrades): always run `npm install` before `npm run build`.** Stale/mismatched `node_modules` builds a broken `dist/server/entry.mjs` where the Astro SSR manifest gets `rootDir: undefined`, crashing at startup with `TypeError: Invalid URL` in `deserializeManifest`. `npm install` + rebuild fixes it; repo code is fine.
- **Stale/mismatched `node_modules`** builds a broken `dist/server/entry.mjs` where the SSR manifest gets `rootDir: undefined`, crashing at startup with `TypeError: Invalid URL` (`input: 'undefined'`) in `deserializeManifest`. `npm run build` now runs `scripts/verify-build.mjs` after `astro build`, failing the build if `rootDir` is missing. Fix when it trips: stop Node, delete `node_modules`, `npm ci`, rebuild. See `docs/lessons.md` (2026-09-07) and `scripts/auto-deploy.bat`.

## Testing

- `npm run test:domain` — tests de dominio con `node:test` sobre los `*.test.ts` de `src/lib/` + `src/pages/api/calidad/*.test.ts` (329 tests). **No los cubre vitest**: `vitest.config.ts` incluye únicamente `tests/unit/**`.
- `npm run test:unit` — vitest sobre `tests/unit/**` (701 tests). Hay **3 fallos pre-existentes**: dos en `tests/unit/phase1-buttons-standardization.test.ts` (el `Cancelar` de `src/pages/profile.astro` ya no es un `ActionButton` tras el cambio de blanqueo de contraseña, y la assertion de `DirectorioContent`) y uno en `tests/unit/challenger-remaining-empirical.test.ts` (paginación); no scopear el glob.
- `npm test` — `test:domain` primero y después `test:unit`. Sale con código 1 hoy por esos fallos pre-existentes; el dominio corre primero para que una regresión real no quede enmascarada.
- `npm run test:e2e` — Playwright completo (`tests/**/*.spec.ts`). Workers: 1 (serial). Requiere dev server; ver "Puertos de la suite E2E" abajo.
- `npm run test:e2e:home` — solo el spec del home personalizado (26 tests: perfiles, calidad-only, simulador de vista, configurador de widgets y de accesos de abajo, vínculo de agente y CSRF).
- `npm run test:e2e:reconcile` — solo el spec de reconciliación de edificios (7 tests).
- `npm run changelog:validate` — valida integridad de archivos Markdown en `src/config/changelog/` (fechas ISO, existencia de commits en git, ausencia de commits duplicados entre releases, ausencia de links markdown externos y parseo exitoso).
- `npm run changelog:prune` — dry-run: lista los changelogs fuera de la ventana de retención (3 meses, anclada al release más reciente). `-- --apply` los borra del disco.
- `npx playwright show-report` — reporte HTML + trazas.
- No hay CI: los tests corren a mano.
- La sección **Testing policy** (arriba) gobierna cómo se _escriben_ los tests; esta gobierna cómo se _ejecutan_.

### Puertos de la suite E2E

- `playwright.config.ts` resuelve `baseURL` **y** `webServer.url` desde `PLAYWRIGHT_BASE_URL` (default `http://localhost:4321`); el puerto se deriva de esa URL.
- **Playwright arranca el dev server solo** (`webServer` en `playwright.config.ts`): `command: npm run dev -- --port <port>`, `url: baseURL`, `reuseExistingServer: !process.env.CI`, `env: { ASTRO_DEV_BACKGROUND: "0" }`, `timeout: 120000`. Correr solo `npx playwright test ... --timeout=30000` — Playwright levanta, espera readiness real y mata el server al final.
- **`ASTRO_DEV_BACKGROUND: "0"` es obligatorio en `webServer`**: Astro 7 auto-backgroundea el dev server cuando detecta agente → el proceso padre sale inmediato y Playwright falla con `Process from config.webServer exited early`.
- **Nunca manejar el server a mano**: nada de `Get-CimInstance Win32_Process`, `Start-Process -WindowStyle Hidden`, `Start-Sleep -Seconds N`, kill por `Get-NetTCPConnection | Stop-Process`, `while` sin deadline, `Select-Object -Last/-First N`, ni `2>&1`. Son las causas de los cuelgues; Playwright ya cubre el ciclo de vida del server.
- **Proyectos/worktrees en simultáneo**: cada workspace DEBE usar un puerto único vía `PLAYWRIGHT_BASE_URL` (ej. 4321/4322/4323). Peligro: si dos comparten el default 4321 y `reuseExistingServer: true`, Playwright **reusa el server del otro proyecto** (la URL responde) y corre los tests contra la app equivocada → falsos positivos. Pinear puerto distinto por workspace es la única mitigación confiable.
- **Si el puerto lo tomó otro proceso**: con `reuseExistingServer: true` Playwright lo reusa (mal, ver arriba); con `false` Astro puede elegir el siguiente puerto libre y Playwright espera `webServer.url` fijo → falla con timeout (claro, no falso positivo). Preferible fallar claro que testear la app equivocada.
- **Nunca** comparar una URL contra `http://localhost:4321` literal en un spec: usar `test.info().project.use.baseURL`. Hay un guard en `tests/unit/specs-base-url.test.ts`.
- Arrancar el dev server a mano (solo para debug) en su **propio comando terminal visible**; ver `docs/lessons.md`.
- **Agente puede levantar dev server** para tests: `Start-Process -FilePath "npm" -ArgumentList "run","dev","--port","<PORT>"` — sin `-WindowStyle Hidden`. Poll readiness con deadline 30s. Si no arranca → throw + reportar.
- **Nunca** comparar una URL contra `http://localhost:4321` literal en un spec: usar `test.info().project.use.baseURL`. Hay un guard en `tests/unit/specs-base-url.test.ts`.

## DB & Drizzle

- **SQLite** at `database/mda.db` (gitignored; copy from prod or `drizzle-kit push`)
- **Schema alignment**: `npx tsx scripts/align-db-to-schema.mts` — idempotente, hace backup, deriva el DDL canónico de `src/db/schema.ts`, reconstruye tablas desalineadas y verifica paridad + integridad. `drizzle-kit push` volvió a funcionar (el bug lo disparaba el CHECK constraint en users, eliminado en 2026-08-30), pero el align script sigue siendo más seguro con datos reales: nunca trunca y reporta en vez de aplicar data-loss statements.
- **Schema**: `src/db/schema.ts` — all tables, relations, types
- **Config**: `drizzle.config.ts` (sqlite dialect, schema `./src/db/schema.ts`, out `./drizzle`)
- **Connection**: `src/db/index.ts` via `better-sqlite3`
- **After schema changes, always run `npx tsx scripts/align-db-to-schema.mts` before the PM2 restart — never `npm run db:push`** (`drizzle-kit push` aborts here with `Error: Interactive prompts require a TTY terminal`).
- **Runbook `scripts/normalize-participaciones.mts`** (one-time, idempotente, corrige participaciones stale de `agents`): (1) **dry-run primero**: `npx tsx scripts/normalize-participaciones.mts`; (2) en prod, antes de aplicar, verificar el vinculo `agents.username ↔ users.username` — el reporte muestra `skippedNoAgent` (usuarios sin agente vinculado que NO se tocan); (3) recien entonces `npx tsx scripts/normalize-participaciones.mts --apply`, que crea un backup **WAL-safe** en `database/` (via `db.backup()`, incluye `-wal`) y escribe en transaccion sincrona. Nunca borra filas.
- **Backfill `scripts/backfill-asistencia.mts`** (one-time, idempotente, inicializa `agents.en_asistencia`; corre solo dentro de `auto-deploy.bat` tras el align): misma mecánica (dry-run por defecto, `--apply` con backup WAL-safe y tx síncrona); aborta si falta la columna. Política: mesa participativa (hoy solo MDA TI) + rol no supervisor + `en_cronograma` ⇒ `en_asistencia=1`; resto ⇒ 0; agentes legacy **sin usuario vinculado** conservan `en_cronograma` (no hay mesa/rol que evaluar). Invariante: `enAsistencia ⊆ enCronograma`. No correr `--apply` sin revisar el dry-run.

## Stack & style

- **Astro SSR** (`output: "server"`) with `@astrojs/node` in `middleware` mode, served by `server.mjs` (Express: static + compression) — not standalone
- **Tailwind v4** (config-free) + **DaisyUI v5** — use DaisyUI token colors only, never hardcode hex
- **React islands** via `@astrojs/react` — interactive only; prefer `.astro` for static content
- **Icons**: `astro-icon` with `@iconify-json/boxicons`
- **URL base helper**: `@lib/baseUrl` exposes `getCleanBase()` (with trailing `/`, for `` `${...}api/foo` ``) and `getBaseNoSlash()` (without trailing `/`, for `` `${...}/oficinas` ``). Always use it; never re-declare `const base = import.meta.env.BASE_URL || "/"` inline.
- **Export PNG de cronograma**: la tabla mensual se renderiza server-side (`GET /api/cronograma/export.png?month=YYYY-MM` → `@resvg/resvg-js`). No reintroducir `html-to-image` para la tabla mensual: su costo es ~17 KB de estilos por nodo y un mes completo supera el límite de data URL de Chrome (ver `docs/lessons.md` 2026-09-30).
- **Firma institucional (Outlook)**: el logo se sirve desde `public/firma.png` (ruta fija, sin hash) y el HTML copiado usa URL absoluta. No volver a `@assets/firma.png`: el hash cambia por build y rompe las firmas ya guardadas (ver `docs/lessons.md` 2026-10-02).
- **Fonts**: `@fontsource-variable/geist` (UI), `@fontsource-variable/geist-mono` (technical data)
- **Path aliases**: `@/*` → `src/*`, `@components/*`, `@db/*`, `@lib/*`, etc.
- **Layout contract**: body `flex flex-col min-h-screen`, main `flex-1` (in `BaseLayout.astro`)

## Code conventions (full list in `docs/CONTEXT.md`)

- **Server Islands**: content pages use `server:defer` + skeleton fallback. In deferred components `Astro.url.pathname`/`searchParams` point to `/_server-islands/...` — recover originals via `getResolvedPathname()`/`getResolvedSearchParams()` from `@lib/navigation.ts` (Referer header)
- **Icons**: `astro-icon` with `size={24}` numeric — never `w-5`/`h-5`/`size-5`
- **Scoped styles**: Astro `<style>` doesn't cross component boundaries nor hit injected HTML — use `<style is:global>` when it must
- **Frontmatter**: keep all `import` statements at the top of `.astro` frontmatter (mid-block imports break the build)
- **Toasts**: server redirects pass `?toast_msg=&toast_type=success|error|warning|info`; client `showToast()` from `@lib/toastClient.ts`
- **DataTable sorting**: wrap in `data-table-sort-root`, rows `data-table-row` + `data-sort-*` (master-detail uses `data-master-detail-sort-item`)
- **API routes**: usar `jsonResponse`/`jsonError` (`@lib/apiResponse`), `requireWriteAccess`/`requireReadAccess` (`@lib/rbac-middleware`), `logAdminFromAstro`; ver sección "API routes" en `docs/CONTEXT.md`
- **`requireSession`** (`@lib/rbac-middleware`): exige solo sesión iniciada (cualquier rol), 401 si no la hay. Usarlo cuando el endpoint alimenta una página `ALL_ROLES` y no hay módulo RBAC propio (p.ej. `search`/`status`/`net-user`/`invgate-user` que sirven `/buscador-usuarios`). Si existe un módulo en `getModulePermissions`, preferir `requireReadAccess`/`requireWriteAccess`.

## Auth & RBAC

- Session cookie-based middleware in `src/middleware.ts`
- Roles (ascending): `agent` < `referent` < `team_leader` < `supervisor` < `admin`
- Config: `src/lib/rbac.ts` — route permissions + module-level read/write
- Required env vars (`.env`, gitignored): `SESSION_SECRET`, `ENCRYPTION_KEY`, `INVGATE_API_KEY`, `INVGATE_BASE_URL`, `INVGATE_API_USERNAME`, `EXTERNAL_STORAGE_DIR`

## Admin CRUD pattern

- Use `.agents/skills/admin-crud-pattern/` skill when adding admin CRUD pages
- Always call `logAdminAction()` (`@lib/auditLogger`) on every mutation
- Form components in `src/components/ui/forms/`: FormField, SelectField, FormTextarea, PasswordField
- DataTable: `src/components/ui/DataTable.astro`

## Documentation lookup (Context7)

- Use Context7 CLI (`ctx7`) to search docs for libraries, frameworks, SDKs, APIs — never guess or rely on training data
- Two-step process:
  1. `ctx7 library <name> <query>` — resolve library to Context7 ID
  2. `ctx7 docs <libraryId> <query>` — query docs with the resolved ID
- First try the MCP `context7` server (resolve-library-id + query-docs) before the CLI
- Max 3 queries per question. If quota is exceeded, tell the user and answer from training data
- Keep `ctx7` up to date: `npm install -g ctx7@latest`

## Frontend work — read first

- `.agents/rules/frontend.md` — design system rules (always_on)
- `docs/DESIGN.md` — source of truth for palette, typography, spacing
- `docs/CONTEXT.md` — product context, sitemap, header contract, conventions
- `docs/lessons.md` — known bugs and error patterns (read at session start)
- `src/lib/navigation.ts` — register new routes here to auto-propagate sidebar + command palette
- **Estándar de formularios (edit/create)**: ver `docs/FORM_STANDARD.md`.
  Usar siempre `src/components/ui/FormShell.astro` (`PageHeader` título +
  subtítulo, íconos `-filled`, barra de acciones al pie: Cancelar
  `variant="soft" color="btn-error"` + Guardar, alineados a la derecha). Sin breadcrumb.
  No duplicar el shell en cada página.

## PM2 production

- `ecosystem.config.cjs` — 5 processes: Astro SSR (port 4321), mda-ping-cubics, sync-legacy-inventory, sync-users, sync-office-links
- `scripts/auto-deploy.bat` — git pull → pm2 kill → npm install → align-db-to-schema → backfill-asistencia --apply → build (verify-build) → pm2 start
- `scripts/backup-db.bat` — copies `database/mda.db` to backup directory
- **PowerShell MUST run as Administrator** for every deploy/build/`pm2` command on the server. Not a recommendation. Without elevation `pm2` fails with `connect EPERM \\.\pipe\rpc.sock` (named-pipe ACL denies connect to a non-admin token) and `npm install` corrupts `node_modules` while Node processes are alive. Verify: `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)` must return `True`. The PM2 daemon must be started once from an elevated console of the real service user and always operated from a console with the same elevation.
- **Never build with PM2 alive, never two builds at once.** A stale/mismatched `dist/client` makes hashed assets 404, and `server.mjs` has no `/_astro/*` guard: the miss falls through to the SSR handler, which answers the HTML 404 page with `Content-Type: text/html`. Symptom in the browser: `Refused to apply style ... MIME type ('text/html')`. `verify-build.mjs` only checks `rootDir`, so it passes on a corrupt `dist`. Manual integrity check: every `_astro/<file>` referenced by `dist/server/entry.mjs` must exist under `dist/client` (expected: 0 missing). Never validate hashed assets with `astro preview` (in `mode: "middleware"` it does not serve `dist/client`). See `docs/lessons.md` 2026-10-05 and `docs/deploy-produccion.md` §Errores comunes.

## HTTPS / reverse proxy (Apache XAMPP)

- TLS termina en Apache (`:443`) con proxy a `127.0.0.1:4321`; `:80` redirige a `https://mda.correo.local/`. Runbook: `docs/deploy-produccion.md` §5.3.
- `@astrojs/node` en modo `middleware` **ignora `X-Forwarded-Proto`** (solo detecta `req.socket.encrypted`): detrás del proxy `Astro.url.origin` queda en `http://`. Nunca usar `Astro.url.origin` para self-fetch server-side — usar `getInternalOrigin()` (`@lib/internalOrigin`, loopback directo a Express). Client-side `window.location.origin` sí es confiable. Todo self-fetch interno debe reenviar cookie **y** `user-agent` con `getInternalFetchHeaders(Astro.request)` (`@lib/internalOrigin`): el middleware liga la sesión al UA (`computeFingerprint`) y la **elimina** si no coincide (302 a `/login` → el endpoint responde 502 y el usuario queda deslogueado). Ver `docs/lessons.md` 2026-10-01.
- Cookie de sesión `Secure` vía `SESSION_COOKIE_SECURE` (runtime `process.env` gana sobre build-time `import.meta.env`; en prod se define en `ecosystem.config.cjs`). `navigator.clipboard` exige contexto seguro (HTTPS).
- Nunca commitear material de certificados (`.cer/.crt/.key/.pem/.pfx` ya gitignored). El CA corporativo debe estar en el trust store de los clientes; si no, browser warning y clipboard sigue bloqueado.
