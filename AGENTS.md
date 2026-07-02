# Correo Argentino MDA — Agent Guide

## Quick start
- `npm run dev` — dev server (port 4321)
- `npm run build` — Astro SSR build (`dist/`)
- `npm run db:push` — push Drizzle schema to SQLite
- `npm run db:studio` — Drizzle Studio GUI

## Testing
- `npx playwright test` — all E2E tests in `tests/`
- Workers: 1 (serial). Requires dev server at `http://localhost:4321`.
- No CI — tests run manually.

## DB & Drizzle
- **SQLite** at `database/mda.db` (gitignored; copy from prod or `drizzle-kit push`)
- **Schema**: `src/db/schema.ts` — all tables, relations, types
- **Config**: `drizzle.config.ts` (sqlite dialect, schema `./src/db/schema.ts`, out `./drizzle`)
- **Connection**: `src/db/index.ts` via `better-sqlite3`
- **Migration mismatches**: `npx tsx scripts/fix-drizzle-mismatch.ts`
- After schema changes, always run `npm run db:push`

## Stack & style
- **Astro SSR** (`output: "server"`) with `@astrojs/node` standalone adapter
- **Tailwind v4** (config-free) + **DaisyUI v5** — use DaisyUI token colors only, never hardcode hex
- **React islands** via `@astrojs/react` — interactive only; prefer `.astro` for static content
- **Icons**: `astro-icon` with `@iconify-json/boxicons`
- **URL base helper**: `@lib/baseUrl` exposes `getCleanBase()` (with trailing `/`, for `` `${...}api/foo` ``) and `getBaseNoSlash()` (without trailing `/`, for `` `${...}/oficinas` ``). Always use it; never re-declare `const base = import.meta.env.BASE_URL || "/"` inline.
- **Fonts**: `@fontsource-variable/geist` (UI), `@fontsource-variable/geist-mono` (technical data)
- **Path aliases**: `@/*` → `src/*`, `@components/*`, `@db/*`, `@lib/*`, etc.
- **Layout contract**: body `flex flex-col min-h-screen`, main `flex-1` (in `BaseLayout.astro`)

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

## Frontend work — read first
- `.agents/rules/frontend.md` — design system rules (always_on)
- `docs/DESIGN.md` — source of truth for palette, typography, spacing
- `docs/CONTEXT.md` — product context, sitemap, header contract
- `src/lib/navigation.ts` — register new routes here to auto-propagate sidebar + command palette

## PM2 production
- `ecosystem.config.cjs` — 3 processes: Astro SSR (port 4321), ping-worker, sync-legacy-inventory
- `scripts/auto-deploy.bat` — git pull → npm install → build → pm2 restart
- `scripts/backup-db.bat` — copies `database/mda.db` to backup directory
