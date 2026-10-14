/**
 * Regla de ortografía para las auditorías de calidad (#291).
 *
 * Heurística liviana y determinista, no un corrector: los tickets de MDA están
 * llenos de siglas y jerga (InvGate, Wise CX, SDW, VPN, Fortinet...), así que un
 * corrector genérico daría falsos positivos en casi todos. Sólo se reportan
 * errores *inequívocos*:
 *
 *  1. Erratas frecuentes (lista cerrada).
 *  2. Palabras del catálogo técnico escritas sin tilde (lista cerrada).
 *  3. Reglas de espaciado: puntuación pegada a la palabra siguiente.
 *  4. Caracteres repetidos (4+), no signos de exclamación/admiración.
 *  5. Oración que arranca en minúscula.
 *
 * shortcut: las dos listas son cortas y están hardcodeadas; crecerlas con casos
 * reales de tickets marcados como no cumple por ortografía, no con un
 * diccionario general.
 */

export type OrthographyFindingKind =
  | "typo"
  | "missing-accent"
  | "spacing"
  | "repetition"
  | "capitalization";

export interface OrthographyFinding {
  kind: OrthographyFindingKind;
  /** Palabra o fragmento observado, tal cual aparece en el texto. */
  word: string;
  message: string;
}

export interface OrthographyOptions {
  /** Términos técnicos adicionales a ignorar (además de la lista interna). */
  extraWhitelist?: readonly string[];
}

export interface OrthographyResult {
  complies: boolean;
  findings: OrthographyFinding[];
}

/** Erratas inequívocas: la forma correcta NO existe como otra palabra válida. */
const TYPOS: Readonly<Record<string, string>> = Object.freeze({
  coneccion: "conexión",
  conecsion: "conexión",
  nesecita: "necesita",
  nescesita: "necesita",
  hiso: "hizo",
  hisieron: "hicieron",
  haver: "haber",
  hubieron: "hubo",
  abria: "abría",
  tambien: "también",
  // "solo" sin tilde es válido (= "solamente"), así que queda fuera a propósito.
});

/** Palabras del catálogo que casi siempre se escriben sin tilde. */
const MISSING_ACCENTS: Readonly<Record<string, string>> = Object.freeze({
  atencion: "atención",
  configuracion: "configuración",
  instalacion: "instalación",
  desconexion: "desconexión",
  reconexion: "reconexión",
  actualizacion: "actualización",
  informacion: "información",
  sesion: "sesión",
  solucion: "solución",
  conexion: "conexión",
  version: "versión",
  aplicacion: "aplicación",
  validacion: "validación",
  cancelacion: "cancelación",
  operacion: "operación",
  migracion: "migración",
  autenticacion: "autenticación",
  documentacion: "documentación",
  congestion: "congestión",
});

/** Siglas, marcas y tokens que nunca se evalúan (todo mayúsculas o con dígito). */
const DEFAULT_WHITELIST: readonly string[] = Object.freeze([
  "invgate",
  "wise",
  "cx",
  "md",
  "mda",
  "sdw",
  "vpn",
  "nis",
  "dns",
  "ip",
  "ips",
  "nro",
  "n°",
  "sdwan",
  "fortinet",
  "zebra",
  "cubic",
  "wi",
  "ppe",
  "sid",
  "acl",
  "api",
  "sla",
  "sop",
  "tns",
  "soft",
  "switch",
  "router",
  "firewall",
  "link",
  "site",
  "node",
  "ticket",
  "tickets",
]);

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const isIgnorableToken = (token: string, whitelist: ReadonlySet<string>): boolean => {
  // Tokens puros de marca/código: O5597, IP-01, N/A, INV-2026...
  if (/^[A-Z0-9_.-]+$/.test(token)) return true;
  if (/\d/.test(token)) return true;
  if (/^https?:\/\//i.test(token) || token.includes("@")) return true;
  return whitelist.has(stripAccents(token.toLowerCase()));
};

/** Reglas que trabajan sobre el texto completo (espaciado, repetición, mayúscula). */
const analyseTextRules = (text: string): OrthographyFinding[] => {
  const findings: OrthographyFinding[] = [];

  const spacing = text.match(/[a-záéíóúñ][.,;:!?](?=[a-záéíóúñ])/i);
  if (spacing) {
    findings.push({
      kind: "spacing",
      word: spacing[0],
      message: `Falta un espacio en "${spacing[0]}"`,
    });
  }

  const repeated = text.match(/([a-zA-Z])\1{3,}/);
  if (repeated) {
    findings.push({
      kind: "repetition",
      word: repeated[0],
      message: `Caracteres repetidos: "${repeated[0]}"`,
    });
  }

  const lowerStart = text.match(/(?:^|[.!?]\s+)([a-záéíóúñ]\w+)/);
  if (lowerStart) {
    findings.push({
      kind: "capitalization",
      word: lowerStart[1],
      message: `La oración arranca en minúscula: "${lowerStart[1]}"`,
    });
  }

  return findings;
};

/**
 * Evalúa el texto y devuelve los errores detectados.
 * Sin texto no hay hallazgos y el criterio se considera cumplido.
 */
export function evaluateOrthography(
  text: string,
  options: OrthographyOptions = {},
): OrthographyResult {
  const trimmed = (text || "").trim();
  if (!trimmed) return { complies: true, findings: [] };

  const whitelist = new Set([
    ...DEFAULT_WHITELIST,
    ...(options.extraWhitelist || []).map((term) => stripAccents(term.toLowerCase())),
  ]);

  const findings: OrthographyFinding[] = [];

  trimmed
    .split(/\s+/)
    .map((token) => token.replace(/^[¡¿"'(\[]+|[,.;:!?)"'\]]+$/g, ""))
    .filter(Boolean)
    .forEach((token) => {
      if (isIgnorableToken(token, whitelist)) return;
      const normalized = stripAccents(token.toLowerCase());

      const typo = TYPOS[normalized];
      // Mismo cuidado que con las tildes: "también" bien escrito no es errata.
      if (typo && token.toLowerCase() !== typo) {
        findings.push({
          kind: "typo",
          word: token,
          message: `¿"${token}"? La forma correcta es "${typo}"`,
        });
        return;
      }

      const accented = MISSING_ACCENTS[normalized];
      // Solo se penaliza la forma SIN tilde: "configuración" ya está bien.
      if (accented && token.toLowerCase() !== accented) {
        findings.push({
          kind: "missing-accent",
          word: token,
          message: `"${token}" lleva tilde: "${accented}"`,
        });
      }
    });

  findings.push(...analyseTextRules(trimmed));

  return { complies: findings.length === 0, findings };
}