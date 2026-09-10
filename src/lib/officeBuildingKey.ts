import { normalizeOfficeAddress } from "./officeAddress";

const ABBREVIATIONS: Record<string, string> = {
  AV: "AVENIDA",
  AVDA: "AVENIDA",
  AVEN: "AVENIDA",
  GDOR: "GOBERNADOR",
  GOB: "GOBERNADOR",
  GOV: "GOBERNADOR",
  DR: "DOCTOR",
  DOC: "DOCTOR",
  PRES: "PRESIDENTE",
  GEN: "GENERAL",
  CAP: "CAPITAN",
  COM: "COMANDANTE",
  PJE: "PASAJE",
  PTRAL: "PEATONAL",
  // Iniciales heurísticas (revisar en dry-run)
  V: "VALENTIN",
  J: "JOSE",
  M: "MARIA",
};

const STOPWORDS = new Set<string>([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "LOS",
  "EL",
  "Y",
  "ESQ",
  "ESQUINA",
  "AL",
  "A",
  "AVENIDA",
  "CALLE",
  "PASAJE",
  "PEATONAL",
  "DOCTOR",
]);

export interface BuildingKeyParts {
  number: string;
  key: string;
}

/**
 * Deriva una clave de "mismo edificio" tolerante a variaciones de texto.
 * Extrae el número de puerta, expande abreviaturas y compara el conjunto
 * de tokens significativos (orden-independiente). Dos direcciones del mismo
 * edificio pero escritas distinto (ej. "AV. GDOR V VERGARA 3443" vs
 * "VERGARA GOBERNADOR DOCTOR VALENTIN 3443") colisionan en la misma clave.
 * Incluye la provincia: un mismo edificio no puede cruzar provincias.
 */
export function buildBuildingKey(
  address: string | null | undefined,
  provinceCode?: string | null,
): BuildingKeyParts {
  const normalized = normalizeOfficeAddress(address);
  if (!normalized) return { number: "", key: "" };

  const tokens = normalized.split(/\s+/).filter(Boolean);

  let number = "";
  const numericIdx = tokens.findIndex((t) => /^\d+([-/]\d+)?$/.test(t));
  if (numericIdx >= 0) {
    number = tokens[numericIdx].split(/[-/]/)[0];
    tokens.splice(numericIdx, 1);
  }

  const expanded = tokens.map((t) => {
    const cleaned = t.replace(/[.,]/g, "");
    const upper = cleaned.toUpperCase();
    return ABBREVIATIONS[upper] ?? upper;
  });

  const significant = expanded.filter((t) => !STOPWORDS.has(t));

  const province = (provinceCode ?? "").trim().toUpperCase() || "NOPROV";
  const key =
    province +
    "#" +
    (number ? number : "NONE") +
    "|" +
    [...significant].sort().join("+");

  return { number, key };
}

export function pickCanonicalAddress(addresses: string[]): string {
  if (addresses.length === 0) return "";
  return addresses.reduce((best, current) =>
    current.length > best.length ? current : best,
  );
}
