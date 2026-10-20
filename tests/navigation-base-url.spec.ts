import { test, expect } from "@playwright/test";
import { getCleanBase } from "../src/lib/baseUrl";
import {
  cleanupTestUser,
  createTestUserAndSession,
  setSessionCookie,
} from "./helpers/auth";

test.describe("Normalización de URLs base", () => {
  const base = getCleanBase();

  test("Página 404 tiene enlace a home con cleanBase", async ({
    page,
    context,
  }) => {
    const user = await createTestUserAndSession("admin");
    try {
      await setSessionCookie(context, user.signedSessionId);
      await page.goto("/404-test-non-existing-path");
      const homeBtn = page.getByRole("link", { name: "Volver al inicio" });
      await expect(homeBtn).toBeVisible();
      await expect(homeBtn).toHaveAttribute("href", base);
    } finally {
      await cleanupTestUser(user.userId, user.sessionId);
    }
  });
});
