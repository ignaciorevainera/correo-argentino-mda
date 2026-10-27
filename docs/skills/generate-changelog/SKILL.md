---
name: generate-changelog
description: Genera la nota de novedades del Portal MDA (src/config/changelog/YYYY-MM-DD.md) desde el historial git, clasificando los commits en Nuevas Funciones, Mejoras y Correcciones, en español neutro profesional, sin incluir el día actual en curso ni duplicar commits ya publicados. Usar cuando se pidan "las novedades", "el changelog", "la nota de versión" o "publicar los cambios".
---

# Generate changelog

Generá la nota de novedades del Portal MDA desde el historial real de git.
Un archivo por día real. Nunca inventes commits, fechas ni descripciones.

## Alcance y Reglas de Dominio

- Escribís SOLO en `src/config/changelog/YYYY-MM-DD.md`.
- No tocás `src/lib/`, `src/pages/`, `src/components/`, ni releases ya publicados.
- Si un release ya publicado tiene errores, NO lo reescribas: reportalo y pedí autorización.
- **VENTANA DE RETENCIÓN**: solo se publican releases de los últimos 3 meses, anclados al release más reciente. Los archivos más viejos no se cargan y se eliminan con `npm run changelog:prune -- --apply`.
- **PROHIBIDO GENERAR EL DÍA ACTUAL EN CURSO**: La fecha de hoy (el día en curso de ejecución) nunca se genera, dado que la jornada no ha concluido y el release quedaría incompleto o vacío. Solo se generan fechas pasadas cerradas (`date < hoy`).
- **IDIOMA EXCLUSIVO ESPAÑOL**: Todos los títulos, highlights, nombres de módulos y descripciones de viñetas deben redactarse o traducirse al **español neutro profesional**. Queda prohibido dejar textos en inglés (por ej. traducir *"support responsive size variants"* -> *"Variantes de tamaño responsivas"*).

## Paso 1 — Commits ya publicados (dedup real)

Releé TODOS los `src/config/changelog/*.md` (excluyendo `example.md` y los que tengan `draft: true` o prefijo `_`).
Para cada archivo tomá:
- los hashes del frontmatter `commits:`
- los hashes `[`hash`]` que aparezcan en las viñetas del cuerpo

Normalizalos a 7 caracteres y unioná todo en un único set `PUBLICADOS`. Ese es el único origen de verdad.
NO confíes en el frontmatter del archivo que estás por escribir: puede traer repetidos.

## Paso 2 — Commits candidatos

```bash
git log --no-merges --since="<fecha último release>" --until="<fecha ayer 23:59:59>" --format="%H|%cd|%s" --date=short
```

- `--since` = la fecha del último release YA publicado (inclusive); si no hay releases, `--since` = 4 semanas atrás.
- `--until` = **estrictamente hasta las 23:59:59 del día anterior al actual**. Nunca incluir el día en curso.
- Si te piden una fecha puntual pasada, usá `--since="<YYYY-MM-DD> 00:00:00" --until="<YYYY-MM-DD> 23:59:59"`. Si esa fecha es hoy, abortá informando que el día en curso no se publica.
- Filtrá los hashes que ya estén en `PUBLICADOS`.
- Descartá commits internos sin impacto operativo: `chore`, `test`, `ci`, `build`, `merge`, `conductor`, "Notes added", dependencias, refactors invisibles.
- Si después de filtrar no queda ningún commit: NO escribas ningún archivo. Reportá "no hay novedades nuevas" y listo.

## Paso 3 — Agrupar por día real

El `date` de cada archivo es la fecha REAL de commit (`%cd` de git), no la fecha de hoy ni la fecha de autor (`%ad`).
Un archivo por día: si los commits cubren varios días pasados, escribís un archivo por cada día.
Título: `DD de Mes de AAAA` (mes en español, ej. "19 de Octubre de 2026").

## Paso 4 — Módulo y descripción

El **Módulo** sale de los paths tocados por el commit, nunca inventado:

```bash
git show --name-only --format="" <hash>
```

Traducí el path a un nombre de módulo en lenguaje de negocio en español:
- `src/pages/automatizaciones/`, `src/lib/workflow/`, `src/lib/invgate/automation/` → **Automatizaciones InvGate**
- `src/components/supervision/calidad/`, `src/lib/ai/`, `src/lib/calidad/` → **Control de Calidad**
- `src/components/cronograma/`, `src/lib/cronograma/` → **Cronograma Operativo**
- `src/components/base-conocimiento/`, `src/lib/kb/` → **Base de Conocimiento**
- `src/components/buscador-usuarios/` → **Buscador de Usuarios**
- `src/components/supervision/asignacion/`, `src/components/supervision/autogestion/` → **Autogestión de Tickets**
- `src/pages/reportes/`, `src/lib/reportes/` → **Métricas y Reportes**
- `src/pages/admin/oficinas/`, `src/lib/office*` → **Gestión de Sedes**
- `src/pages/recursos/`, `src/lib/recursos/` → **Acceso a Recursos**
- `src/lib/rbac*`, `src/pages/login/` → **Seguridad y Accesos**
- `src/components/firma/`, `public/firma*` → **Firma Institucional**

La descripción explica el cambio en lenguaje operativo y en español, sin jerga técnica y sin inventar alcance.
Si el mensaje del commit está en inglés, traducilo con precisión al español.

## Paso 5 — Escribir el archivo

```markdown
---
title: "19 de Octubre de 2026"
date: "2026-10-19"
version: ""
highlights: "Una o dos oraciones con el impacto principal de esta actualización en español."
commits:
  - "abc1234"
  - "def5678"
---

### Nuevas Funciones
- **Automatizaciones InvGate:** Descripción clara del cambio en español. [`abc1234`]

### Mejoras
- **Control de Calidad:** Descripción clara de la mejora en español. [`def5678`]

### Correcciones
- **Gestión de Sedes:** Descripción clara de la solución en español. [`f9e9430`]
```

Reglas de formato (obligatorias):
- Frontmatter YAML al inicio, comillas en los valores de texto.
- `commits`: SOLO hashes cortos de 7 caracteres, en comillas, uno por línea.
- Solo las 3 secciones canónicas, y solo si tienen contenido (omití las vacías).
- Viñeta: `- **Módulo:** Descripción en español. [\`hash\`]`. Un hash por viñeta; si el commit impacta 2 secciones, repetí el hash en ambas.
- **PROHIBIDO**: `[texto](url)` en cualquier parte (ni en el módulo ni en el texto) — sin links a Google, GitHub ni a nada. Sin HTML, sin `class=`, sin `<iframe>`, sin `<script>`, sin emojis en los títulos, sin `draft: true`.
- Sin tablas, sin bloques de código, sin imágenes.

## Paso 6 — Validación obligatoria (antes de commitear)

1. Todo hash listado existe: `git cat-file -t <hash>` devuelve `commit`.
2. Ningún hash del archivo nuevo está en `PUBLICADOS`.
3. Ningún archivo corresponde al día de hoy ni contiene frases en inglés.
4. Corré `npm run changelog:validate`. Si falla, corregí el archivo y volvé a correrlo.
5. Confirmá que el release nuevo aparece en `getChangelogEntries()` y que no quedó vacío.
