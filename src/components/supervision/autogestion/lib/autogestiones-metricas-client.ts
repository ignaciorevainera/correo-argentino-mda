import { getCleanBase } from "@lib/baseUrl";

const cleanBase = getCleanBase();

interface ChartInstances {
  modalidades: any;
  temporal: any;
  operadores: any;
  categorias: any;
  creadores: any;
}

const charts: ChartInstances = {
  modalidades: null,
  temporal: null,
  operadores: null,
  categorias: null,
  creadores: null,
};

let currentFilter = {
  preset: "ultimos_7_dias",
  from: "",
  to: "",
};

// Paleta armónica enfocada en Secondary institucional (#254888), sus gradaciones y acentos
const COLORS = {
  // Secondary institucional principal (Steel Azure)
  secondary: "rgba(37, 72, 136, 0.90)",
  // Variantes y análogos de Secondary
  secondaryDark: "rgba(23, 49, 97, 0.95)",
  secondaryMedium: "rgba(45, 87, 163, 0.85)",
  secondaryLight: "rgba(58, 110, 165, 0.85)", // Accent oficial (#3a6ea5)
  secondarySoft: "rgba(79, 134, 198, 0.80)",
  infoSlate: "rgba(40, 121, 168, 0.85)",      // Info oficial (#2879a8)
  tealAzure: "rgba(20, 125, 140, 0.85)",
  indigoAzure: "rgba(67, 56, 202, 0.85)",

  // Primary institucional reservado para destacados puntuales (School-bus yellow #ffc72c)
  primary: "rgba(255, 199, 44, 0.92)",
  primaryAmber: "rgba(226, 173, 31, 0.90)",  // Warning oficial (#e2ad1f)

  // Paleta armónica para gráficos circulares y multicategoría
  palette: [
    "rgba(37, 72, 136, 0.90)",  // Secondary Steel Azure
    "rgba(58, 110, 165, 0.85)", // Accent Azul
    "rgba(40, 121, 168, 0.85)",  // Info Slate
    "rgba(79, 134, 198, 0.80)", // Light Azure
    "rgba(255, 199, 44, 0.90)", // Primary Amarillo (acento puntual)
    "rgba(45, 87, 163, 0.85)",  // Medium Azure
    "rgba(20, 125, 140, 0.85)", // Teal Azure
    "rgba(100, 116, 139, 0.85)",// Neutral Charcoal
    "rgba(148, 163, 184, 0.85)",// Slate Muted
  ],
};

function getChartConstructor(): any {
  return (window as any).Chart;
}

function initWhenReady() {
  const Chart = getChartConstructor();
  if (!Chart) {
    setTimeout(initWhenReady, 100);
    return;
  }

  // Leer payload inicial
  const payloadEl = document.getElementById("initial-metrics-payload");
  if (payloadEl && payloadEl.textContent) {
    try {
      const initialData = JSON.parse(payloadEl.textContent);
      currentFilter.preset = initialData.range?.preset || "ultimos_7_dias";
      renderAll(initialData);
    } catch (err) {
      console.error("Error parsing initial metrics data:", err);
    }
  }

  setupEventListeners();
}

function renderAll(data: any) {
  updateKpis(data.kpis);
  updateCharts(data);
  updateTable(data.recentAssignments || []);
  updateTimestamp(data.lastSyncAt);
  updateExportLink();
}

function updateKpis(kpis: any) {
  if (!kpis) return;
  const totalEl = document.getElementById("kpi-total-asignadas");
  if (totalEl) totalEl.textContent = String(kpis.totalAsignadas ?? 0);

  const colaEl = document.getElementById("kpi-cola-pendiente");
  if (colaEl) colaEl.textContent = String(kpis.colaPendiente ?? 0);

  const autoEl = document.getElementById("kpi-tasa-automatizacion");
  if (autoEl) autoEl.textContent = `${kpis.tasaAutomatizacion ?? 0}%`;

  const opsEl = document.getElementById("kpi-operadores-activos");
  if (opsEl) opsEl.textContent = String(kpis.operadoresActivos ?? 0);
}

