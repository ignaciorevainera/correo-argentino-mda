# Auditoría — Seguridad

**Fecha:** 2026-07-02 (8.ª pasada)
**Enfoque:** XSS, CSRF, autenticación, headers, rate limiting, uploads
**Base:** Escaneo integral del proyecto

---

## Resumen

| Prioridad | Cantidad | Resueltos |
|-----------|----------|-----------|
| 🔴 CRITICAL | 4 | 2 |
| 🟡 HIGH | 5 | 4 |
| 🟢 MEDIUM | 5 | 3 |

---

## P0 — Crítico (resolver inmediatamente)

### S1.1 🔴 API key hardcodeada en JS del cliente

`src/components/buscador-usuarios/BuscadorUsuariosContent.astro` líneas 547, 633, 752:
```js
const token = "mda_live_bf9d7a2e8c5643190ab76d2e1f48c590";
```
Visible en `view-source` para cualquier usuario. Otorga acceso a la API interna
de búsqueda de usuarios.

**Fix:** Mover el call a un endpoint server-side (API route) que proxy la request.
Nunca exponer secrets en JS del cliente.
**Esfuerzo:** 1-2 h.

### S1.2 🔴 `checkOrigin: false` — CSRF deshabilitado

`astro.config.mjs` línea 17: desactiva la validación CSRF de Astro. Cualquier
sitio externo puede enviar POST requests contra el servidor si el usuario tiene
sesión activa.

**Fix:** Setear `checkOrigin: true` en producción. Si se necesitan requests
cross-origin para APIs específicas, usar configuración CORS explícita.
**Esfuerzo:** 5 min.

### ~~S1.3 🔴 Sin headers de seguridad configurados~~ ✅ Resuelto

~~No se encontraron Content-Security-Policy, X-Frame-Options,
X-Content-Type-Options, Strict-Transport-Security en ningún lugar del proyecto.~~

**~~Headers faltantes:~~**
- ~~`Content-Security-Policy` — scripts inline de cualquier fuente pueden ejecutarse~~
- ~~`X-Frame-Options` — sin protección contra clickjacking~~
- ~~`X-Content-Type-Options: nosniff` — MIME sniffing posible~~
- ~~`Strict-Transport-Security` — sin HSTS (cuando se use HTTPS)~~
- ~~`Referrer-Policy` — sin control de información de referrer~~

**Impacto:** ~~Un atacante que consiga inyectar un script puede ejecutarlo sin
restricciones (no hay CSP). La página puede ser iframeada por terceros.~~

**Fix aplicado:** Headers agregados en `src/middleware.ts` vía `setSecurityHeaders()`.
Headers seteados: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
Strict-Transport-Security (HSTS 2 años), Content-Security-Policy restrictivo.
CSP permite `cdn.jsdelivr.net` (Chart.js), `wms.ign.gob.ar` (tiles IGN),
`'unsafe-inline'` para scripts/style (requerido por Astro SSR + Tailwind).
**Esfuerzo:** 15 min.

### ~~S1.4 🔴 Sin rate limiting en ningún endpoint~~ ✅ Resuelto

~~No se encontró implementación de rate limiting, throttle, ni protección
anti-brute-force en todo el proyecto.~~

**~~Endpoints sin protección:~~**
- ~~Login (brute-force de passwords)~~
- ~~API endpoints de cronograma (data scraping, DoS)~~
- ~~File upload (disk exhaustion)~~
- ~~Export endpoints (data scraping masivo)~~

**Fix aplicado:** Rate limiting implementado en `src/middleware.ts` vía `applyRateLimit()`.
Storage in-memory `Map` con lazy sweep cada 60s. Límites:
- Login: 10 intentos/minuto/IP (`POST /login`)
- API read: 60 requests/minuto/sesión (GET/HEAD/OPTIONS)
- API write: 20 requests/minuto/sesión (POST/PUT/DELETE/PATCH)
- Uploads: 10/hora/sesión (`POST /api/cronograma/import`)
Al excederse se retorna 429 con `Retry-After` (API) o redirect a login con toast (login).
Key por endpoint individual + identificador (userId o IP si no autenticado).
**Esfuerzo:** 40 min.

---

## P1 — Alto impacto

### S3.1 🟡 Session cookie `secure: false`

