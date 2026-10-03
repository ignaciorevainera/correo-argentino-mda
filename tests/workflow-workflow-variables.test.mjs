import {
  parseWorkflowVariables,
  buildAutomationBoard,
  deriveServerInfo,
} from "../src/lib/workflow/workflow-variables";

/**
 * Tablero Status Proyecto desde `current_variables_values` de /wf.request.
 * Fixture con los valores reales de Luis Guillón #79867 (2026-10).
 * Ejecución: node --import tsx tests/workflow-workflow-variables.test.mjs
 */

const failures = [];
function check(name, condition) {
  if (!condition) {
    failures.push(`FAIL: ${name}`);
  } else {
    console.log(`ok - ${name}`);
  }
}

const request = {
  current_variables_values: [
    {
      name: "Título del proceso",
      value: "AUTSUC Luis Guillón (B0106)  2026-09-25",
    },
    { name: "sucursalAmigable", value: "Luis Guillón" },
    { name: "NIS", value: "B0106" },
    { name: "Rango IPS", value: "10.245.221.0" },
    { name: "IDticketServerMOA", value: "79883" },
    { name: "IDticketHH", value: "79884" },
    { name: "IDticketEquipamiento", value: "79882" },
    { name: "IDticketServiciosMF", value: "79887" },
    { name: "IDticketTECOinstalaciones", value: "79881" },
    { name: "idTicketVisitaTecnico", value: "79886" },
    { name: "IDticketRecambio", value: "79885" },
    {
      name: "EstadoServerMOA",
      value: "Entregado en sitio",
      value_label: "Entregado en sitio",
    },
    {
      name: "EstadoHH",
      value: "Entregado en Sitio",
      value_label: "Entregado en Sitio",
    },
    { name: "EstadoOtroHW", value: "En proceso", value_label: "En proceso" },
    {
      name: "EstadoTecoInstalaciones",
      value: "Finalizado",
      value_label: "Finalizado",
    },
    {
      name: "EstadoServiciosM&F",
      value: "En proceso",
      value_label: "En proceso",
    },
    { name: "EstadoCAI", value: "No", value_label: "No" },
    { name: "EstadoPuntoDeVenta", value: "Si", value_label: "Si" },
    { name: "EstadoBUI", value: "Si", value_label: "Si" },
    { name: "TableroGoNoGo", value: "31DC109D", value_label: "Avanzar" },
    { name: "IPsAdicionales", value: "10.245.221.231" },
    { name: "HostnamesAdicional", value: "B0106W101" },
    { name: "PuntoDeVenta", value: "9768" },
    {
      name: "CarpetaBUI",
      value:
        "\\\\10.1.12.178\\escaneo_fact_bue\\METRO\\B0106_9768_LUIS_GUILLON",
    },
    { name: "Acceso VDIs a Rango IPs", value: "True" },
    { name: "Fecha de Apertura", value: "1790294400" },
    { name: "ServiciosM&Flist", value: "", value_label: "" },
  ],
};

const variables = parseWorkflowVariables(request);
check("parsea las variables con valor", variables.size >= 20);

const board = buildAutomationBoard(variables);
check("construye el tablero", board !== null);

const byKey = new Map((board?.indicators ?? []).map((i) => [i.key, i]));
check("servidor entregado (verde)", byKey.get("server")?.tone === "success");
check(
  "handheld entregado (verde)",
  byKey.get("hh")?.value === "Entregado en Sitio",
);
check(
  "equipamiento otro en proceso (amarillo)",
  byKey.get("otherHw")?.tone === "warning",
);
check(
  "red y cableado finalizado (verde)",
  byKey.get("network")?.tone === "success",
);
check(
  "servicios M&F por nombre con entidad html",
  byKey.get("mf")?.value === "En proceso",
);
check("CAI 'No' (amarillo)", byKey.get("cai")?.tone === "warning");
check("punto de venta 'Si' (verde)", byKey.get("pdv")?.tone === "success");
check("carpeta BUI 'Si' (verde)", byKey.get("bui")?.tone === "success");
check(
  "acción a tomar usa value_label 'Avanzar'",
  byKey.get("action")?.value === "Avanzar" &&
    byKey.get("action")?.tone === "success",
);

const linkLabels = (board?.links ?? []).map((l) => l.label);
check(
  "links a los 7 tickets hijos",
  [
    "Servidor MOA",
    "HandHeld",
    "Equipamiento",
    "Servicios M&F",
    "TECO Instalaciones",
    "Visita técnico",
    "Recambio",
  ].every((label) => linkLabels.includes(label)),
);

const techByLabel = new Map((board?.tech ?? []).map((t) => [t.label, t.value]));
check("rango IP", techByLabel.get("Rango IP") === "10.245.221.0");
check(
  "hostnames ya no es campo técnico (pasa al nodo)",
  !techByLabel.has("Hostnames"),
);
check(
  "acceso VDIs ya no es campo técnico (pasa al nodo)",
  !techByLabel.has("Acceso VDIs al rango"),
);
check("punto de venta", techByLabel.get("Punto de venta") === "9768");
check(
  "fecha de apertura formateada",
  typeof techByLabel.get("Fecha de apertura") === "string" &&
    techByLabel.get("Fecha de apertura").includes("2026"),
);

// Un flag booleano no debe "ganarle" a la variable real por substring.
const booleanOnly = buildAutomationBoard(
  parseWorkflowVariables({
    current_variables_values: [
      { name: "booleanHostnamesAdicionales", value: "Activado" },
    ],
  }),
);
const booleanTech = new Map(
  (booleanOnly?.tech ?? []).map((t) => [t.label, t.value]),
);
check("boolean no genera la fila Hostnames", !booleanTech.has("Hostnames"));

check(
  "deriveServerInfo deriva ip y nombre",
  (() => {
    const s = deriveServerInfo(
      new Map([
        ["rangoips", "10.246.16.0"],
        ["nis", "B1046"],
      ]),
    );
    return s?.ip === "10.246.16.231" && s?.name === "B1046308";
  })(),
);
check(
  "deriveServerInfo null sin rango",
  deriveServerInfo(new Map([["nis", "B1046"]])) === null,
);

check("sin variables no hay tablero", buildAutomationBoard(new Map()) === null);
check("request nulo no rompe", parseWorkflowVariables(null).size === 0);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("workflow-workflow-variables: all checks passed");
