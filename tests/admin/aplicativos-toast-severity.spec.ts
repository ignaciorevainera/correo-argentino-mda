import "dotenv/config";
import { expect, test } from "@playwright/test";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
} from "../helpers/auth";

test.describe("toasts de aplicativos conservan severidad (#270)", () => {
  test("toast_type success/error/warning/info se mapea al alert correcto", async ({
    context,
    page,
  }) => {
    const user = await createTestUserAndSession("admin");
    try {
      await setSessionCookie(context, user.signedSessionId);

      const cases = [
        ["success", "alert-success"],
        ["error", "alert-error"],
        ["warning", "alert-warning"],
        ["info", "alert-info"],
      ] as const;

      for (const [type, alertClass] of cases) {
        const message = `toast-${type}-${Date.now()}`;
        await page.goto(
          `/admin/aplicativos?toast_msg=${encodeURIComponent(message)}&toast_type=${type}`,
        );

        const toast = page.locator("#global-toast-container .alert").last();
        await expect(toast).toContainText(message, { timeout: 5000 });
        await expect(toast).toHaveClass(new RegExp(alertClass), {
          timeout: 5000,
        });
      }
    } finally {
      await cleanupTestUser(user.userId, user.sessionId);
    }
  });
});
