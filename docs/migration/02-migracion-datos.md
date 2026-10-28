# 02 — Migración de datos

> Estrategia: migración por módulo, con reconciliación demostrable y rollback. Sin dual-write. Sin big-bang.

## 1. Principios

1. **Un módulo, una migración.** No se migra todo el esquema de una vez.
2. **Claves naturales estables.** `office.code`, `employee.dni`, `user.username`, `mesas.invgate_id`.
3. **Idempotencia.** Correr dos veces no duplica.
4. **Reconciliación.** Conteos, checksums y referencias antes de habilitar.
5. **Dry-run obligatorio.** Sin `--apply` no se escribe.
6. **Rollback probado.** Cada migración tiene vuelta atrás.
7. **Sin dual-write.** El legado queda read-only durante la transición.
8. **Sin datos reales en desarrollo.** Anonimizar.

## 2. Fases

```
0. Inventario y perfilado
1. Definición del modelo destino
2. Mapeo campo a campo
3. ETL idempotente
4. Dry-run + reporte
5. Reconciliación
6. Cutover del módulo
7. Observación
8. Rollback o desmantelamiento
```

## 3. Perfilado inicial

Para cada tabla:

| Chequeo | Consulta |
|---|---|
| Conteo | `SELECT COUNT(*)` |
| Nulos en campos obligatorios | `COUNT(*) WHERE campo IS NULL` |
| Duplicados por clave natural | `GROUP BY clave HAVING COUNT(*) > 1` |
| Huérfanos | `LEFT JOIN ... WHERE padre.id IS NULL` |
| Rangos inválidos | fechas futuras, negativos, enums fuera de catálogo |
| Texto libre | longitudes, caracteres de control, HTML |
| Booleanos inconsistentes | `0/1`, `true/false`, `NULL` |

## 4. Mapa por módulo

| Módulo | Tablas | Clave natural | Orden | Depende de |
|---|---|---|---|---|
| `identity-access` | `users`, `sessions`, `mesas` | `username`, `invgate_id` | 1 | — |
| `people` | `employees`, `employee_offices` | `dni`, `(username, sucursal)` | 2 | `identity-access` |
| `org-directory` | `offices`, `regions`, `provinces`, `office_*` | `code`, `(region, province)` | 3 | — |
| `inventory` | `terminals`, `cubics`, `cubic_assignments` | `(hostname, serial)`, `cubic.code` | 4 | `org-directory`, `people` |
| `titles` | `title_category`, `titles`, `title_favorites` | `name`, `(user_id, title_id)` | 5 | `identity-access` |
| `knowledge-base` | `kb_categories`, `kb_articles` | `(helpdesk_id, name)`, `slug` | 6 | `identity-access`, `helpdesk-catalog` |
| `resource-catalog` | `resource_*`, `application*`, `contact*` | `(category, name)`, `slug` | 7 | `identity-access` |
| `helpdesk-catalog` | `mesas`, `support_guides`, `hidden_helpdesks` | `invgate_id`, `(mesa, tema)` | 8 | `identity-access` |
| `scheduling` | `agents`, `schedules`, `saturday_*`, `weekend_*`, `holidays`, `guardia_*` | `(agent_id, date)`, `(year, month)` | 9 | `identity-access`, `people` |
| `attendance` | `operator_attendance` | `(agent_id, date, shift)` | 10 | `scheduling` |
| `availability` | `assignment_lock`, `assignment_history`, `autogestion_rule_state` | `(ticket, timestamp)` | 11 | `scheduling` |
| `quality` | `quality_audits`, `audit_parameters`, `audit_scores`, `monthly_summaries` | `(agent_id, month, channel, call_id)` | 12 | `identity-access`, `scheduling` |
| `automations` | `automation_*`, `workflow_*` | `invgate_parent_id`, `(parent, stage)` | 13 | `identity-access`, `org-directory` |
| `platform` | `audit_logs`, `deleted_records`, `feedback` | `id` + timestamp | 14 | todos |

## 5. Mapeo del piloto Títulos

### 5.1 Origen → destino

| Origen | Destino | Transformación |
|---|---|---|
| `title_category.id` | `title_category.id` | Conservar o remapear |
| `title_category.name` | `title_category.name` | `trim`, unique |
| `title_category.icon` | `title_category.icon` | default si vacío |
| `title_category.tone` | `title_category.tone` | default si vacío |
| `titles.id` | `titles.id` | Conservar para favoritos |
| `titles.name` | `titles.name` | `formatTitleName`, ≤300 |
| `titles.category_id` | `titles.category_id` | Validar existencia |
| `titles.route` | `titles.route` | `trim`, null si vacío |
| `titles.description` | `titles.description` | `trim`, null si vacío |
| `titles.article_on_kdb` | `titles.article_on_kdb` | Conservar |
| `titles.article_on_kdb_title` | `titles.article_on_kdb_title` | Conservar |
| `titles.kb_match_score` | `titles.kb_match_score` | `numeric(4,3)` |
| `titles.enriched_cases` | `titles.enriched_cases` | Conservar |
| `titles.enriched_at` | `titles.enriched_at` | epoch → timestamptz |
| `titles.deprecated` | `titles.deprecated` | 0/1 → boolean |
| `titles.created_at` | `titles.created_at` | epoch → timestamptz |
| `titles.updated_at` | `titles.updated_at` | epoch → timestamptz |
| `title_favorites.user_id` | `title_favorites.user_id` | Resolver por `users.id` |
| `title_favorites.title_id` | `title_favorites.title_id` | Resolver por `titles.id` |

