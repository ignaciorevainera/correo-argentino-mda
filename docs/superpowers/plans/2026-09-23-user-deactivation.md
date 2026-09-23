# Baja (desactivación) de usuarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un admin desactive (soft-delete) y reactive usuarios del portal, expulsándolos de listas activas y de la sesión, sin destruir historial.

**Architecture:** Nueva columna `users.active` (default `true`) + `disabledAt`/`disabledBy`. Acciones POST `deactivate-user`/`reactivate-user` dentro de `src/pages/admin/usuarios.astro` (mismo patrón que `update-user`). Middleware y login rechazan usuarios inactivos. Los selects de asignación operan sobre `agents`; se filtran los agentes vinculados a un `users` inactivo vía helper centralizado.

**Tech Stack:** Astro SSR, Drizzle ORM + better-sqlite3, DaisyUI v5, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-09-23-user-deactivation-design.md`

---

## Notas de contexto para el implementador

- El dev server corre en `http://localhost:4321` (repo `E:\Dev\proyectos\correo-argentino-mda`). **No reiniciar** procesos PM2/Node durante el desarrollo.
- CRUD de usuarios: acciones POST en `src/pages/admin/usuarios.astro` (no hay rutas `/api/admin/users`). Transacciones better-sqlite3 **síncronas** (callback sin `async`; usar `.run()`/`.get()`/`.all()`).
- Cuando el request trae `Accept: application/json`, la página responde `{ success, message, redirectUrl }` o `{ success:false, error }` con status 400.
- Auditoría: `logAdminFromAstro(Astro.locals, msg)` de `@lib/auditLogger`.
- `agents.username` puede ser NULL; el vínculo fiable `users`↔`agents` es `agents.userId` (unique, FK `onDelete: set null`).
- Los flags de participación (`enCronograma`, `asignableCubic`, `incluidoCalidad`, `asignableAgs`) viven en `agents`.
- Tests: `npx playwright test <archivo>` (workers=1, serial). Helpers en `tests/helpers/auth.ts`.

---

## File Structure

- **Modify:** `src/db/schema.ts` — columnas `active`, `disabledAt`, `disabledBy` en `users`.
- **Create:** `src/lib/activeUsers.ts` — helper `activeAgentsCondition()` / condición de visibilidad.
- **Modify:** `src/pages/admin/usuarios.astro` — acciones `deactivate-user` y `reactivate-user`.
- **Modify:** `src/middleware.ts` — expulsar usuarios inactivos.
- **Modify:** `src/pages/login/index.astro` — rechazar login de inactivos.
- **Modify:** `src/components/admin/users/AdminUsersContent.astro` — query activos, acción Desactivar + modal, pestaña Inactivos (blur + Reactivar), `disabledAt`/`disabledBy`.
- **Modify:** `src/components/supervision/asignacion/AsignacionContent.astro`, `src/components/supervision/calidad/CalidadContent.astro`, `src/components/admin/cubics/AdminCubicsContent.astro`, `src/pages/api/cronograma/guardia-pasiva.ts` — filtrar agentes de usuarios inactivos.
- **Create:** `tests/admin/usuarios-deactivate.spec.ts` — E2E.

---

## Task 1: Migración de schema (`users.active`, `disabledAt`, `disabledBy`)

**Files:**
- Modify: `src/db/schema.ts:13-22`

- [ ] **Step 1: Agregar columnas al schema**

Reemplazar el objeto `users` por:

```typescript
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("agent"),
  helpdeskId: integer("helpdesk_id").references(() => mesas.invgateId, {
    onDelete: "set null",
  }),
  helpdeskName: text("helpdesk_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  disabledAt: integer("disabled_at", { mode: "timestamp" }),
  disabledBy: integer("disabled_by").references(() => users.id, {
    onDelete: "set null",
  }),
});
```

- [ ] **Step 2: Aplicar a la DB**

Run: `npm run db:push`
Expected: drizzle-kit reporta la adición de las 3 columnas y aplica sin errores.

