# Arquitectura y migración — Portal MDA

Documentación de la auditoría del sistema actual y del plan de reconstrucción.

- **Commit auditado:** `d9834795`
- **Fecha de auditoría:** 2026-10-23
- **Alcance:** análisis estático del repositorio, sin ejecutar build, tests ni modificaciones.
- **Estado:** propuesta para revisión. Las decisiones aprobadas y las pendientes se indican en cada documento y en `docs/adr/`.

## Orden de lectura

### 1. Entender el presente

| Documento | Qué responde |
|---|---|
| [00-estado-actual.md](00-estado-actual.md) | Qué tecnología hay, cómo se ejecuta y cuáles son sus métricas |
| [01-inventario-modulos.md](01-inventario-modulos.md) | Qué hace cada módulo, con qué rutas, tablas e integraciones |
| [02-mapa-dependencias.md](02-mapa-dependencias.md) | Cómo se acoplan hoy los módulos y dónde están los puntos de dolor |
| [03-deuda-tecnica.md](03-deuda-tecnica.md) | Registro priorizado de hallazgos con evidencia |

### 2. Entender el destino

| Documento | Qué responde |
|---|---|
| [04-arquitectura-objetivo.md](04-arquitectura-objetivo.md) | Monolito modular, capas, módulos y alternativas descartadas |
| [05-estructura-carpetas.md](05-estructura-carpetas.md) | Árbol de carpetas y responsabilidades |
| [06-convenciones-y-limites.md](06-convenciones-y-limites.md) | Reglas de importación, naming y revisión |
| [07-estrategia-datos.md](07-estrategia-datos.md) | Requisitos de motor, ORM, migraciones y transacciones |
| [08-estrategia-pruebas.md](08-estrategia-pruebas.md) | Pirámide, herramientas y gates |
| [09-observabilidad-y-errores.md](09-observabilidad-y-errores.md) | Errores, logs, auditoría y jobs |

### 3. Ejecutar la transición

| Documento | Qué responde |
|---|---|
| [../migration/00-roadmap.md](../migration/00-roadmap.md) | Fases, dependencias, esfuerzo y criterios de cierre |
| [../migration/01-plan-piloto-titulos.md](../migration/01-plan-piloto-titulos.md) | Alcance detallado del piloto aprobado |
| [../migration/02-migracion-datos.md](../migration/02-migracion-datos.md) | ETL, reconciliación y rollback |
| [../migration/03-riesgos-mitigacion.md](../migration/03-riesgos-mitigacion.md) | Matriz de riesgos |
| [../migration/04-runbook-cutover.md](../migration/04-runbook-cutover.md) | Operación del corte |

### 4. Decisiones

| ADR | Decisión | Estado |
|---|---|---|
| [0001](../adr/0001-monolito-modular.md) | Monolito modular | Aprobado |
| [0002](../adr/0002-next-app-router.md) | Next.js App Router | Aprobado con condiciones |
| [0003](../adr/0003-sesion-y-rbac.md) | Sesión y RBAC | Propuesto |
| [0004](../adr/0004-estrategia-datos.md) | Motor y ORM | Pendiente de Infra |
| [0005](../adr/0005-integraciones-api-first.md) | Integraciones API-first | Recomendado |
| [0006](../adr/0006-ia-y-datos.md) | IA y tratamiento de datos | Pendiente de Seguridad |

## Leyenda

| Símbolo | Significado |
|---|---|
| ✅ | Verificado en código o aprobado por el usuario |
| ⚠️ | Requiere validación en runtime, producción o con otra área |
| ⛔ | Decisión pendiente que bloquea una fase |
| 🔴 / 🟠 / 🟡 | Severidad alta / media / baja |

## Reglas de esta documentación

1. No se describe como implementado nada que no esté en el repositorio.
2. Los datos de la base local son de desarrollo y no representan producción.
3. Las decisiones de Infraestructura, Seguridad y DBA se marcan como pendientes; no se asumen.
4. Los documentos existentes (`docs/CONTEXT.md`, `docs/architecture.md`, `docs/lessons.md`, etc.) no se modifican.

## Vista en el portal

Los documentos se pueden leer desde el portal en `/admin/documentacion` (solo `admin`). Se accede desde la tarjeta **Documentación técnica** en `/admin`. La vista es de solo lectura y resuelve los links relativos entre documentos.
