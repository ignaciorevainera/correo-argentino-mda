import { test } from "node:test";
import assert from "node:assert/strict";
import { getDetailColumnLayout } from "./officeLayout";

const flags = (
  overrides: Partial<Parameters<typeof getDetailColumnLayout>[0]> = {},
) => ({
  hasInvgate: false,
  hasInfo: false,
  hasSiblings: false,
  hasAssets: false,
  ...overrides,
});

test("3-column layout: left + center + right → flex 1.75/2/2.25, compact assets", () => {
  const l = getDetailColumnLayout(
    flags({ hasInfo: true, hasSiblings: true, hasAssets: true }),
  );
  assert.equal(l.hasLeft, true);
  assert.equal(l.hasCenter, true);
  assert.equal(l.hasRight, true);
  assert.equal(l.leftClass, "lg:flex-[1.75]");
  assert.equal(l.centerClass, "lg:flex-[2]");
  assert.equal(l.rightClass, "lg:flex-[2.25]");
  assert.equal(l.compactAssets, true);
});

test("2-column layout: left + right only → w-2/5 / w-3/5, not compact", () => {
  const l = getDetailColumnLayout(flags({ hasInfo: true, hasAssets: true }));
  assert.equal(l.hasCenter, false);
  assert.equal(l.leftClass, "lg:w-2/5");
  assert.equal(l.rightClass, "lg:w-3/5");
  assert.equal(l.compactAssets, false);
});

test("left + center only → flex 3/2", () => {
  const l = getDetailColumnLayout(flags({ hasInfo: true, hasSiblings: true }));
  assert.equal(l.hasRight, false);
  assert.equal(l.leftClass, "lg:flex-[3]");
  assert.equal(l.centerClass, "lg:flex-[2]");
});

test("center + right only → flex 2/3", () => {
  const l = getDetailColumnLayout(
    flags({ hasSiblings: true, hasAssets: true }),
  );
  assert.equal(l.hasLeft, false);
  assert.equal(l.centerClass, "lg:flex-[2]");
  assert.equal(l.rightClass, "lg:flex-[3]");
});

test("single column: only assets → right w-full", () => {
  const l = getDetailColumnLayout(flags({ hasAssets: true }));
  assert.equal(l.leftClass, "");
  assert.equal(l.centerClass, "");
  assert.equal(l.rightClass, "w-full");
});

test("single column: only center (siblings) → center w-full", () => {
  const l = getDetailColumnLayout(flags({ hasSiblings: true }));
  assert.equal(l.centerClass, "w-full");
});

test("single column: only info → left w-full", () => {
  const l = getDetailColumnLayout(flags({ hasInfo: true }));
  assert.equal(l.hasLeft, true);
  assert.equal(l.hasCenter, false);
  assert.equal(l.hasRight, false);
  assert.equal(l.leftClass, "w-full");
  assert.equal(l.centerClass, "");
  assert.equal(l.rightClass, "");
});

test("left does not render when only siblings exist", () => {
  const l = getDetailColumnLayout(
    flags({ hasSiblings: true, hasAssets: true }),
  );
  assert.equal(l.hasLeft, false);
});
