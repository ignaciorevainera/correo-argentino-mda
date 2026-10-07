import { sqliteTable, text, integer, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

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

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expiresAt").notNull(),
  fingerprint: text("fingerprint"),
});
