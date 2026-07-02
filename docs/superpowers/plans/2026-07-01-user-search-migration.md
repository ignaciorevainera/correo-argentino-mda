# User Search Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the employee directory search from MySQL + PHP + Python + XAMPP into the existing Astro + SQLite + Drizzle + TypeScript stack.

**Architecture:** New `employees` SQLite table replaces MySQL `usuarios` table. Three new Astro API endpoints (search, update, LDAP/net-user) replace PHP `get_users.php`. A TypeScript + Playwright sync script replaces the Python scraper. Frontend `BuscadorUsuariosContent.astro` is updated to call the new endpoints. PM2 cron triggers the daily sync.

**Tech Stack:** Astro SSR, SQLite (better-sqlite3), Drizzle ORM, TypeScript, Playwright, ldapjs, PM2

---

### Task 1: Add `employees` table to Drizzle schema

**Files:**
- Modify: `src/db/schema.ts` (after line 18, before `sessions` table — or after the `users` table block)

- [ ] **Step 1: Add the `employees` table definition**

Insert after the `users` table (after line 18) in `src/db/schema.ts`:

```ts
export const employees = sqliteTable("employees", {
  dni: text("dni").primaryKey(),
  username: text("username").notNull(),
  fullname: text("fullname").notNull(),
  interno: text("interno"),
  telefono: text("telefono"),
  sucursal: text("sucursal"),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});
```

Also add `sql` to the import from `drizzle-orm` (not from `drizzle-orm/sqlite-core`, for consistency with existing API endpoints):

```ts
import { relations, sql } from "drizzle-orm";
```

- [ ] **Step 2: Push the schema to SQLite**

Run: `npm run db:push`

Expected output: Table `employees` created in `database/mda.db`.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): add employees table for user search migration"
```

---

### Task 2: Create API search endpoint

**Files:**
- Create: `src/pages/api/usuarios/search.ts`
- New directory: `src/pages/api/usuarios/` (create if not exists)

- [ ] **Step 1: Create the search endpoint**

Create `src/pages/api/usuarios/search.ts`:

```ts
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { like, or } from "drizzle-orm";
import { jsonResponse, jsonError } from "@lib/apiResponse";

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonError("No autenticado", 401);
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || "";

    if (!q) {
      return jsonResponse({ results: [], total: 0 });
    }

    // Escape SQLite LIKE wildcards
    const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escaped}%`;

    const results = await db
      .select()
      .from(employees)
      .where(
        or(
          like(employees.fullname, searchPattern),
          like(employees.username, searchPattern),
          like(employees.dni, searchPattern),
        ),
      )
      .orderBy(employees.fullname)
      .limit(50);

    return jsonResponse({
      results: results.map((e) => ({
        fullname: e.fullname,
        dni: e.dni,
        username: e.username,
        interno: e.interno,
        telefono: e.telefono,
        sucursal: e.sucursal,
      })),
      total: results.length,
    });
  } catch (error) {
    console.error("[UserSearch] Error:", error);
    return jsonError("Error al buscar usuarios", 500);
  }
};
```

- [ ] **Step 2: Test the endpoint builds**

