import type { APIRoute } from "astro";
import { jsonResponse } from "@lib/apiResponse";
import ldap from "ldapjs";

const LDAP_SERVER =
  import.meta.env.LDAP_SERVER || process.env.LDAP_SERVER || "ldap://correo.local";
const LDAP_PORT = import.meta.env.LDAP_PORT || process.env.LDAP_PORT || 389;
const LDAP_BASE_DN =
  import.meta.env.LDAP_BASE_DN || process.env.LDAP_BASE_DN || "DC=correo,DC=local";
const LDAP_USER = import.meta.env.LDAP_USER || process.env.LDAP_USER;
const LDAP_PASS = import.meta.env.LDAP_PASS || process.env.LDAP_PASS;

type ErrorCategory = "credentials" | "network" | "other";

function categorizeError(err: Error): ErrorCategory {
  const msg = err.message || "";
  if (/invalidCredentials|LDAP:\s*49/i.test(msg)) return "credentials";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|getaddrinfo/i.test(msg)) return "network";
  return "other";
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonResponse({ error: "No autorizado" }, 401);
  }

  const start = Date.now();
  const client = ldap.createClient({
    url: `${LDAP_SERVER}:${LDAP_PORT}`,
    reconnect: false,
    connectTimeout: 10000,
    timeout: 10000,
  });

  client.on("error", (err) => {
    console.error("[LdapStatus] LDAP Client Error:", err);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(LDAP_USER || "", LDAP_PASS || "", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      client.search(
        LDAP_BASE_DN,
        { filter: "(objectClass=*)", scope: "base", attributes: ["dn"] },
        (err, res) => {
          if (err) {
            reject(err);
            return;
          }
          res.on("error", reject);
          res.on("end", () => resolve());
        },
      );
    });

    client.unbind();

    return jsonResponse({
      ok: true,
      category: null,
      latencyMs: Date.now() - start,
      message: "Conexión exitosa",
    });
  } catch (error: any) {
    const category = categorizeError(error as Error);
    const msg = String(error?.message || "Error desconocido");

    return jsonResponse({
      ok: false,
      category,
      latencyMs: Date.now() - start,
      message: msg,
    });
  }
};
