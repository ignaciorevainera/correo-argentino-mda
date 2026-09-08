import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// ── DeleteCategoryModal ──
{
  const src = await read("src/components/ui/DeleteCategoryModal.astro");
  assert.match(src, /variant="error"/, "DeleteCategory: cancelar variant=error");
  assert.match(src, /icon="boxicons:x-filled"/, "DeleteCategory: cancelar x-filled");
  assert.match(src, /boxicons:trash-filled/, "DeleteCategory: confirmar trash-filled");
  assert.doesNotMatch(src, /boxicons:trash"/, "DeleteCategory: sin trash no-filled");
  assert.match(src, /gap-3 sm:flex-row/, "DeleteCategory: gap-3 como FormShell");
  assert.doesNotMatch(src, /sm:ml-2/, "DeleteCategory: sin margen extra entre botones");
  assert.ok(
    src.indexOf("ActionCancelButton") < src.indexOf("ActionConfirmButton"),
    "DeleteCategory: Cancelar antes de Confirmar",
  );
}

// ── feedbackModal ──
{
  const src = await read("src/components/ui/modals/feedbackModal.astro");
  assert.match(src, /variant="error"/, "feedback: cancelar variant=error");
  assert.doesNotMatch(src, /name="boxicons:x"/, "feedback: X de cierre filled");
  assert.doesNotMatch(src, /name="boxicons:mail-open"/, "feedback: mail-open filled");
  assert.doesNotMatch(src, /name="boxicons:bug"/, "feedback: bug filled");
  assert.doesNotMatch(src, /name="boxicons:light-bulb-on"/, "feedback: light-bulb filled");
  assert.match(src, /boxicons:send-filled/, "feedback: submits con send-filled");
  assert.doesNotMatch(src, /class="rounded-md"/, "feedback: sin rounded-md custom");
  assert.match(src, /FormField\s+id="bug-asunto"/, "feedback: bug-asunto con FormField");
  assert.match(src, /SelectField\s+id="bug-categoria"/, "feedback: bug-categoria con SelectField");
}

// ── EditUserModal ──
{
  const src = await read("src/components/buscador-usuarios/EditUserModal.astro");
  assert.match(src, /boxicons:pencil-filled/, "EditUser: título filled");
  assert.doesNotMatch(src, /boxicons:pencil"/, "EditUser: sin pencil no-filled");
  assert.match(src, /variant="error"/, "EditUser: cancelar variant=error");
  assert.match(src, /icon="boxicons:x-filled"/, "EditUser: cancelar x-filled");
  assert.ok(src.includes('id="close-edit-modal-btn"'), "EditUser: id cancelar preservado");
  assert.ok(src.includes('id="save-edit-btn"'), "EditUser: id guardar preservado");
  assert.match(src, /ActionConfirmButton/, "EditUser: guardar con ActionConfirmButton");
  assert.match(src, /icon="boxicons:save-filled"/, "EditUser: guardar save-filled");
  assert.match(src, /modal-action mt-6 flex items-center justify-end gap-3/, "EditUser: barra abajo-derecha gap-3");
  assert.doesNotMatch(src, /save-btn-spinner/, "EditUser: sin spinner fijo (JS inyectado)");
}

// ── OperatorFormModal ──
{
  const src = await read("src/components/cronograma/subcomponents/OperatorFormModal.astro");
  assert.match(src, /boxicons:user-plus-filled/, "OperatorForm: user-plus filled");
  assert.doesNotMatch(src, /boxicons:user-plus"/, "OperatorForm: sin user-plus no-filled");
  assert.doesNotMatch(src, /boxicons:edit-alt"/, "OperatorForm: edit-alt filled");
  assert.match(src, /variant="error"/, "OperatorForm: cancelar variant=error");
  assert.match(src, /icon="boxicons:x-filled"/, "OperatorForm: cancelar x-filled");
  for (const id of ["cancel-new-op", "confirm-new-op", "cancel-edit-op", "confirm-edit-op"]) {
    assert.ok(src.includes(id), `OperatorForm: id ${id} preservado`);
  }
  assert.doesNotMatch(src, /<form method="dialog">/, "OperatorForm: sin form dialog vestigial");
}

// ── RulesSettingsModal ──
{
  const src = await read("src/components/cronograma/subcomponents/RulesSettingsModal.astro");
  assert.match(src, /variant="error"/, "Rules: cancelar variant=error");
  assert.match(src, /icon="boxicons:x-filled"/, "Rules: cancelar x-filled");
  assert.match(src, /boxicons:save-filled/, "Rules: guardar save-filled");
  assert.ok(src.includes("save-rules-btn"), "Rules: id save-rules-btn preservado");
  assert.doesNotMatch(src, /<form method="dialog">/, "Rules: sin form dialog vestigial");
}

// ── AgentsTicketModal ──
{
  const src = await read("src/components/offices/AgentsTicketModal.astro");
  assert.match(src, /variant="error"/, "AgentsTicket: cancelar variant=error");
  assert.match(src, /icon="boxicons:x-filled"/, "AgentsTicket: cancelar x-filled");
  assert.ok(src.includes("confirm-agents-ticket-btn"), "AgentsTicket: id confirm 1 preservado");
  assert.ok(src.includes("confirm-create-ticket-btn"), "AgentsTicket: id confirm 2 preservado");
  assert.doesNotMatch(src, /<form method="dialog">/, "AgentsTicket: sin form dialog vestigial");
}

// ── UbicacionesContent ──
{
  const src = await read("src/components/admin/invgate/UbicacionesContent.astro");
  assert.match(src, /variant="error"/, "Ubicaciones: cancelar variant=error");
  assert.match(src, /icon="boxicons:x-filled"/, "Ubicaciones: cancelar x-filled");
  assert.ok(src.includes("create_office_form"), "Ubicaciones: form preservado");
  assert.match(
    src,
    /icon="boxicons:plus-filled"/,
    "Ubicaciones: confirmar con plus-filled",
  );
}

console.log("forms-standard-modals: all checks passed");
