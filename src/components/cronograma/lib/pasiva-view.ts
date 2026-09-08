import { state } from "./state";
import { showToast } from "./notifications";
import { updateViewSwitcherUI } from "./dashboard-client";
import { updatePasivaActiveMonthBadge } from "./monthly-view";

let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

export function hasPasivaChanges(): boolean {
  for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
    if (
      week.referenteId !== week.originalReferenteId ||
      week.operatorId !== week.originalOperatorId ||
      week.supervisorName !== week.originalSupervisorName
    ) {
      return true;
    }
  }
  return false;
}

export function updatePasivaToolbarUI(): void {
  const editToolbar = document.getElementById("pasiva-edit-toolbar");
  if (editToolbar) {
    editToolbar.classList.add(
      "opacity-0",
      "pointer-events-none",
      "translate-y-32",
    );
  }
}

export function triggerPasivaAutoSave(): void {
  updatePasivaToolbarUI();
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(async () => {
    await autoSavePasivaChanges();
  }, 300);
}

export async function autoSavePasivaChanges(): Promise<void> {
  const dateInput = document.getElementById(
    "date-input",
  ) as HTMLInputElement | null;
  const month = dateInput?.value
    ? dateInput.value.slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  const weeks = Object.values(state.pasivaState.weeklyAssignments).map((w) => ({
    startDate: w.startDate,
    endDate: w.endDate,
    supervisorName: w.supervisorName,
    referenteId: w.referenteId,
    operatorId: w.operatorId,
  }));

  const payload = {
    month,
    weeklyAssignments: weeks,
  };

  try {
    const res = await fetch("/api/cronograma/guardia-pasiva", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Error al guardar cambios de guardia pasiva");
    }

    for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
      week.originalReferenteId = week.referenteId;
      week.originalOperatorId = week.operatorId;
      week.originalSupervisorName = week.supervisorName;
    }

    updatePasivaToolbarUI();
    showToast("Guardia pasiva guardada", "success");
  } catch (err) {
    console.error(err);
    showToast("Error al guardar cambios de guardia pasiva", "error");
  }
}

