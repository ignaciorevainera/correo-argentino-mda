import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { mesas, users } from "./auth";

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