`src/lib/session.ts` líneas 41, 51: la cookie de sesión no tiene `secure: true`,
por lo que se envía por conexiones HTTP sin cifrar.

```ts
cookies.set("session_id", signedSessionId, {
  path: "/",
  httpOnly: true,
  secure: false,  // ← debe ser true en producción
  sameSite: "lax",
  expires: expiresAt,
});
```

**Impacto:** En producción, la cookie viaja en texto plano. Un atacante con
acceso a la red (WiFi público, ISP malicioso) puede interceptarla y secuestrar
la sesión.

**Fix:** `secure: process.env.NODE_ENV === "production"`.
**Esfuerzo:** 5 min.

### ~~S3.2 🟡 Enumeración de usuarios via mensajes de login~~ ✅ Resuelto

~~`src/pages/login/index.astro` líneas 62-69: mensajes diferentes para
"El usuario no existe" vs "Contraseña incorrecta".~~

**~~Impacto:~~** ~~Un atacante puede probar usernames y determinar cuáles son válidos.~~

**Fix aplicado:** Unificado en único mensaje genérico "Credenciales inválidas" sin importar si el usuario existe o la contraseña es incorrecta.
**Esfuerzo:** 5 min.

### ~~S3.3 🟡 Sin protección brute-force en login~~ ✅ Resuelto

~~El endpoint de login no tiene rate limiting, lockout progresivo, ni delays.
Intentos ilimitados de contraseña.~~

**~~Fix:~~** ~~Rate limiting (cubierto por S1.4). Considerar lockout después de
N intentos fallidos.~~
**Fix aplicado:** Rate limit 10 POST/min/IP en `POST /login` via `src/lib/rateLimit.ts` + `src/middleware.ts`.
Cubre tanto login como todos los APIs. Ver S1.4.
**Esfuerzo:** Incluido en S1.4.

### ~~S3.4 🟡 Endpoints de exportación accesibles sin autenticación~~ ✅ Resuelto

~~`src/pages/api/export/offices.ts` y `src/pages/api/export/terminals.ts`:
retornan dumps completos de la base de datos (columnas internas incluidas).
NO están en la lista de rutas protegidas del middleware.~~

**Fix aplicado:** Agregado `lowerPath.startsWith("/api/export")` a la lista de rutas protegidas en `src/middleware.ts`.
**Esfuerzo:** 5 min.

### ~~S3.5 🟡 Subida de archivos de aplicativos sin validación de tipo~~ ✅ Resuelto

~~`src/pages/admin/aplicativos/create.astro` líneas 75-103: al subir archivos
via modalidad "local", no hay validación de MIME type, extensión ni tamaño.~~

**Fix aplicado:** Creado `src/lib/appFileUpload.ts` con `processAppFileUpload()` siguiendo patrón de `iconUpload.ts`.
Validación: extensión (.zip, .exe, .msi, .rar), MIME type, tamaño 100 MB.
Aplicado en `create.astro` y `edit/[id].astro`.
**Esfuerzo:** 20 min.

---

## P2 — Mejoras

### ~~S4.1 🟡 SVG upload permite XSS embebido~~ ✅ Resuelto

~~`src/lib/iconUpload.ts` línea 10: permite SVG como iconos. Los SVGs pueden
contener `<script>` y event handlers que se ejecutan si se sirven con
`Content-Type: image/svg+xml`.~~

**Fix aplicado:** Defensa en profundidad.
Upload: `sanitizeSvgContent()` en `src/lib/iconUpload.ts` strippe `<script>`, `on*`, `<foreignObject>`, `javascript:` hrefs.
Serve: `Content-Disposition: attachment` en `src/pages/api/icons/[filename].ts` para SVGs.
`<img>` tags existentes renderizan normal.
**Esfuerzo:** 10 min.

### ~~S4.2 🟡 Error messages filtran detalles internos~~ ✅ Resuelto

~~Múltiples endpoints retornan `error.message` al cliente:~~

~~| Endpoint | Línea | Filtra |
|----------|-------|--------|
| `invgate/incidents.ts` | 43 | URLs internas de InvGate |
| `invgate/ping.ts` | 30 | Ídem |
| `cronograma/import.ts` | 290 | File paths del servidor |
| `offices/create.ts` | 65-69 | Detalles de UNIQUE constraint |
| `asistencia/index.ts` | 28, 146 | Errores crudos |
| `admin/sync-status.ts` | 40 | Errores de DB |~~

