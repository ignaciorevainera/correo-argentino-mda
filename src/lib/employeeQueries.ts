import { db } from "@db/index";
import { employees } from "@db/schema";
import { isNull, or, eq, sql, and } from "drizzle-orm";

export async function getUnassignedEmployeesCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(
      and(
        eq(employees.invgateExists, true),
        or(isNull(employees.sucursal), eq(employees.sucursal, "")),
      ),
    );
  return result[0]?.count ?? 0;
}

export async function getUnassignedEmployees(options?: {
  offset?: number;
  limit?: number;
}) {
  return db
    .select({
      dni: employees.dni,
      username: employees.username,
      fullname: employees.fullname,
      interno: employees.interno,
      telefono: employees.telefono,
      sucursal: employees.sucursal,
      invgateExists: employees.invgateExists,
      invgateId: employees.invgateId,
      position: employees.position,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .where(
      and(
        eq(employees.invgateExists, true),
        or(isNull(employees.sucursal), eq(employees.sucursal, "")),
      ),
    )
    .limit(options?.limit ?? 30)
    .offset(options?.offset ?? 0);
}