### 5.2 Reglas

- Si `category_id` no existe, el título se rechaza y se reporta.
- Si `name` queda vacío, se rechaza.
- Duplicados de nombre: reportar; no fusionar automáticamente.
- Favoritos de usuarios inexistentes: descartar y reportar.
- Favoritos de títulos inexistentes: descartar y reportar.

## 6. ETL

### 6.1 Interfaz

```bash
pnpm migrate:titles --source ./export/titles --dry-run
pnpm migrate:titles --source ./export/titles --apply
pnpm migrate:titles --rollback --batch <id>
```

### 6.2 Requisitos

- Lee de un export inmutable (JSON/CSV), no de la DB viva.
- Valida cada fila con Zod.
- Escribe en lotes de 500.
- Registra `migration_batches` con:
  - id, módulo, inicio, fin, filas leídas/insertadas/rechazadas.
- Genera reporte con rechazos y motivos.
- `--apply` requiere confirmación explícita.
- Backup previo.

### 6.3 Idempotencia

- `UPSERT` por clave natural.
- No reinsertar si ya existe.
- Favoritos: `ON CONFLICT DO NOTHING`.

## 7. Reconciliación

### 7.1 Conteos

```sql
-- origen
SELECT COUNT(*) FROM titles;
-- destino
SELECT COUNT(*) FROM titles;
-- diferencia esperada = rechazados
```

### 7.2 Checksums

```sql
SELECT md5(string_agg(id || ':' || name || ':' || category_id, ',' ORDER BY id))
FROM titles;
```

Comparar origen y destino. Diferencias por normalización de nombre deben explicarse.

### 7.3 Referencias

- 0 títulos con `category_id` inexistente.
- 0 favoritos con `user_id` o `title_id` inexistente.
- 0 nombres vacíos.
- 0 duplicados por nombre (o decisión documentada).

### 7.4 Reporte

| Métrica | Esperado | Obtenido | Estado |
|---|---:|---:|---|
| Categorías | 7 | | |
| Títulos | 525 | | |
| Favoritos | 0 (local) | | |
| Rechazados | 0 | | |
| Huérfanos | 0 | | |

## 8. Migración por módulo: criterios

Un módulo se considera migrado cuando:

1. El ETL corre en dry-run sin rechazos inesperados.
2. La reconciliación de conteos y checksums cierra.
3. Las referencias están completas.
4. La app nueva lee y escribe correctamente.
5. Los E2E del módulo pasan contra datos migrados.
6. El legado queda read-only para ese módulo.
7. Existe rollback probado.

## 9. Rollback

| Nivel | Acción |
|---|---|
| Fila | Revertir por `migration_batches` |
| Módulo | Restaurar backup del módulo |
| Sistema | Volver el proxy al legado |

Reglas:

- Backup antes de `--apply`.
- El rollback no borra datos del legado.
- El rollback se ensaya en staging.
- Se documenta el tiempo de restauración.

## 10. Datos que requieren decisión de negocio

| Dato | Problema | Decisión necesaria |
|---|---|---|
| Títulos duplicados | Mismo nombre, distinta categoría | Fusionar o mantener |
| Oficinas duplicadas | Misma dirección, distinto código | Reconciliar por edificio |
| Empleados sin sucursal | `employee_offices` vacío | Completar desde MidPoint |
| Auditorías duplicadas | Sin unique | Consolidar o mantener |
| `schedules.agent_id` nulo | Overrides legacy | Backfill por nombre |
| Sesiones | No migrar | Expirar todas |
| Contraseñas | Hash bcrypt | Mantener hash o forzar reset |
| Logs de auditoría | Volumen e integridad | Migrar o archivar |

## 11. Herramientas

| Necesidad | Herramienta |
|---|---|
| Export | script Node con DB readonly |
| Validación | Zod |
| ETL | script Node/tsx idempotente |
| Reconciliación | SQL + reporte Markdown |
| Backups | `pg_dump`/`BACKUP DATABASE`/copia SQLite |
| Anonimización | script con mapping |
| Comparación | checksums + conteos |

## 12. Checklist

- [ ] Perfilado documentado.
- [ ] Modelo destino aprobado.
- [ ] Mapeo campo a campo revisado.
- [ ] ETL con dry-run.
- [ ] Reporte de rechazos.
- [ ] Reconciliación cerrada.
- [ ] Rollback probado.
- [ ] Backup verificado.
- [ ] Ventana acordada.
- [ ] Responsable de datos disponible.
