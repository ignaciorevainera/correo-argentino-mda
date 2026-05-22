import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
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
});

export const contactCategories = sqliteTable("contact_categories", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  icon: text("icon").notNull(),
  tone: text("tone").notNull(),
});

export const providerContacts = sqliteTable("provider_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: text("category_id").references(() => contactCategories.id),
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  phones: text("phones", { mode: "json" }).$type<string[]>(),
  emails: text("emails", { mode: "json" }).$type<string[]>(),
  urls: text("urls", { mode: "json" }).$type<
    { label: string; url: string }[]
  >(),
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
  avatarInitials: text("avatar_initials"),
  notes: text("notes"),
  location: text("location").notNull().default("Monte Grande"),
  horarioDefault: text("horario_default").notNull().default("08:00 - 17:00"),
  esquemaSemanal: text("esquema_semanal", { mode: "json" }).$type<Record<string, string>>(),
  esquemaHorario: text("esquema_horario", { mode: "json" }).$type<Record<string, string>>(),
  esquemaBreakInicio: text("esquema_break_inicio", { mode: "json" }).$type<Record<string, string>>(),
  esquemaBreakFin: text("esquema_break_fin", { mode: "json" }).$type<Record<string, string>>(),
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
});

// 9. RECURSOS Y ENLACES (Migración de JSON a BD)
export const resourceCategories = sqliteTable("resource_categories", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  iconName: text("iconName").notNull(),
  tone: text("tone").notNull().default("primary"),
});

export const resourceLinks = sqliteTable("resource_links", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => resourceCategories.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  subtitle: text("subtitle"),
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
