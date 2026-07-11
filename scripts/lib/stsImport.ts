import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { db } from "../../src/db/index";
import { offices, officeAssets, auditLogs } from "../../src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { normalizeSearchValue } from "../../src/lib/clientSearch";
import type { OfficeAssetType } from "../../src/types/offices";

export interface CsvMachine {
  officeName: string;
  region: string;
  provincia: string;
  funcion: string;
  serverCol: string;
  clieCol: string;
  impCol: string;
  totalPc: string;
  totalImpresoras: string;
  tipoServer: string;
  hostname: string;
  ip: string;
  codigoSts: string;
  observaciones: string;
}

export interface CsvOffice {
  codigoSts: string;
  name: string;
  machines: CsvMachine[];
}

export interface OfficeRow {
  id: number;
  code: string;
  name: string;
  provinceCode: string;
}

export interface AssetRow {
  id: number;
  officeId: number;
  type: string;
  hostname: string | null;
  ip: string | null;
}

export interface Mutation {
  action: "insert" | "update" | "noop" | "skip_no_hostname";
  officeId: number;
  officeCode: string;
  officeName: string;
  type: string;
  hostname: string | null;
  ip: string | null;
  existingAssetId?: number;
  changedFields?: string[];
}

export interface ImportDiff {
  matched: number;
  csvOnlyOffices: { codigoSts: string; name: string; province: string }[];
  dbOnlyOffices: { code: string; name: string; provinceCode: string }[];
  mutations: Mutation[];
  totalInserts: number;
  totalUpdates: number;
  totalNoops: number;
  totalSkippedNoHostname: number;
}

const FUNCION_MAP: Record<string, OfficeAssetType> = {
  serv: "server",
  server: "server",
  imp: "printer",
  klie: "client",
  corr: "client",
};

function normalizeFuncion(raw: string): OfficeAssetType {
  const lower = raw.toLowerCase().trim();
  if (FUNCION_MAP[lower]) return FUNCION_MAP[lower];
  const base = lower.split("/")[0];
  if (FUNCION_MAP[base]) return FUNCION_MAP[base];
  return "client";
}

function normalizeHostname(raw: string): string | null {
  const v = raw?.trim();
  if (!v || v.length === 0) return null;
  return v.toUpperCase();
}

function readCsvFile(filePath: string): CsvOffice[] {
  const raw = readFileSync(filePath, "latin1");
  const records = parse(raw, {
    delimiter: ";",
    relax_column_count: true,
    skip_empty_lines: true,
    from_line: 2,
    columns: [
      "officeName", "region", "provincia", "funcion",
      "serverCol", "clieCol", "impCol", "totalPc",
      "totalImpresoras", "tipoServer", "hostname", "ip",
      "codigoSts", "observaciones",
    ],
  }) as CsvMachine[];

  const grouped = new Map<string, CsvMachine[]>();
  for (const r of records) {
    if (!r.codigoSts) continue;
    const code = r.codigoSts.toUpperCase().trim();
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code)!.push(r);
  }

  const result: CsvOffice[] = [];
  for (const [codigoSts, machines] of grouped) {
    result.push({ codigoSts, name: machines[0].officeName, machines });
  }
  return result;
}

export { readCsvFile, normalizeFuncion, normalizeHostname };

const PROVINCE_SUFFIX_MAP: Record<string, string> = {
  BA: "B",
  CF: "C",
  MZA: "M",
  LR: "F",
};

function inferProvinceCode(rawProvince: string, officeName: string): string {
  const v = rawProvince?.trim().toUpperCase();
  if (v && v !== "#N/D" && v.length === 1) return v;
  const upper = officeName.toUpperCase().trim();
  for (const [suffix, code] of Object.entries(PROVINCE_SUFFIX_MAP)) {
    if (upper.endsWith(` ${suffix}`)) return code;
  }
  console.warn(`WARN: can't infer province for "${officeName}" (raw="${rawProvince}"), defaulting to C`);
  return "C";
}

export { inferProvinceCode };

export interface NewOfficeInfo {
  codigoSts: string;
  name: string;
  provinceCode: string;
  machines: CsvMachine[];
}

