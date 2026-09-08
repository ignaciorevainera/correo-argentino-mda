import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const path = "src/components/ui/forms/TagInputField.astro";
assert.ok(existsSync(new URL(path, root)), "Expected TagInputField.astro to exist");

const src = await read(path);

assert.match(src, /fieldset/, "should use daisyUI fieldset");
assert.match(src, /FormLegend/, "should reuse FormLegend");
assert.match(src, /input input-bordered/, "should use daisyUI input-bordered");
assert.match(
  src,
  /badge badge-secondary badge-soft/,
  "should use daisyUI secondary soft badge for tags",
);
assert.match(src, /type="hidden"/, "should emit hidden inputs for formData");
assert.match(src, /toUpperCase/, "should normalize tags to uppercase");
assert.match(src, /Enter/, "should add tag on Enter key");
assert.doesNotMatch(
  src,
  /[a-z]-\[[a-z0-9]/i,
  "should not use arbitrary Tailwind values with []",
);