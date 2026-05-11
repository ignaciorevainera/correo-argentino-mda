#!/usr/bin/env node

/**
 * parse-telegrafia-csv.mjs
 *
 * Lee el CSV de oficinas telegráficas (delimitado por ;) y genera un archivo
 * TypeScript con la constante `mockTelegrafia` de tipo Office[].
 *
 * Uso:
 *   node scripts/parse-telegrafia-csv.mjs
 *
 * Entrada:
 *   src/data/Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Contactos).csv
 *
 * Salida:
 *   src/data/mock_telegrafia.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

const CSV_PATH = resolve(
  PROJECT_ROOT,
  "src/data/Oficinas Telegraficas (STS) (Servidores Dedicados y Operativos-Clientes-Impresoras)(Definitivo).csv"
);

// El CSV está codificado en Windows-1252 / Latin-1 (no UTF-8).
const CSV_ENCODING = "latin1";

const OUTPUT_PATH = resolve(PROJECT_ROOT, "src/data/mock_telegrafia.ts");

// ---------------------------------------------------------------------------
// Mapeos
// ---------------------------------------------------------------------------

/** Letra de provincia → nombre completo */
const PROVINCE_MAP = {
  A: "Salta",
  B: "Buenos Aires",
  C: "CABA",
  D: "San Luis",
  E: "Entre Ríos",
  F: "La Rioja",
  G: "Santiago del Estero",
  H: "Chaco",
  J: "San Juan",
  K: "Catamarca",
  L: "La Pampa",
  M: "Mendoza",
  N: "Misiones",
  P: "Formosa",
  Q: "Neuquén",
  R: "Río Negro",
  S: "Santa Fe",
  T: "Tucumán",
  U: "Chubut",
  V: "Tierra del Fuego",
  W: "Corrientes",
  X: "Córdoba",
  Y: "Jujuy",
  Z: "Santa Cruz",
};

/** Tipo de dispositivo CSV → tipo normalizado */
const ASSET_TYPE_MAP = {
  server: "server",
  impresora: "printer",
  cliente: "client",
};

/** Consolidación de NIS (ej: Tucumán I5712-15 van al I5711) */
const NIS_MERGE_MAP = {
};

/** Forzar nombres específicos por NIS */
const NIS_NAME_FIXES = {
  "I5711": "San Miguel de Tucumán",
};

// ---------------------------------------------------------------------------
// Normalización de texto
// ---------------------------------------------------------------------------

/**
 * Convierte un texto a "Title Case" respetando conectores en minúsculas
 * y términos técnicos en mayúsculas.
 */
