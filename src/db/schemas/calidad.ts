import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { agents } from "./equipamiento";

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
