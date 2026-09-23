# Diseño — Baja (desactivación) de usuarios

Fecha: 2026-09-23
Rama: `feat/user-deactivation` (desde `master`)

## Problema

Necesitamos poder **dar de baja usuarios** de la plataforma por diversos motivos:
fueron mal creados (y no queremos editar uno existente), ya no trabajan en la
empresa, cuentas duplicadas, etc. La baja debe ser reversible, no debe destruir
el historial, y debe poder ejecutarla cualquier usuario con permisos de
administración — excepto sobre sí mismo.

## Decisiones (brainstorming)

| Pregunta | Decisión |
|---|---|
| Modelo de baja | **Soft-delete**: `users.active=false`. No borra fila ni historial; reversible. |
| Visibilidad del inactivo | **Oculto de listas activas** (tabla `/admin/usuarios` y selects de asignación) y accesible vía filtro/pestaña **Inactivos**. |
| Protección self-baja | **No desactivarse a sí mismo** (regla server-side). |
| Protección último admin | **Impedir desactivar al último admin activo**. |
| Confirmación | **Modal de confirmación** con nombre + rol + username del afectado. |
| Quién reactiva | **Solo admin**. |
| Efecto en dominio | **Solo auth + visibilidad**; no toca `agents` (participaciones/guardias quedan intactas). |
| UX de baja | **Botón en la tabla** + filtro **Inactivos** con botón Reactivar. |
| Expulsión de sesión | **Validar `active` en middleware**, expulsar en el próximo request. |
| Auditoría | **`logAdminFromAstro()`** + registrar `disabledAt` / `disabledBy`. |
| Tests | **E2E** (Playwright): happy path + negativos clave. |

Detalle adicional (m0388): en el filtro Inactivos, las filas se **blurrean**
inhabilitando sus opciones de edición, pero el **nombre de usuario queda
visible**.

## Enfoque elegido

**Columna `active` en `users` + acciones toggle**, con el filtro de activos
centralizado en un helper reutilizable.

Alternativas descartadas:
- **B** — usar solo `disabledAt IS NULL` como señal: queries más frágiles y peor
  indexables.
- **C** — hard-delete / anonimización: rompe FKs e historial (guardias,
  participaciones, audit), irreversible.

## Diseño

### 1. Modelo de datos

`src/db/schema.ts`, tabla `users`:

- `active`: `integer("active", { mode: "boolean" }).notNull().default(true)`
- `disabledAt`: `integer("disabled_at", { mode: "timestamp" })`, nullable
- `disabledBy`: `integer("disabled_by")`, nullable, referencia `users.id`
  (auto-referencia)

Default `true` para no alterar las filas existentes.

Migración:
1. `npm run db:push`
2. `npx tsx scripts/align-db-to-schema.mts` (idempotente, hace backup, deriva el
   DDL canónico y verifica paridad + integridad)

### 2. Reglas de negocio (server-side, no solo UI)

- **No self-baja**: si `actor.id === target.id` → error (`{ success:false, error }`,
  400). Precedente: el bloqueo de auto-edición en `usuarios.astro` (constante
  `SELF_EDIT_BLOCKED_ACTIONS`).
- **Proteger último admin activo**: si `target.role === "admin"`, contar los
  admins con `active = true` distintos del target; si el resultado es 0 →
  error. Evita dejar la plataforma sin administradores.
- **Solo admin**: `usuarios.astro` ya está detrás del gate RBAC de admin.
  Además, la acción revalida en el server `normalizeRole(Astro.locals.user.role)
  === "admin"` antes de mutar (defensa en profundidad: no confiar solo en el
  gate de ruta).
- **Idempotencia**: desactivar a alguien ya inactivo → 200 no-op; reactivar a
  alguien ya activo → 200 no-op.

### 3. Acciones (patrón existente de `usuarios.astro`)

El CRUD de usuarios **no** vive en rutas `/api/*`: son acciones `POST` dentro de
`src/pages/admin/usuarios.astro` (`create`, `update-user`, `reset-password`),
con transacciones better-sqlite3 **síncronas** y respuesta JSON cuando el
request trae `Accept: application/json`. La baja sigue el mismo patrón:

- Nueva acción `deactivate-user` en el branch POST de `usuarios.astro`.
- Nueva acción `reactivate-user`, mismo archivo.
- El form de la fila envía `action=deactivate-user` + `userId`; el de la
  pestaña Inactivos envía `action=reactivate-user` + `userId`.
