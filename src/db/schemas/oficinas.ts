import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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

export const technologyReferents = sqliteTable("technology_referents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  regionId: text("regionId")
    .notNull()
    .references(() => regions.id, { onDelete: "cascade" }),
  firstName: text("firstName").notNull(),
  lastName: text("lastName").notNull(),
});
