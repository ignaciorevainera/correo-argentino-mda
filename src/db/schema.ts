import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { relations } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("agent"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expiresAt").notNull(),
});

export const offices = sqliteTable("offices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  provinceCode: text("provinceCode")
    .notNull()
    .references(() => provinces.code),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  email: text("email"),
  notes: text("notes"),
  street: text("street"),
  number: text("number"),
  locality: text("locality"),
  county: text("county"),
  zone: text("zone"),
  officeType: text("officeType"),
  categoryClass: text("categoryClass"),
  rubric: text("rubric"),
  parentNis: text("parentNis"),
  phone: text("phone"),
  manager: text("manager"),
  regionId: text("regionId"),
  enRed: integer("enRed", { mode: "boolean" }).default(false),
  paqarAdmision: integer("paqarAdmision", { mode: "boolean" }).default(false),
  paqarEntrega: integer("paqarEntrega", { mode: "boolean" }).default(false),
  payroll: integer("payroll", { mode: "boolean" }).default(false),
  taxExempt: integer("tax_exempt", { mode: "boolean" }).default(false),
  division: text("division"),
  company: text("company"),
  warehouse: text("warehouse"),
  profitCenter: text("profit_center"),
  cctAdminOffice: text("cct_admin_office"),
  ccCommercial: text("cc_commercial"),
  ccCommercialCorp: text("cc_commercial_corp"),
  ccElectoral: text("cc_electoral"),
  ccNetworkMgmt: text("cc_network_mgmt"),
  ccOperations: text("cc_operations"),
  ccOperational: text("cc_operational"),
  ccHr: text("cc_hr"),
  ccSecurity: text("cc_security"),
  ccAdmin: text("cc_admin"),
  ccAdmission: text("cc_admission"),
  ccCtp: text("cc_ctp"),
  ccCtt: text("cc_ctt"),
  ccTransport: text("cc_transport"),
  ccLogistics: text("cc_logistics"),
  posAutoAuto: text("pos_auto_auto"),
  posCurrentAccount: text("pos_current_account"),
  posManual: text("pos_manual"),
  posManualAuto: text("pos_manual_auto"),
  posPlantaMg: text("pos_planta_mg"),
  posVirtual: text("pos_virtual"),
  posAutoAuto2: text("pos_auto_auto_2"),
  posSapTerminal: text("pos_sap_terminal"),
  searchableText: text("searchable_text"),
}, (table) => ({
  nameIdx: index("name_idx").on(table.name),
  localityIdx: index("locality_idx").on(table.locality),
  provinceIdx: index("province_idx").on(table.provinceCode),
  typeIdx: index("type_idx").on(table.type),
}));

export const contactCategories = sqliteTable("contact_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  icon: text("icon").notNull(),
  tone: text("tone").notNull(),
});

export const providerContacts = sqliteTable("provider_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").references(() => contactCategories.id),
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  phones: text("phones", { mode: "json" }).$type<string[]>(),
  emails: text("emails", { mode: "json" }).$type<string[]>(),
  urls: text("urls", { mode: "json" }).$type<
    { label: string; url: string }[]
  >(),
  sortOrder: integer("sortOrder").default(0),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone"),
});

export const contactCategoriesRelations = relations(
  contactCategories,
  ({ many }) => ({
    contacts: many(providerContacts),
  }),
);

export const officeContacts = sqliteTable(
  "office_contacts",
  {
    officeId: integer("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),

    role: text("role"),
    timeSlot: text("time_slot"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.officeId, table.contactId] }),
  }),
);

export const officeAssets = sqliteTable("office_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  officeId: integer("office_id")
    .notNull()
    .references(() => offices.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  hostname: text("hostname"),
  ip: text("ip"),
});

export const officesRelations = relations(offices, ({ one, many }) => ({
  province: one(provinces, {
    fields: [offices.provinceCode],
    references: [provinces.code],
  }),
  contacts: many(officeContacts),
  assets: many(officeAssets),
  terminals: many(terminals),
}));

export const officeContactsRelations = relations(officeContacts, ({ one }) => ({
  office: one(offices, {
    fields: [officeContacts.officeId],
    references: [offices.id],
  }),
  contact: one(contacts, {
    fields: [officeContacts.contactId],
    references: [contacts.id],
  }),
}));

