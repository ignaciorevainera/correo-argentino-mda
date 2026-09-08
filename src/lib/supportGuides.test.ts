import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCategoryIds, parseTopics } from "./supportGuides";

test("parseCategoryIds returns integer IDs from JSON array", () => {
  assert.deepEqual(parseCategoryIds("[5, 12, 23]"), [5, 12, 23]);
});

test("parseCategoryIds returns [] on invalid input", () => {
  assert.deepEqual(parseCategoryIds("not json"), []);
  assert.deepEqual(parseCategoryIds(null), []);
  assert.deepEqual(parseCategoryIds(undefined), []);
  assert.deepEqual(parseCategoryIds(""), []);
});

test("parseCategoryIds filters non-positive and non-integer values", () => {
  assert.deepEqual(parseCategoryIds("[5, -1, 0, 2.5, 12]"), [5, 12]);
});

test("parseTopics returns trimmed strings from JSON array", () => {
  assert.deepEqual(parseTopics('["VPN", " Correo ", "Hardware"]'), [
    "VPN",
    "Correo",
    "Hardware",
  ]);
});

test("parseTopics falls back to comma split when not JSON", () => {
  assert.deepEqual(parseTopics("VPN, Correo, Hardware"), [
    "VPN",
    "Correo",
    "Hardware",
  ]);
});

test("parseTopics returns [] on empty input", () => {
  assert.deepEqual(parseTopics(null), []);
  assert.deepEqual(parseTopics(""), []);
});