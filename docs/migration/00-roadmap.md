# 00 — Roadmap de reconstrucción

> Sin fechas ni duraciones: no se conoce la disponibilidad del equipo ni los tiempos de Infraestructura.
> Esfuerzo relativo: **S** (días), **M** (1-2 semanas), **L** (2-4 semanas), **XL** (4+ semanas). La incertidumbre se indica por fase.

## Resumen

| Fase | Nombre | Prioridad | Esfuerzo | Depende de | ¿Bloqueada por terceros? |
|---|---|---|---|---|---|
| 0 | Cierre de auditoría y decisiones | Máxima | S | — | No |
| 1 | Requisitos de infra, seguridad y datos | Máxima | M (alta incertidumbre) | 0 | **Sí** |
| 2 | Arquitectura detallada y estándares | Alta | M | 0, 1 | Parcial |
| 3 | Bootstrap del proyecto base | Alta | S-M | 1, 2 | Parcial |
| 4 | Autenticación, sesión y RBAC | Máxima | L | 3 | Parcial (SSO) |
| 5 | Plataforma transversal | Alta | M | 3, 4 | Parcial (storage/secrets) |
| 6 | Piloto A: Títulos | Alta | M | 5 | No |
| 7 | Piloto B: Oficinas | Alta | L | 6 | Parcial (InvGate) |
| 8 | Módulos de contenido | Media-Alta | L | 5 | Parcial (storage) |
| 9 | Módulos operativos | Alta | XL | 5, 7, 8 | Parcial (InvGate/WiseCX) |
| 10 | Calidad, IA, automatizaciones, analítica | Alta | XL | 5, 9 | **Sí** (IA/Seguridad) |
| 11 | Migración y validación de datos | Máxima | L-XL | 6-10 | Parcial (DBA) |
| 12 | QA, seguridad, performance, aceptación | Máxima | L | 11 | Parcial |
| 13 | Cutover y estabilización | Máxima | M | 12 | **Sí** (Infra) |

---

## Fase 0 — Cierre de auditoría y decisiones

| Campo | Detalle |
|---|---|
| **Objetivo** | Convertir la auditoría en decisiones firmadas y un alcance de MVP |
| **Tareas** | Validar hallazgos P0 con dueños; crear ADRs; decision log; acordar alcance; designar responsables |
| **Dependencias** | Ninguna |
| **Prioridad** | Máxima |
| **Esfuerzo** | S |
| **Riesgos** | Parálisis por decisiones externas; alcance que crece |
| **Entregables** | ADRs 0001-0006; decision log; acta de aprobación; alcance del MVP |
| **DoD** | Cada decisión pendiente tiene dueño, criterio y fecha objetivo; el MVP está escrito y aprobado |

## Fase 1 — Requisitos de infraestructura, seguridad y datos

| Campo | Detalle |
|---|---|
| **Objetivo** | Cerrar motor SQL, hosting, SSO, storage, secrets y backups |
| **Tareas** | Relevamiento con Infra/DBA/Seguridad; matriz de requisitos; PoC de conexión y migración; threat model inicial |
| **Dependencias** | Fase 0 |
| **Prioridad** | Máxima |
| **Esfuerzo** | M (alta incertidumbre) |
| **Riesgos** | Bloqueo institucional; cambios de último momento; requisitos no escritos |
| **Entregables** | `07-estrategia-datos.md` completado; PoC; threat model; decisión de motor y hosting |
| **DoD** | Motor y hosting aprobados; PoC conecta, migra una tabla y hace rollback |

## Fase 2 — Arquitectura detallada y estándares

| Campo | Detalle |
|---|---|
| **Objetivo** | Bajar la propuesta a reglas ejecutables y contratos de módulo |
| **Tareas** | ADRs de capas; contratos por módulo; convenciones; reglas de import; estrategia de errores; diseño de auditoría; manifiesto de permisos |
| **Dependencias** | Fases 0, 1 |
| **Prioridad** | Alta |
| **Esfuerzo** | M |
| **Riesgos** | Sobre-diseño; reglas no aplicables al equipo |
| **Entregables** | Documentos 04-09; ADRs; lint de límites; plantilla de módulo |
| **DoD** | Un PR de ejemplo pasa las reglas; revisión de arquitectura aprobada |

## Fase 3 — Bootstrap del proyecto base

| Campo | Detalle |
|---|---|
| **Objetivo** | Proyecto Next.js vacío, reproducible y con calidad |
| **Tareas** | `pnpm`; Next + TS strict; Tailwind + shadcn; ESLint/Prettier; Vitest; Playwright; dependency-cruiser; env Zod; healthcheck; Docker/PM2 según infra |
| **Dependencias** | Fases 1, 2 |
| **Prioridad** | Alta |
| **Esfuerzo** | S-M |
| **Riesgos** | Versiones incompatibles; registro corporativo; Node del servidor |
| **Entregables** | Repo base; CI; `README`; `06-convenciones-y-limites.md` aplicado |
| **DoD** | `pnpm typecheck`, `lint`, `test`, `build` pasan en limpio; CI reproducible |

