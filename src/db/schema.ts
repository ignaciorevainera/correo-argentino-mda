import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

import { relations } from "drizzle-orm";
import { mesas, users } from "./schemas/auth";
import {
  offices,
  contactCategories,
  providerContacts,
  contacts,
  officeContacts,
  officeAssets,
  officeInvgateLinks,
  regions,
  provinces,
  technologyReferents,
} from "./schemas/oficinas";
import { cubics, agents, cubicAssignments, terminals } from "./schemas/equipamiento";
import {
  operatorAttendance,
  agentSaturdayGroups,
  weekendOvertimeShifts,
  monthlyGuardiaPasivaOperator,
  weeklyGuardiaPasivaAssignments,
} from "./schemas/cronograma";
import { qualityAudits, auditParameters, auditScores, monthlySummaries } from "./schemas/calidad";
import { feedback, kbArticles, kbCategories } from "./schemas/kb";

export * from "./schemas/auth";
export * from "./schemas/oficinas";
export * from "./schemas/equipamiento";
export * from "./schemas/cronograma";
export * from "./schemas/calidad";
export * from "./schemas/kb";

export const contactCategoriesRelations = relations(
  contactCategories,
  ({ many }) => ({
    contacts: many(providerContacts),
  }),
);

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

export const technologyReferentsRelations = relations(
  technologyReferents,
  ({ one }) => ({
    region: one(regions, {
      fields: [technologyReferents.regionId],
      references: [regions.id],
    }),
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
  /** id (número, en texto) del artículo de KB de InvGate que mejor matchea. */
  articleOnKdb: text("article_on_kdb"),
  /** Título del artículo de KB (para mostrarlo sin llamar a la API). */
  articleOnKdbTitle: text("article_on_kdb_title"),
  /** Score del match de KB (0..1); null si no hay/no se evaluó. */
  kbMatchScore: real("kb_match_score"),
  /** Nº de casos históricos analizados para derivar ruta/descripción. */
  enrichedCases: integer("enriched_cases"),
  /** Epoch de la última corrida de enriquecimiento; null = pendiente. */
  enrichedAt: integer("enriched_at"),
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

/**
 * Favoritos de títulos por usuario (antes vivían en localStorage del browser).
 * PK compuesta (user_id, title_id); cascada al borrar el usuario o el título.
 */
export const titleFavorites = sqliteTable(
  "title_favorites",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.titleId] }),
  }),
);

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
