import { eq } from "drizzle-orm";
import { db } from "@db/index";
import { offices, officeInvgateLinks } from "@db/schema";

export type ExpectedOfficeType = {
  type: "SUCURSAL" | "AGENCIA";
  officeType: "AUTOMATIZADA" | null;
  reason: "suc_mosaic" | "suc" | "age";
};

export interface OfficeTypeMismatch {
  code: string;
  name: string;
  currentType: string;
  currentOfficeType: string | null;
  expectedType: "SUCURSAL" | "AGENCIA";
  expectedOfficeType: "AUTOMATIZADA" | null;
  reason: "suc_mosaic" | "suc" | "age";
  invgateDisplayName: string;
}

// Allowlist explícito: "SUC 7" y "SUC 37" son nodos de telegrafía, no sucursales.
const SUCURSAL_SUFFIXES = [
  "SUC GIROS",
  "SUC POR FAX",
  "SUC BACK OFFICE",
  "SUC POSTAL",
];

export function inferExpectedOfficeType(
  displayName: string,
  currentType?: string | null,
): ExpectedOfficeType | null {
  if (currentType?.toUpperCase() === "TELEGRAFIA") return null;

  const suffix = displayName.split(" - ").pop()?.trim().toUpperCase() ?? "";

  if (suffix.startsWith("SUC MOSAIC")) {
    return {
      type: "SUCURSAL",
      officeType: "AUTOMATIZADA",
      reason: "suc_mosaic",
    };
  }

  if (
    suffix === "SUC" ||
    SUCURSAL_SUFFIXES.some((prefix) => suffix.startsWith(prefix))
  ) {
    return { type: "SUCURSAL", officeType: null, reason: "suc" };
  }

  if (suffix === "AGE" || suffix.startsWith("AGE ")) {
    return { type: "AGENCIA", officeType: null, reason: "age" };
  }

  return null;
}

export async function findOfficeTypeMismatches(): Promise<
  OfficeTypeMismatch[]
> {
  const rows = await db
    .select({
      code: offices.code,
      name: offices.name,
      type: offices.type,
      officeType: offices.officeType,
      invgateDisplayName: officeInvgateLinks.invgateDisplayName,
    })
    .from(offices)
    .innerJoin(officeInvgateLinks, eq(offices.id, officeInvgateLinks.officeId));

  const mismatches: OfficeTypeMismatch[] = [];

  for (const row of rows) {
    if (!row.invgateDisplayName) continue;

    const expected = inferExpectedOfficeType(row.invgateDisplayName, row.type);
    if (!expected) continue;

    const typeMatches = row.type.toUpperCase() === expected.type;
    const officeTypeMatches =
      expected.officeType === null ||
      row.officeType?.toUpperCase() === "AUTOMATIZADA";

    if (typeMatches && officeTypeMatches) continue;

    mismatches.push({
      code: row.code,
      name: row.name,
      currentType: row.type,
      currentOfficeType: row.officeType,
      expectedType: expected.type,
      expectedOfficeType: expected.officeType,
      reason: expected.reason,
      invgateDisplayName: row.invgateDisplayName,
    });
  }

  return mismatches.sort(
    (a, b) => a.reason.localeCompare(b.reason) || a.code.localeCompare(b.code),
  );
}
