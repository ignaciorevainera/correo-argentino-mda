# ADR 0004 — Estrategia de datos

- **Estado:** Pendiente de Infraestructura/DBA
- **Fecha:** 2026-10-23
- **Decisores:** Infraestructura, DBA, Arquitectura

## Contexto

La aplicación actual usa SQLite con Drizzle. El objetivo es una base SQL corporativa, pero el motor no está confirmado. La elección condiciona driver, ORM, pooling, migraciones, tipos y despliegue.

## Decisión pendiente

Elegir:

1. Motor y versión.
2. Modo de autenticación.
3. Límite de conexiones.
4. ORM.
5. Estrategia de migraciones.
6. Backups/RPO/RTO.
7. Retención.
8. Permiso para vistas/materializaciones.

## Criterios

| Criterio | Peso |
|---|---|
| Soporte del motor | Alto |
| Tipado y migraciones | Alto |
| Transacciones y SQL explícito | Alto |
| Pooling y compatibilidad con Next | Medio |
| Curva de aprendizaje | Medio |
| Licenciamiento | Medio |

## Recomendación preliminar

- **PostgreSQL** si Infra lo ofrece.
- **SQL Server** si es el estándar obligatorio.
- **SQLite** solo para desarrollo y tests.
- **Drizzle** si el motor tiene soporte maduro; **Kysely** si se prioriza SQL explícito.

## Consecuencias de no decidir

- No se puede iniciar Fase 3 con persistencia real.
- No se puede diseñar la migración.
- No se puede dimensionar pooling ni workers.
- Aumenta el riesgo de retrabajo.

## Requisitos mínimos

Ver `docs/architecture/07-estrategia-datos.md`.

## Referencias

- `docs/architecture/07-estrategia-datos.md`
- `docs/migration/02-migracion-datos.md`
