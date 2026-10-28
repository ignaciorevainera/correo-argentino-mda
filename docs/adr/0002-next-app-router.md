# ADR 0002 — Next.js App Router

- **Estado:** Aprobado con condiciones
- **Fecha:** 2026-10-23
- **Decisores:** Arquitectura, equipo de desarrollo

## Contexto

La aplicación actual usa Astro SSR con islas React. La decisión de negocio es evolucionar hacia una aplicación oficial con Next.js App Router, React, TypeScript, Tailwind y shadcn/ui. El sistema es un monolito SSR con sesión, RBAC, endpoints y jobs; no es una SPA.

## Decisión

Adoptar **Next.js App Router + React + TypeScript**, con las siguientes condiciones:

1. Fijar la versión estable al inicio y validarla con Infra.
2. Usar Server Components por defecto.
3. Usar Server Actions solo para mutaciones de UI; mantener route handlers para integraciones, webhooks y exports.
4. No adoptar streaming/RSC como objetivo en sí.
5. Confirmar que el hosting sea Node persistente (no serverless) antes de Fase 3.

## Consecuencias

### Positivas

- Un solo framework para rutas, layouts, server y client.
- Server Actions reducen endpoints manuales.
- React 19 y Tailwind 4 ya se usan.
- shadcn/ui es coherente con el design system.
- Comunidad y documentación amplias.

### Negativas

- Acoplamiento al ciclo de vida de Next.
- RSC introduce complejidad conceptual.
- Cache y revalidación requieren criterio.
- Serverless cambiaría pooling, sesión y jobs.

### Mitigaciones

- Mantener la lógica fuera de `app`.
- Prohibir SQL en páginas y actions.
- Tests de integración contra servicios, no contra Next.
- Documentar decisiones de cache.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Continuar Astro | Viable, pero no responde a la decisión de negocio |
| Remix | Sin ventaja clara sobre Next para este equipo |
| SPA + API | Duplica auth y deploy |
| Framework con ORM integrado | Menor control sobre SQL corporativo |

## Pendientes

- Versión exacta de Next/React.
- Confirmación de Node persistente.
- Política de cache/revalidación.
- Soporte de `pnpm` en el registro corporativo.

## Referencias

- `docs/architecture/04-arquitectura-objetivo.md`
- `docs/architecture/05-estructura-carpetas.md`
