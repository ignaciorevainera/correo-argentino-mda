import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fileUrl = (path) => new URL(path, root);
const read = (path) => readFile(fileUrl(path), "utf8");
const exists = (path) => existsSync(fileUrl(path));

const componentPath = "src/components/ui/forms/FormLegend.astro";

assert.ok(exists(componentPath), "Expected FormLegend.astro to exist");

const component = await read(componentPath);

assert.match(
  component,
  /fieldset-legend/,
  "FormLegend should use DaisyUI's fieldset-legend class",
);
assert.match(
  component,
  /uppercase tracking-wide/,
  "FormLegend should default to uppercase tracking-wide",
);
assert.doesNotMatch(
  component,
  /[a-z]-\[[a-z0-9]/i,
  "FormLegend should not use arbitrary Tailwind values with []",
);
assert.match(
  component,
  /class\?:\s*string/,
  "FormLegend should accept a class prop",
);
assert.match(
  component,
  /<slot\s*\/>/,
  "FormLegend should have a slot for content",
);

const migratedFiles = [
  ["src/components/ui/forms/FormField.astro", 1],
  ["src/components/ui/forms/SelectField.astro", 1],
  ["src/components/ui/forms/PasswordField.astro", 2],
  ["src/components/admin/OfficeForm.astro", 2],
  ["src/pages/admin/aplicativos/create.astro", 7],
  ["src/pages/admin/aplicativos/edit/[id].astro", 7],
  ["src/pages/admin/contactos/create.astro", 3],
  ["src/pages/admin/contactos/edit/[id].astro", 3],
  ["src/pages/admin/recursos/enlace/create.astro", 1],
  ["src/pages/admin/recursos/enlace/edit/[id].astro", 1],
  ["src/pages/admin/contactos/categoria/create.astro", 1],
  ["src/pages/admin/contactos/categoria/edit/[id].astro", 1],
  ["src/pages/admin/recursos/categoria/create.astro", 1],
  ["src/pages/admin/recursos/categoria/edit/[id].astro", 1],
];

for (const [path, expectedCount] of migratedFiles) {
  assert.ok(exists(path), `${path} should exist`);
  const source = await read(path);

  assert.match(
    source,
    /import\s+FormLegend\s+from\s+"@components\/ui\/forms\/FormLegend\.astro"/,
    `${path} should import FormLegend`,
  );

  const matches = source.match(/<FormLegend/g);
  assert.ok(matches, `${path} should have FormLegend usage`);
  assert.equal(
    matches.length,
    expectedCount,
    `${path} should use FormLegend ${expectedCount} time(s), found ${matches.length}`,
  );

  assert.doesNotMatch(
    source,
    /<legend\s+class="fieldset-legend/,
    `${path} should not contain raw <legend class="fieldset-legend...">`,
  );
}

assert.ok(
  exists("src/components/ui/forms/FormLegend.astro"),
  "FormLegend.astro should exist after migration",
);
