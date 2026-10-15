import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// El flag /g es obligatorio: sin él `matchAll` no itera todas las referencias
// de un mismo contenido y sólo se detectaría la primera imagen de cada artículo.
export const KB_IMAGE_URL_PATTERN =
  /\/api\/kb\/images\/([1-9]\d*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp))/gi;

export function collectReferencedKbImages(
  contents: Iterable<string | null | undefined>,
  helpdeskId: number,
): Set<string> {
  const referenced = new Set<string>();
  for (const content of contents) {
    if (!content) continue;
    for (const match of content.matchAll(KB_IMAGE_URL_PATTERN)) {
      if (Number(match[1]) === helpdeskId) {
        referenced.add(match[2].toLowerCase());
      }
    }
  }
  return referenced;
}

export function findOrphanKbImages(
  filesOnDisk: Iterable<string>,
  referenced: Set<string>,
): string[] {
  return [...filesOnDisk]
    .filter((filename) => !referenced.has(filename.toLowerCase()))
    .sort();
}

export interface PruneKbImagesReport {
  dryRun: boolean;
  scannedHelpdesks: number;
  scannedFiles: number;
  orphans: { helpdeskId: number; filename: string }[];
  quarantined: { helpdeskId: number; filename: string; to: string }[];
  quarantineDir: string | null;
}

export function runPruneKbImages(options: {
  dbPath: string;
  storageRoot: string;
  apply: boolean;
  now?: Date;
}): PruneKbImagesReport {
  const { dbPath, storageRoot, apply, now } = options;

  if (!fs.existsSync(dbPath)) {
    throw new Error(`No existe la base de datos: ${dbPath}`);
  }

  const stamp = (now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const quarantineRoot = path.join(
    storageRoot,
    "kb-images-quarantine",
    stamp,
  );

  const orphans: PruneKbImagesReport["orphans"] = [];
  const quarantined: PruneKbImagesReport["quarantined"] = [];
  let scannedFiles = 0;
  let scannedHelpdesks = 0;

  const db = new Database(dbPath, { readonly: !apply });
  try {
    // Sólo se evalúan mesas que tienen artículos: una carpeta sin filas en
    // kb_articles queda intacta (no hay contenido para comparar).
    const helpdesks = db
      .prepare(
        "SELECT DISTINCT helpdesk_id FROM kb_articles WHERE helpdesk_id IS NOT NULL",
      )
      .all() as { helpdesk_id: number }[];
    scannedHelpdesks = helpdesks.length;

    const contentsStmt = db.prepare(
      "SELECT content FROM kb_articles WHERE helpdesk_id = ?",
    );

    for (const { helpdesk_id: helpdeskId } of helpdesks) {
      const mesaDir = path.join(storageRoot, "kb-images", String(helpdeskId));
      if (!fs.existsSync(mesaDir)) continue;

      const files = fs
        .readdirSync(mesaDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      scannedFiles += files.length;

      const contents = (contentsStmt.all(helpdeskId) as { content: string | null }[]).map(
        (row) => row.content,
      );
      const referenced = collectReferencedKbImages(contents, helpdeskId);
      const mesaOrphans = findOrphanKbImages(files, referenced);

      for (const filename of mesaOrphans) {
        orphans.push({ helpdeskId, filename });

        if (apply) {
          // Move, nunca delete: la cuarentena permite revertir el GC.
          const toDir = path.join(quarantineRoot, String(helpdeskId));
          fs.mkdirSync(toDir, { recursive: true });
          const to = path.join(toDir, filename);
          fs.renameSync(path.join(mesaDir, filename), to);
          quarantined.push({ helpdeskId, filename, to });
        }
      }
    }
  } finally {
    db.close();
  }

  return {
    dryRun: !apply,
    scannedHelpdesks,
    scannedFiles,
    orphans,
    quarantined,
    quarantineDir: apply ? quarantineRoot : null,
  };
}