Run: `npm run build` or just check with `npx astro check`

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/usuarios/search.ts
git commit -m "feat(api): add GET /api/usuarios/search endpoint"
```

---

### Task 3: Create API update endpoint

**Files:**
- Create: `src/pages/api/usuarios/[dni].ts`

- [ ] **Step 1: Create the update endpoint**

Create `src/pages/api/usuarios/[dni].ts`:

```ts
import type { APIRoute } from "astro";
import { db } from "@db/index";
import { employees } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import { logAdminAction } from "@lib/auditLogger";

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonError("No autenticado", 401);
  }

  const { dni } = params;
  if (!dni) {
    return jsonError("DNI del usuario requerido", 400);
  }

  try {
    const body = await request.json();
    const { interno, telefono, sucursal } = body;

    const existing = await db
      .select()
      .from(employees)
      .where(eq(employees.dni, dni))
      .limit(1);

    if (existing.length === 0) {
      return jsonError("Usuario no encontrado", 404);
    }

    await db
      .update(employees)
      .set({
        ...(interno !== undefined && { interno: interno || null }),
        ...(telefono !== undefined && { telefono: telefono || null }),
        ...(sucursal !== undefined && { sucursal: sucursal || null }),
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(employees.dni, dni));

    await logAdminAction(
      locals.user.username || "Sistema",
      `Actualizó datos de contacto del empleado ${existing[0].fullname} (${dni})`,
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[UserUpdate] Error:", error);
    return jsonError("Error al actualizar el usuario", 500);
  }
};
```

- [ ] **Step 2: Build check**

Run: `npx astro check` or `npm run build`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/usuarios/[dni].ts
git commit -m "feat(api): add PATCH /api/usuarios/[dni] endpoint"
```

---

### Task 4: Create API net-user (LDAP/AD) endpoint

**Files:**
- Create: `src/pages/api/usuarios/net-user.ts`
- Modify: `package.json` (add `ldapjs` dependency)

- [ ] **Step 1: Install ldapjs**

```bash
npm install ldapjs
```

- [ ] **Step 2: Create the net-user endpoint**

Create `src/pages/api/usuarios/net-user.ts`:

```ts
import type { APIRoute } from "astro";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import ldap from "ldapjs";

const LDAP_SERVER = import.meta.env.LDAP_SERVER || "ldap://correo.local";
const LDAP_PORT = import.meta.env.LDAP_PORT || 389;
const LDAP_BASE_DN = import.meta.env.LDAP_BASE_DN || "DC=correo,DC=local";
const LDAP_USER = import.meta.env.LDAP_USER;
const LDAP_PASS = import.meta.env.LDAP_PASS;
if (!LDAP_USER || !LDAP_PASS) {
  throw new Error("LDAP_USER and LDAP_PASS must be set in .env");
}

function convertFiletime(filetime: number): string | null {
  if (!filetime || filetime === 0) return null;
  // Windows Filetime is 100-nanosecond intervals since 1601-01-01
  const epoch = 11644473600000; // difference between 1601 and 1970 in ms
  const adjusted = Math.floor(filetime / 10000) - epoch;
  if (adjusted <= 0) return null;
  return new Date(adjusted).toISOString().replace("T", " ").substring(0, 19);
}

function formatOutput(data: {
  username: string; fullname: string; title: string; mail: string;
  employee_number: string; physical_office: string; telephone_number: string;
  manager_name: string; department: string; description: string;
  pwd_last_set: string; last_logon: string; when_created: string;
  account_expires: string; groups: string[];
}): string {
  const lines = [
    "Información del usuario en Active Directory",
    "===========================================",
    `Nombre de usuario: ${data.username || "N/A"}`,
    `Nombre completo: ${data.fullname || "N/A"}`,
    `Cargo: ${data.title || "N/A"}`,
    `Email: ${data.mail || "N/A"}`,
    `Legajo: ${data.employee_number || "N/A"}`,
    `Oficina: ${data.physical_office || "N/A"}`,
    `Teléfono: ${data.telephone_number || "N/A"}`,
    `Manager: ${data.manager_name || "N/A"}`,
    `Departamento: ${data.department || "N/A"}`,
    `Descripción: ${data.description || "N/A"}`,
    "",
    "Fechas de cuenta:",
    `  Último cambio de contraseña: ${data.pwd_last_set || "N/A"}`,
    `  Último inicio de sesión: ${data.last_logon || "N/A"}`,
    `  Cuenta creada: ${data.when_created || "N/A"}`,
    `  Cuenta expira: ${data.account_expires || "Nunca"}`,
    "",
    "Grupos de seguridad:",
    ...(data.groups || []).map((g: string) => `  - ${g}`),
    "",
  ];
  return lines.join("\n");
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonError("No autenticado", 401);
  }

  try {
    const url = new URL(request.url);
    const username = url.searchParams.get("username")?.trim();

    if (!username) {
      return jsonError("Parámetro username requerido", 400);
    }

    if (!/^[a-zA-Z0-9.\-_]+$/.test(username)) {
      return jsonError("Formato de username inválido", 400);
    }

    const client = ldap.createClient({
      url: `${LDAP_SERVER}:${LDAP_PORT}`,
      reconnect: false,
    });

    await new Promise<void>((resolve, reject) => {
      client.bind(LDAP_USER, LDAP_PASS, (err) => {
        if (err) reject(new Error(`Error de autenticación LDAP: ${err.message}`));
        else resolve();
      });
    });

    // Escape special LDAP filter characters
    const escapedUsername = username.replace(/[*()\\\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
    const searchFilter = `(&(objectClass=user)(sAMAccountName=${escapedUsername}))`;
    const opts = {
      filter: searchFilter,
      scope: "sub" as const,
      attributes: [
        "dn", "cn", "sAMAccountName", "displayName", "title", "mail",
        "employeeNumber", "physicalDeliveryOfficeName", "telephoneNumber",
        "manager", "department", "description", "memberOf",
        "pwdLastSet", "lastLogon", "lastLogonTimestamp", "whenCreated",
        "accountExpires", "badPwdCount", "lockoutTime",
      ],
    };

    interface LdapUserEntry {
      sAMAccountName?: string;
      cn?: string;
      displayName?: string;
      title?: string;
      mail?: string;
      employeeNumber?: string;
      physicalDeliveryOfficeName?: string;
      telephoneNumber?: string;
      manager?: string;
      department?: string;
      description?: string;
      memberOf?: string | string[];
      pwdLastSet?: number | string;
      lastLogon?: number | string;
      lastLogonTimestamp?: number | string;
      whenCreated?: string;
      accountExpires?: number | string;
      badPwdCount?: number | string;
      lockoutTime?: number | string;
    }

    const entries: LdapUserEntry[] = [];

    await new Promise<void>((resolve, reject) => {
      client.search(LDAP_BASE_DN, opts, (err, res) => {
        if (err) {
          reject(new Error(`Error en búsqueda LDAP: ${err.message}`));
          return;
        }

        res.on("searchEntry", (entry) => {
          entries.push(entry.pojo);
        });

        res.on("error", (err) => {
          reject(new Error(`Error en búsqueda LDAP: ${err.message}`));
        });

        res.on("end", () => {
          resolve();
        });
      });
    });

    client.unbind();

    if (entries.length === 0) {
      return jsonResponse({
        status: "error",
        error: `Usuario "${username}" no encontrado en Active Directory`,
        output: `Usuario "${username}" no encontrado en Active Directory.`,
      });
    }

    const adUser = entries[0];

    // Resolve manager name if present
    let managerName: string | null = null;
    if (adUser.manager) {
      const managerDn = Array.isArray(adUser.manager) ? adUser.manager[0] : adUser.manager;
      if (typeof managerDn === "string" && managerDn.includes("CN=")) {
        const cnMatch = managerDn.match(/CN=([^,]+)/);
        if (cnMatch) managerName = cnMatch[1];
      }
    }

    // Parse groups from memberOf
    const groups: string[] = [];
    if (adUser.memberOf) {
      const members = Array.isArray(adUser.memberOf) ? adUser.memberOf : [adUser.memberOf];
      for (const member of members) {
        const cnMatch = String(member).match(/CN=([^,]+)/);
        if (cnMatch) groups.push(cnMatch[1]);
      }
    }

    const data = {
      username: String(adUser.sAMAccountName || adUser.cn || username),
      fullname: String(adUser.displayName || ""),
      title: String(adUser.title || ""),
      mail: String(adUser.mail || ""),
      employee_number: String(adUser.employeeNumber || ""),
      physical_office: String(adUser.physicalDeliveryOfficeName || ""),
      telephone_number: String(adUser.telephoneNumber || ""),
      manager_name: managerName || "",
      department: String(adUser.department || ""),
      description: String(adUser.description || ""),
      pwd_last_set: convertFiletime(Number(adUser.pwdLastSet)) || "",
      last_logon: convertFiletime(Number(adUser.lastLogon || adUser.lastLogonTimestamp)) || "",
      when_created: String(adUser.whenCreated || ""),
      account_expires: convertFiletime(Number(adUser.accountExpires)) || "",
      bad_pwd_count: String(adUser.badPwdCount || "0"),
      lockout_time: convertFiletime(Number(adUser.lockoutTime)),
      groups,
    };

    const output = formatOutput(data);

    return jsonResponse({
      status: "success",
      ...data,
      output,
      groups,
    });
  } catch (error: any) {
    console.error("[NetUser] Error:", error);
    return jsonResponse({
      status: "error",
      error: error.message || "Error al consultar Active Directory",
      output: `Error: ${error.message || "No se pudo conectar con el servidor LDAP"}`,
    });
  }
};
```

- [ ] **Step 3: Build check**

Run: `npx astro check`

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/usuarios/net-user.ts package.json
git commit -m "feat(api): add GET /api/usuarios/net-user LDAP endpoint"
```

---

### Task 5: Update frontend to use new API endpoints

**Files:**
- Modify: `src/components/buscador-usuarios/BuscadorUsuariosContent.astro`

This task changes 3 fetch calls in the `<script>` block (lines 547-552, 633-643, 752-758).

- [ ] **Step 1: Update search fetch (lines 547-553)**

Replace the external API call with the local endpoint:

Old:
```javascript
const token = "mda_live_bf9d7a2e8c5643190ab76d2e1f48c590";
const url = `http://mda.correo.local/api_mda_find_extension/get_users.php?search=${encodeURIComponent(query)}`;
const response = await fetch(url, {
  headers: {
    "X-API-Key": token,
  },
});
```

New:
```javascript
const url = `/api/usuarios/search?q=${encodeURIComponent(query)}`;
const response = await fetch(url);
```

- [ ] **Step 2: Update edit fetch (lines 633-643)**

Old:
```javascript
const token = "mda_live_bf9d7a2e8c5643190ab76d2e1f48c590";
const url = `http://mda.correo.local/api_mda_find_extension/get_users.php`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": token,
  },
  body: JSON.stringify({ dni, interno, telefono }),
});
```

New:
```javascript
const url = `/api/usuarios/${dni}`;

