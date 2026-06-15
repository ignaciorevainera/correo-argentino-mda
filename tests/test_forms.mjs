import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log("Navegando al login...");
    await page.goto('http://localhost:4321/login');
    await page.waitForLoadState('networkidle');
    console.log("Login cargado.");
    await page.screenshot({ path: 'login.png', fullPage: true });

    console.log("Intentando login...");
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    console.log("Después de intentar el login.");
    await page.screenshot({ path: 'post_login.png', fullPage: true });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
})();