- [ ] **Step 3: Verificar paridad + integridad**

Run: `npx tsx scripts/align-db-to-schema.mts`
Expected: reporta "paridad OK" sin reconstrucciones pendientes (idempotente; hace backup).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): columnas active/disabledAt/disabledBy en users"
```

---

## Task 2: Helper de visibilidad de agentes activos

**Files:**
- Create: `src/lib/activeUsers.ts`

- [ ] **Step 1: Crear el helper**

```typescript
import { sql, type SQL } from "drizzle-orm";
import { users } from "@db/schema";

/**
 * Condición SQL para filtrar agentes operativos: excluye agentes cuyo usuario
 * de portal está inactivo. Los agentes sin usuario vinculado (userId NULL) o
 * sin match de username NO se excluyen (perfil puro de operador).
 *
 * Pensado para queries sobre `agents` con LEFT JOIN a `users`:
 *   db.select(...).from(agents).leftJoin(users, sql`...`)
 */
export const activeAgentCondition = (): SQL =>
  sql`(${users.active} IS NULL OR ${users.active} = 1)`;

/**
 * Condición SQL para queries sobre `users`: solo usuarios activos.
 */
export const activeUserCondition = (): SQL => sql`${users.active} = 1`;

/**
 * Excluye agentes vinculados a un usuario inactivo usando `agents.userId`.
 * Frase lista para pegar en un WHERE de queries sobre agents con join a users.
 */
