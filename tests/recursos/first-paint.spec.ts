import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { test, expect } from "@playwright/test";
import { db } from "../../src/db/index";
import { resourceCategories, resourceLinks } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { getIconsDir } from "../../src/lib/storage";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

/**
 * Objetivo: el primer frame en que existen tarjetas de /recursos debe usar ya
 * la cantidad de columnas guardada (no el fallback 3), sin relayout, sin
 * desborde de viewport y con los íconos acotados a su tamaño final.
 *
 * Instrumento: `addInitScript` instala un loop `requestAnimationFrame` desde
 * `document_start` que muestrea, por frame: cuántos `.grid-item` hay, el ancho
 * del primero, el ancho del grid, `window.innerWidth`, el desborde del
 * documento/tarjetas y el tamaño máximo de `.icon-container`/`img`.
 *
 * El island llega con `server:defer`: el HTML con tarjetas se inserta sin su
 * script y luego un módulo aparte corre y fija `--columns-effective` inline en
 * `#important-links-grid`. Por eso el "primer frame con tarjetas" es,
 * necesariamente, pre-script; el ancho ahí debe ser el final.
 */

const ICON_NAME = `e2e_firstpaint_${Date.now()}.png`;
const iconFile = path.join(getIconsDir(), ICON_NAME);
const LINK_TITLE = "Enlace E2E primer paint";

let admin: TestUser;
let categoryId: number;
let linkId: number;

test.beforeAll(async () => {
  admin = await createTestUserAndSession("admin");

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 180, g: 60, b: 60, alpha: 1 },
    },
  })
    .png()
    .toFile(iconFile);

  const [cat] = await db
    .insert(resourceCategories)
    .values({
      title: "Cat E2E primer paint",
      iconName: "boxicons:link",
      sortOrder: -9998,
    })
    .returning({ id: resourceCategories.id });
  categoryId = cat.id;

  const [link] = await db
    .insert(resourceLinks)
    .values({
      categoryId,
      title: LINK_TITLE,
      subtitle: "Subtítulo E2E",
      url: "https://example.com/first-paint",
      iconPath: ICON_NAME,
    })
    .returning({ id: resourceLinks.id });
  linkId = link.id;
});

test.afterAll(async () => {
  if (linkId) await db.delete(resourceLinks).where(eq(resourceLinks.id, linkId));
  if (categoryId)
    await db
      .delete(resourceCategories)
      .where(eq(resourceCategories.id, categoryId));
  fs.rmSync(iconFile, { force: true });
  if (admin) await cleanupTestUser(admin.userId, admin.sessionId);
});

interface Frame {
  count: number;
  firstWidth: number | null;
  gridWidth: number | null;
  overflow: number;
  maxIcon: number;
  maxImg: number;
}

interface Recorder {
  frames: Frame[];
  maxOverflow: number;
  maxIcon: number;
  maxImg: number;
}

