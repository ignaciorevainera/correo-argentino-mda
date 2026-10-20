import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");

// Variables que no son configuración del proyecto: las define el runtime, el
// bundler o el sistema operativo. Nunca van al .env.example.
const PLATFORM_KEYS = new Set([
  "NODE_ENV",
  "DEV",
  "BASE_URL",
  "VITEST",
  "APPDATA",
  "MDA_SKIP_PRE_PUSH",
]);

function filesUnderSrcAndScripts(): string[] {
  const out = execSync("git ls-files src scripts", { cwd: ROOT, encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .filter((f) => f.trim() !== "")
    .filter((f) => /\.(ts|tsx|mts|astro|js|mjs)$/.test(f));
}

function keysUsedInCode(): Set<string> {
  const keys = new Set<string>();
  const patterns = [
    /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/g,
    /getEnv\(\s*["']([A-Z][A-Z0-9_]+)["']\s*\)/g,
  ];
  for (const file of filesUnderSrcAndScripts()) {
    const content = readFileSync(resolve(ROOT, file), "utf8");
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) keys.add(match[1]);
    }
  }
  return keys;
}

function keysInEnvExample(): Set<string> {
  const content = readFileSync(resolve(ROOT, ".env.example"), "utf8");
  const keys = new Set<string>();
  for (const match of content.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) keys.add(match[1]);
  return keys;
}

describe(".env.example cubre las variables que el código consume (#234)", () => {
  it("no falta ninguna variable usada en src/ ni scripts/", () => {
    const documented = keysInEnvExample();
    const missing = [...keysUsedInCode()]
      .filter((key) => !PLATFORM_KEYS.has(key))
      .filter((key) => !documented.has(key))
      .sort();
    expect(missing).toEqual([]);
  });

  it("toda variable declarada en src/lib/env.ts está en .env.example", () => {
    const documented = keysInEnvExample();
    const envTs = readFileSync(resolve(ROOT, "src/lib/env.ts"), "utf8");
    const declared = [...envTs.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((m) => m[1]);
    const missing = [...new Set(declared)]
      .filter((key) => !PLATFORM_KEYS.has(key))
      .filter((key) => !documented.has(key))
      .sort();
    expect(missing).toEqual([]);
  });
});
