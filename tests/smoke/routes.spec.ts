/**
 * Playwright Smoke Test for Swarm-v2 Canonical Routes
 * Tests all application pages and primary endpoints for HTTP 200, no fatal crashes.
 */

export const ROUTES_TO_TEST = [
  { path: "/api/health", expectedStatus: 200, type: "api" },
  { path: "/api/onboarding/state", expectedStatus: 200, type: "api" },
  { path: "/", expectedStatus: 200, type: "page" },
  { path: "/onboarding", expectedStatus: 200, type: "page" },
  { path: "/social", expectedStatus: 200, type: "page" },
  { path: "/settings/companies", expectedStatus: 200, type: "page" },
  { path: "/store", expectedStatus: 200, type: "page" },
  { path: "/brain", expectedStatus: 200, type: "page" },
  { path: "/local-connect", expectedStatus: 200, type: "page" },
  { path: "/sign", expectedStatus: 200, type: "page" },
];

// If @playwright/test is present in the environment
try {
  const pw = require("@playwright/test");
  if (pw && pw.test) {
    ROUTES_TO_TEST.forEach(({ path, expectedStatus, type }) => {
      pw.test(`Route Smoke Test: ${path} [${type}]`, async ({ page, request }: any) => {
        if (type === "api") {
          const response = await request.get(path);
          pw.expect(response.status()).toBe(expectedStatus);
        } else {
          const response = await page.goto(path);
          pw.expect(response.status()).toBe(expectedStatus);
          await pw.expect(page.locator("body")).toBeVisible();
        }
      });
    });
  }
} catch {
  // @playwright/test is not installed in the local environment; use run-smoke.ts instead
}
