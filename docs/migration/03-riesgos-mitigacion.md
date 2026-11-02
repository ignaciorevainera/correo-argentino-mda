# 03 — Riesgos de migración y mitigación

> Matriz de riesgos técnicos e institucionales. Probabilidad e impacto: alta/media/baja.
> El “dueño” es el área que debe decidir o ejecutar la mitigación.

## 1. Riesgos críticos

| # | Riesgo | Prob. | Impacto | Señal temprana | Mitigación | Dueño |
|---|---|---|---|---|---|---|
| R-01 | Motor SQL no definido a tiempo | Alta | Alto | Fase 1 sin decisión | Escalar en Fase 0; PoC con 2 candidatos; no empezar Fase 3 sin motor | Infra/DBA |
| R-02 | Datos mock/fixture llegan a la app oficial | Alta | Alto | Reportes sin `dataSource` | Gate de “dato real o badge demo”; eliminar fixtures del build | Producto/Arquitectura |
| R-03 | Syncs destructivos durante la transición | Media | Alto | Base vacía tras un corte | Corregir antes de convivir (D-05/D-06); transacción; dry-run | Integraciones |
| R-04 | Pérdida de reglas de negocio no documentadas | Alta | Alto | Diferencias en UAT | Entrevistas, grabación de flujos, tests de paridad | Negocio + equipo |
| R-05 | Doble fuente de verdad durante la transición | Alta | Alto | Datos distintos entre apps | Un dueño por módulo; legado read-only; sin dual-write | Arquitectura |
| R-06 | IA no aprobada por Seguridad | Media | Alto | Fase 10 bloqueada | Feature flag; plan B sin IA; evaluar on-prem | Seguridad/Legal |
| R-07 | Scraping de InvGate/MidPoint se rompe | Alta | Medio | Sync falla | API-first; adapter testeable; alertas | Integraciones |
| R-08 | Performance de reportes | Media | Alto | p95 > 2 s | Read models, índices, cache, límites | DBA/Arquitectura |

## 2. Riesgos de seguridad

| # | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R-09 | CSRF en endpoint nuevo | Media | Alto | CSRF global; test por ruta | Equipo |
| R-10 | XSS en contenido rico | Media | Alto | Sanitización server-side; CSP estricta; tests | Equipo |
| R-11 | SSRF en descargas | Baja | Alto | Allowlist exacta; redirects cerrados; límites | Equipo |
| R-12 | Exposición de AD/PII | Media | Alto | Gates por rol; redacción; auditoría | Seguridad |
| R-13 | Secretos en logs o repo | Media | Alto | Vault; `.gitignore`; escaneo | Seguridad |
| R-14 | Sesión no invalidada en cutover | Media | Medio | Expirar sesiones; rotar secreto | Equipo |
| R-15 | Permisos divergentes entre legado y nuevo | Alta | Alto | Matriz única; tests de paridad | Arquitectura |

## 3. Riesgos de datos

| # | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R-16 | Duplicados de títulos/oficinas | Alta | Medio | Perfilado; decisión de negocio; no fusionar automático | Negocio |
| R-17 | Huérfanos de FK | Alta | Medio | Limpieza previa; constraints | DBA |
| R-18 | Fechas/booleanos mal convertidos | Media | Medio | Tests de integración; validación | Equipo |
| R-19 | Pérdida de historia de auditoría | Media | Alto | Migrar o archivar según retención | Seguridad |
| R-20 | Rollback incompleto | Media | Alto | Ensayo; backup; batch id | DBA |
| R-21 | Volumen mayor al estimado | Media | Medio | Perfilado en producción (solo conteos) | DBA |

## 4. Riesgos operativos

| # | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R-22 | Deploy sin typecheck | Alta | Medio | CI obligatorio | DevOps |
| R-23 | Dependencias de runtime en dev | Alta | Alto | Mover o compilar workers | Equipo |
| R-24 | PM2 con 9 procesos mal documentado | Media | Medio | Inventario y health checks | Operaciones |
| R-25 | Ventana de cutover insuficiente | Media | Alto | Runbook y rollback | Infra |
| R-26 | Falta de observabilidad | Alta | Alto | Logs, métricas, alertas antes del cutover | Equipo |
| R-27 | Resistencia de usuarios | Media | Medio | UAT temprana; paridad visual | Producto |

## 5. Riesgos de proyecto

| # | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R-28 | Alcance crece | Alta | Alto | MVP congelado en Fase 0 | Producto |
| R-29 | Equipo dividido entre legado y nuevo | Alta | Alto | Dedicar un equipo al nuevo; legado en mantenimiento | Gerencia |
| R-30 | Dependencia de una sola persona | Media | Alto | Documentación y pair review | Gerencia |
| R-31 | Falta de UAT | Media | Alto | Planificar usuarios y fechas | Producto |
| R-32 | Cambios normativos | Baja | Medio | Diseño flexible; ADR | Negocio |

## 6. Matriz de severidad

| Probabilidad ↓ / Impacto → | Bajo | Medio | Alto |
|---|---|---|---|
| **Alta** | R-21 | R-16, R-17, R-22, R-24 | R-01, R-02, R-04, R-05, R-07, R-15, R-23, R-26, R-28, R-29 |
| **Media** | — | R-14, R-18, R-27 | R-03, R-06, R-08, R-09, R-10, R-12, R-13, R-19, R-20, R-25, R-30, R-31 |
| **Baja** | — | R-32 | R-11 |

## 7. Plan de mitigación por fase

| Fase | Riesgos a cerrar |
|---|---|
| 0 | R-01, R-02, R-28 |
| 1 | R-01, R-06, R-12, R-13 |
| 2 | R-04, R-05, R-15 |
| 3 | R-22, R-23, R-24 |
| 4 | R-09, R-14, R-15 |
| 5 | R-26 |
| 6 | R-16 (títulos) |
| 7 | R-08, R-17 (oficinas) |
| 8 | R-10, R-12 |
| 9 | R-03, R-07, R-17 |
| 10 | R-06, R-11, R-19 |
| 11 | R-18, R-20, R-21 |
| 12 | R-25, R-31 |
| 13 | R-25, R-26 |

## 8. Criterios de escalamiento

Escalar a decisión gerencial cuando:

- Una decisión externa bloquea 2 fases consecutivas.
- Un riesgo alto se materializa en staging.
- Un P0 de seguridad no tiene dueño.
- El alcance del MVP cambia después de Fase 0.
- El rollback no se puede ensayar.

## 9. Registro de riesgos

Cada riesgo debe tener:

- ID.
- Descripción.
- Dueño.
- Probabilidad e impacto.
- Mitigación.
- Fecha de revisión.
- Estado (`abierto`, `mitigado`, `aceptado`, `cerrado`).

Revisión quincenal durante la migración.