function toTitleCase(text) {
  if (!text) return "";
  const lowerEx = ["de", "del", "la", "lo", "las", "los", "y", "e", "en", "a"];
  const upperEx = [
    "sts", "opt", "nis", "ip", "ipv4", "cdd", "sts-opt", 
    "ctt", "itim", "baires", "bairesd", "sl", "sc", "sf", "suc", "cf", "sit",
    "tf", "i2", "mda"
  ];

  return text
    .toLowerCase()
    .replace(/\bs\.t\.s\./gi, "sts")
    .split(/(\s+|[-/])/)
    .map((word) => {
      if (!word || /^\s+$/.test(word) || word === "-" || word === "/") return word;
      // Limpiar puntos al final para comparar con upperEx
      const cleanWord = word.replace(/\.$/, "");
      if (upperEx.includes(cleanWord)) return cleanWord.toUpperCase();
      if (lowerEx.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
}

/**
 * Normaliza nombres de oficinas.
 */
function normalizeName(name) {
  if (!name) return "";
  
  // Limpieza inicial: "TELEG", guiones iniciales y normalizar separadores
  let result = name.replace(/^TELEG\s*/i, "")
                   .replace(/^-+\s*/, "")
                   .replace(/\s*-\s*/g, " - ")
                   .trim();
  
  // Lista de partes a ignorar (provincias, siglas operativas, etc.)
  const toIgnore = [
    "BS AS", "BS.AS.", "BUE", "SALTA", "MZA", "CABA", "CORDOBA", "SANT FE", "S.FE", "SANTA FE",
    "ENTRE RIOS", "RIO NEGRO", "SANTA CRUZ", "NEUQUEN", "MENDOZA", "MISIONES", "JUJUY",
    "SANTIAGO DEL ESTERO", "SGO DEL ESTERO", "FORMOSA", "LA RIOJA", "LA PAMPA", "CORRIENTES",
    "TUCUMAN", "RIO GRANDE", "ROSARIO", "CAP FED", "CAP.FED.",
    "CHACO", "CHUBUT", "SAN LUIS", "SAN JUAN", "CATAMARCA", "LA PLATA", "SANTA ROSA",
    "AUX", "TEC", "PROV", "PRV", "EXT", "INT", "COM"
  ];

  if (result.includes(" - ")) {
    let parts = result.split(" - ").map(p => p.trim());
    let hasCDD = result.toUpperCase().includes("CDD");
    
    let filteredParts = parts.filter(p => {
      const up = p.toUpperCase();
      if (up === "CDD") return false;
      if (up.includes("CDD")) return true;
      return !toIgnore.includes(up);
    });
    
    // Si filtramos todo, nos quedamos con la última parte
    if (filteredParts.length === 0 && parts.length > 0) {
      filteredParts = [parts[parts.length - 1]];
    }

    if (filteredParts.length > 0) {
      result = filteredParts.join(" - ");
    }
    
    if (hasCDD && !result.toUpperCase().includes("CDD")) {
      result += " CDD";
    }
  }

  // Normalizar capitalización y términos técnicos
  result = toTitleCase(result);
  
  // Ajustes finales de términos técnicos y acentos
  const final = result
    .replace(/\bSts\b/gi, "STS")
    .replace(/\bOpt\b/gi, "OPT")
    .replace(/\bS\.t\.s\b/gi, "STS")
    .trim();

  return applyAccents(final);
}

/**
 * Normaliza direcciones: abreviaturas, puntos y S/N.
 */
function normalizeAddress(address) {
  if (!address) return "";
  let result = address.trim();

  // Normalizar capitalización y términos técnicos
  result = toTitleCase(result);

  // Abreviaturas con punto (asegurar que no tengan ya el punto)
  const replacements = [
    [/\bAv(?![\.\w])/gi, "Av."],
    [/\bAvda(?![\.\w])/gi, "Avda."],
    [/\bPje(?![\.\w])/gi, "Pje."],
    [/\bC(?![\.\w])/gi, "C."],
    [/\bNro(?![\.\w])/gi, "Nº"],
    [/\bGral(?![\.\w])/gi, "Gral."],
    [/\bAlmte(?![\.\w])/gi, "Almte."],
    [/\bPte(?![\.\w])/gi, "Pte."],
    [/\bDr(?![\.\w])/gi, "Dr."],
    [/\bLib(?![\.\w])/gi, "Lib."],
    [/\bS\/n\b/gi, "S/N"],
    [/\bBs As\b/gi, "Bs. As."],
  ];

  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }

  result = applyAccents(result);

  // Agregar S/N si no hay números y no dice S/N
  // Evitar agregar S/N a cosas que no parecen direcciones (como "Planta Baja" o "Piso 1")
  // pero "Piso 1" tiene números, así que no entraría.
  if (!/\d/.test(result) && 
      !result.toUpperCase().includes("S/N") && 
      result.length > 5 &&
      !result.toLowerCase().includes("piso") &&
      !result.toLowerCase().includes("planta")) {
    result += " S/N";
  }

  // Limpieza
  return result
    .replace(/\.\./g, ".") // Evitar doble punto
    .replace(/\s\s+/g, " ") // Doble espacio
    .replace(/\bSts\b/gi, "STS")
    .replace(/\bOpt\b/gi, "OPT")
    .trim();
}

/**
 * Corrige acentos en palabras comunes (Argentine locations and terms).
 */
function applyAccents(text) {
  if (!text) return "";
  const dictionary = [
    [/\bRamon\b/gi, "Ramón"],
    [/\bOran\b/gi, "Orán"],
    [/\bSupervision\b/gi, "Supervisión"],
    [/\bTelegrafia\b/gi, "Telegrafía"],
    [/\bGuemes\b/gi, "Güemes"],
    [/\bNeuquen\b/gi, "Neuquén"],
    [/\bCordoba\b/gi, "Córdoba"],
    [/\bTucuman\b/gi, "Tucumán"],
    [/\bEntre Rios\b/gi, "Entre Ríos"],
    [/\bRio\b/gi, "Río"],
    [/\bJunin\b/gi, "Junín"],
    [/\bLujan\b/gi, "Luján"],
    [/\bItuzaingo\b/gi, "Ituzaingó"],
    [/\bMoron\b/gi, "Morón"],
    [/\bLanus\b/gi, "Lanús"],
    [/\bParana\b/gi, "Paraná"],
    [/\bGualeguaychu\b/gi, "Gualeguaychú"],
    [/\bColon\b/gi, "Colón"],
    [/\bBeltran\b/gi, "Beltrán"],
    [/\bCordon\b/gi, "Cordón"],
    [/\bAndres\b/gi, "Andrés"],
    [/\bMatias\b/gi, "Matías"],
    [/\bLucia\b/gi, "Lucía"],
    [/\bRaul\b/gi, "Raúl"],
    [/\bAngel\b/gi, "Ángel"],
    [/\bMaria\b/gi, "María"],
    [/\bJose\b/gi, "José"],
    [/\bGarcia\b/gi, "García"],
    [/\bLopez\b/gi, "López"],
    [/\bRodriguez\b/gi, "Rodríguez"],
    [/\bMartinez\b/gi, "Martínez"],
    [/\bGonzalez\b/gi, "González"],
    [/\bSanchez\b/gi, "Sánchez"],
    [/\bPerez\b/gi, "Pérez"],
    [/\bGomez\b/gi, "Gómez"],
    [/\bFernandez\b/gi, "Fernández"],
    [/\bDiaz\b/gi, "Díaz"],
    [/\bAlvarez\b/gi, "Álvarez"],
    [/\bGutierrez\b/gi, "Gutiérrez"],
    [/\bFarfan\b/gi, "Farfán"],
    [/\bAnibal\b/gi, "Aníbal"],
    [/\bGaston\b/gi, "Gastón"],
    [/\bNicolas\b/gi, "Nicolás"],
    [/\bSebastian\b/gi, "Sebastián"],
    [/\bMartin\b/gi, "Martín"],
    [/\bEstacion\b/gi, "Estación"],
    [/\bConstitucion\b/gi, "Constitución"],
    [/\bConcepcion\b/gi, "Concepción"],
    [/\bAsuncion\b/gi, "Asunción"],
    [/\bNuñez\b/gi, "Núñez"],
    [/\bPeña\b/gi, "Peña"],
    [/\bTome\b/gi, "Tomé"],
    [/\bEjercito\b/gi, "Ejército"],
    [/\bCorreccin\b/gi, "Corrección"],
    [/\bCorreccion\b/gi, "Corrección"],
    [/\bSeccion\b/gi, "Sección"],
    [/\bDireccion\b/gi, "Dirección"],
    [/\bProduccion\b/gi, "Producción"],
    [/\bGestion\b/gi, "Gestión"],
  ];

  let result = text;
  for (const [regex, replacement] of dictionary) {
    result = result.replace(regex, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parseo CSV con soporte de campos entrecomillados multilínea
// ---------------------------------------------------------------------------

/**
 * Parsea un CSV con delimitador `;` respetando campos entrecomillados que
 * pueden contener saltos de línea internos.
 *
 * Retorna un array de arrays de strings (filas × columnas).
 */
function parseCSV(raw) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (insideQuotes) {
      if (ch === '"') {
        // Comilla doble escapada ("")
        if (i + 1 < raw.length && raw[i + 1] === '"') {
          currentField += '"';
          i++; // saltar la siguiente comilla
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        insideQuotes = true;
      } else if (ch === ";") {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
      } else if (ch === "\r") {
        // ignorar
      } else {
        currentField += ch;
      }
    }
  }

  // Última fila si no terminó en \n
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Procesamiento principal
// ---------------------------------------------------------------------------

function main() {
  // Leer el CSV con encoding correcto (Latin-1 / Windows-1252)
  const raw = readFileSync(CSV_PATH, CSV_ENCODING);
  const allRows = parseCSV(raw);

  // Fila 0 = título general ("Oficinas Telegraficas STS;;;;;;;Contacto;;;;")
  // Fila 1 = encabezados reales
  // Filas 2..N-1 = datos
  // Última fila posible = "Total;...;"

  // Índices de columnas (basados en el nuevo CSV de 8 columnas):
  // 0: NIS
  // 1: Provincia
  // 2: Tipo (Server, Cliente, Impresora)
  // 3: Departamento (Nombre de oficina)
  // 4: Dirección
  // 5: Hostname / Nombre normalizado
  // 6: IPv4
  // 7: Anotaciones (Observaciones)

  const dataRows = allRows.slice(1); // saltar encabezado real (esta versión no tiene título extra)

  /** @type {Map<string, object>} */
  const officesByNIS = new Map();

  for (const cols of dataRows) {
    // Ignorar filas vacías o la fila "Total"
    let nis = (cols[0] || "").trim().toUpperCase();
    if (!nis || nis === "TOTAL") continue;

    // Aplicar consolidación de NIS
    if (NIS_MERGE_MAP[nis]) {
      nis = NIS_MERGE_MAP[nis];
    }

    // Inicializar la oficina si no existe
    if (!officesByNIS.has(nis)) {
      const provincia = (cols[1] || "").trim();
      const departamento = (cols[3] || "").trim();
      const direccion = (cols[4] || "").trim();

      // Limpiar nombre: quitar "TELEG " del inicio
      let rawName = departamento;
      if (rawName.toUpperCase().startsWith("TELEG ")) {
        rawName = rawName.substring(6).trim();
      }

      // Aplicar fix de nombre si existe
      const finalName = NIS_NAME_FIXES[nis] || normalizeName(rawName);

      officesByNIS.set(nis, {
        id: `teleg-${nis.toLowerCase()}`,
        code: nis,
        name: finalName,
        type: "telegrafia",
        region: PROVINCE_MAP[provincia.toUpperCase()] || provincia,
        address: normalizeAddress(direccion),
        lat: -34.6,
        lng: -58.3,
        emails: new Set(),
        notesSet: new Set(),
        contacts: [],
        assets: [],
      });
    }

    const office = officesByNIS.get(nis);

    // --- Asset ---
    const tipoRaw = (cols[2] || "").trim().toLowerCase();
    const hostname = (cols[5] || "").trim();
    const ip = (cols[6] || "").trim();
    const assetType = ASSET_TYPE_MAP[tipoRaw];

    if (assetType && ip) {
      // Evitar duplicados de IP al fusionar
      const isDuplicateAsset = office.assets.some((a) => a.ip === ip);
      if (!isDuplicateAsset) {
        office.assets.push({
          type: assetType,
          hostname: hostname || "sin-nombre",
          ip,
        });
      }
    }

    // --- Anotaciones ---
    const anotaciones = (cols[7] || "").trim();
    if (anotaciones && anotaciones.toLowerCase() !== "no aplica") {
      office.notesSet.add(applyAccents(anotaciones));
    }

    // --- Email ---
    const email = (cols[10] || "").trim();
    if (email && email.toLowerCase() !== "no aplica") {
      office.emails.add(email);
    }
  }

  // ---------------------------------------------------------------------------
  // Generar la salida TypeScript
  // ---------------------------------------------------------------------------

  const offices = [];

  for (const [, office] of officesByNIS) {
    offices.push({
      id: office.id,
      code: office.code,
      name: office.name,
      type: office.type,
      region: office.region,
      address: office.address,
      lat: office.lat,
      lng: office.lng,
      email: [...office.emails].join(", ") || "",
      notes: [...office.notesSet].join(" ") || "",
      contacts: office.contacts,
      assets: office.assets,
    });
  }

  // Construir el archivo TS
  const lines = [];

  lines.push(`// Este archivo fue generado automáticamente por scripts/parse-telegrafia-csv.mjs`);
  lines.push(`// No editar manualmente — regenerar con: node scripts/parse-telegrafia-csv.mjs`);
  lines.push(``);
  lines.push(`export interface TelegrafiaContact {`);
  lines.push(`  name: string;`);
  lines.push(`  phone: string;`);
  lines.push(`  timeSlot: string;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export interface TelegrafiaAsset {`);
  lines.push(`  type: "server" | "printer" | "client";`);
  lines.push(`  hostname: string;`);
  lines.push(`  ip: string;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export interface Office {`);
  lines.push(`  id: string;`);
  lines.push(`  code: string;`);
  lines.push(`  name: string;`);
  lines.push(`  type: "telegrafia";`);
  lines.push(`  region: string;`);
  lines.push(`  address: string;`);
  lines.push(`  lat: number;`);
  lines.push(`  lng: number;`);
  lines.push(`  email: string;`);
  lines.push(`  notes: string;`);
  lines.push(`  contacts: TelegrafiaContact[];`);
  lines.push(`  assets: TelegrafiaAsset[];`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export const mockTelegrafia: Office[] = ${JSON.stringify(offices, null, 2)};`);
  lines.push(``);

  const output = lines.join("\n");

  writeFileSync(OUTPUT_PATH, output, "utf-8");

  console.log(`✅ Generado ${OUTPUT_PATH}`);
  console.log(`   → ${offices.length} oficinas procesadas`);

  // Stats
  const totalContacts = offices.reduce((n, o) => n + o.contacts.length, 0);
  const totalAssets = offices.reduce((n, o) => n + o.assets.length, 0);
  const withEmail = offices.filter((o) => o.email).length;
  const withNotes = offices.filter((o) => o.notes).length;

  console.log(`   → ${totalContacts} contactos`);
  console.log(`   → ${totalAssets} assets`);
  console.log(`   → ${withEmail} oficinas con email`);
  console.log(`   → ${withNotes} oficinas con observaciones`);
}

main();