async function createCsvOnlyOffices(
  csvOffices: CsvOffice[],
  username: string,
): Promise<NewOfficeInfo[]> {
  const existing = await loadDbOffices();
  const todo: NewOfficeInfo[] = [];

  for (const co of csvOffices) {
    if (existing.has(co.codigoSts.toUpperCase())) continue;
    const machine = co.machines[0];
    const provinceCode = inferProvinceCode(machine?.provincia || "", co.name);
    todo.push({
      codigoSts: co.codigoSts,
      name: co.name,
      provinceCode,
      machines: co.machines,
    });
  }

  const auditEntries: { username: string; action: string }[] = todo.map((o) => ({
    username,
    action: `STS_IMPORT: create office code=${o.codigoSts} name=${o.name} provinceCode=${o.provinceCode}`,
  }));

  db.transaction((tx) => {
    for (const o of todo) {
      const searchableText = normalizeSearchValue(
        [o.codigoSts, o.name].filter(Boolean).join(" ")
      );
      tx.insert(offices).values({
        code: o.codigoSts,
        name: o.name,
        type: "TELEGRAFIA",
        provinceCode: o.provinceCode,
        searchableText,
      }).run();
    }
    const ts = new Date().toISOString();
    for (const entry of auditEntries) {
      tx.insert(auditLogs).values({
        username: entry.username,
        action: entry.action,
        timestamp: ts,
      }).run();
    }
  });

  if (todo.length > 0) {
    console.log(`Created ${todo.length} offices.`);
  }

  const nullRows = await db
    .select({ id: offices.id, code: offices.code, name: offices.name })
    .from(offices)
    .where(and(eq(offices.type, "TELEGRAFIA"), sql`${offices.searchableText} IS NULL`));

  if (nullRows.length > 0) {
    await db.transaction((tx) => {
      for (const r of nullRows) {
        tx.update(offices)
          .set({ searchableText: normalizeSearchValue([r.code, r.name].join(" ")) })
          .where(eq(offices.id, r.id))
          .run();
      }
    });
    console.log(`Backfilled searchableText for ${nullRows.length} offices.`);
  }

  return todo;
}

export { createCsvOnlyOffices };

async function loadDbOffices(): Promise<Map<string, OfficeRow>> {
  const rows = await db
    .select({ id: offices.id, code: offices.code, name: offices.name, provinceCode: offices.provinceCode })
    .from(offices)
    .where(eq(offices.type, "TELEGRAFIA"));
  const map = new Map<string, OfficeRow>();
  for (const r of rows) {
    map.set(r.code.toUpperCase(), r);
  }
  return map;
}