## Fase 4 — Autenticación, sesión y RBAC

| Campo | Detalle |
|---|---|
| **Objetivo** | Reemplazar el modelo actual con una única fuente de permisos |
| **Tareas** | Sesión DB + cookie; provider interface; login/logout; CSRF global; rate limit; manifiesto de permisos; layouts por rol; view-as; tests de matriz |
| **Dependencias** | Fase 3 |
| **Prioridad** | Máxima |
| **Esfuerzo** | L |
| **Riesgos** | Diferencias de semántica con el RBAC actual; SSO pendiente; migración de sesiones |
| **Entregables** | `server/auth/*`; `permissions.ts`; tests de autorización |
| **DoD** | Matriz rol × ruta cubierta; CSRF en todas las mutaciones; sesión inválida/expirada/fingerprint probadas; rate limit distribuido o documentado |

## Fase 5 — Plataforma transversal

| Campo | Detalle |
|---|---|
| **Objetivo** | Errores, logs, auditoría, storage, jobs y observabilidad |
| **Tareas** | `AppError`; wrapper HTTP; pino + request ID; audit log; storage adapter; worker runner; health/metrics; `job_runs` |
| **Dependencias** | Fases 3, 4 |
| **Prioridad** | Alta |
| **Esfuerzo** | M |
| **Riesgos** | Complejidad prematura; storage corporativo no disponible |
| **Entregables** | `server/http`, `server/observability`, `server/jobs`, módulo `platform` |
| **DoD** | Un error produce log + respuesta segura; una mutación deja auditoría; un job corre y registra estado; health responde |

## Fase 6 — Piloto A: Títulos

| Campo | Detalle |
|---|---|
| **Objetivo** | Validar el vertical completo con bajo riesgo |
| **Tareas** | Modelo, repo, service, policy, UI, favoritos, import/export, tests, migración |
| **Dependencias** | Fase 5 |
| **Prioridad** | Alta |
| **Esfuerzo** | M |
| **Riesgos** | Subestimar matching KB; CSV sucio; expectativas de paridad |
| **Entregables** | Módulo `titles`; E2E; datos migrados; `01-plan-piloto-titulos.md` ejecutado |
| **DoD** | Paridad funcional; 0 `any`; authz y CSRF probados; E2E verde; reconciliación 100% |

**Justificación:** 3 tablas, alto uso diario, sin escrituras a sistemas externos, ejercita auth/RBAC/listado/filtros/favoritos/CSV/UI.

## Fase 7 — Piloto B: Oficinas

| Campo | Detalle |
|---|---|
| **Objetivo** | Validar consultas pesadas, búsqueda, paginación, caché e InvGate de lectura |
| **Tareas** | Directorio read-only; filtros; estructura; estadísticas; luego CRUD y edificios |
| **Dependencias** | Fase 6 |
| **Prioridad** | Alta |
| **Esfuerzo** | L |
| **Riesgos** | 60+ columnas; duplicados de direcciones; dependencia InvGate; performance |
| **Entregables** | Módulo `org-directory`; E2E; benchmark |
| **DoD** | p95 de listado bajo presupuesto; filtros equivalentes; keyset pagination; reconciliación de edificios probada |

## Fase 8 — Módulos de contenido

| Campo | Detalle |
|---|---|
| **Objetivo** | KB, recursos/aplicativos/contactos, mesas/soportes |
| **Tareas** | Migrar cada módulo; uploads; sanitización; credenciales; caché de mesas |
| **Dependencias** | Fase 5 |
| **Prioridad** | Media-Alta |
| **Esfuerzo** | L |
| **Riesgos** | Storage; XSS; credenciales; dependencia InvGate |
| **Entregables** | 3-4 módulos; E2E; tests de XSS/upload |
| **DoD** | Paridad; tests de seguridad; sin DB en componentes; CSRF completo |

## Fase 9 — Módulos operativos de alto riesgo

| Campo | Detalle |
|---|---|
| **Objetivo** | Cronograma, asistencia, disponibilidad/AGS |
| **Tareas** | Extraer dominio puro; transacciones; locks; reglas; workers; import/export |
| **Dependencias** | Fases 5, 7, 8 |
| **Prioridad** | Alta |
| **Esfuerzo** | XL |
| **Riesgos** | Reglas no documentadas; concurrencia; datos históricos; InvGate/WiseCX |
| **Entregables** | Módulos `scheduling`, `attendance`, `availability`; tests de concurrencia |
| **DoD** | Rotación/cumplimiento/locks probados; paridad de exports; migración validada; sin escrituras fuera de transacción |

## Fase 10 — Calidad, IA, automatizaciones y analítica

