import ldap from "ldapjs";
import fs from "node:fs";

export interface LdapConfig {
  server: string;
  port: number;
  baseDn: string;
  user: string;
  pass: string;
  timeoutMs: number;
  isSecure: boolean;
  tlsCaPath?: string;
}

export function getLdapConfig(): LdapConfig {
  const server = process.env.LDAP_SERVER || "ldap://correo.local";
  const isSecure = server.startsWith("ldaps://");
  const defaultPort = isSecure ? 636 : 389;
  const port = Number(process.env.LDAP_PORT) || defaultPort;
  const tlsCaPath = process.env.LDAP_TLS_CA_PATH || undefined;

  return {
    server,
    port,
    baseDn: process.env.LDAP_BASE_DN || "DC=correo,DC=local",
    user: process.env.LDAP_USER || "",
    pass: process.env.LDAP_PASS || "",
    timeoutMs: Number(process.env.LDAP_TIMEOUT_MS) || 5000,
    isSecure,
    tlsCaPath,
  };
}

export interface ClassifiedLdapError {
  isConfigMissing: boolean;
  isNetworkFailure: boolean;
  isAuthFailure: boolean;
  originalMessage: string;
}

export function classifyLdapError(error: unknown): ClassifiedLdapError {
  const msg = error instanceof Error ? error.message : String(error || "");
  const code = (error as { code?: unknown })?.code;
  const name = (error as { name?: unknown })?.name;
  const codeStr = typeof code === "string" || typeof code === "number" ? String(code) : "";
  const nameStr = typeof name === "string" ? name : "";

  const isConfigMissing = /LDAP_USER.*LDAP_PASS|credenciales.*requerid/i.test(msg);

  const isNetworkFailure =
    /connection timeout|timed?out|enotfound|econnrefused|econnreset|enetunreach|ehostunreach|no disponible|connect/i.test(
      msg,
    ) ||
    /ConnectionError|TimeoutError/i.test(nameStr) ||
    /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH/.test(codeStr);

  const isAuthFailure =
    !isNetworkFailure &&
    (/autenticación|invalid credentials|bind error|data 52e|data 775|acceptSecurityContext/i.test(
      msg,
    ) ||
      code === 49 ||
      codeStr === "49" ||
      /InvalidCredentials/i.test(nameStr));

  return {
    isConfigMissing,
    isNetworkFailure,
    isAuthFailure,
    originalMessage: msg,
  };
}

export const SERVICE_UNAVAILABLE_MESSAGE =
  "El servicio no está disponible en este momento. Intente nuevamente en unos minutos.";

export function getLdapUserErrorMessage(_error: unknown): string {
  return SERVICE_UNAVAILABLE_MESSAGE;
}

export async function withLdapClient<T>(
  fn: (client: ldap.Client, config: LdapConfig) => Promise<T>,
): Promise<T> {
  const config = getLdapConfig();

  if (!config.user || !config.pass) {
    throw new Error("LDAP_USER y LDAP_PASS requeridos en el entorno");
  }

  const clientOptions: ldap.ClientOptions = {
    url: `${config.server}:${config.port}`,
    reconnect: false,
    connectTimeout: config.timeoutMs,
    timeout: config.timeoutMs * 2,
  };

  if (config.tlsCaPath && fs.existsSync(config.tlsCaPath)) {
    try {
      const caCert = fs.readFileSync(config.tlsCaPath);
      clientOptions.tlsOptions = {
        ca: [caCert],
      };
    } catch (err) {
      console.error("[LDAP] Error al leer LDAP_TLS_CA_PATH:", err);
    }
  }

  const client = ldap.createClient(clientOptions);

  client.on("error", (err) => {
    console.error("[LDAP] Client Socket Error:", err?.message || err);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(config.user, config.pass, (err) => {
        if (err) {
          reject(
            new Error(
              `Error de autenticación LDAP: ${err.message || err.code || JSON.stringify(err)}`,
            ),
          );
        } else {
          resolve();
        }
      });
    });

    return await fn(client, config);
  } finally {
    try {
      client.unbind();
    } catch {
      // noop
    }
  }
}
