import { execFileSync } from "node:child_process";

// execFileSync corta la salida en 1 MiB por defecto y 6 meses de changelog ya rondan ese tamaño.
const GIT_MAX_OUTPUT = 64 * 1024 * 1024;
const BLOCK_HEADER = "@@";

interface CommitStats {
  ct: number;
  additions: number;
  deletions: number;
}

/**
 * Cache en memoria por hash (no por entrada): sobrevive a la invalidación del cache de
 * entradas, así que cada release solo resuelve los hashes que agrega. `null` marca un hash
 * que no resuelve a commit (inexistente, ambiguo o de otro tipo) y no se vuelve a consultar.
 */
const commitStatsCache = new Map<string, CommitStats | null>();

function shortHash(rawHash: string): string {
  return rawHash.trim().toLowerCase().slice(0, 7);
}

function runGitWithStdin(args: string[], input: string): string {
  return execFileSync("git", args, {
    input,
    stdio: ["pipe", "pipe", "ignore"],
    encoding: "utf-8",
    maxBuffer: GIT_MAX_OUTPUT,
  });
}

/**
 * Resuelve timestamp y numstat de los hashes pedidos en dos procesos git:
 * `cat-file --batch-check` (por stdin) filtra los que no resuelven a commit —un prefijo
 * ambiguo aborta el lote entero de `log --stdin`— y `log --no-walk --stdin` trae el resto.
 */
function loadCommitStats(hashes: string[]): void {
  const pending = [...new Set(hashes.map(shortHash))].filter(
    (h) => !commitStatsCache.has(h),
  );
  if (pending.length === 0) return;

  const shaToHash = new Map<string, string>();
  try {
    // ^{commit}: un prefijo ambiguo o de un no-commit sale como "missing" en vez de abortar el lote.
    const lines = runGitWithStdin(
      ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
      pending.map((h) => `${h}^{commit}`).join("\n") + "\n",
    ).split("\n");
    // cat-file responde exactamente una línea por línea de entrada.
    pending.forEach((hash, i) => {
      const [sha, type] = (lines[i] ?? "").split(" ");
      if (type === "commit") shaToHash.set(sha, hash);
      else commitStatsCache.set(hash, null);
    });
  } catch {
    return;
  }
  if (shaToHash.size === 0) return;

  let out: string;
  try {
    out = runGitWithStdin(
      [
        "log",
        "--no-walk=unsorted",
        "--stdin",
        "--numstat",
        `--format=${BLOCK_HEADER}%H %ct`,
      ],
      [...shaToHash.keys()].join("\n") + "\n",
    );
  } catch {
    return;
  }

  for (const block of out.split(/^@@/m).slice(1)) {
    const [header, ...body] = block.split("\n");
    const [sha, rawCt] = header.trim().split(/\s+/);
    if (!sha) continue;
    const ct = parseInt(rawCt ?? "", 10);
    const { additions, deletions } = parseNumstatOutput(body.join("\n"));
    commitStatsCache.set(shortHash(sha), {
      ct: Number.isNaN(ct) ? 0 : ct,
      additions,
      deletions,
    });
  }
}

/**
 * Precarga en un solo par de procesos git las stats de todos los hashes indicados.
 * Lo usa el servicio para que un render completo pague 2 procesos y no 2 por release.
 */
export function primeCommitStatsCache(hashes: string[]): void {
  loadCommitStats(hashes);
}

export interface ChangelogStats {
  additions: number;
  deletions: number;
  estimatedHours: number;
  formattedHours: string;
}

/**
 * Parsea la salida de `git show --numstat` sumando adiciones y eliminaciones.
 * Ignora líneas de archivos binarios ("- - path") y líneas vacías.
 */
export function parseNumstatOutput(output: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const addedStr = parts[0];
      const deletedStr = parts[1];

      // Los archivos binarios muestran '-' en vez de un número
      if (addedStr !== "-" && deletedStr !== "-") {
        const a = parseInt(addedStr, 10);
        const d = parseInt(deletedStr, 10);
        if (!Number.isNaN(a)) additions += a;
        if (!Number.isNaN(d)) deletions += d;
      }
    }
  }

  return { additions, deletions };
}

/**
 * Algoritmo de clustering de sesiones de trabajo sobre timestamps de commits (en segundos unix):
 * - Base por sesión iniciada o commit aislado: 30 minutos (1800 s).
 * - Commits con diferencia <= 2 horas (7200 s) se suman a la sesión actual como tiempo real.
 * - Commits con diferencia > 2 horas cierran la sesión y abren una nueva con 30 minutos base.
 */
export function estimateWorkHoursFromTimestamps(timestamps: number[]): {
  estimatedHours: number;
  formattedHours: string;
} {
  if (!timestamps || timestamps.length === 0) {
    return { estimatedHours: 0, formattedHours: "0.0 h" };
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const SESSION_THRESHOLD_SEC = 2 * 60 * 60; // 2 horas
  const BASE_SESSION_SEC = 30 * 60; // 30 minutos

  let totalSeconds = BASE_SESSION_SEC;

  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i] - sorted[i - 1];
    if (delta <= 0) {
      continue;
    }

    if (delta <= SESSION_THRESHOLD_SEC) {
      totalSeconds += delta;
    } else {
      totalSeconds += BASE_SESSION_SEC;
    }
  }

  const hours = totalSeconds / 3600;
  const rounded = Math.round(hours * 10) / 10;
  const formattedHours = `${rounded.toFixed(1)} h`;

  return {
    estimatedHours: rounded,
    formattedHours,
  };
}

/**
 * Calcula las estadísticas de numstat y clustering de horas para un conjunto de hashes de commit.
 * Fail-safe: si git falla o un hash no existe, esa parte suma cero.
 */
export function calculateCommitsStats(commits: string[]): ChangelogStats {
  const fallback: ChangelogStats = {
    additions: 0,
    deletions: 0,
    estimatedHours: 0,
    formattedHours: "0.0 h",
  };

  if (!commits || commits.length === 0) {
    return fallback;
  }

  const validCommits = commits.map((c) => c.trim()).filter((c) => c.length >= 7);
  if (validCommits.length === 0) {
    return fallback;
  }

  loadCommitStats(validCommits);

  let totalAdditions = 0;
  let totalDeletions = 0;
  const timestamps: number[] = [];

  for (const hash of new Set(validCommits.map(shortHash))) {
    const stats = commitStatsCache.get(hash);
    if (!stats) continue;
    totalAdditions += stats.additions;
    totalDeletions += stats.deletions;
    if (stats.ct > 0) timestamps.push(stats.ct);
  }

  const { estimatedHours, formattedHours } = estimateWorkHoursFromTimestamps(timestamps);

  return {
    additions: totalAdditions,
    deletions: totalDeletions,
    estimatedHours,
    formattedHours,
  };
}
