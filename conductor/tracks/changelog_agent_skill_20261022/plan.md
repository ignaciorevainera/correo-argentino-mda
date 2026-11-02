# Implementation Plan: Skill de Generación de Changelog y Corrección del Servicio / Releases

## Phase 1: Robustecer el Servicio de Changelog (`src/lib/changelog/changelogService.ts`)
- [x] Task: Escribir tests para los casos de borde en `src/lib/changelog/changelogService.test.ts`
  - [x] Test para invalidación de cache cuando se modifica el mtime de un archivo individual
  - [x] Test para dedup con prefijo de 7 caracteres (hashes largos vs cortos)
  - [x] Test para verificar que entries descartados no quemen sus commits para siguientes releases
  - [x] Test de tolerancia a BOM UTF-8 y fallback de fecha ISO
- [x] Task: Implementar fixes en `src/lib/changelog/changelogService.ts`
  - [x] Cache key compuesta: directorio + listado ordenado de `nombre:mtimeMs` de cada archivo
  - [x] Deduplicación y match de commits considerando prefijo canónico de 7 caracteres
  - [x] Registrar commits vistos en `globalSeenCommits` solo si el entry efectivamente se publica
  - [x] Validación estricta de fecha ISO con tolerancia a BOM y fallback al nombre del archivo
- [x] Task: Phase Verification & Checkpoint (`npm run test:domain`)

## Phase 2: Script de Validación de Changelogs (`scripts/validate-changelog.mts`)
- [x] Task: Crear script `scripts/validate-changelog.mts` y registrar comando `npm run changelog:validate`
  - [x] Eximir explícitamente `example.md` y archivos temporales/fixtures con prefijo `_*`
  - [x] Validar formato de nombres de archivo y coherencia con fecha ISO del frontmatter
  - [x] Validar que todo commit listado exista en git (`git cat-file -t <hash>`)
  - [x] Validar cero commits repetidos entre diferentes archivos
  - [x] Validar ausencia de links markdown externos (`[texto](url)`) en viñetas o títulos
  - [x] Validar que no existan entradas con `draft: true` salvo `example.md`
  - [x] Validar que todas las entradas sobrevivan al parsing de `getChangelogEntries()`
  - [x] Configurar script `changelog:validate` en `package.json`
- [x] Task: Documentar script en `AGENTS.md` (sección Testing)
- [x] Task: Phase Verification & Checkpoint (`npm run changelog:validate`)

## Phase 3: Saneamiento de Releases en `src/config/changelog/` (17 al 21 de Octubre)
- [x] Task: Reconstruir y normalizar archivos por día real de commit (`%cd`)
  - [x] Relevar commits reales de git por día usando `%cd` (2026-10-17, 2026-10-18, 2026-10-19, 2026-10-20, 2026-10-21)
  - [x] Reatribuir descripciones redactadas a sus commits correspondientes eliminando links de Google Search
  - [x] Incorporar novedades reales del 20 y 21 (papelera de KB, restauración, AGS por rol, mejoras de calidad IA, etc.)
  - [x] Verificar invariante de conservación de los 37 commits históricos originales
  - [x] Eliminar archivos obsoletos o desalineados
- [x] Task: Phase Verification & Checkpoint
  - [x] Ejecutar `npm run changelog:validate`
  - [x] Verificar que las 5 entradas aparezcan en `getChangelogEntries()`
  - [x] Correr suite E2E en puerto aislado (`npx playwright test tests/changelog/changelog.spec.ts`)

## Phase 4: Skill de Generación de Changelog y Deprecación de Prompt Legacy
- [x] Task: Instalar y versionar la Skill
  - [x] Crear `docs/skills/generate-changelog/SKILL.md` con el prompt corregido (%cd, validaciones)
  - [x] Sincronizar copia en `.agents/skills/generate-changelog/SKILL.md`
  - [x] Actualizar `docs/PROMPT_GEMINI_SPARK.md` marcándolo como deprecado y referenciando la nueva skill
- [x] Task: Phase Verification & Checkpoint (Verificar disponibilidad de la skill y corrida limpia de suite completa de tests)
