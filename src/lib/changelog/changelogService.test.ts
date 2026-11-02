import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getChangelogEntries,
  getLatestChangelogDate,
  clearChangelogCache,
  pruneChangelogFiles,
} from "./changelogService.js";

test("changelogService - aislamiento y parsing con fixtures temporales", async (t) => {
  let tempDir: string;

  t.beforeEach(async () => {
    clearChangelogCache();
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mda-changelog-test-"));
  });

  t.afterEach(async () => {
    clearChangelogCache();
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  await t.test("devuelve lista vacía si el directorio no existe", async () => {
    const nonExistentDir = path.join(tempDir, "sub-no-existe");
    const entries = await getChangelogEntries(nonExistentDir);
    assert.deepEqual(entries, []);
    const latestDate = await getLatestChangelogDate(nonExistentDir);
    assert.equal(latestDate, null);
  });

  await t.test("parsea, normaliza fechas ISO completas, filtra borradores (draft: true) y ordena cronológicamente de forma descendente", async () => {
    // Fixture 1: Release intermedio (2026-10-10) con fecha ISO compleja
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-10.md"),
      `---
title: "Actualización de Octubre 1"
date: "2026-10-10T14:30:00Z"
version: "v1.2.0"
commits:
  - "1111aaa"
---
### Mejoras
- Optimización de carga en dashboard [\`1111aaa\`]
`
    );

    // Fixture 2: Release más reciente (2026-10-20)
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-20.md"),
      `---
title: "Actualización de Octubre 2"
date: "2026-10-20"
version: "v1.3.0"
commits:
  - "2222bbb"
---
### Nuevas Funciones
- Nuevo visor de novedades [\`2222bbb\`]
`
    );

    // Fixture 3: Release antiguo (2026-09-15)
    await fs.promises.writeFile(
      path.join(tempDir, "2026-09-15.md"),
      `---
title: "Actualización de Septiembre"
date: "2026-09-15"
version: "v1.1.0"
commits:
  - "3333ccc"
---
### Correcciones
- Corrección de tipificación [\`3333ccc\`]
`
    );

    // Fixture 4: Borrador con fecha futura que debe ser ignorado (draft: true)
    await fs.promises.writeFile(
      path.join(tempDir, "example.md"),
      `---
title: "Plantilla Borrador"
date: "2026-11-01"
draft: true
commits:
  - "4444ddd"
---
### En desarrollo
- Contenido en borrador
`
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 3, "Debe cargar únicamente las 3 entradas que no son draft");

    // Verificar orden descendente: 2026-10-20 -> 2026-10-10 -> 2026-09-15
    assert.equal(entries[0].date, "2026-10-20");
    assert.equal(entries[0].title, "Actualización de Octubre 2");
    assert.deepEqual(entries[0].commits, ["2222bbb"]);

    // Verificar normalización de fecha YYYY-MM-DD
    assert.equal(entries[1].date, "2026-10-10");
    assert.equal(entries[2].date, "2026-09-15");

    // Verificar que el contenido HTML haya sido procesado
    assert.match(entries[0].html, /Nuevo visor de novedades/);

    // Verificar latest date normalizado
    const latestDate = await getLatestChangelogDate(tempDir);
    assert.equal(latestDate, "2026-10-20");
  });

  await t.test("deduplicación: preserva el release original anterior y descarta repeticiones en releases nuevos", async () => {
    // Release ORIGINAL anterior (2026-10-21) que publicó originalmente 'aabbccd'
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-21.md"),
      `---
title: "Release 21 Original"
date: "2026-10-21"
commits:
  - "aabbccd"
  - "8901234"
---
### Funciones
- Feature original [\`aabbccd\`]
- Feature única 21 [\`8901234\`]
`
    );

    // Release NUEVO posterior (2026-10-22) que intenta repetir 'aabbccd' y trae una feature nueva '1234567'
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-22.md"),
      `---
title: "Release 22 Nuevo"
date: "2026-10-22"
commits:
  - "aabbccd"
  - "1234567"
---
### Funciones
- Feature repetida que debe descartarse [\`aabbccd\`]
- Feature nueva 22 [\`1234567\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 2);

    // En la salida (orden descendente por fecha):
    // entries[0] es Release 22 (más reciente): debe conservar SOLO el commit nuevo '1234567'
    assert.equal(entries[0].title, "Release 22 Nuevo");
    assert.deepEqual(entries[0].commits, ["1234567"]);
    assert.doesNotMatch(entries[0].html, /Feature repetida/);
    assert.match(entries[0].html, /Feature nueva 22/);

    // entries[1] es Release 21 (original): debe conservar 'aabbccd' y '8901234' intactos
    assert.equal(entries[1].title, "Release 21 Original");
    assert.deepEqual(entries[1].commits, ["aabbccd", "8901234"]);
    assert.match(entries[1].html, /Feature original/);
    assert.match(entries[1].html, /Feature única 21/);
  });

  await t.test("descarta releases que queden vacías tras la deduplicación completa", async () => {
    // Release previo (2026-10-15)
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-15.md"),
      `---
title: "Release Inicial"
date: "2026-10-15"
commits:
  - "fedcba9"
---
### Funciones
- Feature inicial [\`fedcba9\`]
`
    );

    // Release posterior (2026-10-16) cuyos commits son 100% repetidos del anterior
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-16.md"),
      `---
title: "Release 100% Repetido"
date: "2026-10-16"
commits:
  - "fedcba9"
---
### Funciones
- Feature idéntica re-subida [\`fedcba9\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    // Debe descartar Release 100% Repetido y listar solo Release Inicial
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, "Release Inicial");
  });

  await t.test("descarta entrada inicial más vieja si solo contiene encabezados sin viñetas ni texto sustancial", async () => {
    // Release inicial que solo tiene encabezado vacío sin viñetas
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-01.md"),
      `---
title: "Release Vacío Inicial"
date: "2026-10-01"
---
### ✨ Nuevas Funciones
`
    );

    // Release posterior válido
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-05.md"),
      `---
title: "Release Válido"
date: "2026-10-05"
commits:
  - "1122334"
---
### ✨ Nuevas Funciones
- Feature real [\`1122334\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    // Debe descartar el release inicial vacío y retornar únicamente el válido
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, "Release Válido");
  });

  await t.test("deduplica hashes detectados en el contenido aunque no figuren en frontmatter commits:", async () => {
    // Release anterior que tiene un commit declarado en frontmatter
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-01.md"),
      `---
title: "Release Sin Frontmatter Commits"
date: "2026-10-01"
---
### Mejoras
- Mejora con hash en viñeta [\`7778889\`]
`
    );

    // Release nuevo que tiene declarado '7778889' en frontmatter pero intenta repetirlo
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-02.md"),
      `---
title: "Release Repetidor"
date: "2026-10-02"
commits:
  - "7778889"
  - "9990001"
---
### Mejoras
- Intento de duplicar mejora [\`7778889\`]
- Mejora genuina nueva [\`9990001\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 2);
    // En el release nuevo (entries[0]), el hash repetido se descartó
    assert.doesNotMatch(entries[0].html, /Intento de duplicar/);
    assert.match(entries[0].html, /Mejora genuina nueva/);
    assert.deepEqual(entries[0].commits, ["9990001"]);
  });

  await t.test("un token hex entre corchetes que NO pertenece al frontmatter commits no causa descarte accidental de línea", async () => {
    // Release 1 con hash de commit 'abcdef1'
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-01.md"),
      `---
title: "Release 1"
date: "2026-10-01"
commits:
  - "abcdef1"
---
### Mejoras
- Feature 1 [\`abcdef1\`]
`
    );

    // Release 2 con un token hex fortuito entre corchetes pero que NO es commit declarado en este entry
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-02.md"),
      `---
title: "Release 2"
date: "2026-10-02"
commits:
  - "9999999"
---
### Mejoras
- Enlace o mención con código [abcdef1] sin ser commit de esta release [\`9999999\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 2);
    // La línea de Release 2 NO fue descartada porque 'abcdef1' no estaba en sus commits:
    assert.match(entries[0].html, /Enlace o mención con código/);
  });

  await t.test("parseo de secciones estructuradas: clasifica funciones, mejoras, correcciones y otras", async () => {
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-30.md"),
      `---
title: "Release Multi-Sección"
date: "2026-10-30"
commits:
  - "1111111"
  - "2222222"
  - "3333333"
  - "4444444"
  - "5555555"
---
### ✨ Nuevas Funciones
- Asistente inteligente [\`1111111\`]

### 🚀 Mejoras
- Carga acelerada [\`2222222\`]

### 🛠️ Correcciones nuevas
- Solución de desborde y fixes [\`3333333\`]

### 📢 Novedades varias
- Mantenimiento programado de servidores [\`4444444\`]

### 🔧 Corrección de estabilidad
- Patch operativo [\`5555555\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.sections.length, 5);

    assert.equal(entry.sections[0].key, "funciones");
    assert.match(entry.sections[0].title, /Nuevas Funciones/);
    assert.match(entry.sections[0].html, /Asistente inteligente/);

    assert.equal(entry.sections[1].key, "mejoras");
    assert.match(entry.sections[1].title, /Mejoras/);
    assert.match(entry.sections[1].html, /Carga acelerada/);

    // "### 🛠️ Correcciones nuevas" debe clasificar como "correcciones", no como "funciones"
    assert.equal(entry.sections[2].key, "correcciones");
    assert.match(entry.sections[2].title, /Correcciones nuevas/);
    assert.match(entry.sections[2].html, /Solución de desborde/);

    // "### 📢 Novedades varias" debe clasificar como "otras"
    assert.equal(entry.sections[3].key, "otras");
    assert.match(entry.sections[3].title, /Novedades varias/);
    assert.match(entry.sections[3].html, /Mantenimiento programado/);

    // "### 🔧 Corrección de estabilidad" debe clasificar como "correcciones"
    assert.equal(entry.sections[4].key, "correcciones");
    assert.match(entry.sections[4].title, /Corrección de estabilidad/);
    assert.match(entry.sections[4].html, /Patch operativo/);
  });

  await t.test("invalidación reactiva de cache: detecta cambios en mtime de un archivo individual sin modificar la carpeta", async () => {
    const filePath = path.join(tempDir, "2026-10-15.md");
    await fs.promises.writeFile(
      filePath,
      `---
title: "Versión Inicial"
date: "2026-10-15"
commits:
  - "aaaa111"
---
### Mejoras
- Primera versión [\`aaaa111\`]
`
    );

    const initialEntries = await getChangelogEntries(tempDir);
    assert.equal(initialEntries.length, 1);
    assert.equal(initialEntries[0].title, "Versión Inicial");

    // Modificamos el archivo y actualizamos artificialmente su mtime
    await fs.promises.writeFile(
      filePath,
      `---
title: "Versión Modificada"
date: "2026-10-15"
commits:
  - "aaaa111"
---
### Mejoras
- Texto modificado tras edición [\`aaaa111\`]
`
    );
    const newTime = new Date(Date.now() + 2000);
    fs.utimesSync(filePath, newTime, newTime);

    // Debe invalidar automáticamente el cache sin invocar clearChangelogCache()
    const updatedEntries = await getChangelogEntries(tempDir);
    assert.equal(updatedEntries.length, 1);
    assert.equal(updatedEntries[0].title, "Versión Modificada");
    assert.match(updatedEntries[0].html, /Texto modificado tras edición/);
  });

  await t.test("deduplicación tolerante con prefijo de 7 caracteres entre hash largo y corto", async () => {
    // Release 1 con hash largo de 40 caracteres en frontmatter y viñeta
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-14.md"),
      `---
title: "Release Base"
date: "2026-10-14"
commits:
  - "f71cdc1234567890abcdef1234567890abcdef12"
---
### Nuevas Funciones
- Feature inicial [\`f71cdc1234567890abcdef1234567890abcdef12\`]
`
    );

    // Release 2 intenta publicar el mismo commit con hash corto de 7 caracteres
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-15.md"),
      `---
title: "Release Posterior"
date: "2026-10-15"
commits:
  - "f71cdc1"
---
### Nuevas Funciones
- Intento de duplicar feature inicial [\`f71cdc1\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    // Release Posterior debe descartarse porque su único commit es idéntico por prefijo de 7 caracteres
    assert.equal(entries.length, 1);
    assert.equal(entries[0].date, "2026-10-14");
  });

  await t.test("un release descartado por duplicación NO quema sus commits para releases posteriores", async () => {
    // Release 1: publica commit 1111111
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-10.md"),
      `---
title: "Release 10"
date: "2026-10-10"
commits:
  - "1111111"
---
### Mejoras
- Mejora 10 [\`1111111\`]
`
    );

    // Release 2 (duplicado total del commit 1111111): se descartará por vacío
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-11.md"),
      `---
title: "Release 11 (duplicado)"
date: "2026-10-11"
commits:
  - "1111111"
---
### Mejoras
- Copia de mejora 10 [\`1111111\`]
`
    );

    // Release 3: publica commit legítimo 2222222
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-12.md"),
      `---
title: "Release 12"
date: "2026-10-12"
commits:
  - "2222222"
---
### Nuevas Funciones
- Función genuina 12 [\`2222222\`]
`
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 2, "Deben quedar el release 10 y el release 12");
    assert.equal(entries[0].date, "2026-10-12");
    assert.equal(entries[1].date, "2026-10-10");
  });

  await t.test("tolerancia a UTF-8 BOM y fallback al nombre de archivo ante fecha ausente", async () => {
    // Archivo con Byte Order Mark (BOM: \uFEFF) y sin fecha explícita en frontmatter
    const bomContent = "\uFEFF---\ntitle: \"Release con BOM\"\nversion: \"v1.0\"\ncommits:\n  - \"9999999\"\n---\n### Mejoras\n- Fix de compatibilidad [\\`9999999\\`]\n";
    await fs.promises.writeFile(
      path.join(tempDir, "2026-10-18.md"),
      bomContent,
      "utf-8"
    );

    const entries = await getChangelogEntries(tempDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, "Release con BOM");
    assert.equal(entries[0].date, "2026-10-18", "Debe derivar la fecha 2026-10-18 del nombre del archivo");
  });

  await t.test("ventana de retención: no carga releases de más de 3 meses y el prune los borra solo con --apply", async () => {
    const writeEntry = (fileName: string, date: string, hash: string) =>
      fs.promises.writeFile(
        path.join(tempDir, fileName),
        `---
title: "Release ${date}"
date: "${date}"
commits:
  - "${hash}"
---
### Mejoras
- Mejora del ${date} [\`${hash}\`]
`
      );

    await writeEntry("2026-10-20.md", "2026-10-20", "aaa1111");
    await writeEntry("2026-08-20.md", "2026-08-20", "bbb2222");
    await writeEntry("2026-01-10.md", "2026-01-10", "ccc3333");

    const entries = await getChangelogEntries(tempDir);
    assert.deepEqual(entries.map((e) => e.date), ["2026-10-20", "2026-08-20"]);

    // dry-run: informa pero no toca el disco
    const dryRun = await pruneChangelogFiles(tempDir);
    assert.deepEqual(dryRun, ["2026-01-10.md"]);
    assert.equal(fs.existsSync(path.join(tempDir, "2026-01-10.md")), true);

    const deleted = await pruneChangelogFiles(tempDir, { dryRun: false });
    assert.deepEqual(deleted, ["2026-01-10.md"]);
    assert.equal(fs.existsSync(path.join(tempDir, "2026-01-10.md")), false);
    assert.equal(fs.existsSync(path.join(tempDir, "2026-08-20.md")), true);
  });
});
