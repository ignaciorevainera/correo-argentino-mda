import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const distAstroDir = new URL("../dist/_astro/", import.meta.url);
const distAssets = await readdir(distAstroDir);
const builtCssName = distAssets.find(
  (file) => file.startsWith("BaseLayout.") && file.endsWith(".css"),
);

assert.ok(builtCssName, "Expected Astro to emit a hashed BaseLayout CSS asset");

const builtCss = await read(`dist/_astro/${builtCssName}`);
const builtHtml = await read("dist/index.html");

assert.match(
  builtCss,
  /@font-face\{font-family:Geist Variable[\s\S]*?@font-face\{font-family:Geist Mono Variable/,
);

assert.match(
  builtCss,
  /--font-sans:"Geist Variable",\s*ui-sans-serif,\s*system-ui,\s*sans-serif/,
);

assert.match(
  builtCss,
  /--default-font-family:var\(--font-sans\)/,
);

assert.match(
  builtCss,
  /html,:host\{[\s\S]*?font-family:var\(--default-font-family,ui-sans-serif,\s*system-ui,\s*sans-serif/,
);

assert.match(
  builtCss,
  /body,h1,h2,h3,h4,h5,h6,\.btn\{font-family:var\(--font-sans\)\}/,
);

assert.match(
  builtHtml,
  /rel="preload" href="\/_astro\/geist-latin-wght-normal\.[^"]+\.woff2" as="font" type="font\/woff2" crossorigin/,
);

assert.match(
  builtHtml,
  /rel="preload" href="\/_astro\/geist-mono-latin-wght-normal\.[^"]+\.woff2" as="font" type="font\/woff2" crossorigin/,
);