export async function savePasivaChanges(btn: HTMLButtonElement): Promise<void> {
  const dateInput = document.getElementById(
    "date-input",
  ) as HTMLInputElement | null;
  const month = dateInput?.value
    ? dateInput.value.slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  btn.disabled = true;
  btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span>`;

  const weeks = Object.values(state.pasivaState.weeklyAssignments).map((w) => ({
    startDate: w.startDate,
    endDate: w.endDate,
    supervisorName: w.supervisorName,
    referenteId: w.referenteId,
    operatorId: w.operatorId,
  }));

  const payload = {
    month,
    weeklyAssignments: weeks,
  };

  try {
    const res = await fetch("/api/cronograma/guardia-pasiva", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Error al guardar cambios de guardia pasiva");
    }

    for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
      week.originalReferenteId = week.referenteId;
      week.originalOperatorId = week.operatorId;
      week.originalSupervisorName = week.supervisorName;
    }

    updatePasivaToolbarUI();

    btn.innerText = "Guardado!";
    setTimeout(() => {
      btn.innerText = "Guardar";
      btn.disabled = false;
    }, 2000);
    showToast("Guardia pasiva guardada con éxito", "success");

    await renderPasivaView();
  } catch (err) {
    console.error(err);
    btn.innerText = "Error";
    btn.classList.add("btn-error");
    setTimeout(() => {
      btn.innerText = "Guardar";
      btn.classList.remove("btn-error");
      btn.disabled = false;
    }, 2000);
    const discardBtn = document.getElementById(
      "pasiva-discard-btn",
    ) as HTMLButtonElement | null;
    if (discardBtn) discardBtn.disabled = false;
    showToast("Error al guardar cambios de guardia pasiva", "error");
  }
}

export function discardPasivaChanges(): void {
  for (const week of Object.values(state.pasivaState.weeklyAssignments)) {
    week.referenteId = week.originalReferenteId;
    week.operatorId = week.originalOperatorId;
    week.supervisorName = week.originalSupervisorName;
  }

  populatePasivaWeekInputs();
  updatePasivaToolbarUI();
  showToast("Cambios descartados", "info");
}

export function showPasivaView(): void {
  const dailyView = document.getElementById("daily-view");
  const monthlyView = document.getElementById("monthly-view");
  const groupsView = document.getElementById("groups-view");
  const overtimeView = document.getElementById("overtime-view");
  const pasivaView = document.getElementById("pasiva-view");
  const datePickerContainer = document.getElementById("date-picker-container");

  updateViewSwitcherUI("pasiva");
  updatePasivaActiveMonthBadge();

  if (dailyView) dailyView.classList.add("hidden");
  if (monthlyView) monthlyView.classList.add("hidden");
  if (groupsView) groupsView.classList.add("hidden");
  if (overtimeView) overtimeView.classList.add("hidden");
  if (pasivaView) pasivaView.classList.remove("hidden");

  if (datePickerContainer) datePickerContainer.classList.add("hidden");

  renderPasivaView();
}

export async function renderPasivaView(): Promise<void> {
  const dateInput = document.getElementById(
    "date-input",
  ) as HTMLInputElement | null;
  const month = dateInput?.value
    ? dateInput.value.slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  try {
    const res = await fetch(`/api/cronograma/guardia-pasiva?month=${month}`);
    if (!res.ok)
      throw new Error("No se pudo cargar la información de guardia pasiva");
    const data = await res.json();

    state.pasivaState.operatorId = data.operatorId;
    state.pasivaState.originalOperatorId = data.operatorId;
    state.pasivaState.supervisors = data.supervisors || [];
    state.pasivaState.referentes = data.referentes || [];

    state.pasivaState.weeklyAssignments = {};
    if (data.weeks) {
      data.weeks.forEach((w: any) => {
        const effectiveOperatorId = w.operatorId ?? data.operatorId ?? null;
        state.pasivaState.weeklyAssignments[w.startDate] = {
          startDate: w.startDate,
          endDate: w.endDate,
          supervisorName: w.supervisorName,
          referenteId: w.referenteId,
          operatorId: effectiveOperatorId,
          originalSupervisorName: w.supervisorName,
          originalReferenteId: w.referenteId,
          originalOperatorId: effectiveOperatorId,
        };
      });
    }

    populatePasivaWeekInputs();
    updatePasivaToolbarUI();
  } catch (err) {
    console.error("Error loading pasiva data:", err);
    showToast("Error al cargar datos de guardia pasiva", "error");
  }
}

export function populatePasivaWeekInputs(): void {
  const tbody = document.getElementById("pasiva-weeks-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const sortedWeeks = Object.values(state.pasivaState.weeklyAssignments).sort(
    (a, b) => a.startDate.localeCompare(b.startDate),
  );

  sortedWeeks.forEach((w) => {
    const tr = document.createElement("tr");
    tr.className =
      "group hover:bg-base-200/40 transition-colors duration-150 rounded-xl";

    const d1 = w.startDate.split("-")[2];
    const m1 = w.startDate.split("-")[1];
    const d2 = w.endDate.split("-")[2];
    const m2 = w.endDate.split("-")[1];
    const label = `${d1}/${m1} a ${d2}/${m2}`;

    const tdLabel = document.createElement("td");
    tdLabel.className =
      "py-3 pl-4 font-bold text-xs tabular-nums text-base-content/80";
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);

    const container = document.getElementById("cronograma-app-container");
    const userRole = container?.dataset.userRole || "agent";
    const isReadOnly = ["agent", "referent"].includes(userRole);

    // 1. Supervisor
    const tdSupervisor = document.createElement("td");
    tdSupervisor.className = "py-2 pr-4";
    if (isReadOnly) {
      const supervisorText = document.createElement("span");
      supervisorText.className =
        "select-none text-xs font-bold text-base-content/85 px-3 py-2 bg-base-200/50 rounded-xl border border-base-300 min-h-9 flex items-center w-full";
      supervisorText.textContent = w.supervisorName || "SIN ASIGNAR";
      tdSupervisor.appendChild(supervisorText);
    } else {
      const supervisorSelect = document.createElement("select");
      supervisorSelect.className =
        "select select-bordered select-sm font-bold text-xs h-9 w-full rounded-xl bg-base-100 focus:outline-none focus:border-secondary";

      state.pasivaState.supervisors.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        supervisorSelect.appendChild(opt);
      });

      if (
        w.supervisorName &&
        !state.pasivaState.supervisors.includes(w.supervisorName)
      ) {
        const opt = document.createElement("option");
        opt.value = w.supervisorName;
        opt.textContent = w.supervisorName;
        supervisorSelect.appendChild(opt);
      }

      supervisorSelect.value = w.supervisorName || "";
      supervisorSelect.addEventListener("change", () => {
        w.supervisorName = supervisorSelect.value;
        triggerPasivaAutoSave();
      });
      tdSupervisor.appendChild(supervisorSelect);
    }
    tr.appendChild(tdSupervisor);

    // 2. Referente
    const tdReferente = document.createElement("td");
    tdReferente.className = "py-2 pr-4";
    if (isReadOnly) {
      const referenteText = document.createElement("span");
      referenteText.className =
        "select-none text-xs font-bold text-base-content/85 px-3 py-2 bg-base-200/50 rounded-xl border border-base-300 min-h-9 flex items-center w-full";
      const selectedOp =
        state.cronoData.find((op) => op.id === w.referenteId) ||
        state.pasivaState.referentes.find((r) => r.id === w.referenteId);
      referenteText.textContent = selectedOp
        ? "nombre" in selectedOp
          ? selectedOp.nombre
          : selectedOp.name
        : "SIN REFERENTE";
      tdReferente.appendChild(referenteText);
    } else {
      const referenteSelect = document.createElement("select");
      referenteSelect.className =
        "select select-bordered select-sm font-bold text-xs h-9 w-full rounded-xl bg-base-100 focus:outline-none focus:border-secondary";

      const referenteOptions =
        state.pasivaState.referentes.length > 0
          ? state.pasivaState.referentes
          : state.cronoData.map((op) => ({ id: op.id!, name: op.nombre }));

      referenteSelect.innerHTML = '<option value="">SIN REFERENTE</option>';
      referenteOptions.forEach((ref) => {
        const opt = document.createElement("option");
        opt.value = String(ref.id ?? "");
        opt.textContent = ref.name;
        referenteSelect.appendChild(opt);
      });

      if (
        w.referenteId &&
        !referenteOptions.some((r) => r.id === w.referenteId)
      ) {
        const existingOp = state.cronoData.find(
          (op) => op.id === w.referenteId,
        );
        if (existingOp) {
          const opt = document.createElement("option");
          opt.value = String(existingOp.id);
          opt.textContent = existingOp.nombre;
          referenteSelect.appendChild(opt);
        }
      }

      referenteSelect.value = w.referenteId ? String(w.referenteId) : "";
      referenteSelect.addEventListener("change", () => {
        w.referenteId = referenteSelect.value
          ? parseInt(referenteSelect.value, 10)
          : null;
        triggerPasivaAutoSave();
      });
      tdReferente.appendChild(referenteSelect);
    }
    tr.appendChild(tdReferente);

    // 3. Operador de la semana
    const tdOperator = document.createElement("td");
    tdOperator.className = "py-2 pr-4";
    if (isReadOnly) {
      const operatorText = document.createElement("span");
      operatorText.className =
        "select-none text-xs font-bold text-base-content/85 px-3 py-2 bg-base-200/50 rounded-xl border border-base-300 min-h-9 flex items-center w-full";
      const selectedOp = state.cronoData.find((op) => op.id === w.operatorId);
      operatorText.textContent = selectedOp
        ? selectedOp.nombre
        : "SIN OPERADOR";
      tdOperator.appendChild(operatorText);
    } else {
      const operatorSelect = document.createElement("select");
      operatorSelect.className =
        "select select-bordered select-sm font-bold text-xs h-9 w-full rounded-xl bg-base-100 focus:outline-none focus:border-secondary";

      operatorSelect.innerHTML = '<option value="">SIN OPERADOR</option>';
      state.cronoData.forEach((op) => {
        const opt = document.createElement("option");
        opt.value = String(op.id ?? "");
        opt.textContent = op.nombre;
        operatorSelect.appendChild(opt);
      });
      operatorSelect.value = w.operatorId ? String(w.operatorId) : "";
      operatorSelect.addEventListener("change", () => {
        w.operatorId = operatorSelect.value
          ? parseInt(operatorSelect.value, 10)
          : null;
        triggerPasivaAutoSave();
      });
      tdOperator.appendChild(operatorSelect);
    }
    tr.appendChild(tdOperator);

    tbody.appendChild(tr);
  });
}

export function setupPasivaEventListeners(): void {
  document
    .getElementById("switch-to-pasiva-btn")
    ?.addEventListener("click", () => {
      showPasivaView();
    });

  document
    .getElementById("pasiva-discard-btn")
    ?.addEventListener("click", () => {
      discardPasivaChanges();
    });

  document
    .getElementById("pasiva-save-btn")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      await savePasivaChanges(btn);
    });
}
