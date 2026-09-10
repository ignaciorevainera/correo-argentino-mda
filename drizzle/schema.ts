import {
  sqliteTable,
  AnySQLiteColumn,
  integer,
  text,
  foreignKey,
  primaryKey,
  uniqueIndex,
  index,
  real,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const contacts = sqliteTable("contacts", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  name: text().notNull(),
  phone: text(),
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
    shift: text().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.cubicId, table.agentId, table.shift],
      name: "cubic_assignments_cubic_id_agent_id_shift_pk",
    }),
  ],
);

export const cubics = sqliteTable(
  "cubics",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    name: text().notNull(),
    ip: text(),
    status: text().default("offline").notNull(),
    lastPing: text("last_ping"),
  },
  (table) => [uniqueIndex("cubics_name_unique").on(table.name)],
);

export const officeAssets = sqliteTable("office_assets", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  officeId: integer("office_id")
    .notNull()
    .references(() => offices.id, { onDelete: "cascade" }),
  type: text().notNull(),
  hostname: text(),
  ip: text(),
});

export const officeContacts = sqliteTable(
  "office_contacts",
  {
    officeId: integer("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text(),
    timeSlot: text("time_slot"),
  },
  (table) => [
    primaryKey({
      columns: [table.officeId, table.contactId],
      name: "office_contacts_office_id_contact_id_pk",
    }),
  ],
);

export const users = sqliteTable(
  "users",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    username: text().notNull(),
    password: text().notNull(),
    role: text().default("agent").notNull(),
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

export const sessions = sqliteTable("sessions", {
  id: text().primaryKey().notNull(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  expiresAt: integer().notNull(),
});

export const schedules = sqliteTable(
  "schedules",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    agentName: text("agent_name").notNull(),
    date: text().notNull(),
    status: text().notNull(),
    comment: text(),
    horario: text(),
    entradaReal: text("entrada_real"),
    salidaReal: text("salida_real"),
    breakInicio: text("break_inicio"),
    breakFin: text("break_fin"),
    isOverride: integer("is_override").default(false),
  },
  (table) => [
    index("schedules_date_idx").on(table.date),
    index("schedules_agent_name_idx").on(table.agentName),
  ],
);

export const provinces = sqliteTable("provinces", {
  code: text({ length: 1 }).primaryKey().notNull(),
  name: text().notNull(),
  regionId: text().references(() => regions.id),
});

export const regions = sqliteTable("regions", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  color: text(),
});

export const offices = sqliteTable(
  "offices",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    code: text().notNull(),
    name: text().notNull(),
    type: text().notNull(),
    provinceCode: text()
      .notNull()
      .references(() => provinces.code),
    address: text(),
    lat: real(),
    lng: real(),
    email: text(),
    notes: text(),
    street: text(),
    number: text(),
    locality: text(),
    county: text(),
    zone: text(),
    officeType: text(),
    categoryClass: text(),
    rubric: text(),
    parentNis: text(),
    phone: text(),
    manager: text(),
    regionId: text(),
    enRed: integer().default(false),
    paqarAdmision: integer().default(false),
    paqarEntrega: integer().default(false),
    searchableText: text("searchable_text"),
    payroll: integer().default(false),
    taxExempt: integer("tax_exempt").default(false),
    division: text(),
    company: text(),
    warehouse: text(),
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
    active: integer().default(true),
    closedReason: text("closed_reason"),
  },
  (table) => [
    index("type_idx").on(table.type),
    index("province_idx").on(table.provinceCode),
    index("locality_idx").on(table.locality),
    index("name_idx").on(table.name),
    uniqueIndex("offices_code_unique").on(table.code),
  ],
);

export const operatorShifts = sqliteTable("operator_shifts", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  operatorId: text("operator_id")
    .notNull()
    .references(() => operators.id, { onDelete: "cascade" }),
  type: text().notNull(),
  shiftStart: text("shift_start").notNull(),
  shiftEnd: text("shift_end").notNull(),
  breakTime: text("break_time").notNull(),
});

export const workLocations = sqliteTable("work_locations", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
});

