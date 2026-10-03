import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { users } from "./auth";
import { offices } from "./oficinas";

export const cubics = sqliteTable("cubics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  ip: text("ip"),
  status: text("status").notNull().default("offline"),
  lastPing: text("last_ping"),
});

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  username: text("username"),
  userId: integer("user_id")
    .unique()
    .references(() => users.id, { onDelete: "set null" }),
  avatarInitials: text("avatar_initials"),
  notes: text("notes"),
  location: text("location").notNull().default("Monte Grande"),
  horarioDefault: text("horario_default").notNull().default(""),
  esquemaSemanal: text("esquema_semanal", { mode: "json" }).$type<
    Record<string, string>
  >(),
  esquemaHorario: text("esquema_horario", { mode: "json" }).$type<
    Record<string, string>
  >(),
  esquemaBreakInicio: text("esquema_break_inicio", { mode: "json" }).$type<
    Record<string, string>
  >(),
  esquemaBreakFin: text("esquema_break_fin", { mode: "json" }).$type<
    Record<string, string>
  >(),
  maxConsecutiveHO: integer("max_consecutive_ho"),
  minPWeek: integer("min_p_week"),
  lastAutogestionAssignedAt: integer("last_autogestion_assigned_at"),
  lastAutogestionAssignedBy: text("last_autogestion_assigned_by"),
  lastAutogestionUndo: integer("last_autogestion_undo"),
  estadoExcepcional: text("estado_excepcional"),
  estadoExcepcionalMotivo: text("estado_excepcional_motivo"),
  estadoExcepcionalAt: integer("estado_excepcional_at"),
  estadoExcepcionalMinutos: integer("estado_excepcional_minutos"),
  saturdayGroup: text("saturday_group"),
  saturdayHorario: text("saturday_horario"),
  enCronograma: integer("en_cronograma", { mode: "boolean" })
    .notNull()
    .default(false),
  // Control de asistencia. Invariante: enAsistencia ⊆ enCronograma (un
  // operador no puede tener asistencia sin figurar en cronograma, porque
  // asistencia controla el cumplimiento de los horarios del cronograma).
  enAsistencia: integer("en_asistencia", { mode: "boolean" })
    .notNull()
    .default(false),
  asignableCubic: integer("asignable_cubic", { mode: "boolean" })
    .notNull()
    .default(false),
  incluidoCalidad: integer("incluido_calidad", { mode: "boolean" })
    .notNull()
    .default(false),
  asignableAgs: integer("asignable_ags", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const cubicAssignments = sqliteTable(
  "cubic_assignments",
  {
    cubicId: integer("cubic_id")
      .notNull()
      .references(() => cubics.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    shift: text("shift").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.cubicId, table.agentId, table.shift] }),
  }),
);

export const terminals = sqliteTable(
  "terminals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostname: text("hostname").notNull().unique(),
    macAddress: text("mac_address"),
    ipAddress: text("ip_address"),
    operatingSystem: text("operating_system"),
    osArchitecture: text("os_architecture"),
    ram: text("ram"),
    serialNumber: text("serial_number"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    nis: text("nis").references(() => offices.code),
    nis2: text("nis2"),
    lastContact: text("last_contact"),
    syncedAt: text("synced_at"),
    searchableText: text("searchable_text"),
  },
  (table) => ({
    nisIdx: index("terminals_nis_idx").on(table.nis),
  }),
);
