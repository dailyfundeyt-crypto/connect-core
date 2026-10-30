import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "../../docs/v06/reports/e2e-results.json" }],
    ["html", { outputFolder: "../../docs/v06/reports/e2e-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3101",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
