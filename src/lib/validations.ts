import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users, offices, terminals, supportGuides } from "../db/schema";
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
