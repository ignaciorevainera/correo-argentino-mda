// tests/migrate-locations.test.mjs
import assert from "node:assert/strict";

function buildTree(flatList) {
  const nodeMap = new Map();

  for (const loc of flatList) {
    nodeMap.set(loc.id, {
      prodId: loc.id,
      name: loc.name,
      prodParentId: loc.parent_id,
      children: [],
    });
  }

  const roots = [];

  for (const loc of flatList) {
    const node = nodeMap.get(loc.id);
    if (loc.parent_id === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(loc.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

function flattenTopological(roots) {
  const result = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);
    queue.push(...node.children);
  }
  return result;
}

function simulateIdMapping(ordered) {
  const idMap = new Map();
  let nextId = 1000;
  for (const node of ordered) {
    const newId = nextId++;
    idMap.set(node.prodId, newId);
    node.qaId = newId;

    if (node.prodParentId !== null) {
      node.qaParentId = idMap.get(node.prodParentId);
      assert.ok(
        node.qaParentId !== undefined,
        `Parent prod#${node.prodParentId} should be in ID map before child ${node.name}`,
      );
    } else {
      node.qaParentId = null;
    }
  }
  return { idMap, ordered };
}

// --- Test 1: Empty list produces empty tree ---
{
  const roots = buildTree([]);
  assert.equal(roots.length, 0, "Empty list: no roots");
}

// --- Test 2: Flat list with no parents (all roots) ---
{
  const flat = [
    { id: 1, name: "Argentina", parent_id: null, total: 0 },
    { id: 2, name: "Brasil", parent_id: null, total: 0 },
    { id: 3, name: "Chile", parent_id: null, total: 0 },
  ];
  const roots = buildTree(flat);
  assert.equal(roots.length, 3, "All three are roots");
  assert.equal(roots[0].children.length, 0, "Root 1 has no children");
}

// --- Test 3: Nested hierarchy (1 root, 2 levels) ---
{
  const flat = [
    { id: 1, name: "Argentina", parent_id: null, total: 0 },
    { id: 2, name: "CABA", parent_id: 1, total: 0 },
    { id: 3, name: "Palermo", parent_id: 2, total: 0 },
    { id: 4, name: "Belgrano", parent_id: 2, total: 0 },
    { id: 5, name: "Córdoba", parent_id: 1, total: 0 },
  ];
  const roots = buildTree(flat);
  assert.equal(roots.length, 1, "One root: Argentina");
  assert.equal(roots[0].name, "Argentina", "Root is Argentina");
  assert.equal(
    roots[0].children.length,
    2,
    "Argentina has 2 children: CABA and Córdoba",
  );
  assert.equal(roots[0].children[0].name, "CABA", "First child is CABA");
  assert.equal(
    roots[0].children[0].children.length,
    2,
    "CABA has 2 children: Palermo and Belgrano",
  );
  assert.equal(roots[0].children[1].name, "Córdoba", "Second child is Córdoba");
  assert.equal(
    roots[0].children[1].children.length,
    0,
    "Córdoba has no children",
  );
}

// --- Test 4: Topological sort preserves parent-before-child order ---
{
  const flat = [
    { id: 1, name: "Root", parent_id: null, total: 0 },
    { id: 2, name: "Child", parent_id: 1, total: 0 },
    { id: 3, name: "Grandchild", parent_id: 2, total: 0 },
  ];
  const roots = buildTree(flat);
  const ordered = flattenTopological(roots);
  assert.equal(ordered.length, 3, "Three nodes");
  assert.equal(ordered[0].name, "Root", "Root is first");
  assert.equal(ordered[1].name, "Child", "Child is second");
  assert.equal(ordered[2].name, "Grandchild", "Grandchild is third");
}

// --- Test 5: ID mapping assigns parents before children ---
{
  const flat = [
    { id: 10, name: "Root", parent_id: null, total: 0 },
    { id: 20, name: "A", parent_id: 10, total: 0 },
    { id: 30, name: "B", parent_id: 10, total: 0 },
    { id: 40, name: "A1", parent_id: 20, total: 0 },
  ];
  const roots = buildTree(flat);
  const ordered = flattenTopological(roots);
  const { idMap, ordered: mapped } = simulateIdMapping(ordered);

  assert.equal(idMap.size, 4, "All 4 locations mapped");
  assert.notEqual(idMap.get(10), undefined, "Root has QA ID");
  assert.notEqual(idMap.get(20), undefined, "A has QA ID");

  const a1 = mapped.find((n) => n.name === "A1");
  assert.equal(
    a1.qaParentId,
    idMap.get(20),
    "A1 parent QA ID matches A's new QA ID",
  );
}

// --- Test 6: Orphan children become roots ---
{
  const flat = [
    { id: 1, name: "Orphan", parent_id: 999, total: 0 },
    { id: 2, name: "Real", parent_id: null, total: 0 },
  ];
  const roots = buildTree(flat);
  assert.equal(roots.length, 2, "Orphan becomes root");
  assert.equal(roots[0].name, "Orphan", "Orphan is first root");
}

// --- Test 7: Out-of-order flat list still builds correct tree ---
{
  const flat = [
    { id: 3, name: "Child", parent_id: 1, total: 0 },
    { id: 1, name: "Root", parent_id: null, total: 0 },
  ];
  const roots = buildTree(flat);
  assert.equal(roots.length, 1, "One root despite out-of-order input");
  assert.equal(roots[0].children.length, 1, "Root has child");
  assert.equal(roots[0].children[0].name, "Child", "Child correctly attached");
}

console.log("All migrate-locations tests passed!");
