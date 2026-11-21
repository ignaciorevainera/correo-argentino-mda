import "dotenv/config";
import { test, expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/index";
import { offices, officeInvgateLinks, auditLogs } from "../../src/db/schema";
import { generateCsrfToken } from "../../src/lib/csrf";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

const CODES = [
  "E2E177M1",
  "E2E177A1",
  "E2E177N1",
  "E2E177X1",
  "E2E177L1",
  "E2E177Z1",
  "E2E177T1",
  "E2E177T2",
];
const MDA_TI_MESA = "TI_GSM_MDA TI";
const FIX_URL = "/api/admin/invgate/locations/fix-type";

let admin: TestUser;

async function seed() {
  const existing = await db
    .select({ code: offices.code })
    .from(offices)
    .where(inArray(offices.code, CODES));
  if (existing.length > 0) {
    throw new Error(
      `Fixture E2E colisiona con oficinas existentes: ${existing.map((r) => r.code).join(", ")}`,
    );
  }

  await db.delete(offices).where(inArray(offices.code, CODES));

  const rows = await db
    .insert(offices)
    .values([
      {
        code: "E2E177M1",
        name: "E2E FRANCISCO ALVAREZ",
        type: "AGENCIA",
        officeType: "NO AUTOMATIZADA",
        provinceCode: "B",
      },
      {
        code: "E2E177A1",
        name: "E2E HUDSON",
        type: "SUCURSAL",
        officeType: "NO AUTOMATIZADA",
        provinceCode: "B",
      },
      {
        code: "E2E177N1",
        name: "E2E SIN SUFIJO",
        type: "SUCURSAL",
        officeType: "NO AUTOMATIZADA",
        provinceCode: "B",
      },
      {
        code: "E2E177X1",
        name: "E2E MULTI SEGMENTO",
        type: "SUCURSAL",
        officeType: "NO AUTOMATIZADA",
        provinceCode: "B",
      },
      {
        code: "E2E177L1",
        name: "E2E LEGACY OFFICE TYPE",
        type: "SUCURSAL",
        officeType: "NO AUTOMATIZADA",
        provinceCode: "B",
      },
      {
        code: "E2E177Z1",
        name: "E2E DISPLAY NAME NULO",
        type: "SUCURSAL",
        officeType: "NO AUTOMATIZADA",
        provinceCode: "B",
      },
      {
        code: "E2E177T1",
        name: "E2E TELEGRAFIA SUC 7",
        type: "TELEGRAFIA",
        officeType: null,
        provinceCode: "B",
      },
      {
        code: "E2E177T2",
        name: "E2E TELEGRAFIA SUC GIROS",
        type: "TELEGRAFIA",
        officeType: null,
        provinceCode: "B",
      },
    ])
    .returning({ id: offices.id, code: offices.code });

  const idByCode = new Map(rows.map((row) => [row.code, row.id]));

  await db.insert(officeInvgateLinks).values([
    {
      officeId: idByCode.get("E2E177M1")!,
      invgateLocationId: 9901771,
      invgateDisplayName: "E2E FRANCISCO ALVAREZ - SUC MOSAIC",
    },
    {
      officeId: idByCode.get("E2E177A1")!,
      invgateLocationId: 9901772,
      invgateDisplayName: "E2E HUDSON - AGE GIROS",
    },
    {
      officeId: idByCode.get("E2E177N1")!,
      invgateLocationId: 9901773,
      invgateDisplayName: "E2E SIN SUFIJO",
    },
    {
      officeId: idByCode.get("E2E177X1")!,
      invgateLocationId: 9901774,
      invgateDisplayName: "E2E MULTI - SUC - AGE GIROS",
    },
    {
      officeId: idByCode.get("E2E177L1")!,
      invgateLocationId: 9901775,
      invgateDisplayName: "E2E LEGACY - SUC GIROS",
    },
    {
      officeId: idByCode.get("E2E177Z1")!,
      invgateLocationId: 9901776,
      invgateDisplayName: null,
    },
    {
      officeId: idByCode.get("E2E177T1")!,
      invgateLocationId: 9901777,
      invgateDisplayName: "E2E TELEG CF - SUC 7",
    },
    {
      officeId: idByCode.get("E2E177T2")!,
      invgateLocationId: 9901778,
      invgateDisplayName: "E2E TELEG CF - SUC GIROS",
    },
  ]);
}

test.beforeEach(async () => {
  test.setTimeout(90_000);
  await seed();
  admin = await createTestUserAndSession("admin", {
    helpdeskName: MDA_TI_MESA,
  });
});

test.afterEach(async () => {
  if (!admin) return;
  await db.delete(auditLogs).where(eq(auditLogs.username, admin.username));
  await db.delete(offices).where(inArray(offices.code, CODES));
  await cleanupTestUser(admin.userId, admin.sessionId);
});

test("lista SUC MOSAIC y AGE, y excluye nombres sin sufijo", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  await page.goto("/admin/invgate/ubicaciones");

  await expect(
    page.getByRole("heading", { name: "Diferencias de tipo" }),
  ).toBeVisible();
  await expect(page.locator("[data-mismatch-code='E2E177M1']")).toContainText(
    "Sucursal Automatizada",
  );
  await expect(page.locator("[data-mismatch-code='E2E177A1']")).toContainText(
    "Agencia",
  );
  await expect(page.locator("[data-mismatch-code='E2E177X1']")).toContainText(
    "Agencia",
  );
  await expect(page.locator("[data-mismatch-code='E2E177N1']")).toHaveCount(0);
  await expect(page.locator("[data-mismatch-code='E2E177L1']")).toHaveCount(0);
  await expect(page.locator("[data-mismatch-code='E2E177Z1']")).toHaveCount(0);
  await expect(page.locator("[data-mismatch-code='E2E177T1']")).toHaveCount(0);
  await expect(page.locator("[data-mismatch-code='E2E177T2']")).toHaveCount(0);
});

