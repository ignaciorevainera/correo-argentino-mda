# Specification: Skill de Generación de Changelog y Corrección del Servicio / Releases

## Overview
Reemplazo del flujo de generación de notas de versión basado en Gemini Spark por una **Skill nativa de Antigravity / Agente** (`docs/skills/generate-changelog/SKILL.md` versionada con copia de trabajo en `.agents/skills/generate-changelog/SKILL.md`). La iniciativa abarca la corrección estructural del servicio lector (`src/lib/changelog/changelogService.ts`), la creación de una herramienta de validación de integridad (`scripts/validate-changelog.mts`), la reconstrucción limpia y reatribución de los changelogs históricos existentes (17 al 21 de Octubre de 2026) eliminando enlaces externos basura (Google Search), y la definición determinista de la Skill guiada por el historial de git real.

## Functional Requirements

### 1. Robustecimiento del Servicio Lector (`src/lib/changelog/changelogService.ts`)
- **Invalidación de Cache por Archivo:** Clave de cache compuesta basada en `targetDir` más la lista ordenada de `nombre.md:mtimeMs` de cada archivo, garantizando invalidación inmediata al editar cualquier `.md` sin requerir restart del servidor ni modificar el directorio.
- **Deduplicación por Prefijo Canónico:** Normalización y comparación de hashes considerando prefijo estricto de 7 caracteres para evitar discrepancias entre hashes largos de frontmatter (40 caracteres) y hashes cortos en viñetas (7 caracteres).
- **Aislamiento de Commits de Entradas Descartadas:** Registrar en `globalSeenCommits` exclusivamente los hashes pertenecientes a entradas que efectivamente se publican (no descartadas por vacías), evitando que entradas duplicadas "quemen" commits para fechas posteriores.
- **Tolerancia a BOM y Fallback de Fecha:** Limpieza de UTF-8 BOM (`\uFEFF`), validación estricta de formato ISO YYYY-MM-DD y fallback al nombre del archivo (`YYYY-MM-DD.md`) ante metadatos faltantes o malformados.

### 2. Validador de Integridad de Changelogs (`scripts/validate-changelog.mts`)
- Implementar CLI invocable vía `npm run changelog:validate`.
- **Exenciones Explícitas:** Eximir del chequeo de nombre ISO estricto a `example.md` y a cualquier archivo que comience con prefijo de fixture o test (`_*`, e.g. `_e2e-fixture-*.md`).
- **Verificaciones Obligatorias:**
  - Fecha ISO del frontmatter coherente con el nombre del archivo.
  - Verificación de que todo hash listado exista en el repositorio git (`git cat-file -t <hash>` devuelve `commit`).
  - Cero duplicación de commits entre diferentes archivos publicados.
  - Prohibición estricta de links markdown `[texto](url)` en viñetas o títulos (evitar links a Google Search o repositorios).
  - Ningún archivo en `src/config/changelog/` con `draft: true` salvo `example.md`.
  - Todas las entradas deben sobrevivir al procesamiento de `getChangelogEntries()`.

### 3. Saneamiento de Archivos Históricos (17 al 21 de Octubre de 2026)
- Agrupación por día real según fecha de commit (`%cd`, fecha de commit, no `%ad`).
- Reconstrucción de un archivo por día real (2026-10-17, 2026-10-18, 2026-10-19, 2026-10-20, 2026-10-21).
- Invariante de conservación: el conjunto unión de los 37 commits originales permanece íntegro y protegido, eliminando exclusivamente links basura de Google Search y reatribuyendo viñetas al día real de commit.
- Incorporación de las novedades reales del 20 y 21 de octubre (papelera de KB, restauración, AGS por rol, mejoras de calidad IA, etc.).

### 4. Skill de Generación de Changelog
- Redacción de la Skill en `docs/skills/generate-changelog/SKILL.md` (versionada) y copia espejo en `.agents/skills/generate-changelog/SKILL.md`.
- Reglas deterministas: alcance exclusivo a `src/config/changelog/YYYY-MM-DD.md`, cálculo de `PUBLICADOS` contra todos los markdown existentes, uso de `%cd` para agrupación por fecha real, derivación de módulos vía `git show --name-only`, prohibición estricta de links o HTML, y ejecución obligatoria de `npm run changelog:validate` como paso de verificación previo al commit.
- Deprecación formal de `docs/PROMPT_GEMINI_SPARK.md` con puntero a la nueva skill.

## Non-Functional Requirements
- **Determinismo y Resiliencia:** Sin alucinaciones de commits ni dependencias de wrappers externos.
- **Rendimiento:** Validación de releases rápida (< 2 segundos) y cache en memoria reactivo.

## Acceptance Criteria
- `npm run test:domain` pasa al 100% incluyendo los nuevos tests de `changelogService.test.ts`.
- `npm run changelog:validate` finaliza con código 0 sobre el repositorio saneado.
- `npx playwright test tests/changelog/changelog.spec.ts` pasa en puerto aislado.
- Todas las entradas del 17 al 21 aparecen publicadas en `/changelog` y en `getChangelogEntries()`.
