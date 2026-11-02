import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import YAML from "yaml";
import { getChangelogEntries, getRetentionCutoff, resolveChangelogDir } from "../src/lib/changelog/changelogService.js";

/**
 * Script de validación de integridad para los archivos de changelog en src/config/changelog/.
 * Sale con código 0 si todos los archivos y entradas son válidos y consistentes.
 * Sale con código 1 e imprime detalles claros si se detecta alguna anomalía.
 */

interface ValidationError {
  file: string;
  message: string;
}

const errors: ValidationError[] = [];

function checkCommitExists(hash: string): boolean {
  try {
    const out = execSync(`git cat-file -t ${hash}`, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf-8" }).trim();
    return out === "commit";
  } catch {
    return false;
  }
}

async function validate() {
  const changelogDir = resolveChangelogDir();
  console.log(`🔍 Validando archivos de changelog en: ${changelogDir}`);

  if (!fs.existsSync(changelogDir)) {
    console.error(`❌ El directorio ${changelogDir} no existe.`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(changelogDir).filter((f) => f.endsWith(".md"));
  const targetFiles = allFiles.filter((f) => {
    // Eximir example.md y archivos de pruebas/fixtures con prefijo _
    if (f === "example.md") return false;
    if (f.startsWith("_")) return false;
    return true;
  });

  console.log(`📄 Archivos a validar (${targetFiles.length}): ${targetFiles.join(", ")}`);

  const commitToFiles = new Map<string, string[]>();

  for (const fileName of targetFiles) {
    const filePath = path.join(changelogDir, fileName);
    const content = fs.readFileSync(filePath, "utf-8");

    // 1. Validar nombre de archivo estrictamente ISO YYYY-MM-DD.md
    const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!dateMatch) {
      errors.push({
        file: fileName,
        message: `El nombre del archivo debe seguir el formato estricto YYYY-MM-DD.md (recibido: ${fileName})`,
      });
    }
    const expectedDate = dateMatch ? dateMatch[1] : null;

    // 2. Parsear frontmatter
    const cleanContent = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const fmMatch = cleanContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!fmMatch) {
      errors.push({
        file: fileName,
        message: "El archivo no contiene un bloque frontmatter delimitado por '---'",
      });
      continue;
    }

    let parsedYaml: Record<string, unknown> = {};
    try {
      parsedYaml = YAML.parse(fmMatch[1]) || {};
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({
        file: fileName,
        message: `Error al parsear YAML en frontmatter: ${msg}`,
      });
      continue;
    }

    // 3. Chequear que no esté marcado como draft
    if (parsedYaml.draft === true) {
      errors.push({
        file: fileName,
        message: "El archivo no debe tener 'draft: true' en producción (solo permitido en example.md)",
      });
    }

    // 4. Chequear coherencia de fecha ISO
    const rawDate = parsedYaml.date ? String(parsedYaml.date).trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      errors.push({
        file: fileName,
        message: `La fecha en frontmatter ('${rawDate}') no tiene formato ISO YYYY-MM-DD válido`,
      });
    } else if (expectedDate && !rawDate.startsWith(expectedDate)) {
      errors.push({
        file: fileName,
        message: `La fecha en frontmatter ('${rawDate}') no coincide con el nombre de archivo ('${expectedDate}')`,
      });
    }

    // 5. Validar prohibición de links markdown externos [texto](url) en cuerpo
    const bodyContent = fmMatch[2];
    const linkMatches = [...bodyContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi)];
    if (linkMatches.length > 0) {
      errors.push({
        file: fileName,
        message: `Se encontraron ${linkMatches.length} links markdown externos [texto](url). Están estrictamente prohibidos (links a Google/GitHub). Ejemplo: ${linkMatches[0][0]}`,
      });
    }

    // 6. Recolectar y validar commits
    const frontmatterCommits = Array.isArray(parsedYaml.commits)
      ? (parsedYaml.commits as unknown[]).map((c) => String(c).trim().toLowerCase().slice(0, 7))
      : [];

    const bodyCommitMatches = [...bodyContent.matchAll(/\[`?([a-f0-9]{7,40})`?\]/gi)];
    const bodyCommits = bodyCommitMatches.map((m) => m[1].toLowerCase().slice(0, 7));

    const allFileCommits = new Set([...frontmatterCommits, ...bodyCommits]);

    for (const commit of allFileCommits) {
      if (commit.length < 7) {
        errors.push({
          file: fileName,
          message: `El hash de commit '${commit}' es demasiado corto (mínimo 7 caracteres)`,
        });
        continue;
      }

      // Validar existencia real en git
      const exists = checkCommitExists(commit);
      if (!exists) {
        errors.push({
          file: fileName,
          message: `El commit '${commit}' no existe en el repositorio local de git`,
        });
      }

      // Trackear duplicación entre archivos
      const existing = commitToFiles.get(commit) || [];
      existing.push(fileName);
      commitToFiles.set(commit, existing);
    }
  }

  // 7. Validar duplicación entre archivos
  for (const [commit, files] of commitToFiles.entries()) {
    if (files.length > 1) {
      errors.push({
        file: files.join(", "),
        message: `El commit '${commit}' se encuentra repetido en múltiples archivos: ${files.join(", ")}`,
      });
    }
  }

  // 8. Validar supervivencia en getChangelogEntries()
  // Los releases fuera de la ventana de retención (3 meses) no se cargan a propósito.
  const retentionCutoff = getRetentionCutoff(
    targetFiles.map((f) => f.slice(0, 10)).sort().at(-1) ?? "1970-01-01",
  );
  const expiredFiles = targetFiles.filter((f) => f.slice(0, 10) < retentionCutoff);

  const entries = await getChangelogEntries(changelogDir);
  const loadedDates = new Set(entries.map((e) => e.date));

  for (const fileName of targetFiles) {
    if (expiredFiles.includes(fileName)) continue;
    const baseDate = fileName.replace(/\.md$/, "");
    if (!loadedDates.has(baseDate)) {
      errors.push({
        file: fileName,
        message: `El archivo '${fileName}' fue descartado por getChangelogEntries() (posiblemente quedó sin contenido tras deduplicación o formato inválido)`,
      });
    }
  }

  if (expiredFiles.length > 0) {
    console.log(
      `\nℹ️  ${expiredFiles.length} archivo(s) fuera de la ventana de 3 meses (no se publican): ${expiredFiles.join(", ")}\n   Depuralos con: npm run changelog:prune -- --apply`,
    );
  }

  if (errors.length > 0) {
    console.error(`\n❌ Se encontraron ${errors.length} errores de validación de changelog:\n`);
    for (const err of errors) {
      console.error(` • [${err.file}]: ${err.message}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ Validación exitosa: todos los archivos (${targetFiles.length}) son íntegros, sin links prohibidos y sin commits duplicados.`);
}

validate().catch((err) => {
  console.error("Error fatal durante la validación:", err);
  process.exit(1);
});