export const providerContactsRelations = relations(
  providerContacts,
  ({ one }) => ({
    category: one(contactCategories, {
      fields: [providerContacts.categoryId],
      references: [contactCategories.id],
    }),
  }),
);

export const contactsRelations = relations(contacts, ({ many }) => ({
  officeContacts: many(officeContacts),
}));

export const officeAssetsRelations = relations(officeAssets, ({ one }) => ({
  office: one(offices, {
    fields: [officeAssets.officeId],
    references: [offices.id],
  }),
}));

export const regions = sqliteTable("regions", {
  id: text("id").primaryKey(), // Ej: 'SUR'
  name: text("name").notNull(),
  color: text("color"), // Hex color for map legend, ej: '#003B71'
});

export const provinces = sqliteTable("provinces", {
  code: text("code", { length: 1 }).primaryKey(), // Ej: 'Q'
  name: text("name").notNull(),
  regionId: text("regionId").references(() => regions.id),
});

export const provincesRelations = relations(provinces, ({ one, many }) => ({
  region: one(regions, {
    fields: [provinces.regionId],
    references: [regions.id],
  }),
  offices: many(offices),
}));

export const regionsRelations = relations(regions, ({ many }) => ({
  provinces: many(provinces),
}));

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
  estadoExcepcional: text("estado_excepcional"),
  estadoExcepcionalMotivo: text("estado_excepcional_motivo"),
  estadoExcepcionalAt: integer("estado_excepcional_at"),
  estadoExcepcionalMinutos: integer("estado_excepcional_minutos"),
  saturdayGroup: text("saturday_group"),
  saturdayHorario: text("saturday_horario"),
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

export const cubicsRelations = relations(cubics, ({ many }) => ({
  assignments: many(cubicAssignments),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  assignments: many(cubicAssignments),
  audits: many(qualityAudits),
  attendance: many(operatorAttendance),
  weekendOvertimeShifts: many(weekendOvertimeShifts),
  agentSaturdayGroups: many(agentSaturdayGroups),
  monthlyGuardiaPasivaOperators: many(monthlyGuardiaPasivaOperator),
  weeklyGuardiaPasivaAssignments: many(weeklyGuardiaPasivaAssignments),
}));

export const cubicAssignmentsRelations = relations(
  cubicAssignments,
  ({ one }) => ({
    cubic: one(cubics, {
      fields: [cubicAssignments.cubicId],
      references: [cubics.id],
    }),
    agent: one(agents, {
      fields: [cubicAssignments.agentId],
      references: [agents.id],
    }),
  }),
);

// 8. TABLA DE SCHEDULES (Asistencia y modalidades de operadores)
export const schedules = sqliteTable("schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentName: text("agent_name").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  comment: text("comment"),
  horario: text("horario"),
  entradaReal: text("entrada_real"),
  salidaReal: text("salida_real"),
  breakInicio: text("break_inicio"),
  breakFin: text("break_fin"),
  isOverride: integer("is_override", { mode: "boolean" }).default(false),
});

// 9. RECURSOS Y ENLACES (Migración de JSON a BD)
export const resourceCategories = sqliteTable("resource_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  iconName: text("iconName").notNull(),
  tone: text("tone").notNull().default("primary"),
});

export const resourceLinks = sqliteTable("resource_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => resourceCategories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  subtitle: text("subtitle"),
  iconPath: text("icon_path"),
  sortOrder: integer("sortOrder").default(0),
  deprecated: integer("deprecated", { mode: "boolean" }).default(false),
});

export const resourceCategoriesRelations = relations(
  resourceCategories,
  ({ many }) => ({
    links: many(resourceLinks),
  }),
);

export const resourceLinksRelations = relations(resourceLinks, ({ one }) => ({
  category: one(resourceCategories, {
    fields: [resourceLinks.categoryId],
    references: [resourceCategories.id],
  }),
}));

// 10. UBICACIONES DE TRABAJO (Normalización de sedes presenciales)
export const workLocations = sqliteTable("work_locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

// 11. OPERADORES (Asignación de autogestiones)
export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("disponible"),
  locationId: text("location_id").references(() => workLocations.id),
  currentMode: text("current_mode").notNull().default("presencial"),
  lastAutogestionAssignedAt: integer("last_autogestion_assigned_at"),
});

export const operatorShifts = sqliteTable("operator_shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  operatorId: text("operator_id")
    .notNull()
    .references(() => operators.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'home' | 'presencial'
  shiftStart: text("shift_start").notNull(),
  shiftEnd: text("shift_end").notNull(),
  breakTime: text("break_time").notNull(),
});

