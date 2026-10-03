import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "../src/db";
import { automationParents } from "../src/db/schema";
import {
  listAutomationParentsPage,
  listRecentAutomationParents,
  upsertAutomationParentStatus,
  upsertAutomationParents,
} from "../src/lib/workflow/parent-history";

/**
 * Verificación unitaria de la paginación/búsqueda del historial de padres.
 * Ejecución: npx tsx tests/workflow-parent-history.test.mjs
 */

const failures = [];
const check = (name, condition) => {
  if (condition) {
    console.log(`ok ${name}`);
  } else {
    failures.push(`FAIL ${name}`);
  }
};

const PREFIX = "ZZTEST";
const accentId = 999999906;
const ids = [999999901, 999999902, 999999903, 999999904, 999999905];
// Muy por encima de cualquier dato real de InvGate para que el orden por
// updatedAt sea determinista en `listRecentAutomationParents`.
const base = 9_000_000_000;

const rows = ids.map((id, index) => ({
  id,
  prettyId: `#${id}`,
  branchCode: `${PREFIX}${index + 1}`,
  branchName: `${PREFIX} Sucursal ${index + 1}`,
  displayName: `Automatización ${PREFIX} ${index + 1}`,
  statusId: index < 3 ? 2 : 6,
  isActive: index < 3,
  createdAt: base + index,
  updatedAt: base + index,
  closedAt: index < 3 ? null : base + index,
}));

function cleanup() {
  try {
    db.delete(automationParents)
      .where(inArray(automationParents.automationId, ids))
      .run();
  } catch {
    /* noop */
  }
}

cleanup();

try {
  upsertAutomationParents(rows);

  const page1 = listAutomationParentsPage({ q: PREFIX, page: 1, pageSize: 2 });
  check("total de la búsqueda", page1.total === 5);
  check("totalPages", page1.totalPages === 3);
  check("page1 trae pageSize", page1.items.length === 2);
  check(
    "orden por createdAt desc",
    page1.items[0].id === ids[4] && page1.items[1].id === ids[3],
  );

  const page2 = listAutomationParentsPage({ q: PREFIX, page: 2, pageSize: 2 });
  check("page2 offset", page2.items[0].id === ids[2]);

  const active = listAutomationParentsPage({
    q: PREFIX,
    status: "active",
    pageSize: 10,
  });
  check("filtro active", active.total === 3);
  check(
    "active solo activos",
    active.items.every((item) => item.isActive),
  );

  const finalized = listAutomationParentsPage({
    q: PREFIX,
    status: "finalized",
    pageSize: 10,
  });
  check("filtro finalized", finalized.total === 2);
  check(
    "finalized sin activos",
    finalized.items.every((item) => !item.isActive),
  );

  const clamped = listAutomationParentsPage({ q: PREFIX, page: 99, pageSize: 2 });
  check("page fuera de rango se clampea", clamped.page === 3);

  const recent = listRecentAutomationParents(2);
  check(
    "recent ordena por updatedAt desc",
    recent.length === 2 &&
      recent[0].id === ids[4] &&
      recent[1].id === ids[3],
  );

  // Write-back de estado: un activo pasa a finalizado y el filtro lo refleja.
  upsertAutomationParentStatus(ids[0], {
    statusId: 6,
    updatedAt: base + 100,
    closedAt: base + 100,
  });
  const activeAfter = listAutomationParentsPage({
    q: PREFIX,
    status: "active",
    pageSize: 10,
  });
  check("write-back cambia la clasificación", activeAfter.total === 2);

  // Búsqueda insensible a acentos/ñ: "nandu acentico" -> "Ñandú Acéntico".
  ids.push(accentId);
  upsertAutomationParents([
    {
      id: accentId,
      prettyId: `#${accentId}`,
      branchCode: "ZZTESTACC",
      branchName: "Ñandú Acéntico",
      displayName: "Automatización ZZTEST Ñandú Acéntico",
      statusId: 2,
      isActive: true,
      createdAt: base + 50,
      updatedAt: base + 50,
      closedAt: null,
    },
  ]);
  const accent = listAutomationParentsPage({ q: "nandu acentico" });
  check(
    "búsqueda insensible a acentos",
    accent.total === 1 && accent.items[0].id === accentId,
  );
  const accentByCode = listAutomationParentsPage({ q: "zztestacc" });
  check("búsqueda por código con prefijo", accentByCode.total === 1);
} finally {
  cleanup();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("workflow-parent-history: all checks passed");
