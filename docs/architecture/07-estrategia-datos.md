# 07 — Estrategia de datos

> El motor SQL corporativo **no está definido**. Este documento fija requisitos y criterios de decisión; no asume un motor.

## 1. Situación actual

| Aspecto | Estado |
|---|---|
| Motor | SQLite (`database/mda.db`) |
| Driver | `better-sqlite3` |
| ORM | Drizzle |
| Migraciones | 4 archivos Drizzle para 60 tablas |
| Evolución real | `scripts/align-db-to-schema.mts` |
| Transacciones | Parciales; varias escrituras multi-tabla sin transacción |
| Búsqueda | `LIKE`/GLOB con normalización manual |
| JSON | `users.dashboard_layout` |
| Reportes | Agregaciones en JS sobre tablas completas |
| Backups | `scripts/backup-db.bat` (copia del archivo) |

## 2. Requisitos del motor objetivo

### 2.1 Obligatorios

1. Driver estable para Node 22 en el SO de despliegue.
2. Transacciones ACID con aislamiento configurable.
3. Migraciones versionadas, reproducibles y con rollback.
4. Pooling de conexiones y timeouts.
5. TLS en tránsito.
6. Autenticación compatible con la política corporativa (idealmente integrada a AD).
7. Backup/restore corporativo.
8. Límites de conexiones concurrentes conocidos.
9. Soporte de tipos: enteros, texto, fechas/horas, booleanos, JSON.
10. Licenciamiento y soporte aprobados por la organización.

### 2.2 Deseables

- Búsqueda case-insensitive y con acentos (o `unaccent`/collation).
- Índices parciales y expresiones.
- Full-text search.
- Vistas materializadas.
- `UPSERT`.
- `RETURNING`.
- Particionado o archivado histórico.
- Réplica de lectura para reportes.

### 2.3 Información que falta

- Motor y versión exactos.
- SO y arquitectura del servidor de base.
- Modo de autenticación (usuario/clave, AD, Kerberos, IAM).
- Límite de conexiones por aplicación.
- Política de backups, RPO y RTO.
- Retención de datos y auditoría.
- Si se permite escribir desde la app o solo mediante procedimientos.
- Si hay DBA para migraciones o las ejecuta el equipo.
- Si se permite crear vistas/materializaciones.
- Latencia entre la app y la base.

## 3. Matriz de decisión

| Motor | Driver Node | ORM recomendado | Ventajas | Riesgos |
|---|---|---|---|---|
| PostgreSQL | `pg` | Drizzle o Prisma | Tipos ricos, JSON, full-text, constraints, ecosistema | Requiere infraestructura y DBA |
| SQL Server | `tedious` / `mssql` | Drizzle (mssql) o Kysely | Estándar corporativo, SSO, reporting | Pooling, collation, Windows Auth, licencias |
| MySQL / MariaDB | `mysql2` | Drizzle | Conocido, simple | Menos constraints, JSON limitado, collation |
| SQLite | `better-sqlite3` | Drizzle | Ya funciona, cero infra | No multiusuario, backups manuales, sin red |

**Recomendación preliminar:** PostgreSQL si Infra lo ofrece; SQL Server si es el estándar obligatorio. SQLite solo para desarrollo y pruebas locales.

## 4. ORM

### 4.1 Criterios

| Criterio | Peso |
|---|---|
| Soporte del motor elegido | Alto |
| Tipado de esquema y queries | Alto |
| Migraciones confiables | Alto |
| Transacciones e interacción con SQL crudo | Alto |
| Pooling y compatibilidad con Next | Medio |
| Curva de aprendizaje del equipo | Medio |
| Comunidad y mantenimiento | Medio |
| Licencia | Medio |

### 4.2 Comparación

| Opción | Cuándo elegirla | Cuándo no |
|---|---|---|
| **Drizzle** | El equipo ya lo conoce; se quiere tipado y SQL explícito | El motor no tiene soporte maduro |
| **Prisma** | Se prioriza DX, migraciones y Studio | Se necesita SQL muy específico o pooling serverless complejo |
| **Kysely** | SQL-first, control total, SQL Server | Se quiere esquema declarativo y migraciones integradas |
| **SQL directo** | Procedimientos corporativos obligatorios | Se busca productividad y tipado |

**Recomendación:** Drizzle si el motor es Postgres/MySQL/SQL Server con soporte estable; Kysely si el equipo prioriza SQL explícito o hay restricciones de procedimientos.

## 5. Modelo y esquema

### 5.1 Principios

1. Claves naturales estables para integraciones:
   - `offices.code`
   - `employees.dni`
   - `users.username`
   - `mesas.invgate_id`
   - `titles.id` (interna) + `name` normalizado
2. Toda FK declarada y con acción `ON DELETE` explícita.
3. `NOT NULL` por defecto; nullable solo con justificación.
4. Unique donde el negocio lo exige:
   - `(agent_id, date)` en `schedules`
   - `(agent_id, month, channel_type, call_id)` en auditorías
   - `(username, sucursal)` en `employee_offices`
   - `invgate_location_id` en `office_invgate_links`
