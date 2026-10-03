import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

import { relations, sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("agent"),
  helpdeskId: integer("helpdesk_id").references(() => mesas.invgateId, {
    onDelete: "set null",
  }),
  helpdeskName: text("helpdesk_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  disabledAt: integer("disabled_at", { mode: "timestamp" }),
  disabledBy: integer("disabled_by").references(
    (): AnySQLiteColumn => users.id,
    { onDelete: "set null" },
  ),
});

export const employees = sqliteTable("employees", {
  dni: text("dni").primaryKey(),
  username: text("username").notNull(),
  fullname: text("fullname").notNull(),
  interno: text("interno"),
  telefono: text("telefono"),
  sucursal: text("sucursal"),
  invgateExists: integer("invgate_exists", { mode: "boolean" }).default(false),
  invgateId: integer("invgate_id"),
  position: text("position"),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const employeeOffices = sqliteTable(
  "employee_offices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    sucursal: text("sucursal").notNull(),
  },
  (table) => ({
    uniqueUsernameSucursal: uniqueIndex(
      "employee_offices_username_sucursal_idx",
    ).on(table.username, table.sucursal),
  }),
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expiresAt").notNull(),
  fingerprint: text("fingerprint"),
});

export const offices = sqliteTable(
  "offices",
  {
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
    active: integer("active", { mode: "boolean" }).default(true),
    closedReason: text("closed_reason"),
  },
  (table) => ({
    nameIdx: index("name_idx").on(table.name),
    localityIdx: index("locality_idx").on(table.locality),
    provinceIdx: index("province_idx").on(table.provinceCode),
    typeIdx: index("type_idx").on(table.type),
  }),
);

export const contactCategories = sqliteTable("contact_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  icon: text("icon").notNull(),
  tone: text("tone").notNull(),
  sortOrder: integer("sortOrder").default(0),
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
  invgateLink: one(officeInvgateLinks, {
    fields: [offices.id],
    references: [officeInvgateLinks.officeId],
  }),
}));

export const officeInvgateLinks = sqliteTable("office_invgate_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  officeId: integer("office_id")
    .notNull()
    .unique()
    .references(() => offices.id, { onDelete: "cascade" }),
  invgateLocationId: integer("invgate_location_id").notNull(),
  invgateParentId: integer("invgate_parent_id"),
  invgateParentName: text("invgate_parent_name"),
  invgateDisplayName: text("invgate_display_name"),
  invgateCp: text("invgate_cp"),
  invgateCc: text("invgate_cc"),
  invgateAddress: text("invgate_address"),
  invgateDuplicateCount: integer("invgate_duplicate_count").default(0),
  invgateUserTotal: integer("invgate_user_total").default(0),
  lastSyncedAt: text("last_synced_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

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
  technologyReferents: many(technologyReferents),
}));

export const technologyReferents = sqliteTable("technology_referents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  regionId: text("regionId")
    .notNull()
    .references(() => regions.id, { onDelete: "cascade" }),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull(),
});

export const technologyReferentsRelations = relations(
  technologyReferents,
  ({ one }) => ({
    region: one(regions, {
      fields: [technologyReferents.regionId],
      references: [regions.id],
    }),
  }),
);

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

// 9. RECURSOS Y ENLACES (Migración de JSON a BD)
export const resourceCategories = sqliteTable("resource_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  iconName: text("iconName").notNull(),
  tone: text("tone").notNull().default("primary"),
  sortOrder: integer("sortOrder").default(0),
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
  credentialUsername: text("credential_username"),
  credentialPassword: text("credential_password"),
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

// 12. TABLA DE AUDITORIAS DE CALIDAD
export const qualityAudits = sqliteTable(
  "quality_audits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channelType: text("channel_type").notNull().default("wise_call"), // 'wise_call' | 'wise_email' | 'invgate_ticket'
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
    ringTime: text("ring_time"),
    creationTime: text("creation_time"),
    takeTime: text("take_time"),
    isPas: integer("is_pas", { mode: "boolean" }).notNull().default(false),
    appliesMda: integer("applies_mda", { mode: "boolean" }).notNull().default(false),
    staysInMda: integer("stays_in_mda", { mode: "boolean" }).notNull().default(true),
    recordingUrl: text("recording_url"),
  },
  (table) => ({
    monthIdx: index("quality_audits_month_idx").on(table.month),
    channelIdx: index("quality_audits_channel_idx").on(table.channelType),
  }),
);

