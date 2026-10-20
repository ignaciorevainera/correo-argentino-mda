import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";
const port = new URL(baseURL).port || "4321";
const isProdServer = process.env.PLAYWRIGHT_PROD === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    trace: "on",
  },
  webServer: isProdServer
    ? {
        command: "node server.mjs",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { PORT: port, HOST: "127.0.0.1" },
      }
    : {
        command: `npm run dev -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { ASTRO_DEV_BACKGROUND: "0" },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
