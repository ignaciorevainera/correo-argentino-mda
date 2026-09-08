import { z } from "zod";
import bcrypt from "bcryptjs";

// Expresiones regulares para la validación de contraseña
const pwdRegex = {
  hasUpper: /[A-Z]/,
  hasLower: /[a-z]/,
  hasNumber: /[0-9]/,
};

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .regex(
    pwdRegex.hasUpper,
    "La contraseña debe contener al menos una mayúscula.",
  )
  .regex(
    pwdRegex.hasLower,
    "La contraseña debe contener al menos una minúscula.",
  )
  .regex(pwdRegex.hasNumber, "La contraseña debe contener al menos un número.");

export const hashPassword = async (password: string): Promise<string> => {
  // 12 rondas como se decidió en el diseño (aprox 250ms)
  return await bcrypt.hash(password, 12);
};