export const operatorSchedules = sqliteTable("operator_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  operatorId: text("operator_id")
    .notNull()
    .references(() => operators.id, { onDelete: "cascade" }),
  dayOfWeek: text("day_of_week").notNull(),
  modality: text("modality").notNull(),
  shiftStart: text("shift_start"),
  shiftEnd: text("shift_end"),
  breakTime: text("break_time"),
});

export const workLocationsRelations = relations(workLocations, ({ many }) => ({
  operators: many(operators),
}));

export const operatorsRelations = relations(operators, ({ one, many }) => ({
  shifts: many(operatorShifts),
  schedules: many(operatorSchedules),
  location: one(workLocations, {
    fields: [operators.locationId],
    references: [workLocations.id],
  }),
}));

export const operatorShiftsRelations = relations(operatorShifts, ({ one }) => ({
  operator: one(operators, {
    fields: [operatorShifts.operatorId],
    references: [operators.id],
  }),
}));

export const operatorSchedulesRelations = relations(
  operatorSchedules,
  ({ one }) => ({
    operator: one(operators, {
      fields: [operatorSchedules.operatorId],
      references: [operators.id],
    }),
  }),
);

// 12. TABLA DE AUDITORIAS DE CALIDAD
export const qualityAudits = sqliteTable("quality_audits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  callId: text("call_id").notNull(),
  ticketId: text("ticket_id").notNull(),
  duration: text("duration").notNull(),
  date: text("date").notNull(),
  month: text("month").notNull(),
  totalScore: integer("total_score").notNull(),
  section1Score: integer("section1_score").notNull(),
  section2Score: integer("section2_score").notNull(),
  notes: text("notes"),
  isCriticalFailure: integer("is_critical_failure", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const auditParameters = sqliteTable("audit_parameters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  weight: real("weight").notNull().default(1.0),
  category: text("category").notNull(), // 'Interacción con Usuario' | 'Gestión del Ticket'
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const auditScores = sqliteTable(
  "audit_scores",
  {
    auditId: integer("audit_id")
      .notNull()
      .references(() => qualityAudits.id, { onDelete: "cascade" }),
    parameterId: integer("parameter_id")
      .notNull()
      .references(() => auditParameters.id, { onDelete: "cascade" }),
    score: integer("score", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.auditId, table.parameterId] }),
  }),
);

export const qualityAuditsRelations = relations(
  qualityAudits,
  ({ one, many }) => ({
    agent: one(agents, {
      fields: [qualityAudits.agentId],
      references: [agents.id],
    }),
    scores: many(auditScores),
  }),
);

export const monthlySummaries = sqliteTable(
  "monthly_summaries",
  {
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    summary: text("summary").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.month] }),
  }),
);

export const monthlySummariesRelations = relations(
  monthlySummaries,
  ({ one }) => ({
    agent: one(agents, {
      fields: [monthlySummaries.agentId],
      references: [agents.id],
    }),
  }),
);

export const auditParametersRelations = relations(
  auditParameters,
  ({ many }) => ({
    scores: many(auditScores),
  }),
);

export const auditScoresRelations = relations(auditScores, ({ one }) => ({
  audit: one(qualityAudits, {
    fields: [auditScores.auditId],
    references: [qualityAudits.id],
  }),
  parameter: one(auditParameters, {
    fields: [auditScores.parameterId],
    references: [auditParameters.id],
  }),
}));

export const applicationCategories = sqliteTable("application_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  categoryId: integer("category_id").references(() => applicationCategories.id),
  description: text("description"),
  version: text("version"),
  filePath: text("file_path"),
  iconPath: text("icon_path"),
  sortOrder: integer("sortOrder").default(0),
});

export const applicationCategoriesRelations = relations(
  applicationCategories,
  ({ many }) => ({
    applications: many(applications),
  }),
);

export const applicationsRelations = relations(applications, ({ one }) => ({
  category: one(applicationCategories, {
    fields: [applications.categoryId],
    references: [applicationCategories.id],
  }),
}));

// 14. INVENTARIO DE TERMINALES
export const terminals = sqliteTable("terminals", {
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
});

export const terminalsRelations = relations(terminals, ({ one }) => ({
  office: one(offices, {
    fields: [terminals.nis],
    references: [offices.code],
  }),
}));

