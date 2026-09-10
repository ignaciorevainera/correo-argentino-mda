import { test } from "node:test";
import assert from "node:assert/strict";
import { getDetailColumnLayout } from "./officeLayout";

const flags = (
  overrides: Partial<Parameters<typeof getDetailColumnLayout>[0]> = {},
) => ({
  hasInvgate: false,
  hasInfo: false,
  contactsCount: 0,
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

test("contacts > 5 moves contacts to center and enables compact assets only with center", () => {
  const l = getDetailColumnLayout(
    flags({ hasInfo: true, contactsCount: 6, hasAssets: true }),
  );
  assert.equal(l.hasCenter, true);
  assert.equal(l.contactsToCenter, true);
  assert.equal(l.compactAssets, true);
  assert.equal(l.hasLeft, true);
});

test("contacts === 5 stays in left, no center", () => {
  const l = getDetailColumnLayout(
    flags({ hasInfo: true, contactsCount: 5, hasAssets: true }),
  );
  assert.equal(l.contactsToCenter, false);
  assert.equal(l.hasCenter, false);
  assert.equal(l.compactAssets, false);
});

test("left does not render when only siblings exist", () => {
  const l = getDetailColumnLayout(
    flags({ hasSiblings: true, hasAssets: true }),
  );
  assert.equal(l.hasLeft, false);
});

test("left renders when info present even with contacts moved to center", () => {
  const l = getDetailColumnLayout(flags({ hasInfo: true, contactsCount: 8 }));
  assert.equal(l.hasLeft, true);
  assert.equal(l.hasCenter, true);
});
