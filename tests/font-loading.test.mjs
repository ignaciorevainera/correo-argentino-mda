import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const globalCss = await read("src/styles/global.css");

assert.doesNotMatch(globalCss, /@import\s+["']@fontsource-variable\/geist["']/);
assert.doesNotMatch(
  globalCss,
  /@import\s+["']@fontsource-variable\/geist-mono["']/,
);

const layout = await read("src/layouts/BaseLayout.astro");

assert.match(
  layout,
  /import\s+geistLatinWoff2\s+from\s+"@fontsource-variable\/geist\/files\/geist-latin-wght-normal\.woff2\?url"/,
);
assert.match(
  layout,
  /import\s+geistMonoLatinWoff2\s+from\s+"@fontsource-variable\/geist-mono\/files\/geist-mono-latin-wght-normal\.woff2\?url"/,
);
assert.match(layout, /rel="preload"[\s\S]*href=\{geistLatinWoff2\}/);
assert.match(
  layout,
  /rel="preload"[\s\S]*href=\{geistMonoLatinWoff2\}/,
);