const response = await fetch(url, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ interno, telefono }),
});
```

- [ ] **Step 3: Update net-user fetch (lines 752-758)**

Old:
```javascript
const token = "mda_live_bf9d7a2e8c5643190ab76d2e1f48c590";
const url = `http://mda.correo.local/api_mda_find_extension/get_users.php?action=net_user&username=${encodeURIComponent(username)}`;

const response = await fetch(url, {
  headers: {
    "X-API-Key": token,
  },
});
```

New:
```javascript
const url = `/api/usuarios/net-user?username=${encodeURIComponent(username)}`;
const response = await fetch(url);
```

- [ ] **Step 4: Update the response check in the edit success handler**

The current frontend checks `result.status === "success"`. The new API returns `{ ok: true }`. Change:

Old:
```javascript
if (result.status === "success") {
```

New:
```javascript
if (result.ok) {
```

- [ ] **Step 5: Update the net-user response handling**

The new API returns fields directly (not nested). The current handler checks `result.status === "success"` (around line 764). The new API response shape is `{ status: "success", fullname, title, ... }` — same as the PHP API. So no change needed here.

But verify: the PHP API returns `result.output` and `result.fullname`, etc. The new endpoint also returns these at the top level. The check `result.status === "success"` will work.

The error case at line 831 checks `result.error` — the new endpoint returns `result.error` too. This should be compatible.

- [ ] **Step 6: Verify changes compile**

Run: `npm run build`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/buscador-usuarios/BuscadorUsuariosContent.astro
git commit -m "feat(frontend): point user search to new API endpoints"
```

---

### Task 6: Create TypeScript Playwright sync script

**Files:**
- Create: `scripts/sync-users.ts`
- Modify: `package.json` (install `playwright` as runtime dependency)

- [ ] **Step 1: Install playwright**

```bash
npm install playwright
```

Then install the Chromium browser for Playwright:
```bash
npx playwright install chromium
```

- [ ] **Step 2: Create the sync script**

Create `scripts/sync-users.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/db/index";
import { employees } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { chromium } from "playwright";
import "dotenv/config";

const MIDPOINT_URL = "https://cdc.correoargentino.com.ar";
const LOGIN_URL = `${MIDPOINT_URL}/midpoint/login`;
const USERS_TABLE_URL = `${MIDPOINT_URL}/midpoint/admin/users`;

const MIDPOINT_USER = process.env.MIDPOINT_USER || "helpdesk";
const MIDPOINT_PASS = process.env.MIDPOINT_PASS || "";

const STATUS_PATH = resolve("src/data/last-sync-users-status.json");

async function writeSyncStatus(status: "success" | "error", errorDetail: string | null = null): Promise<void> {
  const data = {
    lastExecution: new Date().toISOString(),
    status,
    error: errorDetail,
  };
  try {
    await writeFile(STATUS_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[SyncUsers] Error al escribir el archivo de estado:", err);
  }
}

async function syncUsers(): Promise<void> {
  const startTime = new Date();
  console.log(`[SyncUsers] Sincronización iniciada: ${startTime.toISOString()}`);

  // Load already-processed usernames from SQLite for resumability
  const existingUsers = await db
    .select({ username: employees.username })
    .from(employees);
  const processedUsernames = new Set(existingUsers.map((u) => u.username));
  console.log(`[SyncUsers] Usuarios existentes en BD: ${processedUsernames.size}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login to MidPoint
    console.log("[SyncUsers] Navegando a la página de login...");
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

    await page.fill('input[name="username"]', MIDPOINT_USER);
    await page.fill('input[name="password"]', MIDPOINT_PASS);
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 30000 });
    console.log("[SyncUsers] Login completado.");

    // Navigate to users table
    console.log("[SyncUsers] Navegando a la tabla de usuarios...");
    await page.goto(USERS_TABLE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("td.name-min-width", { timeout: 30000 });
    console.log("[SyncUsers] Tabla de usuarios detectada.");

    let totalProcessed = 0;
    let totalDeleted = 0;
    let pageNum = 1;

    while (true) {
      console.log(`[SyncUsers] --- Procesando página ${pageNum} ---`);

      const rows = page.locator("tbody tr");
      const rowCount = await rows.count();
      console.log(`[SyncUsers] Filas encontradas en página ${pageNum}: ${rowCount}`);

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);

        // Check if user is disabled
        const disabledIcon = row.locator(
          'td.composited-icon [title*="deshabilitado"], td.composited-icon i.fa-ban.red'
        );
        const isDisabled = (await disabledIcon.count()) > 0;

        const linkEl = row.locator("td.name-min-width a");
        const linkCount = await linkEl.count();

        if (linkCount === 0) continue;

        const username = (await linkEl.innerText()).trim();

        if (isDisabled) {
          // Delete disabled user from SQLite
          await db.delete(employees)
            .where(eq(employees.username, username));
          totalDeleted++;
          console.log(`[SyncUsers] Eliminado (inhabilitado): ${username}`);
          continue;
        }

        // Skip if already processed (resumability)
        if (processedUsernames.has(username)) continue;

        // Visit user profile page
        const href = await linkEl.getAttribute("href");
        const profileUrl = href?.startsWith("http") ? href : `${MIDPOINT_URL}${href}`;

        const profilePage = await context.newPage();
        try {
          await profilePage.goto(profileUrl, { waitUntil: "domcontentloaded" });

          const data = await profilePage.evaluate(() => {
            const result: { doc: string | null; fullName: string | null } = {
              doc: null,
              fullName: null,
            };
            const rows = document.querySelectorAll(".prism-property");
            for (const row of rows) {
              const label = row.querySelector(".prism-property-label");
              if (!label) continue;
              const text = (label as HTMLElement).innerText;
              const val = row.querySelector(".prism-property-value");
              const valText = val ? (val as HTMLElement).innerText.trim() : null;

              if (text.includes("Número de documento")) {
                result.doc = valText;
              } else if (text.includes("Nombre completo")) {
                result.fullName = valText;
              }
            }
            return result;
          });

          const docNumber = data.doc ? data.doc.replace(/\s+/g, "") : null;
          const fullName = data.fullName || "Desconocido";

          if (docNumber) {
            await db
              .insert(employees)
              .values({
                dni: docNumber,
                username,
                fullname: fullName,
              })
              .onConflictDoUpdate({
                target: employees.dni,
                set: {
                  username,
                  fullname: fullName,
                },
              });

            processedUsernames.add(username);
            totalProcessed++;
            console.log(`[SyncUsers] Guardado: ${username} -> ${fullName}`);
          } else {
            console.log(`[SyncUsers] Sin documento para: ${username}`);
          }
        } finally {
          await profilePage.close();
        }

        // Small delay between profiles
        await new Promise((r) => setTimeout(r, 300));
      }

      // Check for next page
      const nextBtn = page.locator("xpath=//a[contains(@class, 'page-link') and normalize-space()='>']");
      const nextBtnCount = await nextBtn.count();

      if (nextBtnCount === 0) {
        console.log("[SyncUsers] No hay botón siguiente. Fin.");
        break;
      }

      const isDisabled = await nextBtn.evaluate(
        (node) => node.parentElement?.classList.contains("disabled") ?? false
      );

      if (isDisabled) {
        console.log("[SyncUsers] Última página alcanzada. Fin.");
        break;
      }

      await nextBtn.click();
      await new Promise((r) => setTimeout(r, 3500));
      pageNum++;
    }

    const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(2);
    console.log(
      `[SyncUsers] Sincronización finalizada en ${elapsed}s. ` +
      `Procesados: ${totalProcessed}, Eliminados: ${totalDeleted}`
    );

    await writeSyncStatus("success");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[SyncUsers] Error crítico:", errorMsg);
    await writeSyncStatus("error", errorMsg);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