test("rechaza sin CSRF y no escribe", async ({ context }) => {
  await setSessionCookie(context, admin.signedSessionId);
  const res = await context.request.post(FIX_URL, {
    data: { code: "E2E177M1" },
  });
  expect(res.status()).toBe(403);

  const [row] = await db
    .select({ type: offices.type })
    .from(offices)
    .where(eq(offices.code, "E2E177M1"));
  expect(row.type).toBe("AGENCIA");
});

test("rechaza a un agente sin escritura y no escribe", async ({ context }) => {
  const agent = await createTestUserAndSession("agent", {
    helpdeskName: MDA_TI_MESA,
  });

  try {
    await setSessionCookie(context, agent.signedSessionId);
    const res = await context.request.post(FIX_URL, {
      headers: { "X-CSRF-Token": generateCsrfToken(agent.sessionId) },
      data: { code: "E2E177M1" },
    });
    expect(res.status()).toBe(403);
  } finally {
    await cleanupTestUser(agent.userId, agent.sessionId);
  }

  const [row] = await db
    .select({ type: offices.type })
    .from(offices)
    .where(eq(offices.code, "E2E177M1"));
  expect(row.type).toBe("AGENCIA");
});

test("rechaza a un team_leader y no escribe", async ({ context }) => {
  const leader = await createTestUserAndSession("team_leader", {
    helpdeskName: MDA_TI_MESA,
  });

  try {
    await setSessionCookie(context, leader.signedSessionId);
    const res = await context.request.post(FIX_URL, {
      headers: { "X-CSRF-Token": generateCsrfToken(leader.sessionId) },
      data: { code: "E2E177M1" },
    });
    expect(res.status()).toBe(403);
  } finally {
    await cleanupTestUser(leader.userId, leader.sessionId);
  }
});

test("corrige SUC MOSAIC a SUCURSAL AUTOMATIZADA y audita", async ({
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  const res = await context.request.post(FIX_URL, {
    headers: { "X-CSRF-Token": generateCsrfToken(admin.sessionId) },
    data: { code: "E2E177M1" },
  });
  expect(res.status()).toBe(200);

  const [row] = await db
    .select({ type: offices.type, officeType: offices.officeType })
    .from(offices)
    .where(eq(offices.code, "E2E177M1"));
  expect(row).toEqual({ type: "SUCURSAL", officeType: "AUTOMATIZADA" });

  const [audit] = await db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.username, admin.username));
  expect(audit.action).toContain("E2E177M1");
});

test("corrige AGE a AGENCIA y limpia officeType", async ({ context }) => {
  await setSessionCookie(context, admin.signedSessionId);
  const res = await context.request.post(FIX_URL, {
    headers: { "X-CSRF-Token": generateCsrfToken(admin.sessionId) },
    data: { code: "E2E177A1" },
  });
  expect(res.status()).toBe(200);

  const [row] = await db
    .select({ type: offices.type, officeType: offices.officeType })
    .from(offices)
    .where(eq(offices.code, "E2E177A1"));
  expect(row).toEqual({ type: "AGENCIA", officeType: null });
});

test("responde 409 en la segunda corrección", async ({ context }) => {
  await setSessionCookie(context, admin.signedSessionId);
  const headers = { "X-CSRF-Token": generateCsrfToken(admin.sessionId) };

  const first = await context.request.post(FIX_URL, {
    headers,
    data: { code: "E2E177M1" },
  });
  expect(first.status()).toBe(200);

  const second = await context.request.post(FIX_URL, {
    headers,
    data: { code: "E2E177M1" },
  });
  expect(second.status()).toBe(409);
});

test("responde 422 si la location no tiene sufijo reconocido", async ({
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  const res = await context.request.post(FIX_URL, {
    headers: { "X-CSRF-Token": generateCsrfToken(admin.sessionId) },
    data: { code: "E2E177N1" },
  });
  expect(res.status()).toBe(422);
});

test("el botón limpia una fila stale cuando el endpoint responde 409", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  await page.goto("/admin/invgate/ubicaciones");

  await db
    .update(offices)
    .set({ type: "SUCURSAL", officeType: "AUTOMATIZADA" })
    .where(eq(offices.code, "E2E177M1"));

  const row = page.locator("[data-mismatch-code='E2E177M1']");
  await expect(row).toBeVisible();
  await row.locator("[data-fix-code]").click();

  await expect(row).toHaveCount(0);
});

test("el botón Corregir actualiza la fila y la DB", async ({
  page,
  context,
}) => {
  await setSessionCookie(context, admin.signedSessionId);
  await page.goto("/admin/invgate/ubicaciones");

  const row = page.locator("[data-mismatch-code='E2E177M1']");
  await expect(row).toBeVisible();
  await row.locator("[data-fix-code]").click();

  await expect(row).toHaveCount(0);

  const [updated] = await db
    .select({ type: offices.type, officeType: offices.officeType })
    .from(offices)
    .where(eq(offices.code, "E2E177M1"));
  expect(updated).toEqual({ type: "SUCURSAL", officeType: "AUTOMATIZADA" });
});
