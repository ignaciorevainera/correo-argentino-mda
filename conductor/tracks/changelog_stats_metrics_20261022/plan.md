# Implementation Plan: Métricas de Código (Líneas +/-) y Estimación de Horas en Changelog

## Phase 1: Servicio de Métricas de Git y Algoritmo de Horas (TDD)
- [x] Task: Escribir tests de dominio para el cálculo de estadísticas de código y clustering de sesiones
  - [x] Crear tests en `src/lib/changelog/changelogStats.test.ts`
  - [x] Test de cálculo de numstat (adiciones y eliminaciones ignorando binarios)
  - [x] Test de clustering de horas: commit aislado = 30m, commits cercanos (<= 2h) = acumulación de delta_t, commits lejanos (> 2h) = nueva sesión
  - [x] Test de resiliencia ante hashes inexistentes o fallos de git
- [x] Task: Implementar funciones de cálculo de estadísticas en `src/lib/changelog/changelogStats.ts`
  - [x] Implementar `calculateCommitsStats(commits: string[]): ChangelogStats`
  - [x] Integrar con `git show --numstat` y timestamps de git con manejo fail-safe de excepciones
- [x] Task: Integrar `ChangelogStats` en `changelogService.ts`
  - [x] Extender `ChangelogEntry` con propiedad `stats: ChangelogStats`
  - [x] Invocar el cálculo durante el procesamiento de entradas y preservar en cache
- [x] Task: Phase Verification & Checkpoint (`npm run test:domain`)

## Phase 2: Renderizado UI en `/changelog` y Pruebas E2E
- [x] Task: Actualizar `src/pages/changelog.astro` con badges visuales
  - [x] Agregar badges estilizados para `+{additions}`, `-{deletions}` y `~{formattedHours}` en la cabecera de cada release
  - [x] Utilizar tokens de DaisyUI/Tailwind (`text-success bg-success/10`, `text-error bg-error/10`) e ícono de reloj
  - [x] Formatear números con separador de miles
- [x] Task: Actualizar o extender spec E2E en `tests/changelog/changelog.spec.ts`
  - [x] Verificar que los badges de métricas se rendericen visiblemente en el DOM
- [x] Task: Phase Verification & Checkpoint
  - [x] `npm run changelog:validate`
  - [x] `npm run test:domain`
  - [x] `npx playwright test tests/changelog/changelog.spec.ts` con puerto propio
