# Unified File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate hardcoded Windows absolute paths (`C:/Projects/...`) across 8 files and unify two separate storage roots into a single `EXTERNAL_STORAGE_DIR` with typed subdirectories.

**Architecture:** Replace inline `path.resolve(process.env.X || "C:/...")` in every file with a single `src/lib/storage.ts` utility that returns subdirectory paths (`apps/`, `icons/`, `pdfs/`). The existing `EXTERNAL_PRIVATE_DIR` is eliminated; PDFs live under `{STORAGE}/pdfs/`. A one-time migration script moves existing files into the new layout.

**Tech Stack:** Node.js `fs`, Astro SSR (`process.env`), TypeScript, Drizzle ORM

**Audit references:** `docs/superpowers/specs/2026-07-01-auditoria-integral.md` §1.7 (hardcoded paths), §1.8 (missing `EXTERNAL_PRIVATE_DIR`)

---

### Task 1: Create `src/lib/storage.ts` — centralized path utility

**Files:**
- Create: `src/lib/storage.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write `storage.ts`**

```ts
import path from "node:path";
import fs from "node:fs";

const SUBDIR_APPS = "apps";
const SUBDIR_ICONS = "icons";
const SUBDIR_PDFS = "pdfs";

function getStorageRoot(): string {
  return path.resolve(
    process.env.EXTERNAL_STORAGE_DIR || "./data/storage",
  );
}

export function getAppsDir(): string {
  return path.join(getStorageRoot(), SUBDIR_APPS);
}

export function getIconsDir(): string {
  return path.join(getStorageRoot(), SUBDIR_ICONS);
}

