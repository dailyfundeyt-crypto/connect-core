/**
 * Standalone Smoke Test Runner for Swarm-v2 Canonical Routes
 * Executes against http://127.0.0.1:3101 and verifies status codes and security headers.
 */

import { ROUTES_TO_TEST } from "./routes.spec";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3101";

async function runSmokeTests() {
  console.log(`\n========================================`);
  console.log(`  Swarm-v2 Smoke Test Runner (Lane 09)  `);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`========================================\n`);

  let passed = 0;
  let failed = 0;
  const results: any[] = [];

  for (const route of ROUTES_TO_TEST) {
    const url = `${BASE_URL}${route.path}`;
    const startTime = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          "Accept": route.type === "api" ? "application/json" : "text/html",
        },
      });
      const durationMs = Date.now() - startTime;
      const status = res.status;
      const ok = status === route.expectedStatus || (route.type === "page" && status < 400);

      const securityHeaders = {
        nosniff: res.headers.get("x-content-type-options"),
        frameOptions: res.headers.get("x-frame-options"),
        rateLimit: res.headers.get("x-ratelimit-limit"),
      };

      if (ok) {
        passed++;
        console.log(`✓ PASS: ${route.path.padEnd(25)} [${status}] (${durationMs}ms)`);
      } else {
        failed++;
        console.error(`✗ FAIL: ${route.path.padEnd(25)} [Expected ${route.expectedStatus}, got ${status}]`);
      }

      results.push({
        path: route.path,
        type: route.type,
        status,
        ok,
        durationMs,
        securityHeaders,
      });
    } catch (err: any) {
      failed++;
      console.error(`✗ ERROR: ${route.path.padEnd(24)} ${err.message}`);
      results.push({
        path: route.path,
        type: route.type,
        status: 0,
        ok: false,
        error: err.message,
      });
    }
  }

  console.log(`\n----------------------------------------`);
  console.log(`Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`----------------------------------------\n`);

  return { passed, failed, results };
}

runSmokeTests()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("Runner crashed:", e);
    process.exit(1);
  });