export const auditParameters = sqliteTable("audit_parameters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  weight: real("weight").default(1.0),
  category: text("category").notNull(), // 'Items' | 'Ticket' | 'MDA'
  channel: text("channel").notNull().default("wise_call"), // 'wise_call' | 'wise_email' | 'invgate_ticket'
  section: text("section").notNull().default("items"), // 'items' | 'ticket' | 'mda'
  order: integer("order").notNull().default(0),
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
    comment: text("comment"),
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
  sortOrder: integer("sortOrder").default(0),
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
  metadata: text("metadata"),
  instructionPdfPath: text("instruction_pdf_path"),
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

export const terminalsRelations = relations(terminals, ({ one }) => ({
  office: one(offices, {
    fields: [terminals.nis],
    references: [offices.code],
  }),
}));

export const supportGuides = sqliteTable("support_guides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invgate_id: integer("invgate_id"),
  categories: text("categories"),
  legacyName: text("legacy_name"),
  route: text("route"),
  topics: text("topics"),
  contacts: text("contacts"),
  referents: text("referents"),
  notes: text("notes"),
  searchableText: text("searchable_text"),
});

export const hiddenHelpdesks = sqliteTable("hidden_helpdesks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invgateId: integer("invgate_id")
    .notNull()
    .unique()
    .references(() => mesas.invgateId, { onDelete: "cascade" }),
  hiddenBy: text("hidden_by").notNull(),
  hiddenAt: text("hidden_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  action: text("action").notNull(),
  timestamp: text("timestamp").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  beforeState: text("before_state", { mode: "json" }),
  afterState: text("after_state", { mode: "json" }),
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

export const operatorAttendanceRelations = relations(
  operatorAttendance,
  ({ one }) => ({
    agent: one(agents, {
      fields: [operatorAttendance.agentId],
      references: [agents.id],
    }),
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

export const agentSaturdayGroupsRelations = relations(
  agentSaturdayGroups,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentSaturdayGroups.agentId],
      references: [agents.id],
    }),
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

export const weekendOvertimeShiftsRelations = relations(
  weekendOvertimeShifts,
  ({ one }) => ({
    agent: one(agents, {
      fields: [weekendOvertimeShifts.agentId],
      references: [agents.id],
    }),
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

export const monthlyGuardiaPasivaOperatorRelations = relations(
  monthlyGuardiaPasivaOperator,
  ({ one }) => ({
    operator: one(agents, {
      fields: [monthlyGuardiaPasivaOperator.operatorId],
      references: [agents.id],
    }),
  }),
);

export const weeklyGuardiaPasivaAssignmentsRelations = relations(
  weeklyGuardiaPasivaAssignments,
  ({ one }) => ({
    referente: one(agents, {
      fields: [weeklyGuardiaPasivaAssignments.referenteId],
      references: [agents.id],
    }),
    operator: one(agents, {
      fields: [weeklyGuardiaPasivaAssignments.operatorId],
      references: [agents.id],
    }),
  }),
);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(), // 'sugerencia' | 'bug'
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pendiente"), // 'pendiente' | 'en_revision' | 'resuelto' | 'descartado'
  category: text("category"), // Solo para 'sugerencia' (ej: 'cronograma', 'asistencia', etc.)
  severity: text("severity"), // Solo para 'bug' (ej: 'leve', 'moderado', 'critico')
  steps: text("steps"), // Solo para 'bug' (Pasos para reproducir)
  userAgent: text("userAgent"), // Información del navegador/OS
  assignedToId: integer("assignedToId").references(() => users.id),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$onUpdateFn(
    () => new Date(),
  ),
});

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, {
    fields: [feedback.userId],
    references: [users.id],
  }),
  assignedTo: one(users, {
    fields: [feedback.assignedToId],
    references: [users.id],
  }),
}));

export const kbArticles = sqliteTable(
  "kb_articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    helpdeskId: integer("helpdesk_id")
      .notNull()
      .references(() => mesas.invgateId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category"),
    status: text("status").notNull().default("draft"),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => users.id),
    publishedByUserId: integer("published_by_user_id").references(
      () => users.id,
    ),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdateFn(
      () => new Date(),
    ),
  },
  (t) => ({
    helpdeskStatusIdx: index("kb_articles_helpdesk_status_idx").on(
      t.helpdeskId,
      t.status,
    ),
  }),
);

export const kbArticlesRelations = relations(kbArticles, ({ one }) => ({
  author: one(users, {
    fields: [kbArticles.authorUserId],
    references: [users.id],
  }),
  publishedBy: one(users, {
    fields: [kbArticles.publishedByUserId],
    references: [users.id],
  }),
  helpdesk: one(mesas, {
    fields: [kbArticles.helpdeskId],
    references: [mesas.invgateId],
  }),
}));

export const kbCategories = sqliteTable(
  "kb_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    helpdeskId: integer("helpdesk_id")
      .notNull()
      .references(() => mesas.invgateId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("kb_categories_helpdesk_name_unique").on(
      table.helpdeskId,
      table.name,
    ),
  ],
);

