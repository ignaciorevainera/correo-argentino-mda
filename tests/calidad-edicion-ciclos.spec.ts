import "dotenv/config";
import { expect, test } from "@playwright/test";
import { db } from "../src/db/index";
import {
  agents,
  auditParameters,
  auditScores,
  qualityAudits,
  users,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "./helpers/auth";

/**
 * Ciclos completos de edicion de una auditoria de calidad en NewAuditForm.
 *
 * Cubre lo que los specs de calidad no ejercitan:
 *  1. `isHydrating` no debe dejar "Volver" pidiendo confirmacion en ningun canal
 *     (la regresion venia de abrir para editar, no de tocar nada).
 *  2. Guardar una edicion ACTUALIZA la fila; el riesgo real es duplicarla si el
 *     id no llega al FormData.
 *  3. Eliminar borra de verdad, previa confirmacion.
 */

let sup: TestUser;
let opUser: TestUser;
let opAgentId: number | null = null;
let supAgentId: number | null = null;

const MONTH = (() => {
  const now = new Date();
  return `${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getFullYear()}`;
})();

async function seed(channelType: string, callId: string) {
  const params = await db
    .select({ id: auditParameters.id, section: auditParameters.section })
    .from(auditParameters)
    .where(eq(auditParameters.active, true));
  const s1 = params.find((p) => p.section === "items") ?? params[0];
  const s2 = params.find((p) => p.section !== "items");

  const [audit] = await db
    .insert(qualityAudits)
    .values({
      agentId: opAgentId!,
      month: MONTH,
      channelType,
      callId,
      ticketId: channelType === "invgate_ticket" ? callId : "",
      duration: "02:00",
      date: new Date().toISOString().slice(0, 10),
      totalScore: 80,
      section1Score: 80,
      section2Score: 80,
      notes: "nota original",
    })
    .returning({ id: qualityAudits.id });

  await db.insert(auditScores).values([
    { auditId: audit.id, parameterId: s1.id, score: true, comment: "obs s1" },
    ...(s2 ? [{ auditId: audit.id, parameterId: s2.id, score: false, comment: null }] : []),
  ]);
  return audit.id;
}

test.beforeEach(async () => {
  sup = await createTestUserAndSession("supervisor");
  opUser = await createTestUserAndSession("agent");
  await db.update(users).set({ helpdeskId: 2509 }).where(eq(users.id, sup.userId));
  await db.update(users).set({ helpdeskId: 2509 }).where(eq(users.id, opUser.userId));

  const [op] = await db
    .insert(agents)
    .values({
      name: "Operador Verificacion",
      username: opUser.username,
      userId: opUser.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  opAgentId = op.id;

  const [sa] = await db
    .insert(agents)
    .values({
      name: "Supervisor Verificacion",
      username: sup.username,
      userId: sup.userId,
      incluidoCalidad: true,
    })
    .returning({ id: agents.id });
  supAgentId = sa.id;
});

test.afterEach(async () => {
  for (const id of [opAgentId, supAgentId]) {
    if (!id) continue;
    const audits = await db.select().from(qualityAudits).where(eq(qualityAudits.agentId, id));
    for (const a of audits) await db.delete(auditScores).where(eq(auditScores.auditId, a.id));
    await db.delete(qualityAudits).where(eq(qualityAudits.agentId, id));
    await db.delete(agents).where(eq(agents.id, id));
  }
  if (sup) await cleanupTestUser(sup.userId, sup.sessionId);
  if (opUser) await cleanupTestUser(opUser.userId, opUser.sessionId);
});

for (const channel of ["wise_email", "invgate_ticket"] as const) {
  test(`${channel}: abrir para editar no pide confirmacion al volver`, async ({ page, context }) => {
    const auditId = await seed(channel, `CANAL-${channel}`);
    await setSessionCookie(context, sup.signedSessionId);
    await page.goto(`/supervision/calidad-operadores/nueva?auditId=${auditId}`);

    // El canal quedo seleccionado
    await expect(page.locator(".channel-btn.btn-active")).toHaveAttribute("data-channel", channel);
    // Los datos cargaron
    await expect(page.locator("#form-call-id")).toHaveValue(`CANAL-${channel}`);

    let dialog = "";
    page.on("dialog", async (d) => {
      dialog = d.message();
      await d.dismiss();
    });

    await page.locator("#btn-back-evaluations").click();
    await page.waitForURL(/\/supervision\/calidad-operadores(?!\/nueva)/);
    expect(dialog, `${channel}: volver no debe pedir confirmacion`).toBe("");

    await expect(page.locator("#operator-details-modal")).toHaveAttribute("open", "", {
      timeout: 10000,
    });
  });
}

test("Guardar una edicion actualiza la fila en vez de duplicarla", async ({ page, context }) => {
  const auditId = await seed("wise_call", "NO-DUPLICAR");
  await setSessionCookie(context, sup.signedSessionId);
  await page.goto(`/supervision/calidad-operadores/nueva?auditId=${auditId}`);

  await page.locator("#form-notes").fill("nota EDITADA");
  await page.locator("#btn-header-save").click();
  await expect(page).toHaveURL(/\/supervision\/calidad-operadores(?!\/nueva)/, { timeout: 20000 });

  const all = await db.select().from(qualityAudits).where(eq(qualityAudits.agentId, opAgentId!));
  expect(all.length, "no debe crear una segunda fila").toBe(1);
  expect(all[0].id).toBe(auditId);
  expect(all[0].notes).toBe("nota EDITADA");
});

test("Eliminar una auditoria la borra y redirige", async ({ page, context }) => {
  const auditId = await seed("wise_call", "A-ELIMINAR");
  await setSessionCookie(context, sup.signedSessionId);
  await page.goto(`/supervision/calidad-operadores/nueva?auditId=${auditId}`);

  const btnDelete = page.locator("#btn-delete-audit");
  await expect(btnDelete).toBeVisible();

  let confirmado = false;
  page.on("dialog", async (d) => {
    confirmado = true;
    await d.accept();
  });

  await btnDelete.click();
  await expect(page).toHaveURL(/\/supervision\/calidad-operadores(?!\/nueva)/, { timeout: 20000 });
  expect(confirmado, "debe pedir confirmacion antes de borrar").toBe(true);

  const after = await db.select().from(qualityAudits).where(eq(qualityAudits.id, auditId));
  expect(after.length, "la auditoria debe estar borrada").toBe(0);
});
