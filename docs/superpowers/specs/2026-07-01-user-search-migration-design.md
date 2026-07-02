# User Search Migration — Design Spec

## Goal

Migrate the employee directory search ("Buscador de usuarios") from the current multi-technology stack (MySQL + PHP + Python + XAMPP) into the existing Astro + SQLite + Drizzle + TypeScript project, consolidating everything into a single codebase with consistent technologies.

## Current Architecture

```
MidPoint (cdc.correoargentino.com.ar)
  └─ scraper_db.py (Playwright Python)  ──→  MySQL (XAMPP :3306)
                                                ↓
              Chrome Extension ──→ PHP get_users.php ←── Astro Frontend
                  (same API)           ├─ search (fuzzy LIKE)
                                       ├─ net_user (LDAP/AD)
                                       └─ update (POST interno/telefono)
```

- **4 technologies**: Python, PHP, MySQL, TypeScript
- **External dependencies**: XAMPP (Apache + MySQL + PHP), separate `D:\MDA-FIND-EXTENSION\server\`, separate `D:\mda BD\scraper_db.py`
- **Security concern**: API token hardcoded in client-side JS
- **No pagination**: PHP API returns max 10 results, no server-side pagination

## Target Architecture

```
MidPoint (cdc.correoargentino.com.ar)
  └─ scripts/sync-users.ts (Playwright TS)  ──→  SQLite (Drizzle ORM)
                                                    ↓
              Chrome Extension ──→ Astro API Endpoints ←── Astro Frontend
                  (same API)           ├─ GET /api/usuarios/search?q=
                                       ├─ GET /api/usuarios/net-user?username=
                                       └─ PATCH /api/usuarios/[id]
                                                    ↓
                                       PM2 cron: sync-users (diario 02:00)
```

- **Single technology stack**: TypeScript + SQLite + Drizzle + Playwright + PM2
- **Zero external servers**: No XAMPP, no PHP, no MySQL
- **Session-based auth**: Uses existing Astro middleware, no hardcoded tokens
- **Consistent patterns**: Follows existing sync scripts (`sync-legacy-inventory.ts`), PM2 ecosystem, Drizzle upserts

## Data Model

### New table: `employees`

Defined in `src/db/schema.ts` following existing Drizzle conventions:

| Column | Type | Constraints | Source |
|--------|------|-------------|--------|
| `id` | `integer` | PK auto-increment | auto |
| `dni` | `text` | NOT NULL, UNIQUE | MidPoint scraper |
| `username` | `text` | NOT NULL | MidPoint scraper |
| `fullname` | `text` | NOT NULL | MidPoint scraper |
| `interno` | `text` | nullable | Manual edit (modal/extension) |
| `telefono` | `text` | nullable | Manual edit (modal/extension) |
| `sucursal` | `text` | nullable | Manual edit (modal/extension) |
| `email` | `text` | nullable | Computed: `<username>@correoargentino.com.ar` |
| `updated_at` | `text` | DEFAULT CURRENT_TIMESTAMP | auto |
| `created_at` | `text` | DEFAULT CURRENT_TIMESTAMP | auto |

The `email` field is computed by the sync script from `username`. It is stored in DB so it can be searched and displayed without runtime computation.

## API Endpoints

### `GET /api/usuarios/search?q=...`

- **Purpose**: Replace PHP fuzzy search
- **Auth**: Session-based (middleware), any authenticated user
- **Logic**: Drizzle `SELECT ... WHERE fullname LIKE '%q%' OR username LIKE '%q%' OR dni LIKE '%q%'` (case-insensitive via SQLite)
- **Response**: `{ results: Employee[], total: number }`
- **No pagination initially** (matches current behavior, ~12k records, LIKE is fast enough)

### `PATCH /api/usuarios/[id]`

- **Purpose**: Replace POST update to edit `interno`/`telefono`/`sucursal`
- **Auth**: Session-based, any authenticated user
- **Body**: `{ interno?: string, telefono?: string, sucursal?: string }`
- **Side effect**: Calls `logAdminAction()` for audit trail
- **Response**: `{ ok: true }` or `{ ok: false, message: string }`

### `GET /api/usuarios/net-user?username=...`

- **Purpose**: Replace PHP LDAP/AD query
- **Auth**: Session-based, any authenticated user
- **Implementation**: Uses `ldapjs` to bind to `ldap://correo.local:389` and query Active Directory for the user's groups, metadata, password age, etc.
- **Credentials**: From `.env` (`LDAP_USER`, `LDAP_PASS`, `LDAP_BASE_DN`, etc.)
- **Response**: Same format as current PHP (`output`, `fullname`, `title`, `employee_number`, `physical_office`, `manager_name`, `groups[]`, timestamps, etc.)
- **Error handling**: Returns `{ ok: false, message: "..." }` on connection errors or user not found

