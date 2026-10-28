# ADR 0003 — Sesión y RBAC

- **Estado:** Propuesto
- **Fecha:** 2026-10-23
- **Decisores:** Arquitectura, Seguridad

## Contexto

La aplicación actual usa una cookie `session_id` firmada con HMAC, una tabla `sessions`, fingerprint de `user-agent`, y un RBAC por prefijo de ruta más checks ad-hoc. Funciona, pero:

- El catálogo de rutas/roles está duplicado en 5 lugares.
- Hay endpoints que solo exigen sesión.
- CSRF se aplica en ~10 endpoints.
- Rate limit y caché de sesión son en memoria.

## Decisión

Implementar:

1. **Sesión opaca en base** con cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
2. **Rotación** al iniciar sesión y al cambiar privilegios.
3. **TTL absoluto e inactividad**.
4. **Fingerprint** de `user-agent`; IP opcional detrás de proxy confiable.
5. **Manifiesto único de permisos** (`permissions.ts`) que genera guards, sidebar y documentación.
6. **CSRF global** para métodos no seguros.
7. **Rate limit distribuido** si hay más de una instancia.
8. **Provider interface** para SSO futuro.

## Modelo de permisos

```ts
can(actor, "titles.write")
can(actor, "quality.viewAll")
can(actor, "cronograma.write", { helpdeskId })
```

Reglas:

- `admin` no revocable.
- Scope por mesa donde aplique.
- Deny by default.
- Prohibido comparar `role === "..."` fuera de `server/auth`.

## Consecuencias

### Positivas

- Una sola fuente de verdad.
- Menos drift entre sidebar, home y permisos.
- CSRF uniforme.
- Preparado para SSO.

### Negativas

- Migración de sesiones existentes.
- Requiere tests de matriz.
- Rate limit distribuido agrega infraestructura.

### Mitigaciones

- Expirar sesiones en el cutover.
- Tests de matriz por rol y ruta.
- Store compartido solo si hay más de una instancia.

## Pendientes

- SSO local vs Entra ID.
- Store de rate limit.
- Política de expiración.
- Ownership para datos de empleados.

## Referencias

- `docs/architecture/04-arquitectura-objetivo.md`
- `docs/architecture/06-convenciones-y-limites.md`