try {
  await syncUsers();
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error("[SyncUsers] Error crítico (top-level):", errorMsg);
  await writeSyncStatus("error", errorMsg);
  process.exit(1);
}
```

- [ ] **Step 3: Add required env vars to `.env`**

The following environment variables must be set in `.env`:

```
LDAP_SERVER=ldap://correo.local
LDAP_PORT=389
LDAP_BASE_DN=DC=correo,DC=local
LDAP_USER=CORREO\otomasi
LDAP_PASS=<your-ldap-password>
MIDPOINT_USER=helpdesk
MIDPOINT_PASS=<your-midpoint-password>
```

- [ ] **Step 4: Build check**

Run: `npx tsx --eval "import './scripts/sync-users.ts'"`
Expected: Script loads without import errors (no actual sync is executed).

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-users.ts
git commit -m "feat(scripts): add sync-users TypeScript + Playwright scraper"
```

---

### Task 7: Add sync-users to PM2 config

**Files:**
- Modify: `ecosystem.config.cjs`

- [ ] **Step 1: Add sync-users app entry**

Insert after the `sync-legacy-inventory` app entry in `ecosystem.config.cjs`:

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
    },
```

- [ ] **Step 2: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "chore(pm2): add sync-users cron job at 02:00 daily"
```

---