export function getPdfsDir(): string {
  return path.join(getStorageRoot(), SUBDIR_PDFS);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
```

- [ ] **Step 2: Add fallback dir to `.gitignore`**

Append to `.gitignore`:
```
# Local storage fallback (when EXTERNAL_STORAGE_DIR is not set)
/data/storage/
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts .gitignore
git commit -m "feat: add centralized storage path utility with subdirectories"
```

---

### Task 2: Update `src/lib/iconUpload.ts` — use centralized utility

**Files:**
- Modify: `src/lib/iconUpload.ts`

- [ ] **Step 1: Replace inline path resolution with `getIconsDir()`**

Replace lines 71-76:
```ts
  // Resolve storage directory
  const uploadDir = path.resolve(
    process.env.EXTERNAL_STORAGE_DIR ||
      "C:/Projects/correo-argentino-mda-programs",
  );
  const iconsDir = path.join(uploadDir, "icons");
```

With:
```ts
  import { getIconsDir, ensureDir } from "@lib/storage";
  const iconsDir = getIconsDir();
```

Also add the import at the top of the file:
```ts
import { getIconsDir, ensureDir } from "@lib/storage";
```

Replace `fs.mkdirSync(iconsDir, { recursive: true })` with `ensureDir(iconsDir)`.

- [ ] **Step 2: Verify no remaining hardcoded paths in the file**

- [ ] **Step 3: Build check**

Run: `npx astro check`
Expected: No new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/iconUpload.ts
git commit -m "refactor: use centralized storage utility in iconUpload"
```

---

### Task 3: Update `src/pages/api/icons/[filename].ts` — serve from `icons/` subdir

**Files:**
- Modify: `src/pages/api/icons/[filename].ts`

- [ ] **Step 1: Replace inline path resolution**

Change:
```ts
const STORAGE_DIR = path.resolve(
  process.env.EXTERNAL_STORAGE_DIR || "C:/Projects/correo-argentino-mda-programs",
);
// ...
const filePath = path.join(STORAGE_DIR, "icons", sanitized);
```

To:
```ts
import { getIconsDir } from "@lib/storage";

const iconsDir = getIconsDir();
// ...
const filePath = path.join(iconsDir, sanitized);
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/icons/\[filename\].ts
git commit -m "refactor: use centralized storage in icons API route"
```

---

### Task 4: Update `src/pages/api/download/[filename].ts` — serve from `apps/` subdir

**Files:**
- Modify: `src/pages/api/download/[filename].ts`

- [ ] **Step 1: Replace inline path resolution**

Change:
```ts
const STORAGE_DIR = path.resolve(
  process.env.EXTERNAL_STORAGE_DIR || "C:/Projects/correo-argentino-mda-programs",
);
// ...
const filePath = path.join(STORAGE_DIR, sanitized);
```

To:
```ts
import { getAppsDir } from "@lib/storage";

const appsDir = getAppsDir();
// ...
const filePath = path.join(appsDir, sanitized);
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/download/\[filename\].ts
git commit -m "refactor: serve downloads from apps/ subdirectory"
```

---

### Task 5: Update `src/pages/api/aplicativos/pdf/[id].ts` — serve from `pdfs/` subdir

**Files:**
- Modify: `src/pages/api/aplicativos/pdf/[id].ts`

- [ ] **Step 1: Replace inline path resolution**

Change:
```ts
const privateDir = path.resolve(
  process.env.EXTERNAL_PRIVATE_DIR || "C:/Projects/correo-argentino-mda-private-pdfs"
);
// ...
const filePath = path.join(privateDir, app.instructionPdfPath);
```

To:
```ts
import { getPdfsDir } from "@lib/storage";

const pdfsDir = getPdfsDir();
// ...
const filePath = path.join(pdfsDir, app.instructionPdfPath);
```

- [ ] **Step 2: Remove unused import if any**

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/aplicativos/pdf/\[id\].ts
git commit -m "refactor: serve instruction PDFs from pdfs/ subdirectory"
```

---

### Task 6: Update `src/pages/admin/aplicativos/create.astro` — upload to subdirectories

**Files:**
- Modify: `src/pages/admin/aplicativos/create.astro`

- [ ] **Step 1: Replace app binary upload path (lines 80-84)**

Change:
```ts
        const uploadDir = path.resolve(
          process.env.EXTERNAL_STORAGE_DIR ||
            (import.meta.env.EXTERNAL_STORAGE_DIR as string) ||
            "C:/Projects/correo-argentino-mda-programs",
        );
```

To:
```ts
        import { getAppsDir, ensureDir, getPdfsDir } from "@lib/storage";
        const appsDir = getAppsDir();
```

Add the import at the top of the frontmatter with the other imports, and remove the inline `import("node:path")` caveats since `path` is imported dynamically... actually wait, in the Astro frontmatter they use `const path = await import("node:path")` dynamically. Let me adjust.

In the frontmatter of `create.astro`, the `fs` and `path` are imported dynamically inside the if block:
```ts
const fs = await import("node:fs");
const path = await import("node:path");
```

This means we can't use static imports from `@lib/storage` in that scope... Actually, we can. The dynamic imports are inside the `if (Astro.request.method === "POST")` block. But `@lib/storage` can be imported at the top of the frontmatter (statically) since it doesn't depend on the request.

Actually, looking more carefully at the code, both `create.astro` and `edit/[id].astro` already have static imports at the top:
```ts
import { resolveUrl } from "@lib/url";
```

And they use dynamic imports for `fs` and `path` inside the POST handler. We can add a static import for `@lib/storage` at the top. Then inside the POST handler, we use the functions from it.

Replace `fs.mkdirSync(uploadDir, { recursive: true })` with `ensureDir(appsDir)`.

But `fs` is dynamically imported... `ensureDir` uses `fs` internally, so we don't need the dynamic `fs` import for mkdir anymore. But `fs` is still used for `writeFileSync`.

Wait, `ensureDir` from `storage.ts` already has `fs` imported there. In the create/edit pages, they still need `fs` for `writeFileSync` and `fs.existsSync`. So we still need the dynamic import of `fs`. Good.

So the changes are:
1. Add static import for storage functions
2. Replace the `path.resolve(...)` with a call to the appropriate function
3. Replace `fs.mkdirSync(uploadDir, { recursive: true })` with `ensureDir(appsDir)`
4. Replace `path.join(uploadDir, safeFileName)` with `path.join(appsDir, safeFileName)`

Same pattern for PDFs.

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/aplicativos/create.astro
git commit -m "refactor: write uploads to apps/ and pdfs/ subdirectories in create.astro"
```

---

### Task 7: Update `src/pages/admin/aplicativos/edit/[id].astro`

**Files:**
- Modify: `src/pages/admin/aplicativos/edit/[id].astro`

- [ ] **Step 1: Apply same changes as Task 6**

Same pattern: add static import, replace `path.resolve(...)` with `getAppsDir()` / `getPdfsDir()`, replace `fs.mkdirSync` with `ensureDir`, replace join paths.

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/aplicativos/edit/\[id\].astro
git commit -m "refactor: write uploads to apps/ and pdfs/ subdirectories in edit.astro"
```

---

### Task 8: Update `src/pages/admin/aplicativos/edit/[id]/eliminar.ts`

**Files:**
- Modify: `src/pages/admin/aplicativos/edit/[id]/eliminar.ts`

- [ ] **Step 1: Replace storage dir resolution**

Change lines 25-29:
```ts
        const storageDir = path.resolve(
          process.env.EXTERNAL_STORAGE_DIR ||
            (import.meta.env.EXTERNAL_STORAGE_DIR as string) ||
            "C:/Projects/correo-argentino-mda-programs",
        );
```

To:
```ts
        import { getAppsDir } from "@lib/storage";
        const appsDir = getAppsDir();
```

Replace `path.join(storageDir, fileName)` with `path.join(appsDir, fileName)`.

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/aplicativos/edit/\[id\]/eliminar.ts
git commit -m "refactor: delete from apps/ subdirectory in eliminar.ts"
```

---

### Task 9: Update `src/pages/admin/aplicativos/categorias/edit/[id]/eliminar.ts`

**Files:**
- Modify: `src/pages/admin/aplicativos/categorias/edit/[id]/eliminar.ts`

- [ ] **Step 1: Replace storage dir resolution**

Change lines 54-58:
```ts
      const storageDir = path.resolve(
        process.env.EXTERNAL_STORAGE_DIR ||
          (import.meta.env.EXTERNAL_STORAGE_DIR as string) ||
          "C:/Projects/correo-argentino-mda-programs",
      );
```

To:
```ts
      import { getAppsDir } from "@lib/storage";
      const appsDir = getAppsDir();
```

Replace `path.join(storageDir, fileName)` with `path.join(appsDir, fileName)`.

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/aplicativos/categorias/edit/\[id\]/eliminar.ts
git commit -m "refactor: delete from apps/ subdirectory in category eliminar.ts"
```

---

### Task 10: Create migration script for existing files

**Files:**
- Create: `scripts/migrate-storage.ts`

- [ ] **Step 1: Write the migration script**

```ts
import fs from "node:fs";
import path from "node:path";

const STORAGE_DIR = path.resolve(
  process.env.EXTERNAL_STORAGE_DIR || "./data/storage",
);
const PRIVATE_DIR = process.env.EXTERNAL_PRIVATE_DIR
  ? path.resolve(process.env.EXTERNAL_PRIVATE_DIR)
  : null;

const APPS_DIR = path.join(STORAGE_DIR, "apps");
const PDFS_DIR = path.join(STORAGE_DIR, "pdfs");

function moveFiles(src: string, dest: string, description: string): void {
  if (!fs.existsSync(src)) {
    console.log(`[skip] Source does not exist: ${src}`);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  let moved = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (fs.existsSync(destPath)) {
      console.log(`[skip] Already exists: ${destPath}`);
      continue;
    }

    fs.renameSync(srcPath, destPath);
    moved++;
  }

  console.log(`[done] Moved ${moved} ${description} from ${src} to ${dest}`);
}

console.log("=== Storage Migration Script ===");
console.log(`STORAGE_DIR: ${STORAGE_DIR}`);
if (PRIVATE_DIR) console.log(`PRIVATE_DIR: ${PRIVATE_DIR}`);
console.log("");

// 1. Move root files (app binaries) to apps/
moveFiles(STORAGE_DIR, APPS_DIR, "app binaries");

// 2. Move private PDFs to pdfs/
if (PRIVATE_DIR) {
  moveFiles(PRIVATE_DIR, PDFS_DIR, "instruction PDFs");
} else {
  console.log("[skip] EXTERNAL_PRIVATE_DIR not set — skipping PDF migration");
}

console.log("");
console.log("Migration complete. Verify and then remove EXTERNAL_PRIVATE_DIR from .env if desired.");
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-storage.ts
git commit -m "feat: add migration script for unified storage layout"
```

---

### Task 11: Update `.env` and create `.env.example`

**Files:**
- Modify: `.env`
- Create: `.env.example`

- [ ] **Step 1: Keep `EXTERNAL_STORAGE_DIR` in `.env`** as is (current value works)

Current `.env` already has `EXTERNAL_STORAGE_DIR="C:/Projects/correo-argentino-mda-programs"`. No change needed unless you want to migrate to a relative path.

- [ ] **Step 2: Create `.env.example`**

```env
# ============================================
# Correo Argentino MDA — Environment Variables
# ============================================
# Copy this file to .env and fill in values.
# NEVER commit .env to version control.

# --- Storage ---
EXTERNAL_STORAGE_DIR="./data/storage"
# Root directory for all uploaded files (apps, icons, PDFs).
# Files are organized into subdirectories automatically:
#   {dir}/apps/  — application binaries (.zip, .exe, .msi, .rar)
#   {dir}/icons/ — icon files (.png, .jpg, .svg, .ico)
#   {dir}/pdfs/  — instruction PDFs (confidential, auth-protected)

# --- Session & Encryption ---
SESSION_SECRET=""
# A random 64-character hex string for session signing.
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

ENCRYPTION_KEY=""
# A 32-character hex string for AES-256-GCM encryption of credentials.
# Generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# --- InvGate API ---
INVGATE_API_USERNAME="portalmda"
INVGATE_BASE_URL="https://correoargentino.sd.cloud.invgate.net/api/v1/"
INVGATE_API_KEY=""
```

- [ ] **Step 3: Commit**

```bash
git add .env .env.example
git commit -m "docs: add .env.example with all required env vars"
```

---

### Task 12: Update `src/env.d.ts` — declare storage env var

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add `EXTERNAL_STORAGE_DIR` to `ImportMetaEnv`**

```ts
interface ImportMetaEnv {
  readonly INVGATE_API_KEY: string;
  readonly INVGATE_BASE_URL: string;
  readonly INVGATE_API_USERNAME: string;
  readonly EXTERNAL_STORAGE_DIR: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/env.d.ts
git commit -m "types: declare EXTERNAL_STORAGE_DIR in ImportMetaEnv"
```

---

### Task 13: Run migration and verify

- [ ] **Step 1: Run the migration script**

```bash
npx tsx scripts/migrate-storage.ts
```

Expected output:
```
=== Storage Migration Script ===
STORAGE_DIR: C:/Projects/correo-argentino-mda-programs
PRIVATE_DIR: C:/Projects/correo-argentino-mda-private-pdfs

[done] Moved N app binaries from ... to .../apps
[done] Moved M instruction PDFs from ... to .../pdfs

Migration complete.
```

- [ ] **Step 2: Start dev server and verify**

```bash
npm run dev
```

Test:
1. Open `/admin/aplicativos` — existing apps show icons, downloads, and PDFs working
2. Create a new app with file upload → binary saves to `apps/`
3. Upload an icon → saves to `icons/`
4. Upload a PDF → saves to `pdfs/`
5. Edit and replace files → old cleaned up, new in correct subdir
6. Delete an app → file removed from `apps/`

- [ ] **Step 3: Verify no hardcoded paths remain**

```bash
rg "C:/Projects/" --include "*.ts" --include "*.astro"
```

Expected: No matches except in `scripts/migrate-storage.ts`.

- [ ] **Step 4: TypeScript check**

```bash
npx astro check
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: run storage migration and finalize unified layout"
```

---

## Self-Review

| Requirement | Covered in |
|-------------|-----------|
| 1.7 Hardcoded `C:/Projects/...` in iconUpload.ts | Task 2 |
| 1.7 Hardcoded `C:/Projects/...` in api/icons/[filename].ts | Task 3 |
| 1.7 Hardcoded `C:/Projects/...` in api/download/[filename].ts | Task 4 |
| 1.7 Hardcoded `C:/Projects/...` in api/aplicativos/pdf/[id].ts | Task 5 |
| 1.7 Hardcoded `C:/Projects/...` in create.astro (2 occurrences) | Task 6 |
| 1.7 Hardcoded `C:/Projects/...` in edit/[id].astro (2 occurrences) | Task 7 |
| 1.7 Hardcoded `C:/Projects/...` in eliminar.ts | Task 8 |
| 1.7 Hardcoded `C:/Projects/...` in categorias/eliminar.ts | Task 9 |
| 1.8 EXTERNAL_PRIVATE_DIR eliminated via unified structure | Tasks 5, 6, 7, 10 |
| .env.example with all vars documented | Task 11 |
| env.d.ts declaration | Task 12 |
| Migration of existing files | Task 10, 13 |
