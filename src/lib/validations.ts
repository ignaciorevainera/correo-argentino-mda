import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users, offices, terminals, supportGuides } from "@db/schema";
import { z } from "zod";

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertOfficeSchema = createInsertSchema(offices);
export const insertTerminalSchema = createInsertSchema(terminals);
export const insertSupportGuideSchema = createInsertSchema(supportGuides);

export const createUserFormSchema = insertUserSchema.extend({
  passwordConfirmation: z.string().min(1, "Confirma la contraseña"),
}).refine((data) => data.password === data.passwordConfirmation, {
  message: "Las contraseñas no coinciden",
  path: ["passwordConfirmation"],
});

export const officeFormSchema = z.object({
  code: z.string().min(1, "El código es obligatorio"),
  name: z.string().min(1, "El nombre es obligatorio"),
  type: z.string().min(1, "El tipo es obligatorio"),
  officeType: z.string().nullable().optional(),
  provinceCode: z.string().min(1, "La provincia es obligatoria"),
  address: z.string().nullable().optional(),
  locality: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  zone: z.string().nullable().optional(),
  email: z.string().email("Formato de email inválido").nullable().optional().or(z.literal("")),
  notes: z.string().nullable().optional(),
  parentNis: z.string().nullable().optional(),
  enRed: z.boolean().optional().default(false),
  paqarAdmision: z.boolean().optional().default(false),
  paqarEntrega: z.boolean().optional().default(false),
  payroll: z.boolean().optional().default(false),
  taxExempt: z.boolean().optional().default(false),
  division: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  warehouse: z.string().nullable().optional(),
  profitCenter: z.string().nullable().optional(),
  cctAdminOffice: z.string().nullable().optional(),
  ccCommercial: z.string().nullable().optional(),
  ccCommercialCorp: z.string().nullable().optional(),
  ccElectoral: z.string().nullable().optional(),
  ccNetworkMgmt: z.string().nullable().optional(),
  ccOperations: z.string().nullable().optional(),
  ccOperational: z.string().nullable().optional(),
  ccHr: z.string().nullable().optional(),
  ccSecurity: z.string().nullable().optional(),
  ccAdmin: z.string().nullable().optional(),
  ccAdmission: z.string().nullable().optional(),
  ccCtp: z.string().nullable().optional(),
  ccCtt: z.string().nullable().optional(),
  ccTransport: z.string().nullable().optional(),
  ccLogistics: z.string().nullable().optional(),
  posAutoAuto: z.string().nullable().optional(),
  posCurrentAccount: z.string().nullable().optional(),
  posManual: z.string().nullable().optional(),
  posManualAuto: z.string().nullable().optional(),
  posPlantaMg: z.string().nullable().optional(),
  posVirtual: z.string().nullable().optional(),
  posAutoAuto2: z.string().nullable().optional(),
  posSapTerminal: z.string().nullable().optional(),
});