export const operatorSchedules = sqliteTable("operator_schedules", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  operatorId: text("operator_id")
    .notNull()
    .references(() => operators.id, { onDelete: "cascade" }),
  dayOfWeek: text("day_of_week").notNull(),
  modality: text().notNull(),
  shiftStart: text("shift_start"),
  shiftEnd: text("shift_end"),
  breakTime: text("break_time"),
});

export const operators = sqliteTable("operators", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  status: text().default("disponible").notNull(),
  locationId: text("location_id").references(() => workLocations.id),
  currentMode: text("current_mode").default("presencial").notNull(),
  lastAutogestionAssignedAt: integer("last_autogestion_assigned_at"),
});

export const auditParameters = sqliteTable(
  "audit_parameters",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    code: text().notNull(),
    name: text().notNull(),
    weight: real().default(1).notNull(),
    category: text().notNull(),
    active: integer().default(true).notNull(),
  },
  (table) => [uniqueIndex("audit_parameters_code_unique").on(table.code)],
);

export const auditScores = sqliteTable(
  "audit_scores",
  {
    auditId: integer("audit_id")
      .notNull()
      .references(() => qualityAudits.id, { onDelete: "cascade" }),
    parameterId: integer("parameter_id")
      .notNull()
      .references(() => auditParameters.id, { onDelete: "cascade" }),
    score: integer().default(false).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.auditId, table.parameterId],
      name: "audit_scores_audit_id_parameter_id_pk",
    }),
  ],
);

export const monthlySummaries = sqliteTable(
  "monthly_summaries",
  {
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    month: text().notNull(),
    summary: text().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.agentId, table.month],
      name: "monthly_summaries_agent_id_month_pk",
    }),
  ],
);

export const qualityAudits = sqliteTable(
  "quality_audits",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    callId: text("call_id").notNull(),
    ticketId: text("ticket_id").notNull(),
    duration: text().notNull(),
    date: text().notNull(),
    month: text().notNull(),
    totalScore: integer("total_score").notNull(),
    section1Score: integer("section1_score").notNull(),
    section2Score: integer("section2_score").notNull(),
    notes: text(),
    isCriticalFailure: integer("is_critical_failure").default(false).notNull(),
  },
  (table) => [index("quality_audits_month_idx").on(table.month)],
);

export const auditLogs = sqliteTable("audit_logs", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  username: text().notNull(),
  action: text().notNull(),
  timestamp: text().notNull(),
});

export const supportGuides = sqliteTable("support_guides", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  legacyName: text("legacy_name"),
  route: text(),
  topics: text(),
  contacts: text(),
  referents: text(),
  notes: text(),
  searchableText: text("searchable_text"),
  invgateId: integer("invgate_id"),
  categories: text(),
});

export const terminals = sqliteTable(
  "terminals",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    hostname: text().notNull(),
    macAddress: text("mac_address"),
    ipAddress: text("ip_address"),
    operatingSystem: text("operating_system"),
    osArchitecture: text("os_architecture"),
    ram: text(),
    serialNumber: text("serial_number"),
    manufacturer: text(),
    model: text(),
    nis: text().references(() => offices.code),
    nis2: text(),
    lastContact: text("last_contact"),
    syncedAt: text("synced_at"),
    searchableText: text("searchable_text"),
  },
  (table) => [
    index("terminals_nis_idx").on(table.nis),
    uniqueIndex("terminals_hostname_unique").on(table.hostname),
  ],
);

export const operatorAttendance = sqliteTable(
  "operator_attendance",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    date: text().notNull(),
    asistencia: text(),
    ausencia: text(),
    entradaReal: text("entrada_real"),
    salidaReal: text("salida_real"),
    cumplimiento: text(),
    cumplimientoForzado: integer("cumplimiento_forzado").default(false),
    motivoLoguin: text("motivo_loguin"),
    detalle: text(),
    shiftType: text("shift_type").default("normal").notNull(),
  },
  (table) => [
    index("operator_attendance_agent_date_idx").on(
      table.agentId,
      table.date,
      table.shiftType,
    ),
    index("operator_attendance_date_idx").on(table.date),
  ],
);

