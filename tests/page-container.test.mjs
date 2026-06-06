import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fileUrl = (path) => new URL(path, root);
const read = (path) => readFile(fileUrl(path), "utf8");
const exists = (path) => existsSync(fileUrl(path));

const componentPath = "src/components/ui/PageContainer.astro";

assert.ok(exists(componentPath), "Expected PageContainer.astro to exist");

const pageContainer = await read(componentPath);

assert.match(
  pageContainer,
  /width\?:\s*"default"\s*\|\s*"xl"/,
  "PageContainer should expose default and wide width variants",
);
assert.match(
  pageContainer,
  /gap\?:\s*"md"\s*\|\s*"lg"/,
  "PageContainer should expose md and lg gap variants",
);
assert.match(
  pageContainer,
  /as\?:\s*"div"\s*\|\s*"section"/,
  "PageContainer should allow rendering as div or section",
);
assert.match(
  pageContainer,
  /class\?:\s*string/,
  "PageContainer should pass through additional classes",
);
assert.match(pageContainer, /max-w-6xl/);
assert.match(pageContainer, /max-w-7xl/);
assert.match(pageContainer, /mx-auto/);
assert.match(pageContainer, /flex/);
assert.match(pageContainer, /w-full/);
assert.match(pageContainer, /flex-col/);
assert.doesNotMatch(
  pageContainer,
  /(?:^|["'\s])(?:p|px|py)-\d/,
  "PageContainer should not include default padding classes",
);

const migratedRoutes = [
  ["src/pages/index.astro", /<PageContainer(?:\s|>)[\s\S]*gap="lg"/],
  [
    "src/pages/catalogo-aplicativos/index.astro",
    /<PageContainer(?:\s|>)[\s\S]*gap="md"/,
  ],
  [
    "src/pages/directorio-oficinas/index.astro",
    /<PageContainer(?:\s|>)[\s\S]*width="xl"/,
  ],
  [
    "src/pages/guia-soportes/index.astro",
    /<PageContainer(?:\s|>)[\s\S]*width="xl"/,
  ],
  [
    "src/pages/design-system/index.astro",
    /<PageContainer(?:\s|>)[\s\S]*width="xl"/,
  ],
];

for (const [path, matcher] of migratedRoutes) {
  const source = await read(path);

  assert.match(
    source,
    /import\s+PageContainer\s+from\s+"@components\/ui\/PageContainer\.astro"/,
    `${path} should import PageContainer`,
  );
  assert.match(source, matcher, `${path} should use the expected container`);
}

const designSystem = await read("src/pages/design-system/index.astro");
assert.match(designSystem, /id="contenedores"/);
assert.match(designSystem, /PageContainer/);
