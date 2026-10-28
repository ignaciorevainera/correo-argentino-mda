# 06 — Convenciones y límites

> Objetivo: que la nueva aplicación no reproduzca el acoplamiento actual. Las reglas deben ser ejecutables, no aspiracionales.

## 1. Principios

1. **Una frontera, una validación.** Todo dato externo se parsea una vez.
2. **Una mutación, un servicio.** Nada de escrituras desde componentes o rutas.
3. **Un módulo, un contrato.** Solo se importa su `index.ts`.
4. **Un dato, un dueño.** Ningún módulo escribe tablas de otro.
5. **Un error, un formato.** `AppError` y respuesta uniforme.
6. **Un permiso, una política.** `can(actor, action, resource)`.
7. **Un job, un registro.** Estado en base, no en archivos.
8. **Un cambio, un test de comportamiento.** Sin tests de texto fuente.

## 2. Reglas de importación

### 2.1 Permitido

```ts
// app
import { requireSession } from "@/server/auth/guards";
import { listTitles, canWriteTitles } from "@/modules/titles";
import { Button } from "@/components/ui/button";

// módulo
import { db } from "@/server/db/client";
import { audit } from "@/modules/platform";
import { formatDate } from "@/shared/utils/date";

// servidor
import { logger } from "@/server/observability/logger";
```

### 2.2 Prohibido

```ts
// ❌ app importa implementación
import { titlesRepository } from "@/modules/titles/titles.repository";

// ❌ módulo importa interno de otro
import { qualityRepository } from "@/modules/quality/audits.repository";

// ❌ servidor conoce dominio
import { createTitle } from "@/modules/titles";

// ❌ componente importa DB
import { db } from "@/server/db/client";

// ❌ página con SQL
const rows = await db.select().from(titles);
```

### 2.3 Aplicación con lint

`eslint.config.mjs`:

```js
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "module", pattern: "src/modules/*", capture: ["module"] },
        { type: "ui", pattern: "src/components/ui/**" },
        { type: "shared-ui", pattern: "src/components/shared/**" },
        { type: "server", pattern: "src/server/**" },
        { type: "shared", pattern: "src/shared/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["module", "ui", "shared-ui", "server", "shared"] },
            { from: "module", allow: ["module", "server", "shared"] },
            { from: "server", allow: ["server", "shared"] },
            { from: "shared", allow: ["shared"] },
            { from: "ui", allow: ["ui", "shared"] },
            { from: "shared-ui", allow: ["ui", "shared-ui", "shared"] },
          ],
        },
      ],
    },
  },
];
```

Complementos:

- `dependency-cruiser` para ciclos y `orphans`.
- `import/no-restricted-paths` para prohibir `@/server/db` fuera de repositorios.
- Regla custom o `no-restricted-imports` para `modules/*/*.repository`.

### 2.4 Reglas adicionales

| Regla | Herramienta |
|---|---|
| Sin ciclos | `dependency-cruiser` (`no-circular`) |
| Sin huérfanos | `dependency-cruiser` (`no-orphans`) |
| Sin DB en `app` | `no-restricted-imports` |
| Sin `any` explícito | `@typescript-eslint/no-explicit-any` |
| Sin `console` | `no-console` (excepto logger) |
| Sin `innerHTML` | regla custom / revisión |
| Sin `process.env` en módulos | solo `server/config` |
| Sin `import.meta.env` en servidor | solo `server/config` |

## 3. `server-only`

Todo archivo que toque DB, secretos o integraciones debe empezar con:

```ts
import "server-only";
```

Aplica a:

- `server/**`
- `modules/**/*.service.ts`
- `modules/**/*.repository.ts`
- `modules/**/*.queries.ts`
- `modules/**/*.policy.ts` (si lee sesión)

No aplica a componentes cliente ni a `shared`.

## 4. Validación

### 4.1 Reglas

1. Zod en route handlers, Server Actions, jobs y adapters.
2. `safeParse` para errores de usuario; `parse` solo si el error es programático.
3. DTOs explícitos; nunca `set({...body})`.
4. Validar IDs, fechas, enums y límites de texto.
5. Validar la salida de integraciones antes de usarla.
6. Mensajes de error en castellano y por campo.

### 4.2 Ejemplo

```ts
const updateTitleSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(300),
  categoryId: z.coerce.number().int().positive(),
});

export async function updateTitle(input: unknown, actor: Actor) {
  const dto = updateTitleSchema.parse(input);
  // ...
}
```

### 4.3 Prohibiciones

- `JSON.parse` sin schema.
- `Number(req.query.x)` sin validar `NaN`.
- `body as Type`.
- `any` en firmas públicas.
- Spread de `request.json()` al ORM.

## 5. Acceso a datos