function updateCharts(data: any) {
  const Chart = getChartConstructor();
  if (!Chart) return;

  // 1. Gráfico de Modalidades (Doughnut)
  const ctxMod = (document.getElementById("chart-modalidades") as HTMLCanvasElement)?.getContext("2d");
  if (ctxMod) {
    if (charts.modalidades) charts.modalidades.destroy();
    const byType = data.byType || [];
    const labels = byType.length ? byType.map((t: any) => t.label) : ["Sin datos"];
    const counts = byType.length ? byType.map((t: any) => t.count) : [0];

    charts.modalidades = new Chart(ctxMod, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: counts,
            backgroundColor: COLORS.palette.slice(0, Math.max(labels.length, 1)),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, font: { size: 11, family: "Geist, sans-serif" } },
          },
        },
      },
    });
  }

  // 2. Gráfico de Volumen Temporal (Bar)
  const ctxTemp = (document.getElementById("chart-temporal") as HTMLCanvasElement)?.getContext("2d");
  if (ctxTemp) {
    if (charts.temporal) charts.temporal.destroy();
    const temporal = data.temporal || [];
    const labels = temporal.map((t: any) => t.label);
    const counts = temporal.map((t: any) => t.count);

    const hint = document.getElementById("temporal-grouping-hint");
    if (hint) {
      hint.textContent = `Agrupado por ${data.range?.grouping === "hour" ? "hora" : "día"}`;
    }

    charts.temporal = new Chart(ctxTemp, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Autogestiones Asignadas",
            data: counts,
            backgroundColor: COLORS.secondary,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, font: { size: 10 } },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          x: {
            ticks: { font: { size: 10 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  // 3. Gráfico de Carga por Operador (Horizontal Bar)
  const ctxOps = (document.getElementById("chart-operadores") as HTMLCanvasElement)?.getContext("2d");
  if (ctxOps) {
    if (charts.operadores) charts.operadores.destroy();
    const byOperator = (data.byOperator || []).slice(0, 15);
    const labels = byOperator.map((o: any) => o.agentName);
    const counts = byOperator.map((o: any) => o.count);

    charts.operadores = new Chart(ctxOps, {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["Sin asignaciones"],
        datasets: [
          {
            label: "Tickets Asignados",
            data: counts.length ? counts : [0],
            backgroundColor: COLORS.secondaryMedium,
            hoverBackgroundColor: COLORS.secondaryDark,
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0, font: { size: 10 } },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          y: {
            ticks: { font: { size: 10, family: "Geist, sans-serif" } },
            grid: { display: false },
          },
        },
      },
    });
  }

  // 4. Gráfico de Categorías en Cola InvGate (Doughnut)
  const ctxCat = (document.getElementById("chart-categorias") as HTMLCanvasElement)?.getContext("2d");
  if (ctxCat) {
    if (charts.categorias) charts.categorias.destroy();
    const byCat = data.queueStats?.byCategory || [];
    const labels = byCat.length ? byCat.map((c: any) => c.label) : ["Cola vacía"];
    const counts = byCat.length ? byCat.map((c: any) => c.count) : [0];

    charts.categorias = new Chart(ctxCat, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: counts,
            backgroundColor: COLORS.palette.slice(0, Math.max(labels.length, 1)),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 10, font: { size: 10, family: "Geist, sans-serif" } },
          },
        },
      },
    });
  }

  // 5. Gráfico de Top Creadores / Sucursales (Bar)
  const ctxCreators = (document.getElementById("chart-creadores") as HTMLCanvasElement)?.getContext("2d");
  if (ctxCreators) {
    if (charts.creadores) charts.creadores.destroy();
    const topCreators = data.queueStats?.topCreators || [];
    const labels = topCreators.map((c: any) => c.label);
    const counts = topCreators.map((c: any) => c.count);

    charts.creadores = new Chart(ctxCreators, {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["Sin tickets en cola"],
        datasets: [
          {
            label: "Tickets Pendientes",
            data: counts.length ? counts : [0],
            backgroundColor: COLORS.secondaryLight,
            hoverBackgroundColor: COLORS.secondary,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, font: { size: 10 } },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          x: {
            ticks: { font: { size: 10 } },
            grid: { display: false },
          },
        },
      },
    });
  }
}