export const kbCategoriesRelations = relations(kbCategories, ({ one }) => ({
  helpdesk: one(mesas, {
    fields: [kbCategories.helpdeskId],
    references: [mesas.invgateId],
  }),
  createdBy: one(users, {
    fields: [kbCategories.createdByUserId],
    references: [users.id],
  }),
}));

export const assignmentLock = sqliteTable("assignment_lock", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: text("username").notNull(),
  acquiredAt: integer("acquired_at").notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
  releaseRequested: integer("release_requested").notNull().default(0),
});

export const titleCategory = sqliteTable("title_category", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull(),
  tone: text("tone").notNull(),
});

export const titles = sqliteTable("titles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => titleCategory.id),
  route: text("route"),
  description: text("description"),
  articleOnKdb: text("article_on_kdb"),
  deprecated: integer("deprecated", {
    mode: "boolean",
  }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdateFn(
    () => new Date(),
  ),
});

// 18. AUTOMATIZACIONES — ETAPAS DEL WORKFLOW (plantilla global configurada por admin)

export const workflowStages = sqliteTable(
  "workflow_stages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Tipo de automatización a la que aplica la etapa. `workflow` = flujo
     * AUTSUC nuevo; `legacy` = casos manuales anteriores a Luis Guillón.
     */
    scope: text("scope").notNull().default("workflow"),
    /** Orden de la etapa en la vista. */
    position: integer("position").notNull().default(0),
    /**
     * Gate opcional: ticket de otra etapa que habilita esta etapa.
     * Null = la etapa siempre está habilitada (solo agrupación).
     */
    gateItemId: integer("gate_item_id").references(
      (): AnySQLiteColumn => workflowStageTickets.id,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdateFn(
      () => new Date(),
    ),
  },
  (table) => ({
    positionIdx: index("workflow_stages_position_idx").on(table.position),
  }),
);

export const workflowStageTickets = sqliteTable(
  "workflow_stage_tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stageId: integer("stage_id")
      .notNull()
      .references(() => workflowStages.id, { onDelete: "cascade" }),
    /**
     * Texto esperado del step label del ticket hijo de InvGate
     * (parte del título previa al primer " - ", ej: "Solicitud de equipamiento").
     * El match se hace normalizado (casing/acentos/ordinales).
     */
    matchLabel: text("match_label").notNull(),
    /**
     * Labels alternativos que también matchean esta card (además de matchLabel).
     * Permite agrupar variantes reales de InvGate en una sola tarjeta, ej:
     * "Configuración de equipo" dentro de "Configuración de server".
     */
    aliases: text("aliases", { mode: "json" }).$type<string[]>().default([]),
    /**
     * Frases clave de la descripción del ticket que también matchean esta card.
     * Se evalúan SOLO cuando el label no matchea (títulos duplicados, ej: los
     * dos "Instalaciones para AUTSUC…" de relevamiento y visita técnica).
     */
    matchDescription: text("match_description", { mode: "json" })
      .$type<string[]>()
      .default([]),
    /**
     * Sufijo de la ruta de categoría de InvGate que también matchea esta card
     * (ej: "Central Paq. » Implementación"). Se compara contra la ruta completa
     * del ticket hijo (coincidencia por sufijo), cubriendo casos con título
     * genérico o duplicado que el label no distingue.
     */
    matchCategory: text("match_category"),
    /**
     * true = los tickets matcheados se muestran anidados como sub-nodos de una
     * card madre (mismo tratamiento que el equipamiento 1.1/1.2/1.3).
     */
    nestChildren: integer("nest_children", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Etiqueta display si difiere del matchLabel; cae al matchLabel si es null. */
    displayName: text("display_name"),
    /** false = ticket informativo/registro (no bloquea la etapa). */
    blocking: integer("blocking", { mode: "boolean" }).notNull().default(true),
    /**
     * Naturaleza del ítem esperado:
     * - `ticket` (default): ticket hijo de InvGate.
     * - `form`: se completa por formulario (no genera ticket).
     * - `manual`: gestión manual de MDC (no genera ticket).
     * - `subprocess`: ticket generado por un subproceso (se matchea igual).
     * form/manual no cuentan como faltantes.
     */
    kind: text("kind").notNull().default("ticket"),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdateFn(
      () => new Date(),
    ),
  },
  (table) => ({
    stagePosIdx: index("workflow_stage_tickets_stage_pos_idx").on(
      table.stageId,
      table.position,
    ),
  }),
);

