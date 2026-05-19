import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";

import { relations } from "drizzle-orm";

// 1. TABLA DE USUARIOS
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("agent"),
});

// 1. TABLA DE OFICINAS
export const offices = sqliteTable("offices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  region: text("region"),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  email: text("email"),
  notes: text("notes"),
});

// 2. TABLA DE CONTACTOS (Independiente)
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone"),
});

// 3. TABLA INTERMEDIA (El puente entre Oficinas y Contactos)
export const officeContacts = sqliteTable(
  "office_contacts",
  {
    officeId: integer("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),

    // ¡Dato clave!: El rol y el horario van en la tabla intermedia.
    // ¿Por qué? Porque "Ariel" podría ser 'Jefe' en la oficina A de mañana,
    // y 'Supervisor' en la oficina B de tarde.
    role: text("role"),
    timeSlot: text("time_slot"),
  },
  (table) => ({
    // Clave primaria compuesta para que no agregues por error a la misma persona 2 veces a la misma oficina
    pk: primaryKey({ columns: [table.officeId, table.contactId] }),
  }),
);

// 4. TABLA DE EQUIPAMIENTO (Se mantiene igual, 1 a Muchos)
export const officeAssets = sqliteTable("office_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  officeId: integer("office_id")
    .notNull()
    .references(() => offices.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  hostname: text("hostname"),
  ip: text("ip"),
});

// Relaciones de Oficinas
export const officesRelations = relations(offices, ({ many }) => ({
  contacts: many(officeContacts),
  assets: many(officeAssets),
}));

// Relaciones de la tabla intermedia (Puente)
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

// Relaciones de Activos
export const officeAssetsRelations = relations(officeAssets, ({ one }) => ({
  office: one(offices, {
    fields: [officeAssets.officeId],
    references: [offices.id],
  }),
}));

// 5. TABLA DE CUBICS (PCs)
export const cubics = sqliteTable("cubics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  ip: text("ip"),
  status: text("status").notNull().default("offline"),
  lastPing: text("last_ping"),
});

// 6. TABLA DE AGENTES (Operadores)
export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatarInitials: text("avatar_initials"),
  notes: text("notes"),
});

// 7. TABLA INTERMEDIA (Asignaciones de Cubics)
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

// Relaciones de Cubics
export const cubicsRelations = relations(cubics, ({ many }) => ({
  assignments: many(cubicAssignments),
}));

// Relaciones de Agentes
export const agentsRelations = relations(agents, ({ many }) => ({
  assignments: many(cubicAssignments),
}));

// Relaciones de Asignaciones (Intermedia)
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
});