## Sync Script (`scripts/sync-users.ts`)

Rewrites the Python Playwright scraper in TypeScript, following the pattern of `sync-legacy-inventory.ts`.

**Flow:**
1. Read already-processed usernames from SQLite to support resumability
2. Launch headless Chromium via Playwright
3. Login to MidPoint (`cdc.correoargentino.com.ar/midpoint/login`) with credentials from `.env`
4. Navigate to users table (`/midpoint/admin/users`)
5. For each page:
   - Check each row for disabled status → `DELETE` from SQLite
   - For enabled users: visit profile page, extract `dni` + `fullname`
   - `UPSERT` into `employees` table: `db.insert(employees).values({...}).onConflictDoUpdate({target: employees.dni, set: {...}})`
   - Track processed usernames in-memory set
6. Move to next page until ">" button is disabled
7. Write `src/data/last-sync-users-status.json` with `{ status: "success"|"error", updatedAt: ISO timestamp, count: number }`
8. On error: write error status, `process.exit(1)`

**Dependencies:**
- `playwright` (npm) — needs to be moved from devDep to regular dep, or installed separately
- `@playwright/test` already exists as devDep

## PM2 Configuration

New entry in `ecosystem.config.cjs`:

```js
{
  name: "sync-users",
  script: "node",
  args: "--import tsx scripts/sync-users.ts",
  cron_restart: "0 2 * * *",
  autorestart: false,
  watch: false,
  error_file: "./logs/sync-users-error.log",
  out_file: "./logs/sync-users-out.log",
}
```

## Frontend Changes (`BuscadorUsuariosContent.astro`)

**Minimal changes required:**
1. Replace `fetch('http://mda.correo.local/...get_users.php?search=...'` with `fetch('/api/usuarios/search?q=...')`
2. Remove `headers: { "X-API-Key": "..." }`
3. Net-user modal: change URL from external PHP to `/api/usuarios/net-user?username=...`
4. Edit modal: change from POST to external PHP to `PATCH /api/usuarios/[id]`

**No visual changes.** All UI components remain the same.

## Chrome Extension

Update the API base URL from `http://mda.correo.local/api_mda_find_extension/` → `https://<astro-server-url>/api/usuarios/`.

## New Environment Variables (`.env`)

| Variable | Purpose |
|----------|---------|
| `LDAP_SERVER` | LDAP/AD server URL (default: `ldap://correo.local`) |
| `LDAP_PORT` | LDAP port (default: `389`) |
| `LDAP_BASE_DN` | Base DN (default: `DC=correo,DC=local`) |
| `LDAP_USER` | Bind user (default: `CORREO\otomasi`) |
| `LDAP_PASS` | Bind password |
| `MIDPOINT_USER` | MidPoint login username (currently `helpdesk`) |
| `MIDPOINT_PASS` | MidPoint login password |

## Decommission Plan

After everything is verified and stable:
1. Stop XAMPP Apache + MySQL services
2. Remove `D:\MDA-FIND-EXTENSION\server\` (PHP scripts)
3. Remove `D:\mda BD\` (Python scraper + batch file)
4. Remove `run_bot.bat` from Windows Task Scheduler

## Execution Order

| # | Step | Files | New Deps |
|---|------|-------|----------|
| 1 | Drizzle schema (`employees` table) | `src/db/schema.ts` | - |
| 2 | API: search endpoint | `src/pages/api/usuarios/search.ts` | - |
| 3 | API: update endpoint | `src/pages/api/usuarios/[id].ts` | - |
| 4 | Frontend: point to new APIs | `BuscadorUsuariosContent.astro` | - |
| 5 | API: LDAP/net-user endpoint | `src/pages/api/usuarios/net-user.ts` | `ldapjs` |
| 6 | Sync script: migrate scraper to TS | `scripts/sync-users.ts` | `playwright` (runtime) |
| 7 | PM2: add sync-users | `ecosystem.config.cjs` | - |
| 8 | Chrome extension: update URLs | Extension manifest/config | - |
| 9 | Decommission old stack | Remove PHP/Python/XAMPP | - |

## Rollback Strategy

Each step is independently revertible:
- Schema changes can be rolled back via Drizzle migration
- Old PHP API can be re-enabled by reverting frontend URL changes
- Chrome extension can be re-published with old URLs
- XAMPP services are only stopped after full validation period
