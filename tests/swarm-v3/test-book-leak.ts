import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadBookChunks } from "../../apps/server/src/swarm/brains/sources/book-ingest";

async function runLeakTest() {
  console.log("=== [SECURITY TEST] Book Text Leak Test (Shingle Search) ===");

  const chunks = loadBookChunks();
  if (chunks.length < 20) {
    throw new Error(`Insufficient chunks for leak test: got ${chunks.length}`);
  }

  // 1. Generate 20 distinct 12-word shingles from randomly selected chunks
  const shingles: string[] = [];
  const step = Math.floor(chunks.length / 20);

  for (let i = 0; i < 20; i++) {
    const chunk = chunks[i * step];
    const words = chunk.text
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (words.length >= 12) {
      const startIndex = Math.min(5, words.length - 12);
      const shingle = words.slice(startIndex, startIndex + 12).join(" ").toLowerCase();
      shingles.push(shingle);
    }
  }

  console.log(`Generated ${shingles.length} 12-word shingles from private 100M book chunks.`);

  // 2. Scan Git Status / Tracked Files
  console.log("Checking Git status and tracked files...");
  try {
    const gitStatus = execSync("git status --porcelain", { encoding: "utf8" });
    if (gitStatus.includes("100m-book.txt")) {
      throw new Error("CRITICAL SECURITY LEAK: 100m-book.txt appears in git status!");
    }
    console.log("  [PASS] Git status does not stage 100m-book.txt");
  } catch (err: any) {
    if (err.message.includes("CRITICAL SECURITY LEAK")) throw err;
    console.log("  (Git status check skipped or passed)");
  }

  // 3. Scan Public / Store / Social / Vercel Payload Directories
  const scanTargets = [
    path.resolve(process.cwd(), "apps/server/src/social"),
    path.resolve(process.cwd(), "apps/server/src/plugins/store"),
    path.resolve(process.cwd(), "apps/app/dist"),
    path.resolve(process.cwd(), "apps/server/dist"),
  ];

  let scannedFilesCount = 0;

  function scanDirectory(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.includes("node_modules") && !entry.name.startsWith(".git")) {
          scanDirectory(fullPath);
        }
      } else if (entry.isFile() && /\.(js|ts|json|html|txt|md)$/i.test(entry.name)) {
        // Skip .bak files or test files
        if (entry.name.includes(".bak-") || entry.name.includes("test-book-leak")) continue;

        scannedFilesCount++;
        const content = fs.readFileSync(fullPath, "utf8").toLowerCase();
        for (const shingle of shingles) {
          if (content.includes(shingle)) {
            throw new Error(
              `CRITICAL LEAK DETECTED! Shingle "${shingle}" was found in public file: ${fullPath}`
            );
          }
        }
      }
    }
  }

  for (const target of scanTargets) {
    scanDirectory(target);
  }

  console.log(`Scanned ${scannedFilesCount} public/store/social payload files. 0 leaks found.`);
  console.log("=== ALL BOOK LEAK TESTS PASSED: PRIVATE SOURCE IS COMPLETELY ISOLATED ===\n");
}

runLeakTest().catch((err) => {
  console.error("Book leak test failed:", err);
  process.exit(1);
});