export const saturdayRotationConfig = sqliteTable(
  "saturday_rotation_config",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    rotationOrder: text("rotation_order").default("A,B,C,D").notNull(),
    startDate: text("start_date").default("2026-06-06").notNull(),
    startGroup: text("start_group").default("A").notNull(),
    month: text().notNull(),
    disabledGroups: text("disabled_groups").default("").notNull(),
  },
  (table) => [
    uniqueIndex("saturday_rotation_config_month_unique").on(table.month),
  ],
);

export const weekendOvertimeConfig = sqliteTable(
  "weekend_overtime_config",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    weekendStartDate: text("weekend_start_date").notNull(),
    referente: text().notNull(),
  },
  (table) => [
    uniqueIndex("weekend_overtime_config_weekend_start_date_unique").on(
      table.weekendStartDate,
    ),
  ],
);

export const weekendOvertimeShifts = sqliteTable(
  "weekend_overtime_shifts",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    weekendStartDate: text("weekend_start_date").notNull(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    date: text().notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (table) => [
    index("overtime_shifts_agent_idx").on(table.agentId),
    index("overtime_shifts_weekend_start_idx").on(table.weekendStartDate),
  ],
);

export const agentSaturdayGroups = sqliteTable(
  "agent_saturday_groups",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    month: text().notNull(),
    saturdayGroup: text("saturday_group"),
    saturdayHorario: text("saturday_horario"),
  },
  (table) => [
    uniqueIndex("agent_month_unique_idx").on(table.agentId, table.month),
  ],
);

export const holidays = sqliteTable(
  "holidays",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    date: text().notNull(),
    name: text().notNull(),
  },
  (table) => [uniqueIndex("holidays_date_unique").on(table.date)],
);

export const monthlyGuardiaPasivaOperator = sqliteTable(
  "monthly_guardia_pasiva_operator",
  {
    month: text().primaryKey().notNull(),
    operatorId: integer("operator_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
  },
);

export const weeklyGuardiaPasivaAssignments = sqliteTable(
  "weekly_guardia_pasiva_assignments",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    supervisorName: text("supervisor_name").notNull(),
    referenteId: integer("referente_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("weekly_guardia_pasiva_assignments_start_date_unique").on(
      table.startDate,
    ),
  ],
);

export const agents = sqliteTable(
  "agents",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    name: text().notNull(),
    username: text(),
    avatarInitials: text("avatar_initials"),
    notes: text(),
    location: text().default("Monte Grande").notNull(),
    horarioDefault: text("horario_default").default("").notNull(),
    esquemaSemanal: text("esquema_semanal"),
    esquemaHorario: text("esquema_horario"),
    esquemaBreakInicio: text("esquema_break_inicio"),
    esquemaBreakFin: text("esquema_break_fin"),
    maxConsecutiveHo: integer("max_consecutive_ho"),
    minPWeek: integer("min_p_week"),
    lastAutogestionAssignedAt: integer("last_autogestion_assigned_at"),
    estadoExcepcional: text("estado_excepcional"),
    estadoExcepcionalMotivo: text("estado_excepcional_motivo"),
    estadoExcepcionalAt: integer("estado_excepcional_at"),
    estadoExcepcionalMinutos: integer("estado_excepcional_minutos"),
    saturdayGroup: text("saturday_group"),
    saturdayHorario: text("saturday_horario"),
    lastAutogestionAssignedBy: text("last_autogestion_assigned_by"),
    lastAutogestionUndo: integer("last_autogestion_undo"),
  },
  (table) => [uniqueIndex("agents_name_unique").on(table.name)],
);

export const applicationCategories = sqliteTable("application_categories", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  title: text().notNull(),
  sortOrder: integer().default(0),
});

export const applications = sqliteTable("applications", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  title: text().notNull(),
  categoryId: integer("category_id").references(() => applicationCategories.id),
  description: text(),
  version: text(),
  filePath: text("file_path"),
  iconPath: text("icon_path"),
  sortOrder: integer().default(0),
  metadata: text(),
  instructionPdfPath: text("instruction_pdf_path"),
});

export const contactCategories = sqliteTable("contact_categories", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  title: text().notNull(),
  icon: text().notNull(),
  tone: text().notNull(),
  sortOrder: integer().default(0),
});