**Fix aplicado:** Helper `sanitizeError()` en `src/lib/apiResponse.ts` que retorna genérico en prod, detalle en dev. URLs internas de InvGate removidas de `invgateClient.ts`. 30 endpoints API migrados a `sanitizeError()`. Build pasa.
**Esfuerzo:** 30 min.

### S4.3 🟡 innerHTML masivo (100+ usos) — vector XSS

La mayoría usa `escapeHtml()` correctamente. Sin embargo, algunas instancias
no tienen escape visible:

| Archivo | Línea | Dato |
|---------|-------|------|
| `HolidaysModal.astro` | 109 | `${name}` de DB |
| `monthly-view.ts` | múltiple | schedule data del server |
| `AdminAplicativosContent.astro` | 500 | regex replacement sobre innerHTML |

**Fix:** Auditar todas las instancias de `innerHTML` que renderizan datos de DB.
Migrar a `textContent`/`createElement` donde sea posible.
**Esfuerzo:** 4-6 h (progresivo).

### S4.4 🟢 Decryption fallback retorna ciphertext

`src/lib/encryption.ts` líneas 44-45, 66-68: si el descifrado falla,
`decryptData()` retorna el texto cifrado raw. Podría exponer blobs
cifrados a la UI.

**Fix:** Retornar string vacío o lanzar error en caso de fallo.
**Esfuerzo:** 5 min.

### ~~S4.5 🟢 Session secret fallback en desarrollo~~ ✅ Resuelto

~~`src/lib/session.ts` línea 12:
```ts
const SECRET_KEY = SECRET || "fallback-secret-do-not-use-in-prod";
```~~

**Fix aplicado:** Fallback reemplazado por `randomBytes(32).toString("hex")` — genera clave aleatoria por reinicio en dev. Prod sigue lanzando error si falta `SESSION_SECRET`.
**Esfuerzo:** 5 min.

---

## Plan de Acción — Seguridad

| Prioridad | ID | Hallazgo | Esfuerzo | Impacto |
|-----------|-----|----------|----------|---------|
| **P0** | S1.1 | 🔴 API key hardcodeada en cliente | 1-2 h | Secret exposure |
| **P0** | S1.2 | 🔴 checkOrigin: false | 5 min | CSRF |
| **P0** | S1.3 | ~~🔴 Sin security headers~~ ✅ | ~~30 min~~ | ~~XSS + clickjacking~~ |
| **P0** | S1.4 | ~~🔴 Sin rate limiting~~ ✅ | ~~2-3 h~~ | ~~DoS + brute-force~~ |
| **P1** | S3.1 | 🟡 Session secure:false | 5 min | Session hijack |
| **P1** | S3.2 | ~~🟡 User enumeration en login~~ ✅ | ~~5 min~~ | ~~Info leak~~ |
| **P1** | S3.3 | ~~🟡 Sin brute-force protection~~ ✅ | ~~incl. en S1.4~~ | ~~Brute-force~~ |
| **P1** | S3.4 | ~~🟡 Export endpoints sin auth~~ ✅ | ~~10 min~~ | ~~Data exposure~~ |
| **P1** | S3.5 | ~~🟡 Upload sin validación de tipo~~ ✅ | ~~30 min~~ | ~~Arbitrary upload~~ |
| **P2** | S4.1 | ~~🟡 SVG upload XSS risk~~ ✅ | ~~30 min~~ | ~~XSS~~ |
| **P2** | ~~S4.2~~ | ~~🟡 Error messages filtran detalles~~ ✅ | ~~30 min~~ | ~~Info leak~~ |
| **P2** | S4.3 | 🟡 innerHTML masivo (100+) | 4-6 h | XSS |
| **P2** | S4.4 | 🟢 Decryption fallback ciphertext | 5 min | Data leak |
| **P2** | ~~S4.5~~ | ~~🟢 Session secret fallback~~ ✅ | ~~5 min~~ | ~~Weak crypto~~ |

**Total esfuerzo estimado:** ~9-14 h.
**Impacto:** Eliminación de 4 vulnerabilidades críticas + hardening general.

### Leyenda

- **P0:** Crítico — resolver inmediatamente.
- **P1:** Alto impacto en seguridad.
- **P2:** Mejoras / buenas prácticas.
