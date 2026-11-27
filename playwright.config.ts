import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const external = Boolean(process.env.E2E_BASE_URL) || Boolean(process.env.E2E_REUSE);

// The preinstalled browser is Chromium, so the "iPhone" project uses iPhone 14 metrics (viewport, touch, UA) on Chromium.
const iphone = { ...devices["iPhone 14"], browserName: "chromium" as const, defaultBrowserType: "chromium" as const };

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "off", screenshot: "off" },
  projects: [
    { name: "iphone", use: iphone },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: external ? undefined : { command: "npm run build && npm run start -- -p 3000", url: baseURL, timeout: 240_000, reuseExistingServer: true },
});