function updateTable(assignments: any[]) {
  const tbody = document.getElementById("table-assignments-body");
  const countEl = document.getElementById("table-records-count");
  if (countEl) countEl.textContent = `${assignments.length} registros`;
  if (!tbody) return;

  if (assignments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-8 text-base-content/40 font-medium">
          No hay asignaciones registradas en el período seleccionado.
        </td>
      </tr>
    `;
    return;
  }

  const modalityConfig: Record<string, { label: string; badgeClass: string }> = {
    cyclic: {
      label: "Cíclica General",
      badgeClass: "badge-secondary text-secondary-content font-bold",
    },
    batch_suggested: {
      label: "Sugerida por Creador",
      badgeClass: "badge-secondary badge-outline font-bold",
    },
    batch_all: {
      label: "Masiva en Cola",
      badgeClass: "badge-info text-info-content font-bold",
    },
    manual: {
      label: "Manual Supervisor",
      badgeClass: "badge-primary text-primary-content font-bold",
    },
    revision: {
      label: "Revisión Pospuesta",
      badgeClass: "badge-neutral text-neutral-content font-bold",
    },
    undo: {
      label: "Deshecha / Anulada",
      badgeClass: "badge-error text-error-content font-bold",
    },
  };

  tbody.innerHTML = assignments
    .map((r) => {
      const modality = modalityConfig[r.type] || {
        label: r.type,
        badgeClass: "badge-ghost",
      };
      const formattedDate = new Date(r.assignedAt).toLocaleString([], {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      return `
        <tr class="hover:bg-base-200/40 transition-colors">
          <td class="font-mono font-bold">${r.ticketNumber || "—"}</td>
          <td class="font-semibold text-base-content">${r.agentName}</td>
          <td class="text-base-content/70">${r.assignedBy}</td>
          <td><span class="badge badge-sm py-2 px-2.5 text-tiny uppercase tracking-wider ${modality.badgeClass}">${modality.label}</span></td>
          <td class="text-right font-mono text-tiny text-base-content/60">${formattedDate}</td>
        </tr>
      `;
    })
    .join("");
}

function updateTimestamp(ts?: number) {
  const el = document.getElementById("sync-timestamp");
  if (!el) return;
  const date = ts ? new Date(ts) : new Date();
  el.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateExportLink() {
  const link = document.getElementById("btn-export-csv") as HTMLAnchorElement;
  if (!link) return;
  let url = `${cleanBase}api/autogestion/metricas/export.csv?preset=${currentFilter.preset}`;
  if (currentFilter.from) url += `&from=${currentFilter.from}`;
  if (currentFilter.to) url += `&to=${currentFilter.to}`;
  link.href = url;
}

async function fetchMetrics(params: { preset?: string; from?: string; to?: string }) {
  const refreshBtn = document.getElementById("btn-refresh-metrics");
  const refreshIcon = document.getElementById("icon-refresh");
  if (refreshBtn) refreshBtn.setAttribute("disabled", "true");
  if (refreshIcon) refreshIcon.classList.add("animate-spin");

  try {
    const query = new URLSearchParams();
    if (params.preset) query.set("preset", params.preset);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    query.set("mock", "1");

    const res = await fetch(`${cleanBase}api/autogestion/metricas?${query.toString()}`);
    if (!res.ok) throw new Error("Error al consultar métricas");
    const json = await res.json();
    if (json.success && json.data) {
      renderAll(json.data);
    }
  } catch (err) {
    console.error("Error al actualizar métricas:", err);
  } finally {
    if (refreshBtn) refreshBtn.removeAttribute("disabled");
    if (refreshIcon) refreshIcon.classList.remove("animate-spin");
  }
}

function setupEventListeners() {
  // Preset buttons
  const presetButtons = document.querySelectorAll("#presets-filter-bar button[data-preset]");
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.getAttribute("data-preset");
      if (!preset) return;

      presetButtons.forEach((b) => {
        b.classList.remove("btn-secondary", "text-secondary-content");
        b.classList.add("btn-ghost", "text-base-content/70");
      });
      btn.classList.remove("btn-ghost", "text-base-content/70");
      btn.classList.add("btn-secondary", "text-secondary-content");

      currentFilter.preset = preset;
      currentFilter.from = "";
      currentFilter.to = "";

      const fromInput = document.getElementById("filter-date-from") as HTMLInputElement;
      const toInput = document.getElementById("filter-date-to") as HTMLInputElement;
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";

      fetchMetrics({ preset });
    });
  });

  // Custom date range button
  const applyBtn = document.getElementById("btn-apply-custom-dates");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const fromInput = document.getElementById("filter-date-from") as HTMLInputElement;
      const toInput = document.getElementById("filter-date-to") as HTMLInputElement;
      if (!fromInput?.value || !toInput?.value) return;

      presetButtons.forEach((b) => {
        b.classList.remove("btn-secondary", "text-secondary-content");
        b.classList.add("btn-ghost", "text-base-content/70");
      });

      currentFilter.preset = "custom";
      currentFilter.from = fromInput.value;
      currentFilter.to = toInput.value;

      fetchMetrics({ preset: "custom", from: fromInput.value, to: toInput.value });
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById("btn-refresh-metrics");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchMetrics(currentFilter);
    });
  }
}

// Inicializar en DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWhenReady);
} else {
  initWhenReady();
}