async function record(
  page: import("@playwright/test").Page,
  columns: number | null,
  viewport: { width: number; height: number } = { width: 1600, height: 900 },
) {
  await page.addInitScript(
    ({ cols, key }) => {
      try {
        window.localStorage.removeItem("enlacesViewMode");
        if (cols == null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, String(cols));
        }
      } catch {
        /* ignore */
      }

      const rec = {
        frames: [] as Frame[],
        maxOverflow: -Infinity,
        maxIcon: -Infinity,
        maxImg: -Infinity,
      };
      (window as unknown as { __rec: Recorder }).__rec = rec;

      const sample = (): void => {
        const iw = window.innerWidth;
        const de = document.documentElement;
        let overflow = de.scrollWidth - iw;

        const grid = document.getElementById("important-links-grid");
        const items = grid
          ? Array.from(grid.querySelectorAll<HTMLElement>(".grid-item"))
          : [];
        const gridWidth = grid ? grid.offsetWidth : null;

        let firstWidth: number | null = null;
        let maxIcon = -Infinity;
        let maxImg = -Infinity;

        items.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          overflow = Math.max(overflow, r.right - iw);
          if (i === 0) firstWidth = r.width;
        });

        document
          .querySelectorAll<HTMLElement>(".icon-container")
          .forEach((c) => {
            const r = c.getBoundingClientRect();
            maxIcon = Math.max(maxIcon, r.width);
            const img = c.querySelector<HTMLElement>("img");
            if (img) maxImg = Math.max(maxImg, img.getBoundingClientRect().width);
          });

        rec.maxOverflow = Math.max(rec.maxOverflow, overflow);
        rec.maxIcon = Math.max(rec.maxIcon, maxIcon);
        rec.maxImg = Math.max(rec.maxImg, maxImg);
        rec.frames.push({
          count: items.length,
          firstWidth,
          gridWidth,
          overflow,
          maxIcon,
          maxImg,
        });

        requestAnimationFrame(sample);
      };

      requestAnimationFrame(sample);
    },
    { cols: columns, key: "enlacesViewColumns" },
  );

  // Ensancha la ventana real del bug (entre la inserción del HTML del island y
  // la ejecución de su script) para observarla de forma determinista.
  await page.route(
    /EnlacesContent\.astro\?astro&type=script/,
    async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    },
  );

  await page.setViewportSize(viewport);
  await page.goto("/recursos", { waitUntil: "load" });
  await page.waitForSelector("#important-links-grid .grid-item");
  // El island fija data-view-mode al correr su script: señal de que ya terminó.
  await page.waitForFunction(() =>
    document.documentElement.hasAttribute("data-view-mode"),
  );
  await page.waitForTimeout(300);

  return page.evaluate(
    () => (window as unknown as { __rec: Recorder }).__rec,
  );
}