export const supportGuides = sqliteTable("support_guides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  helpDeskName: text("help_desk_name").notNull(),
  legacyName: text("legacy_name"),
  invgateName: text("invgate_name"),
  route: text("route"),
  topics: text("topics"),
  contacts: text("contacts"),
  referents: text("referents"),
  notes: text("notes"),
  searchableText: text("searchable_text"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  action: text("action").notNull(),
  timestamp: text("timestamp").notNull(),
});

// 15. CONTROL DE ASISTENCIA (Horarios reales y eventualidades)
export const operatorAttendance = sqliteTable("operator_attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  asistencia: text("asistencia"),
  ausencia: text("ausencia"),
  entradaReal: text("entrada_real"),
  salidaReal: text("salida_real"),
  cumplimiento: text("cumplimiento"),
  cumplimientoForzado: integer("cumplimiento_forzado", { mode: "boolean" }).default(false),
  motivoLoguin: text("motivo_loguin"),
  detalle: text("detalle"),
});

export const operatorAttendanceRelations = relations(
  operatorAttendance,
  ({ one }) => ({
    agent: one(agents, {
      fields: [operatorAttendance.agentId],
      references: [agents.id],
    }),
  })
);

export const saturdayRotationConfig = sqliteTable("saturday_rotation_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull().unique(), // "YYYY-MM"
  rotationOrder: text("rotation_order").notNull().default("A,B,C,D"),
  startDate: text("start_date").notNull().default("2026-06-06"),
  startGroup: text("start_group").notNull().default("A"),
});

export const agentSaturdayGroups = sqliteTable("agent_saturday_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // "YYYY-MM"
  saturdayGroup: text("saturday_group"),
  saturdayHorario: text("saturday_horario"),
}, (table) => ({
  agentMonthUniqueIdx: uniqueIndex("agent_month_unique_idx").on(table.agentId, table.month),
}));

export const agentSaturdayGroupsRelations = relations(agentSaturdayGroups, ({ one }) => ({
  agent: one(agents, {
    fields: [agentSaturdayGroups.agentId],
    references: [agents.id],
  }),
}));

export const weekendOvertimeConfig = sqliteTable("weekend_overtime_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekendStartDate: text("weekend_start_date").notNull().unique(), // Sábado "YYYY-MM-DD"
  referente: text("referente").notNull(),
});

export const weekendOvertimeShifts = sqliteTable("weekend_overtime_shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekendStartDate: text("weekend_start_date").notNull(), // Sábado "YYYY-MM-DD"
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // "YYYY-MM-DD" (Sábado o Domingo)
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(), // "HH:MM"
}, (table) => ({
  weekendStartIdx: index("overtime_shifts_weekend_start_idx").on(table.weekendStartDate),
  agentIdx: index("overtime_shifts_agent_idx").on(table.agentId),
}));

export const weekendOvertimeShiftsRelations = relations(weekendOvertimeShifts, ({ one }) => ({
  agent: one(agents, {
    fields: [weekendOvertimeShifts.agentId],
    references: [agents.id],
  }),
}));

export const holidays = sqliteTable("holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  name: text("name").notNull(),
});

// 17. GUARDIA PASIVA
export const monthlyGuardiaPasivaOperator = sqliteTable("monthly_guardia_pasiva_operator", {
  month: text("month").primaryKey(), // Formato "YYYY-MM"
  operatorId: integer("operator_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
});

export const weeklyGuardiaPasivaAssignments = sqliteTable("weekly_guardia_pasiva_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull().unique(), // Lunes de la semana "YYYY-MM-DD"
  endDate: text("end_date").notNull(),             // Domingo de la semana "YYYY-MM-DD"
  supervisorName: text("supervisor_name").notNull(),// Nombre de texto libre
  referenteId: integer("referente_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
});

export const monthlyGuardiaPasivaOperatorRelations = relations(
  monthlyGuardiaPasivaOperator,
  ({ one }) => ({
    operator: one(agents, {
      fields: [monthlyGuardiaPasivaOperator.operatorId],
      references: [agents.id],
    }),
  })
);

export const weeklyGuardiaPasivaAssignmentsRelations = relations(
  weeklyGuardiaPasivaAssignments,
  ({ one }) => ({
    referente: one(agents, {
      fields: [weeklyGuardiaPasivaAssignments.referenteId],
      references: [agents.id],
    }),
  })
);