import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";
import { db } from "../../src/db/index";
import { deletedRecords, offices, provinces } from "../../src/db/schema";
import { desc, eq } from "drizzle-orm";

const TEST_CODE_PREFIX = "PAPTEST";

let admin: TestUser;
let plainUser: TestUser;
let provinceCode: string;
let createdCode: string;

async function cleanupTestData() {
  const recs = await db
    .select()
    .from(deletedRecords)
    .where(eq(deletedRecords.entity, "oficina"));
  for (const rec of recs) {
    const payload = rec.payload as any;
    const code = payload?.row?.code;
    if (typeof code === "string" && code.startsWith(TEST_CODE_PREFIX)) {
      await db.delete(offices).where(eq(offices.code, code));
      await db.delete(deletedRecords).where(eq(deletedRecords.id, rec.id));
    }
  }
}

async function createTestOffice(code: string): Promise<number> {
  const [office] = await db
    .insert(offices)
    .values({
      code,
      name: `Oficina Papelera ${code}`,
      type: "sucursal",
      provinceCode,
    })
    .returning({ id: offices.id });
  return office.id;
}

test.describe.serial("Papelera de borrados recuperables", () => {
  test.beforeAll(async () => {
    admin = await createTestUserAndSession("admin");
    plainUser = await createTestUserAndSession("agent");
    const [province] = await db.select().from(provinces).limit(1);
    provinceCode = province?.code ?? "Q";
    await cleanupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await cleanupTestUser(admin.userId, admin.sessionId);
    await cleanupTestUser(plainUser.userId, plainUser.sessionId);
  });

  test("borrar oficina crea snapshot en papelera", async ({ page }) => {
    createdCode = `${TEST_CODE_PREFIX}${Date.now()}`;
    const officeId = await createTestOffice(createdCode);
    await setSessionCookie(page.context(), admin.signedSessionId);

    const res = await page.request.post(
      `http://127.0.0.1:4321/oficinas/edit/${officeId}/eliminar`,
    );
    expect(res.ok()).toBeTruthy();

    // La oficina ya no existe
    const [gone] = await db
      .select()
      .from(offices)
      .where(eq(offices.code, createdCode));
    expect(gone).toBeUndefined();

    // Hay snapshot con payload completo
    const matching = await db
      .select()
      .from(deletedRecords)
      .where(eq(deletedRecords.recordId, String(officeId)));
    expect(matching).toHaveLength(1);
    const rec = matching[0];
    expect(rec.entity).toBe("oficina");
    const payload = rec.payload as any;
    expect(payload.row.code).toBe(createdCode);
    expect(payload.row.name).toContain("Papelera");
    expect(Array.isArray(payload.children.officeContacts)).toBe(true);
  });

  test("la oficina borrada aparece en la UI de papelera", async ({ page }) => {
    await setSessionCookie(page.context(), admin.signedSessionId);
    await page.goto("http://127.0.0.1:4321/admin/papelera");
    await expect(page.getByText(`Oficina Papelera ${createdCode}`)).toBeVisible();
    await expect(page.getByText("en papelera").first()).toBeVisible();
  });

  test("restaurar devuelve la oficina con el mismo code", async ({ page }) => {
    // Localizar el snapshot vivo creado por el test anterior (más reciente)
    const [rec] = await db
      .select()
      .from(deletedRecords)
      .where(eq(deletedRecords.entity, "oficina"))
      .orderBy(desc(deletedRecords.id));
    const code = (rec.payload as any).row.code as string;
    expect(code).toBe(createdCode);
    expect(rec.restoredAt).toBeNull();

    await setSessionCookie(page.context(), admin.signedSessionId);
    await page.goto("http://127.0.0.1:4321/admin/papelera");

    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Restaurar" }).first().click();
    await page.waitForURL(/toast_type=success/);

    // La oficina vuelve a existir con el mismo code
    const [back] = await db.select().from(offices).where(eq(offices.code, code));
    expect(back).toBeDefined();
    expect(back!.code).toBe(code);

    // El snapshot queda marcado como restaurado
    const [recAfter] = await db
      .select()
      .from(deletedRecords)
      .where(eq(deletedRecords.id, rec.id));
    expect(recAfter.restoredAt).not.toBeNull();
  });

  test("agente no accede a la papelera", async ({ page }) => {
    await setSessionCookie(page.context(), plainUser.signedSessionId);
    await page.goto("http://127.0.0.1:4321/admin/papelera");
    // Middleware redirige fuera de la ruta (login/home): la tabla de papelera no renderiza
    expect(page.url()).not.toContain("/admin/papelera");
  });
});
