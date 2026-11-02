# 09 — Observabilidad y manejo de errores

> Objetivo: que un incidente se pueda diagnosticar sin acceso al servidor y sin exponer datos sensibles.

## 1. Situación actual

| Aspecto | Estado |
|---|---|
| Logs | `console.log/error` dispersos; 38 `console.log` en `src` |
| Request ID | No existe |
| Métricas | Contadores en memoria (`invgate/metrics.ts`) |
| Trazas | No existen |
| Health check | No existe |
| Errores | `jsonError` + try/catch en 104/131 endpoints |
| Auditoría funcional | `audit_logs` + `logAdminAction` |
| Alertas | No existen |
| Redacción | No existe |

## 2. Taxonomía de errores

```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly userMessage: string,
    readonly context?: Record<string, unknown>,
    readonly cause?: unknown,
  ) {
    super(code);
  }
}
```

| Código | HTTP | Cuándo | Log |
|---|---:|---|---|
| `UNAUTHENTICATED` | 401 | Sin sesión | info |
| `FORBIDDEN` | 403 | Sin permiso | warn |
| `NOT_FOUND` | 404 | Recurso inexistente | info |
| `VALIDATION` | 422 | Zod | info |
| `CONFLICT` | 409 | Duplicado/estado inválido | warn |
| `INTEGRATION` | 502 | InvGate/WiseCX/LDAP | error |
| `TIMEOUT` | 504 | Dependencia lenta | error |
| `RATE_LIMITED` | 429 | Límite | warn |
| `INTERNAL` | 500 | Inesperado | error |

Reglas:

- El cliente recibe `code` y `userMessage`; nunca `cause`, stack ni SQL.
- `cause` se loguea con `requestId`.
- Un error de integración puede degradar a caché si existe.
- Los errores de validación incluyen `fields`.

## 3. Wrapper HTTP

```ts
export async function handleRoute(
  req: Request,
  fn: (ctx: RouteContext) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const started = performance.now();
  try {
    const res = await fn({ requestId, req });
    log.info({ requestId, status: res.status, durationMs: performance.now() - started });
    return res;
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
```

Aplica a:

- route handlers
- Server Actions
- jobs

## 4. Logs

### 4.1 Formato

```json
{
  "level": "info",
  "ts": "2026-10-23T14:02:11.123Z",
  "requestId": "6f1c...",
  "userId": 42,
  "role": "supervisor",
  "module": "quality",
  "action": "audit.create",
  "durationMs": 87,
  "outcome": "ok"
}
```

### 4.2 Reglas

1. JSON, una línea por evento.
2. `requestId` en toda request.
3. `userId` y `role` sin PII.
4. Nunca loguear contraseñas, tokens, cookies, `Authorization`, `IGSMSESSID`.
5. Redactar DNI, teléfono, email y datos de tickets cuando no sean necesarios.
6. No loguear cuerpos completos.
7. Niveles: `debug` (dev), `info`, `warn`, `error`, `fatal`.
8. Sin `console.log` en producción; solo el logger.

### 4.3 Redacción

```ts
const redact = ["password", "token", "authorization", "cookie", "secret", "apiKey"];
```

Configurar en el logger, no en cada llamada.

## 5. Auditoría funcional

Separada de los logs técnicos.

| Campo | Ejemplo |
|---|---|
| `actorId` | 42 |
| `actorUsername` | `jperez` |
| `action` | `quality.audit.create` |
| `entity` | `quality_audit` |
| `entityId` | 1234 |
| `before` | JSON (sin secretos) |
| `after` | JSON (sin secretos) |
| `ip` | 10.0.0.5 |
| `requestId` | UUID |
| `createdAt` | timestamp |

Reglas:

1. Toda mutación de negocio deja auditoría.
2. El `before/after` es un delta, no la fila completa.
3. No se audita lectura, salvo credenciales reveladas.
4. La auditoría es inmutable.
5. Retención según política corporativa.

## 6. Métricas

### 6.1 Técnicas

- `http_requests_total{route,status}`
- `http_request_duration_ms{route}`
- `errors_total{code,module}`
- `db_query_duration_ms{query}`
- `integration_requests_total{provider,status}`
- `integration_duration_ms{provider}`
- `job_runs_total{job,status}`
- `job_duration_ms{job}`

### 6.2 Funcionales

- Auditorías creadas por día.
- Asignaciones AGS por día.
- Tiempo medio de asignación.
- Syncs exitosos/fallidos.
- Tickets InvGate consultados.
- Exportaciones generadas.

## 7. Health checks

| Endpoint | Qué verifica |
|---|---|
| `GET /api/health/live` | Proceso vivo |
| `GET /api/health/ready` | DB + storage + integraciones críticas |
| `GET /api/health/version` | Commit, build, entorno |

Reglas:

- `live` no toca dependencias.
- `ready` con timeout corto.
- No exponer detalles internos al público; solo a red interna.

## 8. Jobs

Tabla `job_runs`:

| Campo | Tipo |
|---|---|
| `id` | UUID |
| `job` | text |
| `status` | `running`/`ok`/`error` |
| `startedAt` | timestamp |
| `finishedAt` | timestamp |
| `durationMs` | integer |
| `error` | text |
| `metrics` | JSON |

Reglas:

1. Un job registra inicio y fin.
2. Lock por `job` para evitar solapamiento.
3. Reintento manual documentado.
4. Alerta si falla 2 veces seguidas.
5. Sin PII en `error`.

## 9. Alertas

| Señal | Umbral | Acción |
|---|---|---|
| 5xx | > 1% en 5 min | Aviso |
| p95 latencia | > 2 s en 5 min | Aviso |
| DB | conexiones > 80% | Aviso |
| Integración | 3 fallos seguidos | Aviso |
| Job | 2 fallos seguidos | Aviso |
| Disco | > 80% | Aviso |
| Sesiones | caída abrupta | Investigar |

## 10. Correlación

- `requestId` propagado a logs, auditoría y respuesta (`X-Request-Id`).
- En jobs, `jobRunId` como correlación.
- En integraciones, `providerRequestId` si existe.
- En errores, `cause` con código del proveedor.

## 11. Qué no hacer

- No loguear el body completo.
- No devolver stack en producción.
- No usar `console.log` como observabilidad.
- No meter PII en nombres de métricas.
- No alertar por cada error de validación.
- No usar la auditoría como log técnico.
- No depender de archivos locales para estado de jobs.

## 12. Criterios de aceptación

1. Toda request tiene `requestId`.
2. Todo error tiene código y respuesta uniforme.
3. Toda mutación de negocio deja auditoría.
4. Todo job deja `job_runs`.
5. Todo adapter registra duración y resultado.
6. Existe health check de app y DB.
7. No hay secretos ni PII en logs.
8. Un incidente se puede rastrear desde el `requestId`.
