// tests/home-personalizado.spec.ts
//
// Home personalizado: saludo, semana en curso del cronograma y score de
// calidad del usuario logueado. Las cards se ocultan cuando el usuario no
// tiene agente vinculado o su mesa no llega a /supervision.
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import {
  agents,
  auditLogs,
  feedback,
  holidays,
  mesas,
  qualityAudits,
  schedules,
  sessions,
  users,
} from "../src/db/schema";

const SECRET = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const MDA = "TI_GSM_MDA TI";
const COORD = "TI_GSM_Mesa de Coord";
const HOLIDAY_SENTINEL = "Feriado Home Test";

const sign = (id: string) =>
  `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;

const toYMD = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** Lunes 12:00 de la semana de `ref` (misma regla que la vista). */
function startOfWeek(ref = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

const addDays = (d: Date, n: number): Date => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

/** El mes de calidad usa MM-YYYY (distinto del YYYY-MM del cronograma). */
const qualityMonthTag = (ref = new Date()): string =>
  `${String(ref.getMonth() + 1).padStart(2, "0")}-${ref.getFullYear()}`;

const previousQualityMonthTag = (ref = new Date()): string => {
  const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return qualityMonthTag(prev);
};

let mdaInvgateId: number | null = null;
let coordInvgateId: number | null = null;

test.describe("Home personalizado", () => {
  const createdUserIds: number[] = [];
  const createdSessionIds: string[] = [];
  const createdAgentIds: number[] = [];
  const createdUsernames: string[] = [];
  let insertedHolidayDate: string | null = null;

  test.beforeAll(async () => {
    await db
      .insert(mesas)
      .values([
        {
          invgateId: 910010,
          name: MDA,
          displayName: null,
          active: true,
          assignable: true,
          lastSyncedAt: new Date().toISOString(),
        },
        {
          invgateId: 910011,
          name: COORD,
          displayName: null,
          active: true,
          assignable: true,
          lastSyncedAt: new Date().toISOString(),
        },
      ])
      .onConflictDoNothing();

    const [mda] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, MDA));
    const [coord] = await db
      .select({ invgateId: mesas.invgateId })
      .from(mesas)
      .where(eq(mesas.name, COORD));
    mdaInvgateId = mda?.invgateId ?? null;
    coordInvgateId = coord?.invgateId ?? null;
  });

  test.afterAll(async () => {
    if (createdAgentIds.length) {
      await db
        .delete(qualityAudits)
        .where(inArray(qualityAudits.agentId, createdAgentIds));
      await db.delete(schedules).where(inArray(schedules.agentId, createdAgentIds));
      await db.delete(agents).where(inArray(agents.id, createdAgentIds));
    }
    if (createdUsernames.length) {
      await db
        .delete(auditLogs)
        .where(inArray(auditLogs.username, createdUsernames));
    }
    if (createdUserIds.length) {
      await db.delete(feedback).where(inArray(feedback.userId, createdUserIds));
      await db.delete(sessions).where(inArray(sessions.id, createdSessionIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (insertedHolidayDate) {
      await db.delete(holidays).where(eq(holidays.date, insertedHolidayDate));
    }
  });

  async function login(context: any, sessionId: string): Promise<void> {
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await context.addCookies([
      {
        name: "session_id",
        value: sign(sessionId),
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);
  }

  async function seedUser(opts: {
    role: string;
    mesa: string | null;
    invgateId: number | null;
    tag: string;
  }): Promise<{ userId: number; sessionId: string; username: string }> {
    const username = `home_${opts.tag}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const [user] = await db
      .insert(users)
      .values({
        username,
        password: "x",
        role: opts.role,
        helpdeskId: opts.invgateId,
        helpdeskName: opts.mesa,
      })
      .returning({ id: users.id });
    createdUserIds.push(user.id);
    createdUsernames.push(username);

    const sessionId = `sess_${username}`;
    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt: Date.now() + 3_600_000,
    });
    createdSessionIds.push(sessionId);

    return { userId: user.id, sessionId, username };
  }

  async function seedAgent(opts: {
    userId: number;
    username: string;
    name: string;
    enCronograma: boolean;
    incluidoCalidad: boolean;
    esquemaSemanal?: Record<string, string>;
    esquemaHorario?: Record<string, string>;
  }): Promise<number> {
    const [agent] = await db
      .insert(agents)
      .values({
        name: opts.name,
        username: opts.username,
        userId: opts.userId,
        enCronograma: opts.enCronograma,
        enAsistencia: opts.enCronograma,
        incluidoCalidad: opts.incluidoCalidad,
        horarioDefault: "08:00 - 17:00",
        esquemaSemanal: opts.esquemaSemanal ?? {},
        esquemaHorario: opts.esquemaHorario ?? {},
      })
      .returning({ id: agents.id });
    createdAgentIds.push(agent.id);
    return agent.id;
  }

  function currentWeekDates(): string[] {
    const monday = startOfWeek();
    return Array.from({ length: 6 }, (_, i) => toYMD(addDays(monday, i)));
  }

  /**
   * Abre el modal de personalización desde el menú del avatar. El ítem está
   * oculto hasta que la isla del home confirma que el perfil puede configurar,
   * así que el click espera a que se habilite.
   */
  async function openDashboardConfig(page: any): Promise<void> {
    await page.locator(".navbar .dropdown [role='button'].avatar").click();
    await page.getByRole("button", { name: "Personalizar inicio" }).click();
    await expect(page.locator("#dashboard-config-modal")).toBeVisible();
  }

  test("agente MDA TI: saludo, semana del cronograma y score de calidad", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "mda",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Ana Home Test",
      enCronograma: true,
      incluidoCalidad: true,
      esquemaSemanal: { Lunes: "Franco" },
    });

    const week = currentWeekDates();
    const statuses = [
      "Presencial Monte Grande",
      "Home Office",
      "Presencial Parque Patricios",
      "Licencia",
      "Vacaciones",
      "Franco",
    ];
    await db.insert(schedules).values(
      week.map((date, i) => ({
        agentId,
        date,
        status: statuses[i],
        comment: "",
        horario: i === 0 ? "09:00 - 18:00" : i === 1 ? "08:00 - 17:00" : "",
        breakInicio: i === 0 ? "12:00" : "",
        breakFin: i === 0 ? "13:00" : "",
        isOverride: true,
      })),
    );

    const month = qualityMonthTag();
    const prevMonth = previousQualityMonthTag();
    await db.insert(qualityAudits).values([
      {
        agentId,
        month,
        channelType: "wise_call",
        callId: "HOME-1",
        ticketId: "",
        duration: "02:00",
        date: week[0],
        totalScore: 90,
        section1Score: 90,
        section2Score: 90,
      },
      {
        agentId,
        month,
        channelType: "wise_email",
        callId: "HOME-2",
        ticketId: "",
        duration: "02:00",
        date: week[1],
        totalScore: 80,
        section1Score: 80,
        section2Score: 80,
      },
      {
        agentId,
        month: prevMonth,
        channelType: "wise_call",
        callId: "HOME-3",
        ticketId: "",
        duration: "02:00",
        date: week[0],
        totalScore: 70,
        section1Score: 70,
        section2Score: 70,
      },
    ]);

    await login(context, user.sessionId);
    await page.goto("/");

    // Saludo personalizado con el nombre del agente (no el username) y punto final.
    await expect(page.locator("#home-greeting")).toContainText(/Ana Home Test\./);

    const weekCard = page.locator('[data-home-card="week"]');
    await expect(weekCard).toBeVisible();
    await expect(weekCard.locator("[data-week-day]")).toHaveCount(6);

    const monday = weekCard.locator(`[data-week-date="${week[0]}"]`);
    await expect(monday).toHaveAttribute("data-week-status", "Presencial Monte Grande");
    await expect(monday).toContainText("09:00 - 18:00");
    await expect(weekCard.locator(`[data-week-date="${week[4]}"]`)).toHaveAttribute(
      "data-week-status",
      "Vacaciones",
    );

    // Presencial en azul secondary; Home Office outline.
    await expect(monday.locator(".badge")).toHaveClass(/badge-secondary/);
    await expect(monday.locator(".badge")).not.toHaveClass(/badge-warning/);
    const homeOffice = weekCard.locator(`[data-week-date="${week[1]}"] .badge`);
    await expect(homeOffice).toHaveClass(/badge-outline/);
    await expect(homeOffice).toHaveClass(/badge-secondary/);

    // Hoy resaltado con el azul secondary (no el amarillo primary).
    if (new Date().getDay() !== 0) {
      const today = weekCard.locator('[data-today="true"]');
      await expect(today).toHaveAttribute("data-week-date", toYMD(new Date()));
      await expect(today).toHaveClass(/border-secondary/);
      await expect(today).not.toHaveClass(/border-primary/);
    } else {
      await expect(weekCard.locator('[data-today="true"]')).toHaveCount(0);
    }

    await expect(page.locator('[data-home-more="week"]')).toHaveAttribute(
      "href",
      /\/supervision\/cronograma$/,
    );

    // AGS quedó restringido a referente+ (rbac + helpdeskAccess), así que el
    // operador ya no ve la card; la cobertura de la card vive en el test del
    // referente.
    await expect(page.locator('[data-home-card="ags"]')).toHaveCount(0);
    await expect(page.locator("[data-ags-instance]")).toHaveCount(0);

    // "Mi semana" tiene el mismo alto que la columna derecha (AGS + calidad).
    const weekBox = await weekCard.boundingBox();
    const sideBox = await page.locator("[data-home-side]").boundingBox();
    expect(weekBox).not.toBeNull();
    expect(sideBox).not.toBeNull();
    expect(Math.abs((weekBox?.height ?? 0) - (sideBox?.height ?? 0))).toBeLessThan(2);

    // Los días ocupan el alto de su card (celdas parejas, sin aire de más).
    const dayCells = weekCard.locator("[data-week-day]");
    const heights = await dayCells.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
    expect(heights.length).toBe(6);
    expect(Math.min(...heights)).toBeGreaterThan(100);
    // Cota relativa: cada celda entra holgada en el alto de la card (el alto
    // absoluto depende de la composición de la columna).
    expect(Math.max(...heights)).toBeLessThan(weekBox?.height ?? 0);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);

    // La semana no deja espacio vacío al pie de la card.
    const summaryBox = await weekCard
      .locator("[data-week-summary]")
      .boundingBox();
    const cardBox2 = await weekCard.boundingBox();
    expect(summaryBox).not.toBeNull();
    expect(cardBox2).not.toBeNull();
    const cardInnerBottom =
      (cardBox2?.y ?? 0) + (cardBox2?.height ?? 0) - 16;
    expect(
      (summaryBox?.y ?? 0) + (summaryBox?.height ?? 0),
    ).toBeGreaterThan(cardInnerBottom - 24);

    // Calidad: promedio de promedios por canal (90 y 80 → 85), delta vs 70.
    const qualityCard = page.locator('[data-home-card="quality"]');
    await expect(qualityCard).toBeVisible();
    await expect(page.locator("#home-quality-score")).toHaveText("85%");
    await expect(page.locator("#home-quality-delta")).toContainText("+15");
    await expect(page.locator("#home-quality-count")).toContainText("2");
    await expect(page.locator('[data-home-more="quality"]')).toHaveAttribute(
      "href",
      /\/supervision\/calidad-operadores$/,
    );

    // Cronograma y Calidad ya no están como cards de abajo (viven arriba).
    await expect(
      page.getByRole("link", { name: /^Abrir Cronograma$/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^Abrir Calidad de operadores$/i }),
    ).toHaveCount(0);

    // Los atajos restantes vuelven al formato grande (con descripción).
    await expect(
      page.getByRole("link", { name: /^Abrir Títulos$/i }),
    ).toHaveAttribute("data-layout", "vertical");
    // ... y sin el botón "Ver más" (la card entera es el link).
    await expect(
      page.getByRole("link", { name: /^Abrir Títulos$/i }),
    ).not.toContainText("Ver más");
  });

  test("score 100%: el badge y el ver más no se salen de la card", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "score100",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Nina Score Perfecto",
      enCronograma: true,
      incluidoCalidad: true,
    });

    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    const now = new Date();
    const month = `${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${String(prevDate.getMonth() + 1).padStart(2, "0")}-${prevDate.getFullYear()}`;
    await db.insert(qualityAudits).values([
      {
        agentId,
        month,
        channelType: "wise_call",
        callId: "S100-A",
        ticketId: "",
        duration: "03:00",
        date: week[0],
        totalScore: 100,
        section1Score: 100,
        section2Score: 100,
      },
      {
        agentId,
        month,
        channelType: "wise_email",
        callId: "S100-B",
        ticketId: "",
        duration: "03:00",
        date: week[1],
        totalScore: 100,
        section1Score: 100,
        section2Score: 100,
      },
      {
        agentId,
        month: prevMonth,
        channelType: "wise_call",
        callId: "S100-C",
        ticketId: "",
        duration: "03:00",
        date: week[0],
        totalScore: 50,
        section1Score: 50,
        section2Score: 50,
      },
    ]);

    await login(context, user.sessionId);
    await page.goto("/");

    const qualityCard = page.locator('[data-home-card="quality"]');
    await expect(qualityCard).toBeVisible();
    await expect(page.locator("#home-quality-score")).toHaveText("100%");

    const cardBox = await qualityCard.boundingBox();
    const badgeBox = await page.locator("#home-quality-delta").boundingBox();
    const moreBox = await page
      .locator('[data-home-more="quality"]')
      .boundingBox();
    expect(cardBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();
    expect(moreBox).not.toBeNull();

    // Nada se sale de la card.
    const cardRight = (cardBox?.x ?? 0) + (cardBox?.width ?? 0);
    expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(
      cardRight + 1,
    );
    expect((moreBox?.x ?? 0) + (moreBox?.width ?? 0)).toBeLessThanOrEqual(
      cardRight + 1,
    );

    // El badge ocupa 2/3 y el botón 1/3 del ancho interior.
    const inner = (cardBox?.width ?? 0) - 32;
    const badgeRatio = (badgeBox?.width ?? 0) / inner;
    const moreRatio = (moreBox?.width ?? 0) / inner;
    expect(badgeRatio).toBeGreaterThan(0.55);
    expect(badgeRatio).toBeLessThan(0.72);
    expect(moreRatio).toBeGreaterThan(0.24);
    expect(moreRatio).toBeLessThan(0.4);
  });

  test("coordinación: no ve cards personales ni links a supervisión", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: COORD,
      invgateId: coordInvgateId,
      tag: "coord",
    });

    await login(context, user.sessionId);
    await page.goto("/");

    await expect(page.locator("[data-home-card]")).toHaveCount(0);
    await expect(
      page.locator('[data-home-grid] a[href*="/supervision"]'),
    ).toHaveCount(0);
  });
  test("agente de calidad sin auditorías: estado vacío, sin score inventado", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "sin_auditorias",
    });
    await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Beto Sin Auditorias",
      enCronograma: true,
      incluidoCalidad: true,
      esquemaSemanal: { Martes: "Home Office" },
    });

    await login(context, user.sessionId);
    await page.goto("/");

    await expect(page.locator('[data-home-card="week"]')).toBeVisible();
    await expect(page.locator('[data-home-card="quality"]')).toBeVisible();
    await expect(page.locator("[data-quality-empty]")).toBeVisible();
    await expect(page.locator("#home-quality-score")).toHaveCount(0);
    // El "Ver más" a Calidad existe también en el estado vacío.
    await expect(page.locator('[data-home-more="quality"]')).toBeVisible();
    await expect(page.locator('[data-home-more="quality"]')).toHaveAttribute(
      "href",
      /\/supervision\/calidad-operadores$/,
    );
  });

  test("feriado de la semana se muestra en su día", async ({ context, page }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "feriado",
    });
    await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Caro Feriado",
      enCronograma: true,
      incluidoCalidad: false,
      esquemaSemanal: { Miercoles: "Home Office" },
    });

    const week = currentWeekDates();
    const holidayDate = week[2];

    // `holidays.date` es único: si ya hay un feriado real ese día, el insert
    // no hace nada y la aserción vale igual (se muestra el real).
    await db
      .insert(holidays)
      .values({ date: holidayDate, name: HOLIDAY_SENTINEL })
      .onConflictDoNothing();
    const [stored] = await db
      .select({ name: holidays.name })
      .from(holidays)
      .where(eq(holidays.date, holidayDate));
    if (stored?.name === HOLIDAY_SENTINEL) insertedHolidayDate = holidayDate;

    await login(context, user.sessionId);
    await page.goto("/");

    const cell = page.locator(`[data-week-date="${holidayDate}"]`);
    await expect(cell).toHaveAttribute("data-week-holiday", /[A-Za-zÁÉÍÓÚáéíóú]/);
    await expect(cell).toContainText(stored?.name ?? HOLIDAY_SENTINEL);
  });

  test("otro agente con filas del mes no convierte mi semana en Franco", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "esquema",
    });
    await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Rita Solo Esquema",
      enCronograma: true,
      incluidoCalidad: false,
      esquemaSemanal: {
        Lunes: "Home Office",
        Martes: "Presencial Monte Grande",
      },
      esquemaHorario: { Lunes: "08:00 - 17:00" },
    });

    // Otro operador del mismo mes con cronograma generado (por defecto Franco).
    const otroUser = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "otro_con_filas",
    });
    const otroAgentId = await seedAgent({
      userId: otroUser.userId,
      username: otroUser.username,
      name: "Otro Con Filas",
      enCronograma: true,
      incluidoCalidad: false,
    });
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await db.insert(schedules).values({
      agentId: otroAgentId,
      date: `${monthPrefix}-01`,
      status: "Franco",
      comment: "",
      horario: "",
      isOverride: false,
    });

    await login(context, user.sessionId);
    await page.goto("/");

    const week = currentWeekDates();
    const weekCard = page.locator('[data-home-card="week"]');
    await expect(weekCard).toBeVisible();
    // El lunes sale del esquema semanal del operador, no de una fila ajena.
    await expect(
      weekCard.locator(`[data-week-date="${week[0]}"]`),
    ).toHaveAttribute("data-week-status", "Home Office");
  });

  test("agente sin participaciones: no ve cards personales", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "fuera",
    });
    await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Dani Fuera De Todo",
      enCronograma: false,
      incluidoCalidad: false,
    });

    await login(context, user.sessionId);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-home-card="week"]')).toHaveCount(0);
    await expect(page.locator('[data-home-card="quality"]')).toHaveCount(0);
    // AGS quedó restringido a referente+ (módulo de autogestiones).
    await expect(page.locator('[data-home-card="ags"]')).toHaveCount(0);
    // Sin widgets disponibles no hay configurador: el ítem del menú del avatar
    // queda oculto.
    await page.locator(".navbar .dropdown [role='button'].avatar").click();
    await expect(
      page.getByRole("button", { name: "Personalizar inicio" }),
    ).toBeHidden();
  });

  test("agente de calidad sin cronograma: ve Calidad del equipo en lugar de Mi semana", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "calidad_solo",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Cami Calidad",
      enCronograma: false,
      incluidoCalidad: true,
    });

    const month = qualityMonthTag();
    await db.insert(qualityAudits).values([
      {
        agentId,
        month,
        channelType: "wise_call",
        callId: "CAL-A",
        ticketId: "",
        duration: "02:00",
        date: currentWeekDates()[0],
        totalScore: 95,
        section1Score: 95,
        section2Score: 95,
      },
      {
        agentId,
        month,
        channelType: "wise_email",
        callId: "CAL-B",
        ticketId: "",
        duration: "02:00",
        date: currentWeekDates()[1],
        totalScore: 85,
        section1Score: 85,
        section2Score: 85,
      },
    ]);

    await login(context, user.sessionId);
    await page.goto("/");

    // Patrón de 3: Calidad del equipo grande + AGS chica + Mi calidad mediana.
    await expect(page.locator('[data-home-card="week"]')).toHaveCount(0);
    await expect(page.locator('[data-home-big="quality-team"]')).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="quality"]'),
    ).toHaveCount(1);

    const teamCard = page.locator('[data-home-card="quality-team"]');
    await expect(teamCard).toBeVisible();
    await expect(teamCard).toContainText("promedio del equipo");
    await expect(page.locator('[data-home-more="quality-team"]')).toHaveAttribute(
      "href",
      /\/supervision\/calidad-operadores$/,
    );

    // AGS requiere referente+: el agente no lo ve aunque sea dato de mesa.
    await expect(
      page.locator('[data-home-widget="ags"] [data-home-card="ags"]'),
    ).toHaveCount(0);
  });

  test("referente: semana grande + AGS + Calidad del equipo", async ({
    context,
    page,
  }) => {
    let agsNextName = "Ana Cola";
    let agsCalls = 0;
    await page.route("**/api/ags/next", async (route) => {
      agsCalls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next: {
            agentId: 999001,
            name: agsNextName,
            modality: "Home Office",
            status: "Disponible",
            available: true,
            lastAssignedAt: null,
          },
          availableCount: 3,
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    const user = await seedUser({
      role: "referent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "referente",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Rita Referente",
      enCronograma: true,
      incluidoCalidad: true,
    });

    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    await login(context, user.sessionId);
    await page.goto("/");

    await expect(page.locator('[data-home-big="week"]')).toHaveCount(1);

    // AGS en formato compacto (columna): una sola fila, sin lista.
    const agsCard = page.locator('[data-home-card="ags"]');
    await expect(agsCard).toBeVisible();
    await expect(agsCard).toContainText("Próximo en autogestiones");
    await expect(page.locator("[data-ags-instance]")).toHaveCount(1);
    await expect(page.locator("[data-ags-row]")).toHaveCount(0);
    await expect(page.locator("[data-ags-name]").first()).toHaveText("Ana Cola");
    await expect(page.locator("[data-ags-meta]").first()).toHaveText("Disponible");
    await expect(page.locator("[data-ags-initials]").first()).toHaveText("AC");
    await expect.poll(() => agsCalls).toBeGreaterThan(0);
    await expect(page.locator('[data-home-more="ags"]')).toHaveAttribute(
      "href",
      /\/supervision\/asignacion-autogestiones$/,
    );

    // Refresca al volver a la pestaña.
    agsNextName = "Beto Cola";
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator("[data-ags-name]").first()).toHaveText("Beto Cola");

    await expect(
      page.locator('[data-home-widget="ags"] [data-home-card="ags"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="quality-team"]'),
    ).toHaveCount(1);
    // El referente no ve "Mi calidad" (ve la del equipo).
    await expect(page.locator('[data-home-card="quality"]')).toHaveCount(0);
  });

  test("supervisor: Calidad del equipo + AGS + Automatizaciones", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "supervisor",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "supervisor",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Sofi Supervisora",
      enCronograma: true,
      incluidoCalidad: true,
    });

    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );
    await db.insert(qualityAudits).values({
      agentId,
      month: qualityMonthTag(),
      channelType: "wise_call",
      callId: "SUP-A",
      ticketId: "",
      duration: "02:00",
      date: week[0],
      totalScore: 90,
      section1Score: 90,
      section2Score: 90,
    });

    await login(context, user.sessionId);
    await page.goto("/");

    // No se evalúa la calidad del supervisor: ve la del equipo como grande.
    await expect(page.locator('[data-home-big="quality-team"]')).toHaveCount(1);
    await expect(page.locator('[data-home-card="week"]')).toHaveCount(0);
    await expect(page.locator('[data-home-card="quality"]')).toHaveCount(0);

    const automationCard = page.locator('[data-home-card="automation"]');
    await expect(automationCard).toBeVisible();
    await expect(automationCard).toContainText("Activas");
    await expect(page.locator('[data-home-more="automation"]')).toHaveAttribute(
      "href",
      /\/automatizaciones\/metricas$/,
    );
    // Columna derecha: AGS chica + automatizaciones mediana.
    await expect(
      page.locator('[data-home-widget="ags"] [data-home-card="ags"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="automation"]'),
    ).toHaveCount(1);
  });

  test("admin: sugerencias/reportes, auditoría y gestión de usuarios", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "admin",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "admin",
    });

    // Feedback pendiente (2) y movimientos de auditoría para las cards.
    await db.insert(feedback).values([
      {
        userId: user.userId,
        type: "sugerencia",
        subject: "Agregar filtro por mes en calidad",
        description: "Detalle",
        status: "pendiente",
        category: "calidad",
      },
      {
        userId: user.userId,
        type: "bug",
        subject: "El export de cronograma falla",
        description: "Detalle",
        status: "pendiente",
        severity: "moderado",
      },
      {
        userId: user.userId,
        type: "bug",
        subject: "Ya resuelto",
        description: "Detalle",
        status: "resuelto",
        severity: "leve",
      },
    ]);
    await db.insert(auditLogs).values([
      {
        username: user.username,
        action: "Actualizó el rol de un usuario",
        timestamp: new Date().toISOString(),
      },
      {
        username: user.username,
        action: "Creó una categoría de recursos",
        timestamp: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);

    await login(context, user.sessionId);
    await page.goto("/");

    // El admin ya no ve semana / calidad / AGS.
    await expect(page.locator('[data-home-card="week"]')).toHaveCount(0);
    await expect(page.locator('[data-home-card="quality"]')).toHaveCount(0);
    await expect(page.locator('[data-home-card="ags"]')).toHaveCount(0);

    // Sí ve las tres cards de administración con datos.
    const feedbackCard = page.locator('[data-home-card="feedback"]');
    await expect(feedbackCard).toBeVisible();
    await expect(feedbackCard).toContainText("2");
    await expect(feedbackCard).toContainText("pendientes");
    // Versión chica: conteo + desglose, sin listado de sugerencias.
    await expect(feedbackCard).not.toContainText("Agregar filtro por mes");

    await expect(page.locator('[data-home-card="users"]')).toBeVisible();
    await expect(
      page.locator('[data-home-card="users"]'),
    ).toContainText("Sin ubicación");

    const auditCard = page.locator('[data-home-card="audit"]');
    await expect(auditCard).toBeVisible();
    await expect(auditCard).toContainText("Actualizó el rol de un usuario");
    // La auditoría es la card principal (2 columnas); feedback y usuarios van
    // en la columna derecha, así ninguna card queda estirada.
    await expect(
      page.locator('[data-home-side] [data-home-card="audit"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-home-side] [data-home-card="feedback"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="users"]'),
    ).toHaveCount(1);

    // Los "Ver más" apuntan a las secciones correctas.
    await expect(page.locator('[data-home-more="feedback"]')).toHaveAttribute(
      "href",
      /\/admin\/feedback$/,
    );
    await expect(page.locator('[data-home-more="users"]')).toHaveAttribute(
      "href",
      /\/admin\/usuarios$/,
    );
    await expect(page.locator('[data-home-more="audit"]')).toHaveAttribute(
      "href",
      /\/admin\/auditoria$/,
    );

    // Los accesos de abajo salen de la matriz; las rutas con card arriba no se
    // duplican (Usuarios/Auditoría/Feedback quedan solo arriba).
    await expect(
      page.getByRole("link", { name: /^Abrir Títulos$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Abrir Usuarios y roles$/i }),
    ).toHaveCount(0);
  });

  test("simulador: el admin puede ver como operador y salir", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "admin",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "admin_view",
    });
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await login(context, user.sessionId);

    // Sin la cookie, vista real de admin.
    await page.goto("/");
    await expect(page.locator('[data-home-card="audit"]')).toBeVisible();
    await expect(page.locator("[data-exit-view-as]")).toHaveCount(0);

    // Con la cookie de simulación, la vista pasa a operador.
    await context.addCookies([
      {
        name: "view_as",
        value: "operador",
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page.locator('[data-home-card="week"]')).toBeVisible();
    await expect(page.locator('[data-home-card="audit"]')).toHaveCount(0);
    // Banner + opción de salir.
    await expect(page.locator("[data-view-as-banner]")).toBeVisible();
    await expect(page.locator("[data-view-as-banner]")).toContainText(
      "Viendo como",
    );
    await expect(
      page.locator("[data-view-as-banner] [data-exit-view-as]"),
    ).toBeVisible();
  });

  test("simulador: ver como referente y valores retirados se ignoran", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "admin",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "admin_view_ref",
    });
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await login(context, user.sessionId);

    await context.addCookies([
      {
        name: "view_as",
        value: "referente",
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page.locator('[data-home-big="week"]')).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="quality-team"]'),
    ).toHaveCount(1);
    await expect(page.locator("[data-view-as-banner]")).toContainText(
      "Referente",
    );

    // Valores que ya no existen en la lista blanca (team_leader / calidad) se
    // ignoran: vuelve a la vista real de admin.
    await context.clearCookies({ name: "view_as" });
    await context.addCookies([
      {
        name: "view_as",
        value: "team_leader",
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page.locator("[data-view-as-banner]")).toHaveCount(0);
    await expect(page.locator('[data-home-big="audit"]')).toHaveCount(1);
  });

  test("simulador: una cookie de vista en un no-admin se ignora", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "supervisor",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "no_admin_view",
    });
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await login(context, user.sessionId);
    await context.addCookies([
      {
        name: "view_as",
        value: "operador",
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);

    await page.goto("/");

    // La cookie no aplica: sigue viendo su propia vista y sin banner.
    await expect(page.locator("[data-view-as-banner]")).toHaveCount(0);
    await expect(page.locator("[data-exit-view-as]")).toHaveCount(0);
    await expect(page.locator('[data-home-card="automation"]')).toBeVisible();
  });

  test("simulador: el endpoint responde 403 a un no-admin", async ({
    context,
  }) => {
    const user = await seedUser({
      role: "supervisor",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "endpoint_view",
    });
    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await login(context, user.sessionId);

    const res = await context.request.post(
      new URL("/api/admin/view-as", base).href,
      {
        form: { profile: "operador" },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
    expect(res.status()).toBe(403);
  });

  test("configurador: cambia la card grande, persiste y se restablece", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "layout",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Lola Layout",
      enCronograma: true,
      incluidoCalidad: true,
    });

    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );
    await db.insert(qualityAudits).values({
      agentId,
      month: qualityMonthTag(),
      channelType: "wise_call",
      callId: "LAYOUT-A",
      ticketId: "",
      duration: "02:00",
      date: week[0],
      totalScore: 90,
      section1Score: 90,
      section2Score: 90,
    });

    await login(context, user.sessionId);
    await page.goto("/");

    // Default: semana grande.
    await expect(page.locator('[data-home-big="week"]')).toHaveCount(1);

    // Abre el configurador desde el menú del avatar y cambia SOLO la card
    // grande: la columna se reacomoda sola (intercambio con el grande anterior
    // + autocompletado).
    const configureItems = page.locator("[data-open-dashboard-config]");
    await expect(configureItems).toHaveCount(1);
    await expect(
      page.locator(".navbar [data-open-dashboard-config]"),
    ).toHaveCount(1);
    await openDashboardConfig(page);

    await page.selectOption("#dashboard-big", "quality");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    await expect(page.locator('[data-home-big="quality"]')).toHaveCount(1);
    // "Mi calidad" salió de la columna y entró "Mi semana" (el grande anterior).
    await expect(page.locator('[data-home-widget="week"]')).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="quality"]'),
    ).toHaveCount(0);

    // Persiste al recargar.
    await page.goto("/");
    await expect(page.locator('[data-home-big="quality"]')).toHaveCount(1);

    // Restablecer vuelve al default del perfil.
    await openDashboardConfig(page);
    await page.locator("[data-reset-dashboard-layout]").click();
    await page.waitForURL(/toast_msg=/);
    await expect(page.locator('[data-home-big="week"]')).toHaveCount(1);
  });

  test("configurador: una configuración fuera de la lista blanca cae al default", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "layout_invalid",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Ivan Invalido",
      enCronograma: true,
      incluidoCalidad: false,
    });

    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await login(context, user.sessionId);
    await page.goto("/");

    // Un operador no puede montar auditoría / usuarios / feedback: el server
    // ajusta la config a los widgets permitidos y avisa con un warning.
    const token = await page
      .locator('meta[name="csrf-token"]')
      .getAttribute("content");
    const res = await context.request.post(
      new URL("/api/home/layout", base).href,
      {
        form: {
          big: "audit",
          side1: "users",
          side2: "feedback",
          csrf_token: token ?? "",
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
    expect(res.url()).toContain("toast_type=warning");

    await page.goto("/");
    await expect(page.locator('[data-home-big="week"]')).toHaveCount(1);
    await expect(page.locator('[data-home-card="audit"]')).toHaveCount(0);
  });

  test("configurador: el admin configura la vista simulada y no toca la real", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "admin",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "layout_preview",
    });
    // Con agente propio, la vista simulada de operador tiene semana y calidad
    // disponibles (el configurador necesita al menos 3 widgets).
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Ada Admin",
      enCronograma: true,
      incluidoCalidad: true,
    });
    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );
    await db.insert(qualityAudits).values({
      agentId,
      month: qualityMonthTag(),
      channelType: "wise_call",
      callId: "ADM-SIM",
      ticketId: "",
      duration: "02:00",
      date: week[0],
      totalScore: 88,
      section1Score: 88,
      section2Score: 88,
    });

    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    await login(context, user.sessionId);
    await context.addCookies([
      {
        name: "view_as",
        value: "operador",
        domain: new URL(base).hostname,
        path: "/",
      },
    ]);

    await page.goto("/");

    // En vista previa el admin SÍ puede configurar la vista simulada.
    await openDashboardConfig(page);
    await page.selectOption("#dashboard-big", "quality");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    await expect(page.locator('[data-home-big="quality"]')).toHaveCount(1);

    // Al salir de la vista previa, su layout real (admin) no cambió.
    await context.clearCookies({ name: "view_as" });
    await page.goto("/");
    await expect(page.locator('[data-home-big="audit"]')).toHaveCount(1);
  });

  test("admin con agente: puede sumar Mi semana y calidad a su inicio", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "admin",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "admin_agent",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Admin Operador",
      enCronograma: true,
      incluidoCalidad: true,
    });

    const week = currentWeekDates();
    await db.insert(schedules).values(
      week.map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );
    await db.insert(qualityAudits).values({
      agentId,
      month: qualityMonthTag(),
      channelType: "wise_call",
      callId: "ADM-A",
      ticketId: "",
      duration: "02:00",
      date: week[0],
      totalScore: 91,
      section1Score: 91,
      section2Score: 91,
    });

    await login(context, user.sessionId);
    await page.goto("/");

    // Default de admin: auditoría grande.
    await expect(page.locator('[data-home-big="audit"]')).toHaveCount(1);

    await openDashboardConfig(page);
    await expect(
      page.locator('#dashboard-big option[value="week"]'),
    ).toHaveCount(1);
    await page.selectOption("#dashboard-big", "week");
    await page.selectOption("#dashboard-side1", "quality");
    await page.selectOption("#dashboard-side2", "audit");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    await expect(page.locator('[data-home-big="week"]')).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="quality"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-home-side] [data-home-card="audit"]'),
    ).toHaveCount(1);
  });

  test("auditoría: limita las filas según el slot", async ({ context, page }) => {
    const user = await seedUser({
      role: "admin",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "audit_limits",
    });
    await db.insert(auditLogs).values(
      Array.from({ length: 8 }, (_, i) => ({
        username: user.username,
        action: `Movimiento ${i + 1}`,
        timestamp: new Date(Date.now() - i * 60_000).toISOString(),
      })),
    );

    await login(context, user.sessionId);
    await page.goto("/");

    // Grande: 5 movimientos.
    const auditCard = page.locator('[data-home-card="audit"]');
    await expect(auditCard).toBeVisible();
    await expect(auditCard.locator("ul > li")).toHaveCount(5);

    // En la columna (mediana) muestra 3.
    await openDashboardConfig(page);
    await page.selectOption("#dashboard-big", "feedback");
    await page.selectOption("#dashboard-side1", "users");
    await page.selectOption("#dashboard-side2", "audit");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    await expect(
      page.locator('[data-home-widget="audit"] ul > li'),
    ).toHaveCount(3);
  });

  test("configurador: elegir y ordenar los accesos de abajo", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "access_config",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Alicia Accesos",
      enCronograma: true,
      incluidoCalidad: true,
    });
    await db.insert(schedules).values(
      currentWeekDates().map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    await login(context, user.sessionId);
    await page.goto("/");

    const grid = page.locator("[data-access-grid]");
    await expect(grid.locator(":scope > *")).toHaveCount(8);
    await expect(
      page.getByRole("link", { name: /^Abrir Títulos$/i }),
    ).toBeVisible();

    await openDashboardConfig(page);
    await expect(page.locator("#dashboard-access-list")).toBeVisible();

    // Sacar Títulos y subir Mesas de Ayuda al primer lugar.
    await page.getByLabel("Mostrar Títulos").uncheck();
    await page.getByRole("button", { name: "Subir Mesas de Ayuda" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    await expect(grid.locator(":scope > *")).toHaveCount(7);
    await expect(
      page.getByRole("link", { name: /^Abrir Títulos$/i }),
    ).toHaveCount(0);
    // Primera card del grid: Mesas de Ayuda.
    await expect(grid.locator(":scope > *").first()).toHaveAttribute(
      "aria-label",
      /Mesas de Ayuda/,
    );

    // Persiste al recargar.
    await page.goto("/");
    await expect(page.locator("[data-access-grid] > *")).toHaveCount(7);

    // Restablecer vuelve al default de 8 con Títulos primero.
    await openDashboardConfig(page);
    await page.locator("[data-reset-dashboard-layout]").click();
    await page.waitForURL(/toast_msg=/);
    await expect(page.locator("[data-access-grid] > *")).toHaveCount(8);
    await expect(
      page.getByRole("link", { name: /^Abrir Títulos$/i }),
    ).toBeVisible();
  });

  test("AGS en formato grande: lista los primeros 5 de la cola", async ({
    context,
    page,
  }) => {
    const queue = [
      "Ana Cola",
      "Beto Cola",
      "Carla Cola",
      "Diego Cola",
      "Elena Cola",
      "Fede Cola",
    ].map((name, index) => ({
      agentId: 999100 + index,
      name,
      modality: index % 2 === 0 ? "Home Office" : "Presencial Monte Grande",
      status: "Disponible",
      available: true,
      lastAssignedAt: index === 0 ? null : Date.now() - (index + 1) * 3_600_000,
    }));

    await page.route("**/api/ags/next", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next: queue[0],
          queue: queue.slice(0, 5),
          availableCount: queue.length,
          generatedAt: new Date().toISOString(),
        }),
      });
    });

    const user = await seedUser({
      role: "referent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "ags_big",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Ana AGS Grande",
      enCronograma: true,
      incluidoCalidad: true,
    });
    await db.insert(schedules).values(
      currentWeekDates().map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );
    await db.insert(qualityAudits).values({
      agentId,
      month: qualityMonthTag(),
      channelType: "wise_call",
      callId: "AGS-BIG",
      ticketId: "",
      duration: "02:00",
      date: currentWeekDates()[0],
      totalScore: 88,
      section1Score: 88,
      section2Score: 88,
    });

    await login(context, user.sessionId);
    await page.goto("/");

    // En la columna (formato compacto) hay una sola fila y no hay lista.
    await expect(page.locator("[data-ags-row]")).toHaveCount(0);
    await expect(page.locator("[data-ags-name]").first()).toHaveText("Ana Cola");

    // Al pasarla a la card grande aparece la lista de la cola.
    await openDashboardConfig(page);
    await page.selectOption("#dashboard-big", "ags");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    const bigAgs = page.locator('[data-home-big="ags"] [data-home-card="ags"]');
    await expect(bigAgs.locator("[data-ags-row]")).toHaveCount(5);
    await expect(bigAgs.locator("[data-ags-row]").first()).toContainText(
      "Ana Cola",
    );
    await expect(bigAgs.locator("[data-ags-row]").nth(4)).toContainText(
      "Elena Cola",
    );
    // La sexta queda fuera del preview y se informa al pie.
    await expect(bigAgs.locator("[data-ags-more]")).toHaveText(
      "y 1 más disponible",
    );
    // El nombre del primero va en el tooltip del avatar (sin fila compacta).
    await expect(
      bigAgs.locator('[data-ags-row] [role="img"]').first(),
    ).toHaveAttribute("aria-label", "Ana Cola");
    await expect(page.locator("[data-ags-name]")).toHaveCount(0);

    // Sin cola: estado vacío, sin filas y sin el pie "y N más".
    await page.unroute("**/api/ags/next");
    await page.route("**/api/ags/next", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next: null,
          queue: [],
          availableCount: 0,
          generatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(bigAgs.locator("[data-ags-row]")).toHaveCount(0);
    await expect(bigAgs).toContainText("Sin operadores disponibles");
    await expect(bigAgs.locator("[data-ags-more]")).toHaveText("");
  });

  test("un agente vinculado a otro usuario no se resuelve por username", async ({
    context,
    page,
  }) => {
    const owner = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "vinculo_owner",
    });
    const intruder = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "vinculo_intruder",
    });
    const ownerAgentId = await seedAgent({
      userId: owner.userId,
      username: owner.username,
      name: "Dueño Legítimo",
      enCronograma: true,
      incluidoCalidad: true,
    });
    // Dato stale: el agente del dueño conserva el username de otro usuario.
    await db
      .update(agents)
      .set({ username: intruder.username })
      .where(eq(agents.id, ownerAgentId));

    await login(context, intruder.sessionId);
    await page.goto("/");

    // Sin agente propio, no debe ver la semana ni la calidad del dueño.
    await expect(page.locator('[data-home-card="week"]')).toHaveCount(0);
    await expect(page.locator('[data-home-card="quality"]')).toHaveCount(0);
    await expect(page.locator("#home-greeting")).not.toContainText(
      "Dueño Legítimo",
    );
  });

  test("accesos: desmarcar todo oculta la sección de abajo", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "access_empty",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Elena Sin Accesos",
      enCronograma: true,
      incluidoCalidad: true,
    });
    await db.insert(schedules).values(
      currentWeekDates().map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    await login(context, user.sessionId);
    await page.goto("/");
    await expect(page.locator("[data-access-grid] > *")).toHaveCount(8);

    await openDashboardConfig(page);
    const boxes = page.locator('#dashboard-access-list input[type="checkbox"]');
    const total = await boxes.count();
    for (let i = 0; i < total; i++) await boxes.nth(i).uncheck();
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForURL(/toast_msg=/);

    // Sin tarjetas: la sección no se renderiza (ni siquiera vacía).
    await expect(page.locator("[data-access-grid]")).toHaveCount(0);

    await page.goto("/");
    await expect(page.locator("[data-access-grid]")).toHaveCount(0);

    await openDashboardConfig(page);
    await page.locator("[data-reset-dashboard-layout]").click();
    await page.waitForURL(/toast_msg=/);
    await expect(page.locator("[data-access-grid] > *")).toHaveCount(8);
  });

  test("personalizar inicio: el ítem sólo existe en el inicio", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "menu_off_home",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Marta Fuera Del Inicio",
      enCronograma: true,
      incluidoCalidad: true,
    });
    await db.insert(schedules).values(
      currentWeekDates().map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    await login(context, user.sessionId);
    await page.goto("/");
    await expect(page.locator(".navbar [data-open-dashboard-config]")).toHaveCount(1);

    await page.goto("/profile");
    await expect(page.locator("[data-open-dashboard-config]")).toHaveCount(0);
  });

  test("guardar el layout sin token CSRF responde 403", async ({
    context,
    page,
  }) => {
    const user = await seedUser({
      role: "agent",
      mesa: MDA,
      invgateId: mdaInvgateId,
      tag: "layout_csrf",
    });
    const agentId = await seedAgent({
      userId: user.userId,
      username: user.username,
      name: "Nora Sin Csrf",
      enCronograma: true,
      incluidoCalidad: true,
    });
    await db.insert(schedules).values(
      currentWeekDates().map((date) => ({
        agentId,
        date,
        status: "Home Office",
        comment: "",
        horario: "08:00 - 17:00",
        isOverride: true,
      })),
    );

    await login(context, user.sessionId);
    await page.goto("/");

    const base = test.info().project.use.baseURL ?? "http://localhost:4321";
    const res = await context.request.post(
      new URL("/api/home/layout", base).href,
      {
        form: { big: "week", side1: "ags", side2: "quality" },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
    expect(res.status()).toBe(403);
  });
});
