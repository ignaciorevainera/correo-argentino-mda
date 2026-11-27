import "dotenv/config";
import { test, expect } from "@playwright/test";
import {
  createTestUserAndSession,
  cleanupTestUser,
  setSessionCookie,
  type TestUser,
} from "../helpers/auth";

test.describe("Tooltip de reportar agentes caídos en /oficinas", () => {
  let admin: TestUser;

  test.beforeAll(async () => {
    admin = await createTestUserAndSession("admin");
  });

  test.afterAll(async () => {
    if (admin) await cleanupTestUser(admin.userId, admin.sessionId);
  });

  test("no se recorta contra los bordes ni queda detrás de la tabla en primera y última fila", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, admin.signedSessionId);

    await page.goto("/oficinas?type=TELEGRAFIA");
    await page.waitForSelector("[data-agents-ticket-trigger]", {
      timeout: 20000,
    });
    await page.waitForLoadState("networkidle");

    const triggers = page.locator("[data-agents-ticket-trigger]:visible");
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);

    const indicesToCheck = count > 1 ? [0, count - 1] : [0];

    for (const idx of indicesToCheck) {
      const btn = triggers.nth(idx);
      await btn.scrollIntoViewIfNeeded();
      await expect(btn).toHaveClass(/tooltip-left/);

      await btn.hover();
      // Esperar a que termine la transición de opacidad del tooltip (200ms + 75ms delay)
      await page.waitForTimeout(350);

      const geometry = await btn.evaluate((el) => {
        const wrapper = el.closest("[data-master-detail-table-wrapper]");
        if (!wrapper) throw new Error("No se encontró [data-master-detail-table-wrapper]");

        const wrapperRect = wrapper.getBoundingClientRect();
        const btnRect = el.getBoundingClientRect();
        const before = window.getComputedStyle(el, "::before");

        const width = parseFloat(before.width);
        const height = parseFloat(before.height);
        const rightOffset = parseFloat(before.right);
        const topOffset = parseFloat(before.top);

        // Con tooltip-left, ::before se posiciona respecto al botón:
        // right: calc(100% + 0.5rem) -> borde derecho del tooltip = btnRect.right - rightOffset
        const tooltipRight = btnRect.right - rightOffset;
        const tooltipLeft = tooltipRight - width;
        // top: 50% con translateY(-50%) -> centrado verticalmente en el botón
        const tooltipCenterY = btnRect.top + (Number.isFinite(topOffset) ? topOffset : btnRect.height / 2);
        const tooltipTop = tooltipCenterY - height / 2;
        const tooltipBottom = tooltipCenterY + height / 2;

        return {
          opacity: parseFloat(before.opacity),
          zIndex: before.zIndex,
          tooltipLeft,
          tooltipRight,
          tooltipTop,
          tooltipBottom,
          wrapperLeft: wrapperRect.left,
          wrapperRight: wrapperRect.right,
          wrapperTop: wrapperRect.top,
          wrapperBottom: wrapperRect.bottom,
        };
      });

      expect(geometry.opacity).toBeGreaterThan(0.9);
      expect(geometry.tooltipLeft).toBeGreaterThanOrEqual(geometry.wrapperLeft);
      expect(geometry.tooltipRight).toBeLessThanOrEqual(geometry.wrapperRight);
      expect(geometry.tooltipTop).toBeGreaterThanOrEqual(geometry.wrapperTop);
      expect(geometry.tooltipBottom).toBeLessThanOrEqual(geometry.wrapperBottom);
    }
  });
});
