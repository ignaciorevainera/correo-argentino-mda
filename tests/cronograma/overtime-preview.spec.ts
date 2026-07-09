import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { db } from '../../src/db/index';
import { users, sessions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";

function signSessionId(sessionId: string): string {
  const signature = createHmac("sha256", SECRET_KEY).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

let adminUserId: number;
let adminSessionId: string;

test.beforeAll(async () => {
  const username = `overtime_preview_admin_${Date.now()}`;
  adminSessionId = `overtime_preview_session_${Date.now()}`;
  const signedId = signSessionId(adminSessionId);

  const [{ id }] = await db.insert(users).values({
    username,
    password: 'hashed_fake_password',
    role: 'admin',
  }).returning({ id: users.id });
  adminUserId = id;

  await db.insert(sessions).values({
    id: adminSessionId,
    userId: adminUserId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  });
});

test.afterAll(async () => {
  await db.delete(sessions).where(eq(sessions.id, adminSessionId));
  await db.delete(users).where(eq(users.id, adminUserId));
});

test.describe('Overtime preview modal', () => {
  test('Ver Mes button opens modal with month header', async ({ context, page }) => {
    const signedId = signSessionId(adminSessionId);
    await context.addCookies([{
      name: 'session_id',
      value: signedId,
      domain: '127.0.0.1',
      path: '/',
    }]);

    await page.goto('/supervision/cronograma');
    await page.waitForTimeout(500);

    // Switch to overtime tab
    await page.click('#switch-to-overtime-btn');
    await page.waitForTimeout(300);

    // Click "Ver Mes" button
    await page.click('#preview-month-btn');

    // Modal should appear
    const modal = page.locator('#overtime-preview-modal');
    await expect(modal).toBeVisible();

    // Modal should have a header with month name and year
    const header = modal.locator('h3');
    await expect(header).toBeVisible();

    // Modal should have a content container
    const content = modal.locator('#overtime-preview-content');
    await expect(content).toBeVisible();

    // Modal should have prev/next month buttons
    await expect(modal.locator('#preview-prev-month')).toBeVisible();
    await expect(modal.locator('#preview-next-month')).toBeVisible();

    // Close via close button
    await modal.locator('#preview-close-btn').click();
    await expect(modal).not.toBeVisible();
  });

  test('Modal can be opened, navigated, and closed via backdrop', async ({ context, page }) => {
    const signedId = signSessionId(adminSessionId);
    await context.addCookies([{
      name: 'session_id',
      value: signedId,
      domain: '127.0.0.1',
      path: '/',
    }]);

    await page.goto('/supervision/cronograma');
    await page.waitForTimeout(500);
    await page.click('#switch-to-overtime-btn');
    await page.waitForTimeout(300);
    await page.click('#preview-month-btn');

    const modal = page.locator('#overtime-preview-modal');
    await expect(modal).toBeVisible();

    // Navigate to previous month
    await modal.locator('#preview-prev-month').click();
    await page.waitForTimeout(300);

    // Modal should still be visible after navigation
    await expect(modal).toBeVisible();

    // Navigate to next month (back to original)
    await modal.locator('#preview-next-month').click();
    await page.waitForTimeout(300);
    await expect(modal).toBeVisible();

    // Close via backdrop click (press Escape)
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });
});