5. `CHECK` para enums y rangos.
6. Timestamps en UTC.
7. Soft delete solo donde la papelera lo requiera.
8. Auditoría inmutable separada.
9. JSON solo para configuración, no para datos consultables.
10. Sin columnas “todas las anteriores” (`pos_*`, 15 centros de costo) sin justificación.

### 5.2 Entidades compartidas

| Entidad | Dueño | Consumidores |
|---|---|---|
| `users` | `identity-access` | todos (solo lectura) |
| `agents` | `scheduling` | `attendance`, `availability`, `quality`, `home` |
| `offices` | `org-directory` | `people`, `inventory`, `automations`, `analytics` |
| `mesas` | `identity-access` / `helpdesk-catalog` | `quality`, `knowledge-base`, `helpdesk-catalog` |
| `employees` | `people` | `identity-access`, `home` |

Regla: el dueño escribe; los demás leen por API/read model, no por tabla.

### 5.3 Estados y enums

- Usar `CHECK` o tabla de catálogo, no strings libres.
- Migrar `status` de `schedules` a enum validado.
- Migrar roles a tabla o enum canónico.
- Documentar transiciones de estado.

## 6. Migraciones

### 6.1 Reglas

1. Toda migración vive en el repositorio.
2. Se aplica en CI sobre una base limpia.
3. Se prueba también sobre una copia de producción anonimizada.
4. Es idempotente o tiene control de versión.
5. Tiene rollback o plan de contingencia.
6. No se usa `db push` en producción.
7. Los cambios destructivos se separan en dos releases (expandir/contraer).
8. Los seeds son idempotentes.

### 6.2 Estrategia expand/contract

```
Release 1: agregar columna nullable + backfill + escribir en ambos lados
Release 2: hacer NOT NULL + leer solo la nueva
Release 3: eliminar la vieja
```

Aplica a:

- `schedules.agent_id` (backfill desde nombre)
- `employee_offices` (FK)
- auditorías duplicadas (unique)
- `office_invgate_links` (unique)

## 7. Transacciones y concurrencia

1. Toda operación multi-tabla en una transacción.
2. Locks pesimistas para AGS (`SELECT ... FOR UPDATE` o equivalente).
3. `busy_timeout`/deadlock retry con backoff.
4. Idempotencia por clave de negocio en jobs.
5. Sin llamadas externas dentro de una transacción larga.
6. Patrón outbox para eventos que deban persistirse y publicarse.

## 8. Consultas y reportes

1. Paginación obligatoria; tope duro.
2. `COUNT` separado o `window function`, no cargar todo.
3. Índices según filtros reales (`date`, `agent_id`, `helpdesk_id`, `status`).
4. Reportes sobre vistas/materializaciones, no JS.
5. Cache con TTL para catálogos externos.
6. Evitar `OFFSET` alto; usar keyset pagination.
7. Medir `EXPLAIN` de las 10 consultas más costosas.
8. Presupuesto: p95 < 500 ms para listados; < 2 s para reportes.

## 9. Datos de desarrollo y pruebas

- Base local con `database/mda.db` solo para desarrollo.
- Seeds mínimos y deterministas por módulo.
- Nunca copiar producción a development sin anonimizar.
- Fixtures de integración grabados y versionados.
- Tests de integración con transacción y rollback.

## 10. Calidad de datos observada

| Problema | Evidencia | Acción |
|---|---|---|
| Duplicados de auditoría | Sin unique | Detectar y consolidar antes de migrar |
| `schedules.agent_id` nulo | Esquema | Backfill por nombre/username |
| `employee_offices` sin FK | Esquema | Limpiar huérfanos + FK |
| `office_invgate_links` duplicado | Sin unique | Detectar y resolver |
| Estado de sync en archivos | `src/data/*.json` | Migrar a `sync_runs` |
| Fechas como texto | `schedules.date` | Normalizar a `date` |
| Booleanos como integer | SQLite | Mapear a boolean |
| JSON en columnas | `dashboard_layout` | Mantener con schema |

## 11. Estrategia de migración

Ver `docs/migration/02-migracion-datos.md`.

Resumen:

1. Perfilar datos.
2. Definir claves naturales.
3. ETL idempotente por módulo.
4. Reconciliar conteos y checksums.
5. Validar referencias.
6. Dry-run.
7. Cutover por módulo.
8. Rollback.

## 12. Decisiones pendientes

| # | Decisión | Dueño | Impacto |
|---|---|---|---|
| 1 | Motor y versión | Infra/DBA | Bloquea ORM y migraciones |
| 2 | Autenticación a DB | Seguridad | Bloquea pooling y secrets |
| 3 | Límite de conexiones | DBA | Bloquea pooling y workers |
| 4 | Backups/RPO/RTO | Infra | Bloquea cutover |
| 5 | Retención | Negocio/Seguridad | Afecta histórico y auditoría |
| 6 | Vistas/materializaciones | DBA | Afecta reportes |
| 7 | Procedimientos obligatorios | DBA | Afecta ORM |
| 8 | Anonimización | Seguridad | Afecta pruebas |
