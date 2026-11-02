/**
 * Motor de validación sintáctica y diff determinista para bloques de rúbrica
 * según el Protocolo de Mantenimiento de rubricas-calidad.md.
 */

export interface RubricValidationResult {
  valid: boolean;
  errors: string[];
  parsedMeta?: {
    nombre?: string;
    lastCalibrated?: string;
    hasNullCase?: boolean;
  };
}

export interface DiffLine {
  type: "same" | "add" | "del";
  line: string;
}

export interface SimpleDiffResult {
  hasChanges: boolean;
  diffLines: DiffLine[];
  unifiedText: string;
}

export interface CalibrationMetadata {
  date: string;
  info: string;
  raw: string;
}

/**
 * Valida que un bloque editado de rúbrica cumpla estrictamente con la
 * gramática canónica de 7 claves, cotas Few-Shot y delimitadores del protocolo.
 */
export function validateRubricBlock(
  content: string,
  expectedCode: string,
): RubricValidationResult {
  const errors: string[] = [];
  const normalized = content.replace(/\r\n/g, "\n").trim();

  // 1. Validar delimitador ## criterio: <codigo>
  const delimiterMatches = Array.from(
    normalized.matchAll(/^## criterio:\s*([a-zA-Z0-9_-]+)/gm),
  );

  if (delimiterMatches.length === 0) {
    errors.push(`Falta el delimitador obligatorio: '## criterio: ${expectedCode}'`);
  } else if (delimiterMatches.length > 1) {
    errors.push(
      `El bloque contiene más de un delimitador '## criterio:'. Debe haber un delimitador único.`,
    );
  } else {
    const foundCode = delimiterMatches[0][1].trim();
    if (foundCode !== expectedCode) {
      errors.push(
        `El código del criterio ('${foundCode}') no coincide con el esperado ('${expectedCode}').`,
      );
    }
  }

  // 2. Validar claves canónicas obligatorias
  const requiredKeys: Array<{ key: string; label: string; regex: RegExp }> = [
    { key: "nombre", label: "Nombre (- **Nombre:**)", regex: /^- \*\*Nombre:\*\*\s*(.+)$/m },
    { key: "objetivo", label: "Objetivo (- **Objetivo:**)", regex: /^- \*\*Objetivo:\*\*\s*(.+)$/m },
    {
      key: "queBuscar",
      label: "Qué buscar en el ticket (- **Qué buscar en el ticket:**)",
      regex: /^- \*\*Qué buscar en el ticket:\*\*\s*(.+)$/m,
    },
    {
      key: "reglaCumple",
      label: "Regla Cumple (- **Regla Cumple (`cumple: true`):**)",
      regex: /^- \*\*Regla Cumple \(`cumple: true`\):\*\*\s*(.+)$/m,
    },
    {
      key: "reglaNoCumple",
      label: "Regla No Cumple (- **Regla No Cumple (`cumple: false`):**)",
      regex: /^- \*\*Regla No Cumple \(`cumple: false`\):\*\*\s*(.+)$/m,
    },
    {
      key: "ejemploCumple",
      label: "Ejemplo Cumple (- **Ejemplo Cumple:**)",
      regex: /^- \*\*Ejemplo Cumple:\*\*/m,
    },
    {
      key: "ejemploNoCumple",
      label: "Ejemplo No Cumple (- **Ejemplo No Cumple:**)",
      regex: /^- \*\*Ejemplo No Cumple:\*\*/m,
    },
  ];

  for (const req of requiredKeys) {
    if (!req.regex.test(normalized)) {
      errors.push(`Falta la sección obligatoria: ${req.label}`);
    }
  }

  // 3. Prohibición de parches informales (Protocolo §3)
  const informalPatches = normalized.match(
    /^- \*\*(Nota|Actualización|Actualizacion|Ojo|Excepción|Excepcion):\*\*/im,
  );
  if (informalPatches) {
    errors.push(
      "El bloque contiene parches informales prohibidos por el protocolo (Nota/Actualización/Ojo). Refine la regla existente directamente.",
    );
  }

  // 4. Cotas de Few-Shot: Evidencia ≤ 160 chars, Razonamiento ≤ 180 chars (Z6)
  const evidenceMatches = Array.from(
    normalized.matchAll(/^\s*-\s*Evidencia:\s*(?:"([^"]*)"|([^\n\r]+))/gm),
  );
  for (const m of evidenceMatches) {
    const text = (m[1] ?? m[2] ?? "").trim();
    if (text.length > 160) {
      errors.push(
        `Evidencia de ejemplo Few-Shot supera el límite de 160 caracteres (longitud: ${text.length}).`,
      );
    }
  }

  const reasoningMatches = Array.from(
    normalized.matchAll(/^\s*-\s*Razonamiento:\s*(?:"([^"]*)"|([^\n\r]+))/gm),
  );
  for (const m of reasoningMatches) {
    const text = (m[1] ?? m[2] ?? "").trim();
    if (text.length > 180) {
      errors.push(
        `Razonamiento de ejemplo Few-Shot supera el límite de 180 caracteres (longitud: ${text.length}).`,
      );
    }
  }

  // 5. Extracción de metadatos informativos
  const nombreMatch = normalized.match(/^- \*\*Nombre:\*\*\s*(.+)$/m);
  const nombre = nombreMatch ? nombreMatch[1].trim() : undefined;
  const calibrationMeta = extractCalibrationMetadata(normalized);

  return {
    valid: errors.length === 0,
    errors,
    parsedMeta: {
      nombre,
      lastCalibrated: calibrationMeta?.date,
      hasNullCase: /^- \*\*Caso Null \(`cumple: null`\):\*\*/m.test(normalized),
    },
  };
}

/**
 * Calcula un diff línea por línea simple mediante programación dinámica (LCS)
 * optimizado para bloques de rúbrica (< 100 líneas).
 */
export function computeSimpleDiff(
  original: string,
  modified: string,
): SimpleDiffResult {
  const origClean = original.replace(/\r\n/g, "\n").trim();
  const modClean = modified.replace(/\r\n/g, "\n").trim();

  if (origClean === modClean) {
    return {
      hasChanges: false,
      diffLines: origClean ? origClean.split("\n").map((l) => ({ type: "same", line: l })) : [],
      unifiedText: "",
    };
  }

  const a = origClean ? origClean.split("\n") : [];
  const b = modClean ? modClean.split("\n") : [];
  const n = a.length;
  const m = b.length;

  // Matriz LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtracking para construir diffLines
  let i = n;
  let j = m;
  const reversedDiff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversedDiff.push({ type: "same", line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversedDiff.push({ type: "add", line: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      reversedDiff.push({ type: "del", line: a[i - 1] });
      i--;
    }
  }

  const diffLines = reversedDiff.reverse();
  const hasChanges = diffLines.some((l) => l.type !== "same");

  const unifiedLines: string[] = [];
  for (const d of diffLines) {
    if (d.type === "same") {
      unifiedLines.push(`  ${d.line}`);
    } else if (d.type === "del") {
      unifiedLines.push(`- ${d.line}`);
    } else if (d.type === "add") {
      unifiedLines.push(`+ ${d.line}`);
    }
  }

  return {
    hasChanges,
    diffLines,
    unifiedText: hasChanges ? unifiedLines.join("\n") : "",
  };
}

/**
 * Formatea el comentario de calibración HTML canónico para incrustar en el bloque.
 * Formato: <!-- calibrado: YYYY-MM-DD | INFO | caso #TICKET -->
 */
export function formatCalibrationComment(
  date: string,
  info: string,
  ticketId?: string | number,
): string {
  const parts = [date, info.trim()];
  if (ticketId !== undefined && ticketId !== null && String(ticketId).trim() !== "") {
    parts.push(`caso #${String(ticketId).trim()}`);
  }
  return `<!-- calibrado: ${parts.join(" | ")} -->`;
}

/**
 * Expresión regular canónica para detectar y parsear el comentario HTML de calibración completo.
 */
export const CALIBRATION_COMMENT_REGEX =
  /<!--\s*calibrado:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\s*\|\s*([\s\S]*?))?\s*-->/;

/**
 * Verifica si un bloque contiene un comentario de calibración.
 */
export function hasCalibrationComment(block: string): boolean {
  return CALIBRATION_COMMENT_REGEX.test(block);
}

/**
 * Reemplaza el comentario de calibración existente en un bloque.
 */
export function replaceCalibrationComment(block: string, newComment: string): string {
  return block.replace(CALIBRATION_COMMENT_REGEX, newComment);
}

/**
 * Inserta o actualiza el comentario de calibración en un bloque.
 */
export function upsertCalibrationComment(
  block: string,
  criterionCode: string,
  newComment: string,
): string {
  if (hasCalibrationComment(block)) {
    return replaceCalibrationComment(block, newComment);
  }
  const headerRegex = new RegExp(`(## criterio:\\s*${criterionCode}\\s*\\n)`);
  if (headerRegex.test(block)) {
    return block.replace(headerRegex, `$1${newComment}\n`);
  }
  return `${newComment}\n${block}`;
}

/**
 * Extrae fecha y metadatos del comentario de calibración si existe en el texto.
 */
export function extractCalibrationMetadata(
  content: string,
): CalibrationMetadata | null {
  const match = content.match(CALIBRATION_COMMENT_REGEX);
  if (!match) return null;

  return {
    date: match[1].trim(),
    info: (match[2] ?? "").trim(),
    raw: match[0],
  };
}

/**
 * Normaliza el texto de una regla:
 * - Remueve viñetas iniciales (- , * , • )
 * - Colapsa saltos de línea y múltiples espacios a uno solo
 * - Aplica trim
 */
export function normalizeRuleText(text: string): string {
  return text
    .replace(/^[\s\-*•]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Evalúa amigablemente si un texto cuenta con la estructura causal SI / PERO / ENTONCES.
 * No es un gate bloqueante, sino un hint pedagógico para el supervisor.
 */
export function checkCausalHint(text: string): { isCausal: boolean; hint?: string } {
  const t = text.trim();
  if (!t) {
    return { isCausal: false };
  }

  const hasSi = /\bSI\b/i.test(t);
  const hasPero = /\bPERO\b/i.test(t);
  const hasEntonces = /\bENTONCES\b/i.test(t);

  if (hasSi && hasPero && hasEntonces) {
    return { isCausal: true };
  }

  return {
    isCausal: false,
    hint: "Sugerencia: para mayor precisión en la IA, podés redactar como: SI [condición] PERO [salvedad], ENTONCES [resolución].",
  };
}

export interface InsertRuleResult {
  success: boolean;
  newBlock: string;
  errors: string[];
}

/**
 * Inserta de manera no destructiva una regla en un bloque de rúbrica en la sección especificada.
 * Si la sección ya tiene viñetas, añade la nueva al final.
 * Si la sección tiene formato inline en la misma línea del encabezado, la convierte a lista con viñetas.
 * Finalmente valida el bloque con validateRubricBlock para asegurar que conserve la gramática de 7 claves.
 */
export function insertRuleIntoBlock(
  block: string,
  ruleText: string,
  targetSection: "cumple" | "no_cumple",
  expectedCode: string,
): InsertRuleResult {
  const normalizedRule = normalizeRuleText(ruleText);
  if (!normalizedRule) {
    return {
      success: false,
      newBlock: block,
      errors: ["El texto de la regla no puede estar vacío."],
    };
  }

  const normalizedBlock = block.replace(/\r\n/g, "\n");
  const lines = normalizedBlock.split("\n");

  // Regex para ubicar el encabezado de destino
  const headerRegex =
    targetSection === "cumple"
      ? /^- \*\*Regla Cumple(?:\s*\(`cumple:\s*true`\))?:\*\*(.*)$/
      : /^- \*\*Regla No Cumple(?:\s*\(`cumple:\s*false`\))?:\*\*(.*)$/;

  let headerIndex = -1;
  let inlineContent = "";

  for (let idx = 0; idx < lines.length; idx++) {
    const match = lines[idx].match(headerRegex);
    if (match) {
      headerIndex = idx;
      inlineContent = (match[1] ?? "").trim();
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      success: false,
      newBlock: block,
      errors: [
        `No se encontró el encabezado canónico para la sección ${targetSection === "cumple" ? "Regla Cumple" : "Regla No Cumple"}.`,
      ],
    };
  }

  const headerLine = lines[headerIndex];
  // Si la línea tenía texto inline (ej: "- **Regla Cumple:** Texto existente")
  if (inlineContent) {
    // Normalizar encabezado para dejarlo limpio de texto inline
    const cleanHeader = headerLine.replace(headerRegex, (full, rest) => {
      return full.slice(0, full.length - rest.length).trimEnd();
    });

    const newLines = [
      ...lines.slice(0, headerIndex),
      cleanHeader,
      `  - ${inlineContent}`,
      `  - ${normalizedRule}`,
      ...lines.slice(headerIndex + 1),
    ];

    const candidateBlock = newLines.join("\n");
    const val = validateRubricBlock(candidateBlock, expectedCode);
    if (!val.valid) {
      return { success: false, newBlock: block, errors: val.errors };
    }

    return { success: true, newBlock: candidateBlock, errors: [] };
  }

  // Si ya estaba en formato multilínea o con viñetas subordinadas
  // Buscar dónde terminan las viñetas de esta sección (siguiente línea que empiece con "- **" o fin de archivo)
  let insertAt = headerIndex + 1;
  while (insertAt < lines.length) {
    const l = lines[insertAt];
    // Si encontramos el inicio de otra clave principal canónica ("- **") o delimitador ("---" o "##")
    if (/^- \*\*[^*]+:\*\*/.test(l) || /^## criterio:/.test(l) || /^---/.test(l)) {
      break;
    }
    insertAt++;
  }

  // Retroceder líneas vacías previas a la siguiente sección si las hubiera
  let targetInsertIndex = insertAt;
  while (targetInsertIndex > headerIndex + 1 && lines[targetInsertIndex - 1].trim() === "") {
    targetInsertIndex--;
  }

  const newLines = [
    ...lines.slice(0, targetInsertIndex),
    `  - ${normalizedRule}`,
    ...lines.slice(targetInsertIndex),
  ];

  const candidateBlock = newLines.join("\n");
  const val = validateRubricBlock(candidateBlock, expectedCode);
  if (!val.valid) {
    return { success: false, newBlock: block, errors: val.errors };
  }

  return { success: true, newBlock: candidateBlock, errors: [] };
}