async function loadDbAssets(officeIds: number[]): Promise<Map<number, AssetRow[]>> {
  if (officeIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(officeAssets)
    .where(inArray(officeAssets.officeId, officeIds));
  const map = new Map<number, AssetRow[]>();
  for (const r of rows) {
    if (!map.has(r.officeId)) map.set(r.officeId, []);
    map.get(r.officeId)!.push(r);
  }
  return map;
}

async function previewImport(csvOffices: CsvOffice[]): Promise<ImportDiff> {
  const dbOffices = await loadDbOffices();
  const matchedIds: number[] = [];
  const csvOnly: { codigoSts: string; name: string; province: string }[] = [];
  const mutations: Mutation[] = [];

  for (const csv of csvOffices) {
    const dbOffice = dbOffices.get(csv.codigoSts.toUpperCase());
    if (!dbOffice) {
      csvOnly.push({
        codigoSts: csv.codigoSts,
        name: csv.name,
        province: csv.machines[0]?.provincia || "",
      });
      continue;
    }
    matchedIds.push(dbOffice.id);
  }

  const dbAssets = await loadDbAssets(matchedIds);
  let totalInserts = 0;
  let totalUpdates = 0;
  let totalNoops = 0;
  let totalSkippedNoHostname = 0;

  for (const csv of csvOffices) {
    const dbOffice = dbOffices.get(csv.codigoSts.toUpperCase());
    if (!dbOffice) continue;

    const existingAssets = dbAssets.get(dbOffice.id) || [];

    for (const machine of csv.machines) {
      const assetType = normalizeFuncion(machine.funcion);
      const hostname = normalizeHostname(machine.hostname);
      const ip = (machine.ip || "").trim();

      if (!hostname && !ip) {
        mutations.push({
          action: "skip_no_hostname",
          officeId: dbOffice.id,
          officeCode: dbOffice.code,
          officeName: dbOffice.name,
          type: assetType,
          hostname: null,
          ip: null,
        });
        totalSkippedNoHostname++;
        continue;
      }

      let match: AssetRow | undefined;

      if (hostname) {
        match = existingAssets.find(
          (a) =>
            a.type.toLowerCase() === assetType &&
            (a.hostname || "").toUpperCase() === hostname
        );
      }

      if (!match && ip && ip.toLowerCase() !== "no conectada" && ip.toLowerCase() !== "sin habilitar") {
        match = existingAssets.find(
          (a) =>
            a.type.toLowerCase() === assetType &&
            (a.ip || "").trim().toLowerCase() === ip.toLowerCase()
        );
      }

      if (match) {
        const changedFields: string[] = [];
        const newHostname = hostname || match.hostname;
        if (newHostname && newHostname.toUpperCase() !== (match.hostname || "").toUpperCase()) {
          changedFields.push("hostname");
        }
        if (ip && (match.ip || "").trim().toLowerCase() !== ip.toLowerCase()) {
          changedFields.push("ip");
        }

        if (changedFields.length > 0) {
          mutations.push({
            action: "update",
            officeId: dbOffice.id,
            officeCode: dbOffice.code,
            officeName: dbOffice.name,
            type: assetType,
            hostname: newHostname,
            ip: ip || match.ip,
            existingAssetId: match.id,
            changedFields,
          });
          totalUpdates++;
        } else {
          mutations.push({
            action: "noop",
            officeId: dbOffice.id,
            officeCode: dbOffice.code,
            officeName: dbOffice.name,
            type: assetType,
            hostname: hostname || match.hostname,
            ip: ip || match.ip,
            existingAssetId: match.id,
          });
          totalNoops++;
        }
      } else {
        mutations.push({
          action: "insert",
          officeId: dbOffice.id,
          officeCode: dbOffice.code,
          officeName: dbOffice.name,
          type: assetType,
          hostname,
          ip: ip || null,
        });
        totalInserts++;
      }
    }
  }

  const dbOnly: { code: string; name: string; provinceCode: string }[] = [];
  for (const [code, office] of dbOffices) {
    if (!csvOffices.find((c) => c.codigoSts.toUpperCase() === code)) {
      dbOnly.push({
        code: office.code,
        name: office.name,
        provinceCode: office.provinceCode,
      });
    }
  }

  return {
    matched: matchedIds.length,
    csvOnlyOffices: csvOnly,
    dbOnlyOffices: dbOnly,
    mutations,
    totalInserts,
    totalUpdates,
    totalNoops,
    totalSkippedNoHostname,
  };
}

export { previewImport };

async function applyImport(diff: ImportDiff, username: string): Promise<void> {
  const auditEntries: { username: string; action: string }[] = [];

  for (const m of diff.mutations) {
    if (m.action === "skip_no_hostname" || m.action === "noop") continue;

    if (m.action === "insert") {
      auditEntries.push({
        username,
        action: `STS_IMPORT: insert office_asset office_id=${m.officeId} type=${m.type} hostname=${m.hostname || ""} ip=${m.ip || ""}`,
      });
    } else if (m.action === "update" && m.existingAssetId) {
      auditEntries.push({
        username,
        action: `STS_IMPORT: update office_asset id=${m.existingAssetId} hostname=${m.hostname || ""} ip=${m.ip || ""} [${(m.changedFields || []).join(",")}]`,
      });
    }
  }

  db.transaction((tx) => {
    for (const m of diff.mutations) {
      if (m.action === "skip_no_hostname" || m.action === "noop") continue;

      if (m.action === "insert") {
        tx.insert(officeAssets).values({
          officeId: m.officeId,
          type: m.type,
          hostname: m.hostname,
          ip: m.ip,
        }).run();
      } else if (m.action === "update" && m.existingAssetId) {
        const updates: Record<string, unknown> = {};
        if (m.changedFields?.includes("hostname")) {
          updates.hostname = m.hostname;
        }
        if (m.changedFields?.includes("ip")) {
          updates.ip = m.ip;
        }
        if (Object.keys(updates).length > 0) {
          tx.update(officeAssets)
            .set(updates)
            .where(eq(officeAssets.id, m.existingAssetId))
            .run();
        }
      }
    }

    for (const entry of auditEntries) {
      tx.insert(auditLogs).values({
        username: entry.username,
        action: entry.action,
        timestamp: new Date().toISOString(),
      }).run();
    }
  });
}

export { applyImport };
