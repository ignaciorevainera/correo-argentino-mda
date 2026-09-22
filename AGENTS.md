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

## Quick start

- `npm run dev` — dev server (port 4321)
- `npm run build` — Astro SSR build (`dist/`)
- `npm run db:push` — push Drizzle schema to SQLite
- `npm run db:studio` — Drizzle Studio GUI
- **Never run `npm install`/`npm audit fix` while PM2/Node processes are alive.** On Windows, native `.node` modules in use (e.g. `better-sqlite3.node`) can't be replaced (`EBUSY/EPERM`) → `node_modules` stays inconsistent → the next build ships a broken SSR manifest. `pm2 kill` (or stop the processes) before installing.
- **After `git pull` that changes `package.json`/`package-lock.json` (e.g. Astro upgrades): always run `npm install` before `npm run build`.** Stale/mismatched `node_modules` builds a broken `dist/server/entry.mjs` where the Astro SSR manifest gets `rootDir: undefined`, crashing at startup with `TypeError: Invalid URL` in `deserializeManifest`. `npm install` + rebuild fixes it; repo code is fine.
- **Stale/mismatched `node_modules`** builds a broken `dist/server/entry.mjs` where the SSR manifest gets `rootDir: undefined`, crashing at startup with `TypeError: Invalid URL` (`input: 'undefined'`) in `deserializeManifest`. `npm run build` now runs `scripts/verify-build.mjs` after `astro build`, failing the build if `rootDir` is missing. Fix when it trips: stop Node, delete `node_modules`, `npm ci`, rebuild. See `docs/lessons.md` (2026-09-07) and `scripts/auto-deploy.bat`.

## Testing

- `npx playwright test` — E2E tests (`tests/**/*.spec.ts`). Workers: 1 (serial). Requires dev server at `http://localhost:4321`.
- Artifact after runs: HTML report + traces (see Testing policy).
- No CI — tests run manually.

## DB & Drizzle

- **SQLite** at `database/mda.db` (gitignored; copy from prod or `drizzle-kit push`)
- **Schema alignment**: `npx tsx scripts/align-db-to-schema.mts` — idempotente, hace backup, deriva el DDL canónico de `src/db/schema.ts`, reconstruye tablas desalineadas y verifica paridad + integridad. `drizzle-kit push` volvió a funcionar (el bug lo disparaba el CHECK constraint en users, eliminado en 2026-08-30), pero el align script sigue siendo más seguro con datos reales: nunca trunca y reporta en vez de aplicar data-loss statements.
- **Schema**: `src/db/schema.ts` — all tables, relations, types
- **Config**: `drizzle.config.ts` (sqlite dialect, schema `./src/db/schema.ts`, out `./drizzle`)
- **Connection**: `src/db/index.ts` via `better-sqlite3`
- After schema changes, always run `npm run db:push`
- **Runbook `scripts/normalize-participaciones.mts`** (one-time, idempotente, corrige participaciones stale de `agents`): (1) **dry-run primero**: `npx tsx scripts/normalize-participaciones.mts`; (2) en prod, antes de aplicar, verificar el vinculo `agents.username ↔ users.username` — el reporte muestra `skippedNoAgent` (usuarios sin agente vinculado que NO se tocan); (3) recien entonces `npx tsx scripts/normalize-participaciones.mts --apply`, que crea un backup **WAL-safe** en `database/` (via `db.backup()`, incluye `-wal`) y escribe en transaccion sincrona. Nunca borra filas.

## Stack & style

- **Astro SSR** (`output: "server"`) with `@astrojs/node` standalone adapter
- **Tailwind v4** (config-free) + **DaisyUI v5** — use DaisyUI token colors only, never hardcode hex
- **React islands** via `@astrojs/react` — interactive only; prefer `.astro` for static content
- **Icons**: `astro-icon` with `@iconify-json/boxicons`
- **URL base helper**: `@lib/baseUrl` exposes `getCleanBase()` (with trailing `/`, for `` `${...}api/foo` ``) and `getBaseNoSlash()` (without trailing `/`, for `` `${...}/oficinas` ``). Always use it; never re-declare `const base = import.meta.env.BASE_URL || "/"` inline.
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
  `variant="error"` + Guardar, alineados a la derecha). Sin breadcrumb.
  No duplicar el shell en cada página.

## PM2 production

- `ecosystem.config.cjs` — 5 processes: Astro SSR (port 4321), mda-ping-cubics, sync-legacy-inventory, sync-users, sync-office-links
- `scripts/auto-deploy.bat` — git pull → pm2 kill → npm install → build (verify-build) → pm2 start
- `scripts/backup-db.bat` — copies `database/mda.db` to backup directory
