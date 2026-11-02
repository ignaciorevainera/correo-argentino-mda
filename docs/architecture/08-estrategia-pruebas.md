# 08 — Estrategia de pruebas

> Regla del proyecto: no escribir unit tests después del código como formalidad. Los tests deben describir comportamiento y fallar cuando el comportamiento cambia.

## 1. Pirámide adaptada

| Nivel | Herramienta | Alcance | Velocidad | Obligatorio |
|---|---|---|---|---|
| Dominio | Vitest | Funciones puras, políticas, cálculos, parsers | ms | Sí |
| Integración | Vitest + DB real | Repositorios, transacciones, constraints, migraciones | s | Sí |
| Contrato | Vitest + fixtures | InvGate, Wise CX, LDAP, legacy | s | Sí en adapters |
| E2E | Playwright | Flujos por rol, auth, CSRF, exports | min | Smoke en PR; completo nightly |
| Seguridad | Vitest + Playwright | Matriz de permisos, XSS, SSRF, rate limit | s-min | Sí |
| Accesibilidad | axe | Páginas clave | s | Semanal |
| Performance | k6/artillery | Listados y reportes | min | Por release |

## 2. Qué testea cada nivel

### 2.1 Dominio (sin DB, sin HTTP)

- Rotación de sábados.
- Cumplimiento y tolerancias de asistencia.
- Scoring de calidad y ponderación por canal/sección.
- Elegibilidad AGS y orden de cola.
- Normalización de direcciones y edificios.
- Parseo de CSV de cronograma.
- Políticas de permiso.
- Mapeo de estados de workflow.

Característica: deterministas, rápidos, sin mocks de infraestructura.

### 2.2 Integración (DB real)

- Repositorios: `findMany`, `create`, `update`, `delete`.
- Transacciones y rollback.
- Constraints: unique, FK, check.
- Migraciones sobre base limpia.
- Queries de reporte y paginación.
- Soft delete y restauración.

Regla: cada test corre en una transacción que se revierte, o en un esquema efímero.

### 2.3 Contrato (adapters)

- InvGate: tickets, helpdesks, categorías, usuarios, comentarios.
- Wise CX: presencia y wallboard.
- LDAP: bind, búsqueda, errores.
- Legacy inventory: payload y parseo.
- IA: request/response y errores.

Regla: fixtures grabados y versionados; el test falla si el contrato cambia.

### 2.4 E2E (navegador)

Flujos mínimos por módulo:

| Módulo | Flujos |
|---|---|
| Auth | login, logout, sesión expirada, CSRF, rate limit |
| Títulos | listar, buscar, copiar, favoritear, crear/editar/borrar, import/export |
| Oficinas | listar, filtrar, ver detalle, estadísticas, crear/editar |
| Inventario | listar, filtrar, estadísticas, export |
| Buscador | buscar, ver perfil, editar contacto, permisos |
| Recursos | listar, revelar credencial, CRUD admin |
| KB | listar, ver, crear/editar, publicar, imágenes, sanitización |
| Mesas | matriz, editar, ocultar, asignar |
| Automatizaciones | listar, detalle, cerrar/reabrir, métricas |
| Reportes | dashboard, categorías, mesas, workflows, badge de fuente |
| Cronograma | cargar mes, editar, rotación, HE, guardia, export |
| Asistencia | planilla, marcar, estadísticas, ficha |
| AGS | disponibilidad, asignar, deshacer, lock, reglas |
| Calidad | nueva auditoría por canal, editar, borrar, calibración |
| Admin | usuarios, roles, permisos, auditoría, papelera |

### 2.5 Seguridad

- Matriz rol × ruta × acción.
- CSRF en toda mutación.
- XSS en campos ricos (KB, comentarios, nombres).
- SSRF en descargas.
- Path traversal en archivos.
- Rate limit por usuario e IP.
- Sesión inválida, expirada, fingerprint distinto.
- Secretos no expuestos en logs ni respuestas.

### 2.6 Accesibilidad

- Navegación por teclado.
- Foco visible.
- Labels y `aria-*`.
- Contraste.
- Modales con focus trap.
- Tablas con headers.

### 2.7 Performance

- p95 de listados < 500 ms.
- p95 de reportes < 2 s.
- Export de 10k filas sin bloquear.
- Carga inicial del home < 2 s.

