import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // tests share one database
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "off", ...devices["Desktop Chrome"] },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm start", url: `${baseURL}/healthz`, reuseExistingServer: true, timeout: 60_000 },
});