export const workflowStagesRelations = relations(
  workflowStages,
  ({ many, one }) => ({
    tickets: many(workflowStageTickets),
    gateItem: one(workflowStageTickets, {
      fields: [workflowStages.gateItemId],
      references: [workflowStageTickets.id],
    }),
  }),
);

export const workflowStageTicketsRelations = relations(
  workflowStageTickets,
  ({ one }) => ({
    stage: one(workflowStages, {
      fields: [workflowStageTickets.stageId],
      references: [workflowStages.id],
    }),
  }),
);

/**
 * Cache key/value persistido para resoluciones costosas de InvGate
 * (category_id, queue_ids, snapshot de discovery). Sobrevive a los restarts
 * del proceso para no repetir los escaneos completos en la primera carga.
 */
export const invgateCache = sqliteTable("invgate_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * Cierres locales de automatizaciones: el portal marca un caso como finalizado
 * sin impactar en InvGate (donde el padre puede seguir Abierto). `kind` es
 * "manual" (admin) o "auto" (flujo al 100%). Reabrir = borrar la fila.
 */
export const automationClosures = sqliteTable("automation_closures", {
  automationId: integer("automation_id").primaryKey(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  percent: integer("percent").notNull(),
  closedBy: text("closed_by").notNull(),
  closedAt: integer("closed_at").notNull(),
});

/**
 * Datos manuales de una automatización (override local sobre el formulario
 * inicial). Carga de jefe/zonal y campos operativos que no vienen de InvGate
 * (Número de contacto, Franja horaria, notas). Se edita desde el portal y el
 * detalle lo mezcla sobre lo parseado. Nunca toca InvGate.
 */
export const automationManualData = sqliteTable("automation_manual_data", {
  automationId: integer("automation_id").primaryKey(),
  jefeName: text("jefe_name"),
  jefeDni: text("jefe_dni"),
  jefeLegajo: text("jefe_legajo"),
  jefeZonal: text("jefe_zonal"),
  contactNumber: text("contact_number"),
  openingHours: text("opening_hours"),
  notes: text("notes"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Padres de automatización vistos alguna vez como activos (categoría 3023).
 * El workflow los reasigna a otras mesas y salen de las colas resueltas; este
 * tracking los mantiene en el portal aunque cambien de `assigned_group_id`.
 * Solo guarda activos: se poda al finalizar.
 */
export const automationTrackedParents = sqliteTable("automation_tracked_parents", {
  automationId: integer("automation_id").primaryKey(),
  lastStatusId: integer("last_status_id").notNull(),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

/**
 * Historial completo de padres de automatización vistos alguna vez por el
 * scan. A diferencia de `automation_tracked_parents` (que poda al finalizar),
 * esta tabla NUNCA poda: alimenta el listado "todos los tickets padres creados
 * hasta el momento" y el buscador por NIS/nombre de sucursal.
 */
export const automationParents = sqliteTable(
  "automation_parents",
  {
    automationId: integer("automation_id").primaryKey(),
    prettyId: text("pretty_id").notNull(),
    displayName: text("display_name").notNull(),
    branchCode: text("branch_code"),
    branchName: text("branch_name"),
    statusId: integer("status_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    closedAt: integer("closed_at"),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => ({
    createdAtIdx: index("automation_parents_created_at_idx").on(table.createdAt),
    updatedAtIdx: index("automation_parents_updated_at_idx").on(table.updatedAt),
  }),
);

// 19. ADMIN MESAS Y PAPELERA
export const mesas = sqliteTable("mesas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invgateId: integer("invgate_id").notNull().unique(),
  name: text("name").notNull().unique(),
  displayName: text("display_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Curacion manual: si la mesa puede elegirse en el select de alta/edicion de
  // usuario. Separado de `active` (ciclo de vida del sync de InvGate). La mesa
  // principal MDA TI siempre es asignable (exenta del toggle).
  assignable: integer("assignable", { mode: "boolean" })
    .notNull()
    .default(false),
  lastSyncedAt: text("last_synced_at").notNull(),
});

// 20. PAPELERA DE BORRADO RECUPERABLE (snapshots pre-delete)
export const deletedRecords = sqliteTable(
  "deleted_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(), // "oficina" | "cubic" | "agente" | entityName del handler
    recordId: text("record_id").notNull(), // id original, en texto
    label: text("label").notNull(), // legible: 'Oficina "Rafaela" (Q123)'
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(), // { row: filaPadre, children?: { clave: filas[] } }
    deletedBy: text("deleted_by").notNull(),
    deletedAt: text("deleted_at").notNull(),
    restoredAt: text("restored_at"),
    purgedAt: text("purged_at"),
  },
  (t) => ({
    entityIdx: index("deleted_records_entity_idx").on(t.entity, t.deletedAt),
  }),
);