## 3. Datos de prueba

1. Seeds deterministas por módulo.
2. Un usuario por rol, con mesa asignada.
3. Un usuario sin mesa.
4. Un usuario inactivo.
5. Catálogos mínimos: regiones, provincias, mesas, categorías.
6. Casos límite: nombres con acentos, `<script>`, comillas, campos vacíos.
7. Nunca datos reales sin anonimizar.

## 4. Anti-patrones prohibidos

| Anti-patrón | Por qué |
|---|---|
| Test que valida texto fuente de `.astro`/`.tsx` | Change-detector; falla por refactor sin cambio de comportamiento |
| Test sobre la implementación de un mock | No valida el sistema real |
| Test que depende del orden de ejecución | Flaky |
| Test que usa la DB de desarrollo | Contamina y no es reproducible |
| Test E2E que solo verifica que un heading existe | No valida el flujo |
| Snapshot gigante de HTML | Ruido y falsos positivos |
| Test sin aserción de comportamiento | No aporta |
| Test que requiere red externa | Inestable |

## 5. Estructura de tests

```
tests/
├─ unit/
│  ├─ scheduling/rotation.test.ts
│  ├─ attendance/compliance.test.ts
│  ├─ quality/scoring.test.ts
│  └─ availability/queue.test.ts
├─ integration/
│  ├─ titles/titles.repository.test.ts
│  ├─ quality/audits.repository.test.ts
│  └─ scheduling/schedules.repository.test.ts
├─ contract/
│  ├─ invgate/tickets.test.ts
│  ├─ wisecx/presence.test.ts
│  └─ ldap/bind.test.ts
├─ e2e/
│  ├─ auth.spec.ts
│  ├─ titles.spec.ts
│  ├─ quality.spec.ts
│  └─ ...
├─ security/
│  ├─ rbac.spec.ts
│  ├─ csrf.spec.ts
│  └─ xss.spec.ts
└─ fixtures/
   ├─ invgate/
   ├─ wisecx/
   └─ seeds/
```

## 6. Gates de CI

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e:smoke
```

Nightly:

```bash
pnpm test:e2e
pnpm test:security
pnpm test:a11y
```

Reglas:

- Un PR no mergea con gates rojos.
- Un cambio de esquema requiere migración + test de integración.
- Un cambio de permiso requiere test de matriz.
- Un cambio de integración requiere contrato actualizado.

## 7. Cobertura

No perseguir un porcentaje global. Priorizar:

1. Reglas de negocio críticas (calidad, asistencia, AGS, cronograma).
2. Permisos y CSRF.
3. Integraciones.
4. Migraciones.
5. Flujos E2E de cada rol.

Objetivo sugerido:

| Área | Cobertura mínima |
|---|---:|
| Dominio puro | 90% |
| Servicios críticos | 80% |
| Repositorios | 70% |
| UI | E2E de flujos, no cobertura de líneas |
| Adapters | Contratos principales |

## 8. Plan de pruebas por fase

| Fase | Pruebas |
|---|---|
| 3 | Smoke de bootstrap, typecheck, lint, boundaries |
| 4 | Matriz RBAC, sesión, CSRF |
| 5 | Errores, logs, auditoría, jobs |
| 6 | Títulos: unit + integración + E2E |
| 7 | Oficinas: queries, filtros, performance |
| 8 | Contenido: XSS, uploads, credenciales |
| 9 | Operativos: concurrencia, locks, import/export |
| 10 | Calidad/IA/automatizaciones: scoring, contratos, reportes |
| 11 | Migración: reconciliación, rollback |
| 12 | Regresión completa, seguridad, carga, a11y |

## 9. Reporte y trazabilidad

- Playwright HTML + traces en cada corrida.
- JUnit XML para CI.
- Capturas en fallos.
- Enlace al commit y al ambiente.
- Un test que falla debe tener dueño y ticket.

## 10. Definición de “suficientemente probado”

1. El flujo principal funciona para cada rol.
2. Los permisos deniegan lo que deben denegar.
3. Las mutaciones son CSRF-safe.
4. Los errores muestran un mensaje útil y no filtran datos.
5. La migración reconcilia.
6. El rollback funciona.
7. Los tests corren en CI sin red externa.
