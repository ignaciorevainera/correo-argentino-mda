import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sortAgsQueue,
  type AgsQueueCandidate,
} from "./agsQueue";

const op = (
  agentId: number,
  overrides: Partial<AgsQueueCandidate> = {},
): AgsQueueCandidate => ({
  agentId,
  nombre: `Operador ${agentId}`,
  disponible: true,
  asignableAgs: true,
  lastAutogestionAssignedAt: null,
  ...overrides,
});

test("la cola pone primero a los que nunca recibieron una autogestión", () => {
  const queue = sortAgsQueue([
    op(1, { lastAutogestionAssignedAt: 1_000 }),
    op(2, { lastAutogestionAssignedAt: null }),
    op(3, { lastAutogestionAssignedAt: 2_000 }),
  ]);
  assert.deepEqual(
    queue.map((o) => o.agentId),
    [2, 1, 3],
  );
});

test("entre asignados gana el más viejo", () => {
  const queue = sortAgsQueue([
    op(1, { lastAutogestionAssignedAt: 5_000 }),
    op(2, { lastAutogestionAssignedAt: 1_000 }),
    op(3, { lastAutogestionAssignedAt: 3_000 }),
  ]);
  assert.deepEqual(
    queue.map((o) => o.agentId),
    [2, 3, 1],
  );
});

test("excluye operadores no disponibles o no asignables a AGS", () => {
  const queue = sortAgsQueue([
    op(1),
    op(2, { disponible: false }),
    op(3, { asignableAgs: false }),
  ]);
  assert.deepEqual(
    queue.map((o) => o.agentId),
    [1],
  );
});

test("la cola no muta el array de entrada", () => {
  const input = [
    op(1, { lastAutogestionAssignedAt: 2_000 }),
    op(2, { lastAutogestionAssignedAt: 1_000 }),
  ];
  const ordered = sortAgsQueue(input);
  assert.notEqual(ordered, input, "debe devolver un array nuevo");
  assert.deepEqual(
    input.map((o) => o.agentId),
    [1, 2],
    "el array de entrada no se ordena in place",
  );
  assert.deepEqual(
    ordered.map((o) => o.agentId),
    [2, 1],
  );
});

test("sin operadores disponibles la cola queda vacía", () => {
  assert.deepEqual(sortAgsQueue([op(1, { disponible: false })]), []);
  assert.deepEqual(sortAgsQueue([]), []);
});

test("un empate de timestamp conserva el orden de entrada", () => {
  const queue = sortAgsQueue([
    op(1, { lastAutogestionAssignedAt: 1_000 }),
    op(2, { lastAutogestionAssignedAt: 1_000 }),
  ]);
  assert.deepEqual(
    queue.map((o) => o.agentId),
    [1, 2],
  );
});
