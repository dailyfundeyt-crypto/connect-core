import { execSync } from "node:child_process";
import path from "node:path";

const testFiles = [
  "test-contracts-and-stubs.ts",
  "test-quote-check.ts",
  "test-book-leak.ts",
  "test-serverless-isolation.ts",
  "test-privacy-flags.ts",
  "test-brains-api.ts",
  "test-e2e-simulation-council-spark.ts",
  "test-regression-dark-toggles-spark.ts",
];

async function runAll() {
  console.log("===============================================================");
  console.log(" SWARM-V3 LANE 10 MASTER TEST RUNNER");
  console.log(" Wissens-Brains ($100M-Frameworks), Tests, Sicherheit, Lizenzen");
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;
  const results: { file: string; status: "PASS" | "FAIL"; durationMs: number }[] = [];

  for (const file of testFiles) {
    const fullPath = path.resolve(process.cwd(), "tests/swarm-v3", file);
    const start = Date.now();
    process.stdout.write(`Executing ${file}... `);

    try {
      execSync(`bun "${fullPath}"`, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_PATH: path.resolve(process.cwd(), "apps/server/node_modules"),
        },
        stdio: "pipe",
      });
      const durationMs = Date.now() - start;
      console.log(`[PASS] (${durationMs}ms)`);
      passed++;
      results.push({ file, status: "PASS", durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      console.log(`[FAIL] (${durationMs}ms)`);
      console.error(err.stdout?.toString() || err.stderr?.toString() || err.message);
      failed++;
      results.push({ file, status: "FAIL", durationMs });
    }
  }

  console.log("\n===============================================================");
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${testFiles.length})`);
  console.log("===============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});
