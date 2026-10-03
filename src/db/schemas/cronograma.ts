import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { agents } from "./equipamiento";

// 8. TABLA DE SCHEDULES (Asistencia y modalidades de operadores)
export const schedules = sqliteTable(
  "schedules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: integer("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    date: text("date").notNull(),
    status: text("status").notNull(),
    comment: text("comment"),
    horario: text("horario"),
    entradaReal: text("entrada_real"),
    salidaReal: text("salida_real"),
    breakInicio: text("break_inicio"),
    breakFin: text("break_fin"),
    isOverride: integer("is_override", { mode: "boolean" }).default(false),
  },
  (table) => ({
    agentIdIdx: index("schedules_agent_id_idx").on(table.agentId),
    dateIdx: index("schedules_date_idx").on(table.date),
  }),
);

// 10. UBICACIONES DE TRABAJO (Normalización de sedes presenciales)
export const workLocations = sqliteTable("work_locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

// 15. CONTROL DE ASISTENCIA (Horarios reales y eventualidades)
export const operatorAttendance = sqliteTable(
  "operator_attendance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    asistencia: text("asistencia"),
    ausencia: text("ausencia"),
    entradaReal: text("entrada_real"),
    salidaReal: text("salida_real"),
    horarioEstipulado: text("horario_estipulado"),
    cumplimiento: text("cumplimiento"),
    cumplimientoForzado: integer("cumplimiento_forzado", {
      mode: "boolean",
    }).default(false),
    motivoLoguin: text("motivo_loguin"),
    detalle: text("detalle"),
    shiftType: text("shift_type").notNull().default("normal"),
  },
  (table) => ({
    agentDateIdx: index("operator_attendance_agent_date_idx").on(
      table.agentId,
      table.date,
      table.shiftType,
    ),
    dateIdx: index("operator_attendance_date_idx").on(table.date),
  }),
);

export const saturdayRotationConfig = sqliteTable("saturday_rotation_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull().unique(), // "YYYY-MM"
  rotationOrder: text("rotation_order").notNull().default("A,B,C,D"),
  startDate: text("start_date").notNull().default("2026-06-06"),
  startGroup: text("start_group").notNull().default("A"),
  disabledGroups: text("disabled_groups").notNull().default(""),
});

export const agentSaturdayGroups = sqliteTable(
  "agent_saturday_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // "YYYY-MM"
    saturdayGroup: text("saturday_group"),
    saturdayHorario: text("saturday_horario"),
  },
  (table) => ({
    agentMonthUniqueIdx: uniqueIndex("agent_month_unique_idx").on(
      table.agentId,
      table.month,
    ),
  }),
);

export const weekendOvertimeConfig = sqliteTable("weekend_overtime_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekendStartDate: text("weekend_start_date").notNull().unique(), // Sábado "YYYY-MM-DD"
  referente: text("referente").notNull(),
});

export const weekendOvertimeShifts = sqliteTable(
  "weekend_overtime_shifts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekendStartDate: text("weekend_start_date").notNull(), // Sábado "YYYY-MM-DD"
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // "YYYY-MM-DD" (Sábado o Domingo)
    startTime: text("start_time").notNull(), // "HH:MM"
    endTime: text("end_time").notNull(), // "HH:MM"
  },
  (table) => ({
    weekendStartIdx: index("overtime_shifts_weekend_start_idx").on(
      table.weekendStartDate,
    ),
    agentIdx: index("overtime_shifts_agent_idx").on(table.agentId),
  }),
);

export const holidays = sqliteTable("holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  name: text("name").notNull(),
});

// 17. GUARDIA PASIVA
export const monthlyGuardiaPasivaOperator = sqliteTable(
  "monthly_guardia_pasiva_operator",
  {
    month: text("month").primaryKey(), // Formato "YYYY-MM"
    operatorId: integer("operator_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
  },
);

export const weeklyGuardiaPasivaAssignments = sqliteTable(
  "weekly_guardia_pasiva_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startDate: text("start_date").notNull().unique(), // Lunes de la semana "YYYY-MM-DD"
    endDate: text("end_date").notNull(), // Domingo de la semana "YYYY-MM-DD"
    supervisorName: text("supervisor_name").notNull(), // Nombre de texto libre
    referenteId: integer("referente_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
    operatorId: integer("operator_id").references(() => agents.id, {
      onDelete: "cascade",
    }),
  },
);
