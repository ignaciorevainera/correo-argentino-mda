import { z } from "zod";

/**
 * Validación central de variables de entorno (#234). Las críticas son las que,
 * si faltan o están mal formadas, rompen la seguridad del portal; el resto se
 * reporta para auditoría pero no bloquea (tiene fallbacks o es de integraciones).
 */
const criticalSchema = z.object({
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY debe tener al menos 32 caracteres"),
});

const optionalKeys = [
  "EXTERNAL_STORAGE_DIR",
  "INTERNAL_ORIGIN",
  "SESSION_COOKIE_SECURE",
  "PORT",
  "HOST",
  "INVGATE_API_KEY",
  "INVGATE_API_USERNAME",
  "INVGATE_BASE_URL",
  "INVGATE_QA_API_KEY",
  "INVGATE_QA_API_USERNAME",
  "INVGATE_QA_BASE_URL",
  "INVGATE_MCP_TOKEN",
  "INVGATE_METRICS",
  "INVGATE_AUTOMATION_GROUP_ID",
  "INVGATE_AUTOMATION_CATEGORY_ID",
  "INVGATE_AUTOMATION_VIEW_ID",
  "AUTOMATION_DETAIL_TTL_MIN",
  "AUTOMATION_PROGRESS_TTL_MIN",
  "AUTOMATION_CHILD_CACHE_TTL_MIN",
  "AUTOMATION_USERS_CACHE_TTL_MIN",
  "AUTOMATION_CLOSE_THRESHOLD",
  "AUTOMATION_STALLED_THRESHOLD_DAYS",
  "AUTOMATION_AGE_THRESHOLD_DAYS",
  "TITLE_KB_THRESHOLD",
  "REVAL_OUT",
  "LDAP_SERVER",
  "LDAP_PORT",
  "LDAP_BASE_DN",
  "LDAP_USER",
  "LDAP_PASS",
  "LDAP_TIMEOUT_MS",
  "LDAP_TLS_CA_PATH",
  "LDAP_TLS_REJECT_UNAUTHORIZED",
  "MIDPOINT_USER",
  "MIDPOINT_PASS",
  "MIDPOINT_URL",
  "WISE_CX_API_KEY",
  "WISE_CX_API_USER",
  "WISE_CX_BASE_URL",
  "WISE_CX_WALLBOARD_COMPANY",
  "WISE_CX_WALLBOARD_TAB_GUID",
  "WISE_CX_WALLBOARD_WIDGET_ID",
  "GROQ_API_KEY",
  "DATABASE_PATH",
  "MDA_SKIP_PRE_PUSH",
  "ENTRA_ENABLED",
  "ENTRA_TENANT_ID",
  "ENTRA_CLIENT_ID",
  "ENTRA_CLIENT_SECRET",
  "ENTRA_REDIRECT_URI",
] as const;

/**
 * Prerequisitos de los jobs PM2 de sincronización (#234): sin ellos, los jobs
 * (`autorestart:false` + `cron_restart` diario) mueren en silencio. Los exige
 * `scripts/verify-env.mts` en el deploy; NO bloquean el runtime web (por eso no
 * van en `criticalSchema`). Si un script deja de usar una clave, sacarla de acá.
 */
export const SCRIPT_CRITICAL_KEYS = [
  "MIDPOINT_USER",
  "MIDPOINT_PASS",
  "LEGACY_INVENTORY_URL",
] as const;

/**
 * Prerequisitos "al menos uno del par" (#308): `sync-users` consume InvGate vía
 * `invgateClient`, que acepta las `_QA_` como fallback. Exigir sólo la primaria
 * daría falso positivo cuando el deploy usa las `_QA_`.
 */
export const SCRIPT_CRITICAL_ANY_OF = [
  ["INVGATE_API_KEY", "INVGATE_QA_API_KEY"],
  ["INVGATE_BASE_URL", "INVGATE_QA_BASE_URL"],
] as const;

export type ServerEnvValidation = {
  ok: boolean;
  missing: string[];
  invalid: string[];
  absentOptional: string[];
};

function valueOf(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
}

export function validateServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnvValidation {
  const critical = criticalSchema.safeParse({
    SESSION_SECRET: valueOf(env, "SESSION_SECRET"),
    ENCRYPTION_KEY: valueOf(env, "ENCRYPTION_KEY"),
  });

  const missing: string[] = [];
  const invalid: string[] = [];
  if (!critical.success) {
    for (const issue of critical.error.issues) {
      const key = String(issue.path[0]);
      if (valueOf(env, key) === undefined) missing.push(key);
      else invalid.push(key);
    }
  }

  const absentOptional = optionalKeys.filter((key) => valueOf(env, key) === undefined);
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid, absentOptional };
}

/**
 * Verifica los prerequisitos de los jobs PM2 (#234). A diferencia de las
 * críticas de runtime, falla siempre que falte una (no sólo en producción):
 * son condición para que los jobs de sync funcionen tras el deploy.
 */
export function validateScriptEnv(
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; missing: string[] } {
  const missing = [
    ...SCRIPT_CRITICAL_KEYS.filter((key) => valueOf(env, key) === undefined),
    ...SCRIPT_CRITICAL_ANY_OF
      .filter((group) => group.every((key) => valueOf(env, key) === undefined))
      .map((group) => group.join(" | ")),
  ];
  return { ok: missing.length === 0, missing };
}

/**
 * Lee una variable obligatoria y aborta con exit 1 si falta (#234). Devuelve
 * `string` (el narrowing del `const` no llega a las function declarations
 * hoisted, por eso un guard manual no basta), y centraliza el fail-fast de los
 * scripts de mantenimiento. `env` inyectable para tests.
 */
export function requireEnv(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = valueOf(env, key);
  if (value === undefined) {
    console.error(`Falta ${key}. Definila en .env (ver .env.example) antes de correr el script.`);
    process.exit(1);
  }
  return value;
}

/**
 * Fail-fast (#234): en producción aborta si falta una crítica; en dev/log avisa,
 * para no romper worktrees locales sin .env completo.
 */
export function assertServerEnv(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateServerEnv(env);
  if (!result.ok) {
    const detail = [
      result.missing.length ? `faltan: ${result.missing.join(", ")}` : "",
      result.invalid.length ? `inválidas: ${result.invalid.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    const message = `Variables de entorno críticas ${detail}. Revisá .env (ver .env.example).`;
    if (env.NODE_ENV === "production") throw new Error(message);
    console.error(`[env] ${message}`);
  }
}