export const providerContacts = sqliteTable("provider_contacts", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  categoryId: integer("category_id").references(() => contactCategories.id),
  provider: text().notNull(),
  service: text().notNull(),
  phones: text(),
  emails: text(),
  urls: text(),
  sortOrder: integer().default(0),
});

export const resourceCategories = sqliteTable("resource_categories", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  title: text().notNull(),
  iconName: text().notNull(),
  tone: text().default("primary").notNull(),
  sortOrder: integer().default(0),
});

export const resourceLinks = sqliteTable("resource_links", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => resourceCategories.id, { onDelete: "cascade" }),
  title: text().notNull(),
  url: text().notNull(),
  subtitle: text(),
  iconPath: text("icon_path"),
  sortOrder: integer().default(0),
  deprecated: integer().default(false),
  credentialUsername: text("credential_username"),
  credentialPassword: text("credential_password"),
});

export const feedback = sqliteTable("feedback", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  userId: integer()
    .notNull()
    .references(() => users.id),
  type: text().notNull(),
  subject: text().notNull(),
  description: text().notNull(),
  status: text().default("pendiente").notNull(),
  category: text(),
  severity: text(),
  steps: text(),
  userAgent: text(),
  assignedToId: integer().references(() => users.id),
  createdAt: integer().notNull(),
  updatedAt: integer(),
});

export const technologyReferents = sqliteTable("technology_referents", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  regionId: text()
    .notNull()
    .references(() => regions.id, { onDelete: "cascade" }),
  firstName: text().notNull(),
  lastName: text().notNull(),
});

export const assignmentLock = sqliteTable("assignment_lock", {
  id: integer().primaryKey().notNull(),
  userId: integer("user_id").notNull(),
  username: text().notNull(),
  acquiredAt: integer("acquired_at").notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
  releaseRequested: integer("release_requested").default(0).notNull(),
});

export const employees = sqliteTable("employees", {
  dni: text().primaryKey().notNull(),
  username: text().notNull(),
  fullname: text().notNull(),
  interno: text(),
  telefono: text(),
  sucursal: text(),
  updatedAt: text("updated_at").default("sql`(CURRENT_TIMESTAMP)`"),
  invgateExists: integer("invgate_exists").default(false),
  position: text(),
});

export const officeInvgateLinks = sqliteTable(
  "office_invgate_links",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    officeId: integer("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    invgateLocationId: integer("invgate_location_id").notNull(),
    invgateParentId: integer("invgate_parent_id"),
    invgateParentName: text("invgate_parent_name"),
    invgateDisplayName: text("invgate_display_name"),
    invgateCp: text("invgate_cp"),
    invgateCc: text("invgate_cc"),
    invgateAddress: text("invgate_address"),
    invgateDuplicateCount: integer("invgate_duplicate_count").default(0),
    lastSyncedAt: text("last_synced_at")
      .default("sql`(datetime('now'))`")
      .notNull(),
    createdAt: text("created_at").default("sql`(datetime('now'))`"),
  },
  (table) => [
    uniqueIndex("office_invgate_links_office_id_unique").on(table.officeId),
  ],
);

export const titleCategory = sqliteTable(
  "title_category",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    name: text().notNull(),
    icon: text().notNull(),
    tone: text().notNull(),
  },
  (table) => [uniqueIndex("title_category_name_unique").on(table.name)],
);

export const titles = sqliteTable("titles", {
  id: integer().primaryKey({ autoIncrement: true }).notNull(),
  name: text().notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => titleCategory.id),
  route: text(),
  description: text(),
  articleOnKdb: text("article_on_kdb"),
  deprecated: integer().default(false),
  createdAt: integer("created_at"),
  updatedAt: integer("updated_at"),
});

export const employeeOffices = sqliteTable(
  "employee_offices",
  {
    id: integer().primaryKey({ autoIncrement: true }).notNull(),
    username: text().notNull(),
    sucursal: text().notNull(),
  },
  (table) => [
    uniqueIndex("employee_offices_username_sucursal_idx").on(
      table.username,
      table.sucursal,
    ),
  ],
);
