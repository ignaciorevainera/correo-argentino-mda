import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectReferencedKbImages,
  findOrphanKbImages,
  runPruneKbImages,
} from "../../src/lib/kbImageGc";

const UUID_A = "11111111-1111-4111-8111-111111111111.png";
const UUID_B = "22222222-2222-4222-8222-222222222222.webp";

describe("collectReferencedKbImages", () => {
  it("extrae las referencias de la mesa pedida y excluye las demás", () => {
    const contents = [
      `![a](/api/kb/images/7/${UUID_A})`,
      `![b](/api/kb/images/8/${UUID_B})`,
      null,
    ];
    expect([...collectReferencedKbImages(contents, 7)]).toEqual([UUID_A]);
  });

  it("acepta variantes con base, query y case", () => {
    const contents = [`/sistema/api/kb/images/7/${UUID_A.toUpperCase()}?v=2`];
    expect([...collectReferencedKbImages(contents, 7)]).toEqual([UUID_A]);
  });
});

describe("findOrphanKbImages", () => {
  it("marca solo los archivos sin referencia", () => {
    const referenced = new Set([UUID_A]);
    expect(findOrphanKbImages([UUID_A, UUID_B], referenced)).toEqual([UUID_B]);
  });
});

const tempDirs: string[] = [];
function makeTempDirs(): { dbPath: string; storageRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-image-gc-"));
  tempDirs.push(root);
  return {
    dbPath: path.join(root, "mda.db"),
    storageRoot: path.join(root, "storage"),
  };
}

function seed(dbPath: string, rows: { helpdeskId: number; content: string }[]) {
  const db = new Database(dbPath);
  db.exec(
    "CREATE TABLE kb_articles (id INTEGER PRIMARY KEY AUTOINCREMENT, helpdesk_id INTEGER NOT NULL, content TEXT)",
  );
  const insert = db.prepare(
    "INSERT INTO kb_articles (helpdesk_id, content) VALUES (?, ?)",
  );
  for (const row of rows) insert.run(row.helpdeskId, row.content);
  db.close();
}

function writeImage(storageRoot: string, helpdeskId: number, filename: string) {
  const dir = path.join(storageRoot, "kb-images", String(helpdeskId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), "x");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("runPruneKbImages", () => {
  it("en dry-run reporta huérfanos sin tocar el disco", () => {
    const { dbPath, storageRoot } = makeTempDirs();
    seed(dbPath, [{ helpdeskId: 7, content: `/api/kb/images/7/${UUID_A}` }]);
    writeImage(storageRoot, 7, UUID_A);
    writeImage(storageRoot, 7, UUID_B);

    const report = runPruneKbImages({ dbPath, storageRoot, apply: false });
    expect(report.orphans).toEqual([{ helpdeskId: 7, filename: UUID_B }]);
    expect(report.quarantined).toEqual([]);
    expect(fs.existsSync(path.join(storageRoot, "kb-images", "7", UUID_B))).toBe(true);
  });

  it("en apply mueve el huérfano a cuarentena y preserva el referenciado", () => {
    const { dbPath, storageRoot } = makeTempDirs();
    seed(dbPath, [
      { helpdeskId: 7, content: `/api/kb/images/7/${UUID_A}` },
      { helpdeskId: 9, content: "sin imágenes" },
    ]);
    writeImage(storageRoot, 7, UUID_A);
    writeImage(storageRoot, 7, UUID_B);
    writeImage(storageRoot, 9, UUID_B);

    const report = runPruneKbImages({ dbPath, storageRoot, apply: true });
    expect(report.orphans).toHaveLength(2);
    expect(fs.existsSync(path.join(storageRoot, "kb-images", "7", UUID_A))).toBe(true);
    expect(fs.existsSync(path.join(storageRoot, "kb-images", "7", UUID_B))).toBe(false);
    expect(report.quarantined.map((item) => item.filename).sort()).toEqual([
      UUID_B,
      UUID_B,
    ]);
  });

  it("cae a copyFile + unlink cuando renameSync lanza EXDEV", () => {
    const { dbPath, storageRoot } = makeTempDirs();
    seed(dbPath, [{ helpdeskId: 7, content: "sin imágenes" }]);
    writeImage(storageRoot, 7, UUID_B);

    const exdev = new Error(
      "EXDEV: cross-device link not permitted",
    ) as NodeJS.ErrnoException;
    exdev.code = "EXDEV";

    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw exdev;
    });

    try {
      const report = runPruneKbImages({ dbPath, storageRoot, apply: true });

      expect(report.quarantined).toHaveLength(1);
      const moved = report.quarantined[0];
      expect(
        fs.existsSync(path.join(storageRoot, "kb-images", "7", UUID_B)),
      ).toBe(false);
      expect(fs.existsSync(moved.to)).toBe(true);
      expect(fs.readFileSync(moved.to, "utf8")).toBe("x");
    } finally {
      renameSpy.mockRestore();
    }
  });

  it("es idempotente: una segunda corrida no encuentra nada", () => {
    const { dbPath, storageRoot } = makeTempDirs();
    seed(dbPath, [{ helpdeskId: 7, content: `/api/kb/images/7/${UUID_A}` }]);
    writeImage(storageRoot, 7, UUID_B);

    runPruneKbImages({ dbPath, storageRoot, apply: true });
    const second = runPruneKbImages({ dbPath, storageRoot, apply: false });
    expect(second.orphans).toEqual([]);
  });
});
