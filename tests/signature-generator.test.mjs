import { chromium } from "playwright";

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const url = "http://localhost:4321/generador-firmas";
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "networkidle" });

  console.log("Initial state checks...");
  const btnDownload = page.locator("#btn-download-png");
  const btnCopyVisual = page.locator("#btn-copy-visual");
  const btnCopyCode = page.locator("#btn-copy-code");

  const isDisabledDownload = await btnDownload.isDisabled();
  if (!isDisabledDownload)
    throw new Error("Download button should be disabled initially");

  console.log("Filling required fields...");
  await page.fill("#input-name", "juan perez");
  await page.fill("#input-role", "Developer");
  await page.fill("#input-department", "IT");
  await page.fill("#input-address1", "Av. Siempre Viva 123");

  await page.waitForTimeout(500);

  console.log(
    "Checking if buttons are enabled after filling required fields...",
  );
  if (await btnDownload.isDisabled())
    throw new Error("Download button should be enabled");

  console.log("Checking preview updates...");
  const previewText = await page.locator("#preview-container").innerText();
  if (
    !previewText.includes("Juan Perez") &&
    !previewText.includes("Juan Pérez") &&
    !previewText.toUpperCase().includes("JUAN PEREZ")
  ) {
    throw new Error("Name not found in preview");
  }

  console.log("Testing optional fields...");
  await page.fill("#input-phone", "011 4444");
  await page.fill("#input-internal", "123");
  await page.fill("#input-mobile", "15 5555");
  await page.waitForTimeout(500);

  const newPreviewText = await page.locator("#preview-container").innerText();
  if (!newPreviewText.includes("Tel: 011 4444"))
    throw new Error("Phone number not found in preview");
  if (!newPreviewText.includes("Int: 123"))
    throw new Error("Internal number not found in preview");
  if (!newPreviewText.includes("Cel: 15 5555"))
    throw new Error("Mobile number not found in preview");

  console.log("Testing image toggle...");
  await page.uncheck("#input-include-image");
  await page.waitForTimeout(500);

  const imgCount = await page.locator("#preview-container img").count();
  if (imgCount !== 0)
    throw new Error("Image should not be in preview when unchecked");

  console.log("All tests passed successfully!");
  await page.screenshot({ path: "test_signature_success.png", fullPage: true });

  await browser.close();
})();