1. Solo `*.repository.ts` importa `db`.
2. Un repositorio no conoce HTTP ni React.
3. Un servicio no arma SQL; compone repositorios y transacciones.
4. Las consultas de listado reciben `page` y `pageSize` con tope.
5. Los reportes usan vistas/materializaciones o `*.queries.ts`.
6. No `SELECT *` en endpoints públicos.
7. No JOIN entre tablas de módulos distintos sin un read model explícito.
8. Toda escritura multi-tabla va en transacción.
9. Toda tabla mutable tiene `created_at`/`updated_at`.
10. Toda migración es reversible o tiene plan de rollback documentado.

## 6. Autorización

1. `requireSession()` en layout `(portal)`.
2. `can(actor, "module.action")` en el servicio, no solo en la UI.
3. Scope por mesa donde aplique.
4. `admin` no revocable.
5. Prohibido comparar `role === "admin"` fuera de `server/auth`.
6. Prohibido confiar en el cliente para ocultar acciones.
7. Un endpoint nuevo sin política explícita debe fallar cerrado.

## 7. Errores

```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly userMessage: string,
    readonly cause?: unknown,
  ) {
    super(code);
  }
}
```

| Código | HTTP | Uso |
|---|---:|---|
| `UNAUTHENTICATED` | 401 | Sin sesión |
| `FORBIDDEN` | 403 | Sin permiso |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `VALIDATION` | 422 | Zod |
| `CONFLICT` | 409 | Duplicado/estado |
| `INTEGRATION` | 502 | InvGate/WiseCX/LDAP |
| `INTERNAL` | 500 | Inesperado |

Reglas:

- Nunca devolver stack, SQL ni nombres de tablas.
- Loguear `cause` con `requestId`.
- Un error de integración no debe tumbar el módulo si hay caché válida.
- Los errores de validación incluyen `fields`.

## 8. UI

1. Server Components por defecto; islas client solo para interacción.
2. shadcn/ui para primitivas; no crear botones/modales ad-hoc.
3. `PageHeader`/`FormShell` compartidos.
4. Iconos con tamaño numérico, nunca clases `w-5`.
5. Colores solo tokens del design system.
6. Formularios con labels, `aria-*` y foco visible.
7. Estados: loading, empty, error y success explícitos.
8. Sin `dangerouslySetInnerHTML` salvo sanitizador aprobado y test.
9. Sin fetch a `/api` absoluto; usar el cliente tipado o Server Actions.
10. Sin lógica de negocio en componentes.

## 9. Integraciones

1. Un adapter por proveedor.
2. Timeout obligatorio.
3. Retry solo en errores transitorios, con jitter y tope.
4. Circuit breaker para dependencias críticas.
5. Caché con TTL y clave explícita.
6. Contrato Zod para request y response.
7. Errores normalizados.
8. Sin scraping en el request; worker dedicado.
9. Secretos por entorno.
10. Logs sin tokens ni cookies.

## 10. Jobs

1. Un job = un caso de uso idempotente.
2. Estado en tabla `job_runs`.
3. Lock por clave para evitar solapamiento.
4. Timeout y cancelación.
5. Reintento manual documentado.
6. Alertas por fallo repetido.
7. Sin lógica de negocio duplicada: importa servicios.

## 11. Git y revisión

### 11.1 Commits

- Conventional Commits: `feat(titles): ...`, `fix(quality): ...`.
- Un commit = un cambio coherente.
- No commitear secretos, `.env`, DB ni artefactos.
- No commitear código muerto “por si acaso”.

### 11.2 Pull request

Checklist:

- [ ] Tipo y lint pasan.
- [ ] Tests nuevos o actualizados.
- [ ] Sin `any` nuevos.
- [ ] Sin acceso a DB fuera de repositorios.
- [ ] Sin permisos ad-hoc.
- [ ] Sin secretos ni PII en logs.
- [ ] Migración incluida si cambia el esquema.
- [ ] Documentación actualizada si cambia el contrato.
- [ ] Rollback posible.

### 11.3 Revisión de arquitectura

Un PR que cruce límites de módulo requiere aprobación del responsable de arquitectura. Las excepciones se documentan en un ADR.

## 12. Documentación

- Un README por módulo con propósito, contratos y tablas.
- Un ADR por decisión relevante.
- Runbook por job y por integración.
- Changelog por release.
- Diagramas en Mermaid dentro de `docs/architecture/`.

## 13. Definición de “terminado”

Una tarea está terminada cuando:

1. Cumple el criterio funcional.
2. Tiene tests de comportamiento.
3. Pasa tipo, lint y límites.
4. Tiene auditoría si muta datos.
5. Tiene manejo de error y estado vacío.
6. Está documentada si cambia un contrato.
7. No agrega deuda P1 nueva.