test.describe("/recursos — primer paint sin flash", () => {
  for (const columns of [1, 2, 3, 4]) {
    test(`${columns} columnas guardadas: el primer frame ya las respeta`, async ({
      context,
      page,
    }) => {
      await setSessionCookie(context, admin.signedSessionId);
      const rec = await record(page, columns);

      const withCards = rec.frames.filter(
        (f) => f.count > 0 && f.firstWidth !== null && f.gridWidth,
      );
      expect(withCards.length, "hubo frames con tarjetas").toBeGreaterThan(0);

      const last = withCards[withCards.length - 1];
      const gridWidth = last.gridWidth as number;
      const expected = (gridWidth - 8 * (columns - 1)) / columns;

      for (const [i, f] of withCards.entries()) {
        expect(
          Math.abs((f.firstWidth as number) - expected),
          `frame #${i} (count=${f.count}) ancho ${f.firstWidth} ≠ ${columns} col (${expected.toFixed(1)})`,
        ).toBeLessThanOrEqual(2);
      }

      // El atributo (highlight/label) también debe reflejar el valor efectivo.
      await expect(page.locator("html")).toHaveAttribute(
        "data-view-columns",
        String(columns),
      );
    });
  }

  test("viewport angosto: el primer frame respeta el cap responsive, no la columna guardada", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);
    // Guardado 4, pero a 1000px el cap de getColumnCap() es 2.
    const rec = await record(page, 4, { width: 1000, height: 800 });

    const withCards = rec.frames.filter(
      (f) => f.count > 0 && f.firstWidth !== null && f.gridWidth,
    );
    expect(withCards.length, "hubo frames con tarjetas").toBeGreaterThan(0);

    const CAP = 2;
    const last = withCards[withCards.length - 1];
    const gridWidth = last.gridWidth as number;
    const expected = (gridWidth - 8 * (CAP - 1)) / CAP;

    // Sin el clamp del script inline el primer frame mediria 4 columnas y
    // recien al hidratar el island saltaria a 2 -> relayout.
    for (const [i, f] of withCards.entries()) {
      expect(
        Math.abs((f.firstWidth as number) - expected),
        `frame #${i} (count=${f.count}) ancho ${f.firstWidth} ≠ cap ${CAP} col (${expected.toFixed(1)})`,
      ).toBeLessThanOrEqual(2);
    }

    await expect(page.locator("html")).toHaveAttribute(
      "data-view-columns",
      String(CAP),
    );
  });

  // Regresión #123 (causa 1, caso borde): el inline usaba window.innerWidth y el
  // island el ancho del contenedor, que va ~78-320px por detrás del viewport y
  // encima topa en max-w-7xl (1280). En 1280/1366 el inline calculaba cap 4 y el
  // island cap 2 -> primer frame a 4 y relayout a 2.
  for (const width of [1280, 1366]) {
    test(`viewport ${width} con 4 guardadas: sin salto 4→2 (cap consistente)`, async ({
      context,
      page,
    }) => {
      await setSessionCookie(context, admin.signedSessionId);
      const rec = await record(page, 4, { width, height: 900 });

      const withCards = rec.frames.filter(
        (f) => f.count > 0 && f.firstWidth !== null && f.gridWidth,
      );
      expect(withCards.length, "hubo frames con tarjetas").toBeGreaterThan(0);

      const CAP = 4;
      const last = withCards[withCards.length - 1];
      const gridWidth = last.gridWidth as number;
      const expected = (gridWidth - 8 * (CAP - 1)) / CAP;

      for (const [i, f] of withCards.entries()) {
        expect(
          Math.abs((f.firstWidth as number) - expected),
          `frame #${i} (count=${f.count}) ancho ${f.firstWidth} ≠ cap ${CAP} col (${expected.toFixed(1)})`,
        ).toBeLessThanOrEqual(2);
      }

      await expect(page.locator("html")).toHaveAttribute(
        "data-view-columns",
        String(CAP),
      );
    });
  }

  // Regresión #123 (causa 1, usuario default): sin preferencia guardada el inline
  // no tocaba nada, así que el primer frame pintaba el default :root (3) y el
  // island lo bajaba al cap (2) -> flash 3→2. El fix aplica siempre
  // min(saved ?? 3, cap).
  test("usuario sin preferencia a 1200: sin salto 3→2", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);
    const rec = await record(page, null, { width: 1200, height: 800 });

    const withCards = rec.frames.filter(
      (f) => f.count > 0 && f.firstWidth !== null && f.gridWidth,
    );
    expect(withCards.length, "hubo frames con tarjetas").toBeGreaterThan(0);

    const CAP = 2;
    const last = withCards[withCards.length - 1];
    const gridWidth = last.gridWidth as number;
    const expected = (gridWidth - 8 * (CAP - 1)) / CAP;

    for (const [i, f] of withCards.entries()) {
      expect(
        Math.abs((f.firstWidth as number) - expected),
        `frame #${i} (count=${f.count}) ancho ${f.firstWidth} ≠ cap ${CAP} col (${expected.toFixed(1)})`,
      ).toBeLessThanOrEqual(2);
    }

    await expect(page.locator("html")).toHaveAttribute(
      "data-view-columns",
      String(CAP),
    );
  });

  test("mode ausente: sin desborde de viewport y con íconos acotados", async ({
    context,
    page,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);
    const rec = await record(page, 4);

    expect(
      rec.maxOverflow,
      `desborde de viewport durante la carga: ${rec.maxOverflow}px`,
    ).toBeLessThanOrEqual(1);

    // Se renderizó al menos un ícono (img) — de lo contrario el chequeo no vale.
    expect(rec.maxImg, "se midió algún ícono <img>").toBeGreaterThan(0);

    // Tamaño final con mode normal (ausente): contenedor 44px, ícono 36px.
    expect(
      rec.maxIcon,
      `ícono gigante durante la carga: contenedor ${rec.maxIcon}px`,
    ).toBeLessThanOrEqual(45);
    expect(
      rec.maxImg,
      `imagen de ícono gigante durante la carga: ${rec.maxImg}px`,
    ).toBeLessThanOrEqual(37);
  });
});
