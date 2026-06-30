import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const typesPath = new URL("../src/types/invgate.ts", import.meta.url);
const source = await readFile(typesPath, "utf8");

assert.ok(source.includes("interface InvgateIncident"), "InvgateIncident type should exist");
assert.ok(source.includes("interface InvgateIncidentsResponse"), "InvgateIncidentsResponse type should exist");
assert.ok(source.includes("interface InvgatePagination"), "InvgatePagination type should exist");

// Verify base types are still there
assert.ok(source.includes("InvgateResult<T>"), "InvgateResult should still exist");
assert.ok(source.includes("InvgateApiResponse<T>"), "InvgateApiResponse should still exist");
assert.ok(source.includes("interface InvgateApiError"), "InvgateApiError should still exist");

console.log("All invgate domain type tests passed!");
