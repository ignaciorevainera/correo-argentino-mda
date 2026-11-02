# ADR 0001 — Monolito modular

- **Estado:** Aprobado
- **Fecha:** 2026-10-23
- **Decisores:** Arquitectura, equipo de desarrollo

## Contexto

El Portal MDA es un sistema interno con un solo equipo, un dominio institucional único y entidades compartidas entre módulos (`users`, `agents`, `offices`, `mesas`). Varios flujos requieren transacciones que cruzan tablas (calidad, cronograma, disponibilidad). La versión actual mezcla presentación, negocio y datos, pero no tiene una necesidad real de distribución.

## Decisión

Construir la nueva versión como **monolito modular**:

- Un solo despliegue web.
- Módulos por dominio con superficie pública (`index.ts`).
- Capas internas: schema, policy, service, repository.
- Límites aplicados por lint.
- Jobs en proceso separado, compartiendo servicios.

## Consecuencias

### Positivas

- Transacciones simples.
- Un solo pipeline y un solo artefacto.
- Menor complejidad operativa.
- Posibilidad de extraer un módulo (IA, sync) sin reescribir.
- Curva de aprendizaje razonable.

### Negativas

- El monolito puede degradarse si no se aplican los límites.
- Un fallo de despliegue afecta a todos los módulos.
- Requiere disciplina de revisión.

### Mitigaciones

- `eslint-plugin-boundaries` + `dependency-cruiser` en CI.
- Un README por módulo.
- Revisión de arquitectura en PRs que crucen límites.
- ADR para excepciones.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Microservicios | Complejidad operativa y transaccional sin beneficio |
| SPA + API separada | Duplica auth/sesión/deploy |
| Big-bang rewrite | Riesgo alto |
| Serverless | Incompatible con SQL corporativo, jobs y archivos |

## Referencias

- `docs/architecture/04-arquitectura-objetivo.md`
- `docs/architecture/06-convenciones-y-limites.md`
