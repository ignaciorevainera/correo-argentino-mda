import type { APIRoute } from "astro";
import { jsonResponse, jsonError, sanitizeError } from "@lib/apiResponse";
import ldap from "ldapjs";

const LDAP_SERVER =
  import.meta.env.LDAP_SERVER || process.env.LDAP_SERVER || "ldap://correo.local";
const LDAP_PORT = import.meta.env.LDAP_PORT || process.env.LDAP_PORT || 389;
const LDAP_BASE_DN =
  import.meta.env.LDAP_BASE_DN || process.env.LDAP_BASE_DN || "DC=correo,DC=local";
const LDAP_USER = import.meta.env.LDAP_USER || process.env.LDAP_USER;
const LDAP_PASS = import.meta.env.LDAP_PASS || process.env.LDAP_PASS;

const LICENSE_FILTER =
  "(&(objectClass=group)(|" +
  "(cn=*f3*)(cn=*e1*)(cn=*e3*)(cn=*kiosk*)(cn=*kiosko*)(cn=*o365*)(cn=*m365*)(cn=*licen*)(cn=*office*)" +
  "(description=*f3*)(description=*e1*)(description=*e3*)(description=*kiosk*)(description=*kiosko*)(description=*office*)" +
  "))";

interface AdGroupEntry {
  cn?: string;
  description?: string;
  distinguishedName?: string;
}

export const GET: APIRoute = async () => {
  if (!LDAP_USER || !LDAP_PASS) {
    return jsonError("LDAP_USER y LDAP_PASS requeridos en .env", 500);
  }

  const client = ldap.createClient({
    url: `${LDAP_SERVER}:${LDAP_PORT}`,
    reconnect: false,
    connectTimeout: 30000,
    timeout: 60000,
  });

  client.on("error", (err) => {
    console.error("[AdGroupsLicenses] LDAP Client Error:", err);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      client.bind(LDAP_USER, LDAP_PASS, (err) => {
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

    const entries: AdGroupEntry[] = [];

    await new Promise<void>((resolve, reject) => {
      client.search(
        LDAP_BASE_DN,
        {
          filter: LICENSE_FILTER,
          scope: "sub" as const,
          attributes: ["cn", "description", "distinguishedName"],
        },
        (err, res) => {
          if (err) {
            reject(new Error(`Error en búsqueda LDAP: ${err.message}`));
            return;
          }
          res.on("searchEntry", (entry) => {
            const flat: Record<string, unknown> = {};
            for (const a of entry.pojo.attributes) {
              flat[a.type] = a.values.length === 1 ? a.values[0] : a.values;
            }
            entries.push(flat as AdGroupEntry);
          });
          res.on("error", (err2) => {
            reject(new Error(`Error en búsqueda LDAP: ${err2.message}`));
          });
          res.on("end", () => resolve());
        },
      );
    });

    client.unbind();

    const groups = entries
      .map((e) => ({
        name: String(e.cn || ""),
        description:
          typeof e.description === "string" ? e.description : "",
        dn: String(e.distinguishedName || ""),
      }))
      .filter((g) => g.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({ total: groups.length, groups });
  } catch (error) {
    client.unbind();
    console.error("[AdGroupsLicenses] Error:", error);
    return jsonError(sanitizeError(error) || "Error al consultar AD", 500);
  }
};
