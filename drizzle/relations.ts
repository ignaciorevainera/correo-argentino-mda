import { relations } from "drizzle-orm/relations";
import {
  agents,
  cubicAssignments,
  cubics,
  offices,
  officeAssets,
  contacts,
  officeContacts,
  users,
  sessions,
  regions,
  provinces,
  operators,
  operatorShifts,
  operatorSchedules,
  workLocations,
  auditParameters,
  auditScores,
  qualityAudits,
  monthlySummaries,
  terminals,
  operatorAttendance,
  weekendOvertimeShifts,
  agentSaturdayGroups,
  monthlyGuardiaPasivaOperator,
  weeklyGuardiaPasivaAssignments,
  applicationCategories,
  applications,
  contactCategories,
  providerContacts,
  resourceCategories,
  resourceLinks,
  feedback,
  technologyReferents,
  officeInvgateLinks,
  titleCategory,
  titles,
} from "./schema";

export const cubicAssignmentsRelations = relations(
  cubicAssignments,
  ({ one }) => ({
    agent: one(agents, {
      fields: [cubicAssignments.agentId],
      references: [agents.id],
    }),
    cubic: one(cubics, {
      fields: [cubicAssignments.cubicId],
      references: [cubics.id],
    }),
  }),
);

export const agentsRelations = relations(agents, ({ many }) => ({
  cubicAssignments: many(cubicAssignments),
  monthlySummaries: many(monthlySummaries),
  qualityAudits: many(qualityAudits),
  operatorAttendances: many(operatorAttendance),
  weekendOvertimeShifts: many(weekendOvertimeShifts),
  agentSaturdayGroups: many(agentSaturdayGroups),
  monthlyGuardiaPasivaOperators: many(monthlyGuardiaPasivaOperator),
  weeklyGuardiaPasivaAssignments: many(weeklyGuardiaPasivaAssignments),
}));

export const cubicsRelations = relations(cubics, ({ many }) => ({
  cubicAssignments: many(cubicAssignments),
}));

export const officeAssetsRelations = relations(officeAssets, ({ one }) => ({
  office: one(offices, {
    fields: [officeAssets.officeId],
    references: [offices.id],
  }),
}));

export const officesRelations = relations(offices, ({ one, many }) => ({
  officeAssets: many(officeAssets),
  officeContacts: many(officeContacts),
  province: one(provinces, {
    fields: [offices.provinceCode],
    references: [provinces.code],
  }),
  terminals: many(terminals),
  officeInvgateLinks: many(officeInvgateLinks),
}));

export const officeContactsRelations = relations(officeContacts, ({ one }) => ({
  contact: one(contacts, {
    fields: [officeContacts.contactId],
    references: [contacts.id],
  }),
  office: one(offices, {
    fields: [officeContacts.officeId],
    references: [offices.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  officeContacts: many(officeContacts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  feedbacks_assignedToId: many(feedback, {
    relationName: "feedback_assignedToId_users_id",
  }),
  feedbacks_userId: many(feedback, {
    relationName: "feedback_userId_users_id",
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

export const operatorShiftsRelations = relations(operatorShifts, ({ one }) => ({
  operator: one(operators, {
    fields: [operatorShifts.operatorId],
    references: [operators.id],
  }),
}));

export const operatorsRelations = relations(operators, ({ one, many }) => ({
  operatorShifts: many(operatorShifts),
  operatorSchedules: many(operatorSchedules),
  workLocation: one(workLocations, {
    fields: [operators.locationId],
    references: [workLocations.id],
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

export const workLocationsRelations = relations(workLocations, ({ many }) => ({
  operators: many(operators),
}));

export const auditScoresRelations = relations(auditScores, ({ one }) => ({
  auditParameter: one(auditParameters, {
    fields: [auditScores.parameterId],
    references: [auditParameters.id],
  }),
  qualityAudit: one(qualityAudits, {
    fields: [auditScores.auditId],
    references: [qualityAudits.id],
  }),
}));

export const auditParametersRelations = relations(
  auditParameters,
  ({ many }) => ({
    auditScores: many(auditScores),
  }),
);

export const qualityAuditsRelations = relations(
  qualityAudits,
  ({ one, many }) => ({
    auditScores: many(auditScores),
    agent: one(agents, {
      fields: [qualityAudits.agentId],
      references: [agents.id],
    }),
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

export const terminalsRelations = relations(terminals, ({ one }) => ({
  office: one(offices, {
    fields: [terminals.nis],
    references: [offices.code],
  }),
}));

export const operatorAttendanceRelations = relations(
  operatorAttendance,
  ({ one }) => ({
    agent: one(agents, {
      fields: [operatorAttendance.agentId],
      references: [agents.id],
    }),
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

export const agentSaturdayGroupsRelations = relations(
  agentSaturdayGroups,
  ({ one }) => ({
    agent: one(agents, {
      fields: [agentSaturdayGroups.agentId],
      references: [agents.id],
    }),
  }),
);

export const monthlyGuardiaPasivaOperatorRelations = relations(
  monthlyGuardiaPasivaOperator,
  ({ one }) => ({
    agent: one(agents, {
      fields: [monthlyGuardiaPasivaOperator.operatorId],
      references: [agents.id],
    }),
  }),
);

export const weeklyGuardiaPasivaAssignmentsRelations = relations(
  weeklyGuardiaPasivaAssignments,
  ({ one }) => ({
    agent: one(agents, {
      fields: [weeklyGuardiaPasivaAssignments.referenteId],
      references: [agents.id],
    }),
  }),
);

export const applicationsRelations = relations(applications, ({ one }) => ({
  applicationCategory: one(applicationCategories, {
    fields: [applications.categoryId],
    references: [applicationCategories.id],
  }),
}));

export const applicationCategoriesRelations = relations(
  applicationCategories,
  ({ many }) => ({
    applications: many(applications),
  }),
);

export const providerContactsRelations = relations(
  providerContacts,
  ({ one }) => ({
    contactCategory: one(contactCategories, {
      fields: [providerContacts.categoryId],
      references: [contactCategories.id],
    }),
  }),
);

export const contactCategoriesRelations = relations(
  contactCategories,
  ({ many }) => ({
    providerContacts: many(providerContacts),
  }),
);

export const resourceLinksRelations = relations(resourceLinks, ({ one }) => ({
  resourceCategory: one(resourceCategories, {
    fields: [resourceLinks.categoryId],
    references: [resourceCategories.id],
  }),
}));

export const resourceCategoriesRelations = relations(
  resourceCategories,
  ({ many }) => ({
    resourceLinks: many(resourceLinks),
  }),
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user_assignedToId: one(users, {
    fields: [feedback.assignedToId],
    references: [users.id],
    relationName: "feedback_assignedToId_users_id",
  }),
  user_userId: one(users, {
    fields: [feedback.userId],
    references: [users.id],
    relationName: "feedback_userId_users_id",
  }),
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

export const officeInvgateLinksRelations = relations(
  officeInvgateLinks,
  ({ one }) => ({
    office: one(offices, {
      fields: [officeInvgateLinks.officeId],
      references: [offices.id],
    }),
  }),
);

export const titlesRelations = relations(titles, ({ one }) => ({
  titleCategory: one(titleCategory, {
    fields: [titles.categoryId],
    references: [titleCategory.id],
  }),
}));

export const titleCategoryRelations = relations(titleCategory, ({ many }) => ({
  titles: many(titles),
}));