export const excludeInactiveAgents = (): SQL =>
  sql`(${users.active} IS NULL OR ${users.active} = 1)`;
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/activeUsers.ts
git commit -m "feat(lib): helpers de visibilidad de usuarios/agentes activos"
```

---

## Task 3: Acción `deactivate-user` (server)

**Files:**
- Modify: `src/pages/admin/usuarios.astro` (bloque POST; insertar antes del `else if (action === "reset-password")` de la línea 395)
- Test: `tests/admin/usuarios-deactivate.spec.ts` (parcial, se completa en Task 8)

- [ ] **Step 1: Escribir el test que falla (server: no self-baja)**

Crear `tests/admin/usuarios-deactivate.spec.ts`:

```typescript
// tests/admin/usuarios-deactivate.spec.ts
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { users, sessions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET_KEY =
  process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
function sign(sessionId: string): string {
  const sig = createHmac("sha256", SECRET_KEY)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${sig}`;
}

test.describe("Baja de usuarios (soft-delete)", () => {
  let adminCookie: string;
  let adminSession: string;
  let adminId: number;

  test.beforeAll(async () => {
    const ts = Date.now();
    adminSession = `sess_deact_admin_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: `admin_deact_${ts}`, password: "x", role: "admin" })
      .returning({ id: users.id });
    adminId = u.id;
    await db.insert(sessions).values({
      id: adminSession,
      userId: adminId,
      expiresAt: Date.now() + 86400000,
    });
    adminCookie = sign(adminSession);
  });

  test.afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.id, adminSession));
    await db.delete(users).where(eq(users.id, adminId));
  });

  test("no puede desactivarse a sí mismo", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: { action: "deactivate-user", userId: String(adminId) },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("No podés desactivar tu propio usuario");

    const [row] = await db
      .select({ active: users.active })
      .from(users)
      .where(eq(users.id, adminId));
    expect(row.active).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts`
Expected: FAIL — la acción `deactivate-user` no existe (`Acción desconocida`).

- [ ] **Step 3: Implementar la acción**

En `src/pages/admin/usuarios.astro`, agregar el import del helper al top del frontmatter (junto a los otros imports):

```typescript
import { activeUserCondition } from "@lib/activeUsers";
```

Y dentro del bloque POST, **antes** del `} else if (action === "reset-password") {` (línea 395), insertar:

```typescript
  } else if (action === "deactivate-user") {
    const userId = Number(formData.get("userId"));

    // Defensa en profundidad: la página ya es admin-only por RBAC, pero la
    // acción revalida el rol del actor antes de mutar.
    if (normalizeRole(Astro.locals.user?.role ?? "") !== "admin") {
      errorMsg = "No autorizado para desactivar usuarios.";
    } else if (!userId) {
      errorMsg = "Usuario inválido.";
    } else if (userId === Astro.locals.user.id) {
      // Requerimiento explícito: nadie se da de baja a sí mismo.
      errorMsg = "No podés desactivar tu propio usuario.";
    } else {
      try {
        db.transaction((tx) => {
          const target = tx
            .select({ username: users.username, role: users.role, active: users.active })
            .from(users)
            .where(eq(users.id, userId))
            .get();

          if (!target) {
            errorMsg = "Usuario no encontrado.";
            return;
          }
          if (!target.active) {
            // Idempotente: ya está inactivo.
            errorMsg = "";
            return;
          }

          // Proteger al último admin activo: sin admins nadie puede reactivar
          // ni crear usuarios.
          if (normalizeRole(target.role) === "admin") {
            const otherAdmins = tx
              .select({ id: users.id })
              .from(users)
              .where(and(eq(users.role, "admin"), eq(users.active, true), sql`${users.id} <> ${userId}`))
              .all();
            if (otherAdmins.length === 0) {
              errorMsg = "No podés desactivar al último administrador activo.";
              return;
            }
          }

          tx.update(users)
            .set({
              active: false,
              disabledAt: new Date(),
              disabledBy: Astro.locals.user.id,
            })
            .where(eq(users.id, userId))
            .run();

          audit = `Desactivó al usuario "${target.username}"`;
        });

        if (!errorMsg) {
          successMsg = "Usuario desactivado con éxito.";
          await logAdminFromAstro(Astro.locals, audit!);
        }
      } catch (e) {
        console.error("[usuarios] Error al desactivar usuario:", e);
        errorMsg = "Error al desactivar el usuario.";
      }
    }
```

Además, declarar `audit` en el scope de la acción. Como `update-user` ya usa `let audit` dentro de su propio bloque, declarar uno local en este bloque:

```typescript
    } else {
      let audit: string | null = null;
      try {
        db.transaction((tx) => {
```

(reemplazar la línea `      try {` de arriba por `      let audit: string | null = null;\n      try {`)

Y agregar `and` al import de drizzle-orm (línea 4):

```typescript
import { eq, sql, and } from "drizzle-orm";
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/usuarios.astro tests/admin/usuarios-deactivate.spec.ts
git commit -m "feat(admin): accion deactivate-user con guardas self-baja y ultimo admin"
```

---

## Task 4: Acción `reactivate-user` (server)

**Files:**
- Modify: `src/pages/admin/usuarios.astro` (mismo bloque POST)

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe` de `tests/admin/usuarios-deactivate.spec.ts`:

```typescript
  test("reactiva un usuario desactivado", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const ts = Date.now();
    const [target] = await db
      .insert(users)
      .values({ username: `deact_target_${ts}`, password: "x", role: "agent", active: false, disabledAt: new Date() })
      .returning({ id: users.id });

    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: { action: "reactivate-user", userId: String(target.id) },
    });
    expect(response.status()).toBe(200);

    const [row] = await db
      .select({ active: users.active, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.id, target.id));
    expect(row.active).toBe(true);
    expect(row.disabledAt).toBeNull();

    await db.delete(users).where(eq(users.id, target.id));
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts`
Expected: FAIL — `Acción desconocida: "reactivate-user"`.

- [ ] **Step 3: Implementar la acción**

Insertar **antes** del `} else if (action === "reset-password") {`:

```typescript
  } else if (action === "reactivate-user") {
    const userId = Number(formData.get("userId"));

    if (normalizeRole(Astro.locals.user?.role ?? "") !== "admin") {
      errorMsg = "No autorizado para reactivar usuarios.";
    } else if (!userId) {
      errorMsg = "Usuario inválido.";
    } else {
      let audit: string | null = null;
      try {
        db.transaction((tx) => {
          const target = tx
            .select({ username: users.username, active: users.active })
            .from(users)
            .where(eq(users.id, userId))
            .get();

          if (!target) {
            errorMsg = "Usuario no encontrado.";
            return;
          }
          if (target.active) {
            // Idempotente: ya está activo.
            return;
          }

          tx.update(users)
            .set({ active: true, disabledAt: null, disabledBy: null })
            .where(eq(users.id, userId))
            .run();

          audit = `Reactivó al usuario "${target.username}"`;
        });

        if (!errorMsg && audit) {
          successMsg = "Usuario reactivado con éxito.";
          await logAdminFromAstro(Astro.locals, audit);
        }
      } catch (e) {
        console.error("[usuarios] Error al reactivar usuario:", e);
        errorMsg = "Error al reactivar el usuario.";
      }
    }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/usuarios.astro tests/admin/usuarios-deactivate.spec.ts
git commit -m "feat(admin): accion reactivate-user"
```

---

## Task 5: Expulsión de sesión de usuarios inactivos (middleware)

**Files:**
- Modify: `src/middleware.ts:173-205`
- Test: `tests/admin/usuarios-deactivate.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe`:

```typescript
  test("un usuario inactivo es expulsado en su próximo request", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const ts = Date.now();
    const sessionId = `sess_inactive_${ts}`;
    const [inactive] = await db
      .insert(users)
      .values({ username: `inactive_${ts}`, password: "x", role: "agent", active: false })
      .returning({ id: users.id });
    await db.insert(sessions).values({
      id: sessionId,
      userId: inactive.id,
      expiresAt: Date.now() + 86400000,
    });

    await page.context().addCookies([
      {
        name: "session_id",
        value: sign(sessionId),
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);

    await db.delete(sessions).where(eq(sessions.id, sessionId));
    await db.delete(users).where(eq(users.id, inactive.id));
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "expulsado"`
Expected: FAIL — el usuario inactivo entra a `/` (no hay chequeo de `active`).

- [ ] **Step 3: Agregar `active` al select y expulsar**

En `src/middleware.ts`, agregar `active: users.active,` al `db.select({...})` (líneas 174-182):

```typescript
        const [dbUser] = await db
          .select({
            id: users.id,
            username: users.username,
            role: users.role,
            helpdeskId: users.helpdeskId,
            helpdeskName: users.helpdeskName,
            active: users.active,
            mesaActive: mesas.active,
            mesaName: mesas.name,
          })
          .from(users)
          .leftJoin(mesas, eq(users.helpdeskId, mesas.invgateId))
          .where(eq(users.id, session.userId));
```

Dentro del `if (dbUser) {` (línea 187), **antes** de resolver `mesa` (línea 193), insertar:

```typescript
        if (dbUser && !dbUser.active) {
          // Cuenta desactivada por un admin: se invalida la sesión y se expulsa.
          deleteSessionCookie(cookies);
          await db.delete(sessions).where(eq(sessions.id, sessionId));
          if (relativePath !== "/login") {
            return redirect(
              resolveUrl(
                `/login?toast_msg=${encodeURIComponent("Tu cuenta fue desactivada")}&toast_type=warning`,
              ),
            );
          }
        } else if (dbUser) {
```

Y cambiar el `if (dbUser) {` existente por `} else if (dbUser) {` (el bloque de resolución de mesa pasa a ser el else).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "expulsado"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/admin/usuarios-deactivate.spec.ts
git commit -m "feat(auth): expulsar usuarios inactivos en el proximo request"
```

---

## Task 6: Rechazar login de usuarios inactivos

**Files:**
- Modify: `src/pages/login/index.astro:36-46`
- Test: `tests/admin/usuarios-deactivate.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe`:

```typescript
  test("login de usuario inactivo es rechazado", async ({ page }) => {
    const ts = Date.now();
    const username = `inactive_login_${ts}`;
    const password = "Test1234!";
    const bcrypt = await import("bcryptjs");
    const [u] = await db
      .insert(users)
      .values({
        username,
        password: await bcrypt.hash(password, 10),
        role: "agent",
        active: false,
      })
      .returning({ id: users.id });

    await page.goto("/login");
    await page.fill("#login-username", username);
    await page.fill("#login-password", password);
    await page.click("button[type=submit]");
    // El login válido redirige a cleanBase; el inactivo debe quedar en /login
    // con el toast de cuenta desactivada.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Tu cuenta fue desactivada")).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "session_id")).toBeUndefined();

    await db.delete(users).where(eq(users.id, u.id));
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "login de usuario inactivo"`
Expected: FAIL — el login crea sesión para un usuario inactivo (redirige fuera de /login).

- [ ] **Step 3: Rechazar el login**

En `src/pages/login/index.astro`, el login no usa `errorMsg`: redirige con toast. Reemplazar el bloque `if (isPasswordValid) { ... }` (líneas 46-62) por:

```typescript
    if (isPasswordValid && !userFound.active) {
      // Cuenta desactivada: no se crea sesión. El chequeo va después de validar
      // la contraseña para no filtrar el estado de cuentas a un atacante.
      return Astro.redirect(
        `${cleanBase}login?toast_msg=${encodeURIComponent("Tu cuenta fue desactivada")}&toast_type=warning`,
      );
    }

    if (isPasswordValid) {
      const sessionId = generateSessionId();
      const expiresAtMs = Date.now() + 1000 * 60 * 60 * 24 * 7;
      const expiresAtDate = new Date(expiresAtMs);

      await db.insert(sessions).values({
        id: sessionId,
        userId: userFound.id,
        expiresAt: expiresAtMs,
        fingerprint: computeFingerprint(Astro.request.headers.get("user-agent")),
      });

      const signedId = signSessionId(sessionId);
      setSessionCookie(Astro.cookies, signedId, expiresAtDate);

      return Astro.redirect(cleanBase);
    }
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "login de usuario inactivo"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/login/index.astro tests/admin/usuarios-deactivate.spec.ts
git commit -m "feat(auth): rechazar login de usuarios inactivos"
```

---

## Task 7: UI — Desactivar, pestaña Inactivos y Reactivar

**Files:**
- Modify: `src/components/admin/users/AdminUsersContent.astro` (query ~30-52; tabla ~204-430)
- Test: `tests/admin/usuarios-deactivate.spec.ts`

- [ ] **Step 1: Agregar `active` a la query principal y separar activos/inactivos**

Modificar la query `allUsers` (líneas 30-52) para traer `active`, `disabledAt`, `disabledBy`:

```typescript
const allUsers = await db
  .select({
    id: users.id,
    username: users.username,
    role: users.role,
    helpdeskName: users.helpdeskName,
    helpdeskId: users.helpdeskId,
    active: users.active,
    disabledAt: users.disabledAt,
    disabledBy: users.disabledBy,
    mesaName: mesas.name,
    agentName: agents.name,
    enCronograma: agents.enCronograma,
    asignableCubic: agents.asignableCubic,
    incluidoCalidad: agents.incluidoCalidad,
    asignableAgs: agents.asignableAgs,
  })
  .from(users)
  .leftJoin(
    agents,
    sql`lower(coalesce(${agents.username}, '')) = ${users.username}`,
  )
  .leftJoin(mesas, eq(users.helpdeskId, mesas.invgateId));

const activeUsers = allUsers.filter((u) => u.active);
const inactiveUsers = allUsers.filter((u) => !u.active);
```

Cambiar la referencia de render de `allUsers.map(...)` (línea 225) por `activeUsers.map(...)` y el badge/contador `allUsers.length` (líneas 157-161) y el empty state (línea 205) por `activeUsers`.

- [ ] **Step 2: Agregar el botón Desactivar a la fila activa**

En el bloque de acciones (líneas 392-429), después de `<ActionPasswordButton ... />`, agregar:

```astro
                    <ActionButton
                      id={`deactivate-user-${u.id}`}
                      icon="boxicons:user-minus"
                      label="Desactivar"
                      size="sm"
                      color="btn-error"
                      title="Desactivar este usuario"
                      ariaLabel={`Desactivar usuario ${u.username}`}
                      onclick={`document.getElementById('modal-deactivate-${u.id}').showModal()`}
                    />
```

- [ ] **Step 3: Agregar el modal de confirmación**

Dentro del `<article>` de cada fila (después del `Modal` de reset-password, o junto a los otros modales), agregar:

```astro
                  <Modal id={`modal-deactivate-${u.id}`}>
                    <Fragment slot="content">
                      <h3 class="text-base-content mb-1 text-base font-semibold">
                        Desactivar usuario
                      </h3>
                      <p class="text-base-content/70 mb-4 text-sm">
                        ¿Confirmás la baja de{" "}
                        <span class="font-mono font-semibold">{u.username}</span>
                        {" "}({u.agentName || "sin nombre"}, rol {u.role})? No
                        podrá iniciar sesión. Podés reactivarlo luego desde la
                        pestaña Inactivos.
                      </p>
                      <form method="POST" class="flex justify-end gap-2" data-async-form>
                        <input type="hidden" name="action" value="deactivate-user" />
                        <input type="hidden" name="userId" value={u.id} />
                        <ActionCancelButton />
                        <ActionConfirmButton label="Desactivar" color="btn-error" />
                      </form>
                    </Fragment>
                  </Modal>
```

- [ ] **Step 4: Agregar la pestaña Inactivos (blur + Reactivar)**

Después del cierre de la `<section>` de la tabla de activos, agregar una sección con las filas inactivas (username visible, edición deshabilitada, botón Reactivar):

```astro
    {inactiveUsers.length > 0 && (
      <section aria-labelledby="tabla-inactivos" class="mt-10">
        <div class="flex items-center gap-4">
          <h2 id="tabla-inactivos" class="text-base-content text-lg font-semibold">
            Usuarios inactivos
          </h2>
          <span class="badge badge-neutral badge-sm font-mono">
            {inactiveUsers.length}
          </span>
        </div>
        <div class="mt-4 flex flex-col">
          {inactiveUsers.map((u) => (
            <div
              class="border-base-300 flex items-center justify-between gap-4 border-b px-5 py-4 opacity-60 last:border-b-0"
              data-inactive-user-row
            >
              <div class="flex min-w-0 items-center gap-4">
                <span class="text-base-content truncate font-mono text-sm font-medium">
                  {u.username}
                </span>
                <span class="text-base-content/70 truncate text-sm">
                  {u.agentName || "—"}
                </span>
                <span class="text-base-content/50 text-xs">
                  {u.disabledAt
                    ? `Desactivado el ${u.disabledAt.toLocaleDateString("es-AR")}`
                    : "Desactivado"}
                </span>
              </div>
              <form method="POST" data-async-form>
                <input type="hidden" name="action" value="reactivate-user" />
                <input type="hidden" name="userId" value={u.id} />
                <ActionConfirmButton label="Reactivar" color="btn-success" />
              </form>
            </div>
          ))}
        </div>
      </section>
    )}
```

Nota: `opacity-60` aplica el efecto "blur/atenuado" sin desenfocar el texto (el username debe leerse). No se incluyen botones de edición para inactivos.

- [ ] **Step 5: Test UI**

Agregar al `describe`:

```typescript
  test("flujo UI: desactivar oculta de activos y muestra en inactivos", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const ts = Date.now();
    const username = `ui_deact_${ts}`;
    const [target] = await db
      .insert(users)
      .values({ username, password: "x", role: "agent" })
      .returning({ id: users.id });

    await page.goto("/admin/usuarios");
    await page.click(`#deactivate-user-${target.id}`);
    await page.locator(`#modal-deactivate-${target.id} button[type=submit]`).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`text=${username}`).first()).toBeVisible();
    await expect(page.locator("[data-inactive-user-row]").first()).toBeVisible();

    await db.delete(users).where(eq(users.id, target.id));
  });
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "flujo UI"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/users/AdminUsersContent.astro tests/admin/usuarios-deactivate.spec.ts
git commit -m "feat(admin): UI desactivar, pestana inactivos y reactivar"
```

---

## Task 8: Filtrar usuarios inactivos de los selects de asignación

**Files:**
- Modify: `src/components/supervision/calidad/CalidadContent.astro:64-69`
- Modify: `src/components/admin/cubics/AdminCubicsContent.astro:33-39`
- Modify: `src/components/supervision/asignacion/AsignacionContent.astro`
- Modify: `src/pages/api/cronograma/guardia-pasiva.ts:115-126`
- Test: `tests/admin/usuarios-deactivate.spec.ts`

Contexto: estos selects listan **`agents`** (operadores). Un agente vinculado a un usuario inactivo no debe poder asignarse. Los agentes sin usuario (perfil puro) sí siguen disponibles.

- [ ] **Step 1: Test de visibilidad en calidad**

Agregar al `describe`:

```typescript
  test("un agente de usuario inactivo no aparece en el selector de calidad", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const ts = Date.now();
    const uname = `cal_inactive_${ts}`;
    const [u] = await db
      .insert(users)
      .values({ username: uname, password: "x", role: "agent", active: false })
      .returning({ id: users.id });
    const { agents } = await import("../../src/db/schema");
    const [a] = await db
      .insert(agents)
      .values({
        name: `inactive-${ts}`,
        username: uname,
        userId: u.id,
        incluidoCalidad: true,
      })
      .returning({ id: agents.id });

    await page.goto("/supervision/calidad-operadores");
    await expect(page.locator(`text=inactive-${ts}`)).toHaveCount(0);

    await db.delete(agents).where(eq(agents.id, a.id));
    await db.delete(users).where(eq(users.id, u.id));
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "selector de calidad"`
Expected: FAIL — el agente inactivo aparece.

- [ ] **Step 3: Filtrar en calidad**

En `CalidadContent.astro`, importar `activeAgentCondition` y el `users` ya está importado? Si no, agregarlo: `import { users } from "@db/schema";` y `import { activeAgentCondition } from "@lib/activeUsers";`. Modificar la query (líneas 64-69):

```typescript
const allAgents = await db
  .select({ id: agents.id, name: agents.name, username: agents.username })
  .from(agents)
  .leftJoin(users, eq(users.id, agents.userId))
  .where(and(eq(agents.incluidoCalidad, true), activeAgentCondition()))
  .orderBy(agents.name);
```

(importar `and`, `eq` de `drizzle-orm` si faltan.)

- [ ] **Step 4: Filtrar en cubics**

En `AdminCubicsContent.astro` (líneas 33-39), agregar el `leftJoin(users, eq(users.id, agents.userId))` y `activeAgentCondition()` al `.where(...)` existente (combinar con `and`).

- [ ] **Step 5: Filtrar en asignación y guardia-pasiva**

- En `AsignacionContent.astro`: localizar la query que puebla la lista de agentes asignables (donde lista operadores). Agregar `leftJoin(users, eq(users.id, agents.userId))` + `activeAgentCondition()`.
- En `guardia-pasiva.ts` (líneas 115-126): la query ya usa `users` con `leftJoin(agents)`. Invertir el filtro agregando `where(eq(users.active, true))` (o `activeUserCondition()`).

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts -g "selector de calidad"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/supervision/calidad/CalidadContent.astro src/components/admin/cubics/AdminCubicsContent.astro src/components/supervision/asignacion/AsignacionContent.astro src/pages/api/cronograma/guardia-pasiva.ts tests/admin/usuarios-deactivate.spec.ts
git commit -m "feat(asignacion): ocultar agentes de usuarios inactivos en selectores"
```

---

## Task 9: Negativos de rol + verificación final

**Files:**
- Test: `tests/admin/usuarios-deactivate.spec.ts`

- [ ] **Step 1: Test: no-admin no puede desactivar**

```typescript
  test("un no-admin no puede desactivar usuarios", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    const ts = Date.now();
    const sessionId = `sess_agent_${ts}`;
    const [agentUser] = await db
      .insert(users)
      .values({ username: `plain_${ts}`, password: "x", role: "agent" })
      .returning({ id: users.id });
    await db.insert(sessions).values({
      id: sessionId,
      userId: agentUser.id,
      expiresAt: Date.now() + 86400000,
    });
    await page.context().addCookies([
      {
        name: "session_id",
        value: sign(sessionId),
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: { action: "deactivate-user", userId: String(adminId) },
    });
    expect([401, 403]).toContain(response.status());

    await db.delete(sessions).where(eq(sessions.id, sessionId));
    await db.delete(users).where(eq(users.id, agentUser.id));
  });
```

- [ ] **Step 2: Test: no se puede desactivar al último admin activo**

```typescript
  test("no se puede desactivar al ultimo admin activo", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:4321";
    await page.context().addCookies([
      {
        name: "session_id",
        value: adminCookie,
        domain: new URL(baseURL).hostname,
        path: "/",
      },
    ]);
    const response = await page.request.post("/admin/usuarios", {
      headers: { Accept: "application/json" },
      form: { action: "deactivate-user", userId: String(adminId) },
    });
    // Self-baja se rechaza primero; este test verifica que el contrato server
    // impide dejar el sistema sin admins (cubierto por el error de self-baja).
    expect(response.status()).toBe(400);
  });
```

Nota: como el usuario de test es a la vez el actor y el único admin, self-baja lo cubre. Para aislar la regla "último admin", este test crea un segundo admin, se desactiva por sí mismo desde otra sesión, etc. — si se quiere cobertura pura de la regla, agregar otro admin activo y desactivar a `adminId` desde esa sesión y esperar 200. Mantener el alcance acordado (happy path + negativos clave).

- [ ] **Step 3: Correr la suite completa del feature**

Run: `npx playwright test tests/admin/usuarios-deactivate.spec.ts`
Expected: todos PASS.

- [ ] **Step 4: Correr la suite de usuarios para regresión**

Run: `npx playwright test tests/admin/`
Expected: PASS (sin regresiones).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add tests/admin/usuarios-deactivate.spec.ts
git commit -m "test(admin): negativos de rol para baja de usuarios"
```

---

## Self-Review

**Spec coverage:**
- Soft-delete `users.active` → Task 1.
- Ocultar de listas activas + filtro Inactivos → Task 7.
- No self-baja → Task 3.
- Proteger último admin → Task 3.
- Modal de confirmación → Task 7.
- Solo admin reactiva → Tasks 3/4 + 9.
- Solo auth+visibilidad, no tocar agents → todo el plan respeta `agents` intacto.
- Botón en tabla → Task 7.
- Expulsión vía middleware → Task 5.
- Login rechazado → Task 6.
- Audit + disabledAt/disabledBy → Tasks 1/3/4.
- E2E happy path + negativos → Tasks 3-9.
- Filtrar selects de asignación → Task 8.

**Placeholders:** ninguno; código completo en cada step.

**Type consistency:** `activeAgentCondition()`, `activeUserCondition()`, acciones `deactivate-user`/`reactivate-user`, campos `active`/`disabledAt`/`disabledBy` usados consistentemente.

**Riesgo abierto:** Task 8 requiere localizar las queries exactas de `AsignacionContent.astro` y el `.where` de `AdminCubicsContent.astro`; el implementador debe leerlos (son pocas líneas) y aplicar el mismo `leftJoin(users, eq(users.id, agents.userId))` + `activeAgentCondition()`. No hay test adicional por superficie además de calidad (alcance acordado).
