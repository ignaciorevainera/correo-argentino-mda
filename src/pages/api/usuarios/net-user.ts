import type { APIRoute } from "astro";
import { jsonResponse, jsonError } from "@lib/apiResponse";
import ldap from "ldapjs";

const LDAP_SERVER = import.meta.env.LDAP_SERVER || "ldap://correo.local";
const LDAP_PORT = import.meta.env.LDAP_PORT || 389;
const LDAP_BASE_DN = import.meta.env.LDAP_BASE_DN || "DC=correo,DC=local";
const LDAP_USER = import.meta.env.LDAP_USER;
const LDAP_PASS = import.meta.env.LDAP_PASS;
if (!LDAP_USER || !LDAP_PASS) {
  throw new Error("LDAP_USER and LDAP_PASS must be set in .env");
}

function convertFiletime(filetime: number): string | null {
  if (!filetime || filetime === 0) return null;
  // Windows Filetime is 100-nanosecond intervals since 1601-01-01
  const epoch = 11644473600000; // difference between 1601 and 1970 in ms
  const adjusted = Math.floor(filetime / 10000) - epoch;
  if (adjusted <= 0) return null;
  return new Date(adjusted).toISOString().replace("T", " ").substring(0, 19);
}

function formatOutput(data: {
  username: string; fullname: string; title: string; mail: string;
  employee_number: string; physical_office: string; telephone_number: string;
  manager_name: string; department: string; description: string;
  pwd_last_set: string; last_logon: string; when_created: string;
  account_expires: string; groups: string[];
}): string {
  const lines = [
    "Información del usuario en Active Directory",
    "===========================================",
    `Nombre de usuario: ${data.username || "N/A"}`,
    `Nombre completo: ${data.fullname || "N/A"}`,
    `Cargo: ${data.title || "N/A"}`,
    `Email: ${data.mail || "N/A"}`,
    `Legajo: ${data.employee_number || "N/A"}`,
    `Oficina: ${data.physical_office || "N/A"}`,
    `Teléfono: ${data.telephone_number || "N/A"}`,
    `Manager: ${data.manager_name || "N/A"}`,
    `Departamento: ${data.department || "N/A"}`,
    `Descripción: ${data.description || "N/A"}`,
    "",
    "Fechas de cuenta:",
    `  Último cambio de contraseña: ${data.pwd_last_set || "N/A"}`,
    `  Último inicio de sesión: ${data.last_logon || "N/A"}`,
    `  Cuenta creada: ${data.when_created || "N/A"}`,
    `  Cuenta expira: ${data.account_expires || "Nunca"}`,
    "",
    "Grupos de seguridad:",
    ...(data.groups || []).map((g: string) => `  - ${g}`),
    "",
  ];
  return lines.join("\n");
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.id === 0) {
    return jsonError("No autenticado", 401);
  }

  try {
    const url = new URL(request.url);
    const username = url.searchParams.get("username")?.trim();

    if (!username) {
      return jsonError("Parámetro username requerido", 400);
    }

    if (!/^[a-zA-Z0-9.\-_]+$/.test(username)) {
      return jsonError("Formato de username inválido", 400);
    }

    const client = ldap.createClient({
      url: `${LDAP_SERVER}:${LDAP_PORT}`,
      reconnect: false,
    });

    await new Promise<void>((resolve, reject) => {
      client.bind(LDAP_USER, LDAP_PASS, (err) => {
        if (err) reject(new Error(`Error de autenticación LDAP: ${err.message}`));
        else resolve();
      });
    });

    // Escape special LDAP filter characters
    const escapedUsername = username.replace(/[*()\\\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
    const searchFilter = `(&(objectClass=user)(sAMAccountName=${escapedUsername}))`;
    const opts = {
      filter: searchFilter,
      scope: "sub" as const,
      attributes: [
        "dn", "cn", "sAMAccountName", "displayName", "title", "mail",
        "employeeNumber", "physicalDeliveryOfficeName", "telephoneNumber",
        "manager", "department", "description", "memberOf",
        "pwdLastSet", "lastLogon", "lastLogonTimestamp", "whenCreated",
        "accountExpires", "badPwdCount", "lockoutTime",
      ],
    };

    interface LdapUserEntry {
      sAMAccountName?: string;
      cn?: string;
      displayName?: string;
      title?: string;
      mail?: string;
      employeeNumber?: string;
      physicalDeliveryOfficeName?: string;
      telephoneNumber?: string;
      manager?: string;
      department?: string;
      description?: string;
      memberOf?: string | string[];
      pwdLastSet?: number | string;
      lastLogon?: number | string;
      lastLogonTimestamp?: number | string;
      whenCreated?: string;
      accountExpires?: number | string;
      badPwdCount?: number | string;
      lockoutTime?: number | string;
    }

    const entries: LdapUserEntry[] = [];

    await new Promise<void>((resolve, reject) => {
      client.search(LDAP_BASE_DN, opts, (err, res) => {
        if (err) {
          reject(new Error(`Error en búsqueda LDAP: ${err.message}`));
          return;
        }

        res.on("searchEntry", (entry) => {
          entries.push(entry.pojo);
        });

        res.on("error", (err) => {
          reject(new Error(`Error en búsqueda LDAP: ${err.message}`));
        });

        res.on("end", () => {
          resolve();
        });
      });
    });

    client.unbind();

    if (entries.length === 0) {
      return jsonResponse({
        status: "error",
        error: `Usuario "${username}" no encontrado en Active Directory`,
        output: `Usuario "${username}" no encontrado en Active Directory.`,
      });
    }

    const adUser = entries[0];

    // Resolve manager name if present
    let managerName: string | null = null;
    if (adUser.manager) {
      const managerDn = Array.isArray(adUser.manager) ? adUser.manager[0] : adUser.manager;
      if (typeof managerDn === "string" && managerDn.includes("CN=")) {
        const cnMatch = managerDn.match(/CN=([^,]+)/);
        if (cnMatch) managerName = cnMatch[1];
      }
    }

    // Parse groups from memberOf
    const groups: string[] = [];
    if (adUser.memberOf) {
      const members = Array.isArray(adUser.memberOf) ? adUser.memberOf : [adUser.memberOf];
      for (const member of members) {
        const cnMatch = String(member).match(/CN=([^,]+)/);
        if (cnMatch) groups.push(cnMatch[1]);
      }
    }

    const data = {
      username: String(adUser.sAMAccountName || adUser.cn || username),
      fullname: String(adUser.displayName || ""),
      title: String(adUser.title || ""),
      mail: String(adUser.mail || ""),
      employee_number: String(adUser.employeeNumber || ""),
      physical_office: String(adUser.physicalDeliveryOfficeName || ""),
      telephone_number: String(adUser.telephoneNumber || ""),
      manager_name: managerName || "",
      department: String(adUser.department || ""),
      description: String(adUser.description || ""),
      pwd_last_set: convertFiletime(Number(adUser.pwdLastSet)) || "",
      last_logon: convertFiletime(Number(adUser.lastLogon || adUser.lastLogonTimestamp)) || "",
      when_created: String(adUser.whenCreated || ""),
      account_expires: convertFiletime(Number(adUser.accountExpires)) || "",
      bad_pwd_count: String(adUser.badPwdCount || "0"),
      lockout_time: convertFiletime(Number(adUser.lockoutTime)),
      groups,
    };

    const output = formatOutput(data);

    return jsonResponse({
      status: "success",
      ...data,
      output,
      groups,
    });
  } catch (error: any) {
    console.error("[NetUser] Error:", error);
    return jsonResponse({
      status: "error",
      error: error.message || "Error al consultar Active Directory",
      output: `Error: ${error.message || "No se pudo conectar con el servidor LDAP"}`,
    });
  }
};