### Task 8: One-time data migration from MySQL to SQLite

**Files:**
- Create: `scripts/migrate-users-mysql-to-sqlite.ts` (one-shot script)

This script connects to the legacy MySQL, reads all users, and inserts them into SQLite. Run once to seed the `employees` table before the first sync.

- [ ] **Step 1: Install mysql2**

```bash
npm install mysql2
```

- [ ] **Step 2: Create the migration script**

Create `scripts/migrate-users-mysql-to-sqlite.ts`:

```ts
import { db } from "../src/db/index";
import { employees } from "../src/db/schema";
import mysql from "mysql2/promise";

const MYSQL_HOST = process.env.MIGRATE_MYSQL_HOST || "localhost";
const MYSQL_PORT = Number(process.env.MIGRATE_MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MIGRATE_MYSQL_USER || "root";
const MYSQL_PASS = process.env.MIGRATE_MYSQL_PASS || "";
const MYSQL_DB = process.env.MIGRATE_MYSQL_DB || "usuarios_habilitados";

async function migrate() {
  console.log("[Migrate] Conectando a MySQL...");
  const connection = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASS,
    database: MYSQL_DB,
  });

  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    "SELECT id, dni, fullname, username, interno, telefono, sucursal, updated_at FROM usuarios"
  );
  console.log(`[Migrate] Leídos ${rows.length} registros desde MySQL.`);

  await connection.end();

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const dni = String(row.dni || "").trim();
    const username = String(row.username || "").trim();
    const fullname = String(row.fullname || "").trim();

    if (!dni || !username) {
      skipped++;
      continue;
    }

    try {
      await db
        .insert(employees)
        .values({
          dni,
          username,
          fullname: fullname || "Desconocido",
          interno: row.interno ? String(row.interno) : null,
          telefono: row.telefono ? String(row.telefono) : null,
          sucursal: row.sucursal ? String(row.sucursal) : null,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        })
        .onConflictDoNothing({ target: employees.dni });
      inserted++;
    } catch (err) {
      console.error(`[Migrate] Error insertando ${username}:`, err);
      skipped++;
    }
  }

  console.log(`[Migrate] Completado. Insertados: ${inserted}, Omitidos: ${skipped}`);
  process.exit(0);
}

migrate();
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-users-mysql-to-sqlite.ts
git commit -m "feat(scripts): add one-shot MySQL-to-SQLite migration script"
```

---

### Task 9: Chrome extension update + decommission (manual)

These steps are performed manually by the developer after the previous tasks are verified in production.

**Chrome extension:**
- Modify the extension's manifest or config to change API base URL from `http://mda.correo.local/api_mda_find_extension/` to `https://<astro-server-url>/api/usuarios/`

**Decommission:**
- Stop XAMPP Apache + MySQL services
- Remove `D:\MDA-FIND-EXTENSION\server\` (PHP scripts)
- Remove `D:\mda BD\` (Python scraper + batch file)
- Remove `run_bot.bat` from Windows Task Scheduler

---

### Verification checklist

After all tasks are deployed:

- [ ] Search for a user by name → returns results from SQLite
- [ ] Search for a user by DNI → returns correct results
- [ ] Search for a user by username → returns correct results
- [ ] Edit interno of a user → saves and persists on re-search
- [ ] Edit telefono of a user → saves and persists on re-search
- [ ] Click "net user" on a user → opens modal with AD info
- [ ] Chrome extension search returns same results
- [ ] Run `npx tsx scripts/sync-users.ts` manually → data is upserted
- [ ] Check PM2 status: `pm2 status` → shows sync-users process
- [ ] Check logs: `pm2 logs sync-users` → shows successful sync
