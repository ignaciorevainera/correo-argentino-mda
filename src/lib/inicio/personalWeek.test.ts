import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonalWeek,
  getWeekDates,
  type WeekAgent,
} from "./personalWeek";

// Semana fija lun 2026-10-19 → sáb 2026-10-24. Elegida para no depender del
// "hoy" real: la vista siempre muestra la semana en curso.
const WEEK = [
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
];

const agent: WeekAgent = {
  esquemaSemanal: {
    Lunes: "Home Office",
    Martes: "Presencial Monte Grande",
    Miercoles: "Presencial Parque Patricios",
    Jueves: "Licencia",
    Viernes: "Vacaciones",
    Sabado: "Franco",
  },
  esquemaHorario: {
    Lunes: "08:00 - 17:00",
    Martes: "09:00 - 18:00",
  },
  esquemaBreakInicio: { Lunes: "12:00" },
  esquemaBreakFin: { Lunes: "13:00" },
  horarioDefault: "08:00 - 17:00",
  saturdayGroup: "A",
  saturdayHorario: "07:00 - 13:00",
};

const rotationConfig = {
  rotationOrder: "A,B,C,D",
  startDate: "2026-06-06",
  startGroup: "A",
  disabledGroups: "",
};

const baseParams = {
  weekDates: WEEK,
  todayStr: "2026-10-20",
  agent,
  rows: [],
  holidays: {},
  rotationConfigByMonth: { "2026-10": rotationConfig },
  saturdayByMonth: {
    "2026-10": { group: "A", horario: "07:00 - 13:00" },
  },
};

test("getWeekDates devuelve lunes a sábado y una semana que empieza el lunes", () => {
  assert.deepEqual(getWeekDates(new Date("2026-10-20T12:00:00")), WEEK);
  // Un domingo pertenece a la semana que arrancó el lunes anterior.
  assert.equal(getWeekDates(new Date("2026-10-25T12:00:00"))[0], "2026-10-19");
});

test("mes sin generar: la semana sale del esquema semanal del agente", () => {
  const days = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: [],
  });

  assert.equal(days.length, 6);
  assert.equal(days[0].dayName, "Lunes");
  assert.equal(days[0].status, "Home Office");
  assert.equal(days[0].horario, "08:00 - 17:00");
  assert.equal(days[0].breakInicio, "12:00");
  assert.equal(days[0].breakFin, "13:00");

  assert.equal(days[1].status, "Presencial Monte Grande");
  assert.equal(days[1].horario, "09:00 - 18:00");

  // Sin horario propio en el esquema, cae al horario default.
  assert.equal(days[2].status, "Presencial Parque Patricios");
  assert.equal(days[2].horario, "08:00 - 17:00");
});

test("los días no laborables no muestran horario ni break", () => {
  const days = buildPersonalWeek({ ...baseParams, scheduledMonths: [] });
  const licencia = days[3];
  const vacaciones = days[4];

  assert.equal(licencia.status, "Licencia");
  assert.equal(licencia.horario, "");
  assert.equal(licencia.breakInicio, "");
  assert.equal(vacaciones.status, "Vacaciones");
  assert.equal(vacaciones.horario, "");
});

test("mes generado: la fila de schedules manda sobre el esquema semanal", () => {
  const days = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: ["2026-10"],
    rows: [
      {
        date: "2026-10-19",
        status: "Vacaciones",
        horario: "08:00 - 17:00",
        breakInicio: "12:00",
        breakFin: "13:00",
        isOverride: true,
      },
      {
        date: "2026-10-20",
        status: "Home Office",
        horario: "10:00 - 19:00",
        breakInicio: "13:00",
        breakFin: "14:00",
        isOverride: true,
      },
    ],
  });

  assert.equal(days[0].status, "Vacaciones");
  // Vacaciones limpia horario y break aunque la fila los traiga.
  assert.equal(days[0].horario, "");
  assert.equal(days[0].breakInicio, "");

  assert.equal(days[1].status, "Home Office");
  assert.equal(days[1].horario, "10:00 - 19:00");
  assert.equal(days[1].breakInicio, "13:00");
  assert.equal(days[1].breakFin, "14:00");

  // Día sin fila dentro de un mes generado: Franco, no el esquema.
  assert.equal(days[2].status, "Franco");
  assert.equal(days[2].horario, "");
});

test("sábado de rotación: Home Office con el horario del sábado", () => {
  const days = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: ["2026-10"],
    rows: [
      {
        date: "2026-10-24",
        status: "Franco",
        horario: "",
        breakInicio: "",
        breakFin: "",
        isOverride: false,
      },
    ],
  });

  const saturday = days[5];
  assert.equal(saturday.status, "Home Office");
  assert.equal(saturday.horario, "07:00 - 13:00");
  assert.equal(saturday.isSaturdayRotation, true);
});

test("un override del sábado gana sobre la rotación", () => {
  const days = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: ["2026-10"],
    rows: [
      {
        date: "2026-10-24",
        status: "Licencia",
        horario: "",
        breakInicio: "",
        breakFin: "",
        isOverride: true,
      },
    ],
  });

  assert.equal(days[5].status, "Licencia");
  assert.equal(days[5].isSaturdayRotation, false);
});

test("grupo deshabilitado o sin grupo: el sábado queda Franco", () => {
  const disabled = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: ["2026-10"],
    rotationConfigByMonth: {
      "2026-10": { ...rotationConfig, disabledGroups: "A" },
    },
  });
  assert.equal(disabled[5].status, "Franco");

  const sinGrupo = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: ["2026-10"],
    agent: { ...agent, saturdayGroup: null },
    saturdayByMonth: { "2026-10": { group: null, horario: null } },
  });
  assert.equal(sinGrupo[5].status, "Franco");
});

test("marca el día de hoy y el feriado de la semana", () => {
  const days = buildPersonalWeek({
    ...baseParams,
    scheduledMonths: [],
    holidays: { "2026-10-21": "Censo nacional" },
  });

  assert.equal(days[1].isToday, true);
  assert.equal(days[0].isToday, false);
  assert.equal(days[2].holiday, "Censo nacional");
  assert.equal(days[0].holiday, null);
});

test("una semana que cruza de mes resuelve cada mes por separado", () => {
  const crossWeek = [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ];
  const days = buildPersonalWeek({
    ...baseParams,
    weekDates: crossWeek,
    todayStr: "2026-09-30",
    // Solo octubre está generado: septiembre cae al esquema.
    scheduledMonths: ["2026-10"],
    rows: [
      {
        date: "2026-10-01",
        status: "Licencia",
        horario: "",
        breakInicio: "",
        breakFin: "",
        isOverride: true,
      },
    ],
  });

  // Septiembre: esquema semanal (lunes = Home Office).
  assert.equal(days[0].status, "Home Office");
  // Octubre: la fila generada manda (jueves = Licencia).
  assert.equal(days[3].status, "Licencia");
  assert.equal(days[3].isToday, false);
  // Y hoy (30/09) sí está marcado.
  assert.equal(days[2].isToday, true);
});