- Guard: última barrera server-side. El acceso a `usuarios.astro` ya está
  restringido a admin por RBAC (página admin); la acción revalida el rol del
  actor (`Astro.locals.user.role === "admin"`) y responde 400/JSON si no.
- Setean/limpian `active`, `disabledAt`, `disabledBy` en `users`.
- `await logAdminFromAstro(Astro.locals, ...)` con la misma forma de los otros
  audits (p.ej. `Desactivó al usuario "<username>"`).
- Respuesta: mismo contrato JSON que las acciones existentes
  (`{ success, message, redirectUrl }` o `{ success:false, error }` + 400).

### 4. Auth y expulsión de sesión

- `src/middleware.ts` (~línea 173-205, donde se resuelve `dbUser` desde
  `users`): agregar `active: users.active` al `select`; si `!dbUser.active` →
  `deleteSessionCookie(cookies)` + borrar la fila de `sessions` + redirect
  `/login?toast_msg=Tu cuenta fue desactivada&toast_type=warning`. Debe
  ejecutarse **antes** de armar `currentUser`, igual que el bloque de sesión
  expirada (líneas 207-219).
- `src/pages/login/index.astro` (~línea 36-46, tras el `bcrypt.compare`
  válido): si `!userFound.active` → no crear sesión; redirigir/mostrar el
  toast de cuenta desactivada. El chequeo va **después** de validar la
  contraseña para no filtrar existencia/estado de cuentas a un atacante.

Cubre "sacar al usuario que ya tenía la sesión abierta": se lo expulsa en su
próximo request, sin store de sesiones (la sesión es una cookie firmada + tabla
`sessions`).

### 5. Visibilidad — filtrar inactivos de listas activas

Centralizar una condición/helper reutilizable de "usuarios activos" (p.ej.
`activeUsersCondition()` en `src/lib/`) en lugar de repetir
`eq(users.active, true)`. Superficies a filtrar (a confirmar como checklist en
la fase de plan):

- Tabla principal de `/admin/usuarios` (`AdminUsersContent.astro`, query de
  usuarios ~línea 33-50): filtrar `active = true`; los inactivos van a la
  pestaña Inactivos.
- Selects de asignación: cronograma, calidad, AGS, cubics, guardias (buscar
  cada query de `users` usada para poblar un `<select>` de asignación).

Precedente en el repo: `mesas.active` ya se usa exactamente así (ver
`mesas.active = false` en la query de usuarios con mesa inactiva, ~línea 58).

Cada superficie se enumera como checklist en la fase de plan para evitar fugas
(poder asignar un usuario inactivo).

### 6. UI `/admin/usuarios`

Edición actual: inline por fila dentro de `AdminUsersContent.astro` (modales
`edit-user-*`), con un patrón de `btn-disabled` + `disabled` ya usado para
impedir auto-edición (`u.id === currentUserId`, ~líneas 407-420).

- **Fila activa**: acción **Desactivar** (botón/kebab en la fila) → modal de
  confirmación mostrando nombre, rol y username del afectado.
- **Filtro/pestaña Inactivos**: lista de desactivados con los mismos controles
  de fila pero con las opciones de edición **deshabilitadas (blur, reusando el
  patrón `btn-disabled` + `disabled`)** y el **username visible**; botón
  **Reactivar**. Muestra `disabledAt` y `disabledBy`.
- Los inactivos **no** aparecen en la pestaña de activos.

### 7. Auditoría

- `logAdminFromAstro()` (helper del repo) en baja y reactivación (actor, usuario
  afectado, acción, timestamp), con la misma forma que los audits existentes.
- `disabledAt` y `disabledBy` persistidos en la fila `users`.

### 8. Tests (E2E — Playwright, único mecanismo)

- **Happy path**: admin da de baja → el user desaparece de la tabla activa →
  aparece en Inactivos → su login falla → admin reactiva → reaparece en activos
  y puede loguear.
- **Negativos clave**:
  - Un usuario no puede desactivarse a sí mismo.
  - No se puede desactivar al último admin activo.
  - Un usuario sin rol admin no puede desactivar a otro.

Artefacto: HTML report + traces de Playwright.

## Fuera de alcance

- Tocar `agents` (participaciones, guardias, asignaciones históricas).
- Hard-delete / borrado real de filas.
- Invalidación inmediata de sesiones abiertas en otros dispositivos (sin store
  de sesiones).
- Motivo de baja como campo (dropdown mal creado / no trabaja más / etc.) — no
  elegido en brainstorming.