| Campo | Detalle |
|---|---|
| **Objetivo** | Módulos de mayor complejidad y reportes reales |
| **Tareas** | Auditorías; parámetros; calibración; adapters IA; workflows; read models; eliminar fixtures |
| **Dependencias** | Fases 5, 9 |
| **Prioridad** | Alta |
| **Esfuerzo** | XL |
| **Riesgos** | IA no aprobada; scraping; métricas mal definidas; volumen |
| **Entregables** | Módulos `quality`, `automations`, `analytics`; contratos de integración |
| **DoD** | Reportes con `dataSource` verificable; scoring probado; contratos InvGate/WiseCX; IA con feature flag |

## Fase 11 — Migración y validación de datos

| Campo | Detalle |
|---|---|
| **Objetivo** | Mover datos con reconciliación demostrable |
| **Tareas** | Perfilado; mapeo; ETL idempotente; checksums; conteos; referencias; dry-run; rollback |
| **Dependencias** | Fases 6-10, por módulo |
| **Prioridad** | Máxima |
| **Esfuerzo** | L-XL, iterativo |
| **Riesgos** | Datos sucios; duplicados; campos libres; historia incompleta |
| **Entregables** | `02-migracion-datos.md`; scripts; reporte de reconciliación |
| **DoD** | 100% de filas críticas reconciliadas; 0 FK huérfanas; rollback probado |

## Fase 12 — QA, seguridad, performance y aceptación

| Campo | Detalle |
|---|---|
| **Objetivo** | Validar antes del cutover |
| **Tareas** | E2E de regresión; pentest interno; carga; accesibilidad; UAT por rol; runbook |
| **Dependencias** | Fase 11 |
| **Prioridad** | Máxima |
| **Esfuerzo** | L |
| **Riesgos** | Hallazgos tardíos; disponibilidad de usuarios para UAT |
| **Entregables** | Reporte de QA; matriz de riesgos; plan de cutover |
| **DoD** | Sin P0/P1 abiertos; UAT firmada; rollback ensayado; performance dentro de presupuesto |

## Fase 13 — Cutover y estabilización

| Campo | Detalle |
|---|---|
| **Objetivo** | Producción y retiro del legado |
| **Tareas** | Ventana; proxy por módulo; monitoreo; soporte; desmantelamiento |
| **Dependencias** | Fase 12 |
| **Prioridad** | Máxima |
| **Esfuerzo** | M |
| **Riesgos** | Regresiones ocultas; datos en vuelo; rollback incompleto |
| **Entregables** | Producción; dashboard; postmortem |
| **DoD** | 2 semanas sin incidentes P1; legado en read-only; backups verificados |

---

## Secuencia de módulos

```
Títulos (piloto)
  → Oficinas (lectura)
  → Recursos / Contactos
  → Base de conocimiento
  → Mesas / Soportes
  → Cronograma
  → Asistencia
  → Disponibilidad / AGS
  → Calidad
  → Automatizaciones
  → Analítica
```

### Por qué este orden

| Módulo | Complejidad | Dependencias | Criticidad | Valor | Decisión |
|---|---|---|---|---|---|
| Títulos | Baja | InvGate KB (lectura) | Alta | Alto uso diario | **Primero** |
| Oficinas | Media | InvGate | Alta | Alto uso | Segundo |
| Recursos/Contactos | Baja | Storage | Media | Medio | Tercero |
| KB | Media | Storage | Media | Medio | Cuarto |
| Mesas | Media | InvGate | Media | Alto | Quinto |
| Cronograma | Alta | — | Muy alta | Alto | Después de plataforma |
| Asistencia | Alta | Cronograma | Alta | Alto | Después de cronograma |
| AGS | Muy alta | InvGate/WiseCX | Muy alta | Alto | Después de cronograma |
| Calidad | Muy alta | InvGate/WiseCX/IA | Muy alta | Alto | Después de AGS |
| Automatizaciones | Muy alta | InvGate | Alta | Alto | Después de calidad |
| Analítica | Alta | Read models | Alta | Alto | Al final |

### No empezar por

- **Calidad:** IA + scraping + formulario de 3.676 líneas.
- **Cronograma:** 15 rutas API y reglas no documentadas.
- **AGS:** locks y escrituras en InvGate.
- **Automatizaciones:** 7.123 líneas de workflow.

---

## Hitos de decisión

| Hito | Cuándo | Qué se decide |
|---|---|---|
| H1 | Fin de Fase 0 | Alcance del MVP y dueños |
| H2 | Fin de Fase 1 | Motor, hosting, SSO, storage |
| H3 | Fin de Fase 4 | Modelo de auth aprobado |
| H4 | Fin de Fase 6 | Piloto validado; continuar o ajustar |
| H5 | Fin de Fase 7 | Performance y patrón de lectura validados |
| H6 | Fin de Fase 10 | Paridad funcional de módulos críticos |
| H7 | Fin de Fase 11 | Datos reconciliados |
| H8 | Fin de Fase 12 | Autorización de cutover |

## Riesgo de secuencia

El camino crítico es: **motor SQL → auth → plataforma → piloto → migración → cutover**. Cualquier demora en Fase 1 corre todo el roadmap. Por eso la Fase 0 debe cerrar con dueños y fechas objetivo, aunque no haya estimaciones de duración.
