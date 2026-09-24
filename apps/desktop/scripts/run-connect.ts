/**
 * Dev or package the Connect product window.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "build") {
  console.error("Usage: bun scripts/run-connect.ts <dev|build>");
  process.exit(1);
}

const desktop = join(import.meta.dir, "..");
process.env.CONNECT_PRODUCT_WINDOW = "1";
process.env.CONNECT_ROOT ??= join(desktop, "..");

const candidates =
  process.platform === "win32"
    ? ["tauri.exe", "tauri.cmd", "tauri"]
    : ["tauri"];
let binary = "";
for (const name of candidates) {
  const path = join(desktop, "node_modules", ".bin", name);
  if (existsSync(path)) {
    binary = path;
    break;
  }
}
if (!binary) {
  console.error("[Connect] Zuerst im Ordner desktop: bun install");
  process.exit(1);
}

// Do not use shell:true — paths with spaces (e.g. Kunc GmbH) break otherwise.
const child = spawn(
  binary,
  [mode, "--config", "src-tauri/tauri.connect.conf.json"],
  {
    cwd: desktop,
    stdio: "inherit",
    env: process.env,
    shell: false,
  },
);

child.on("error", (error) => {
  console.error(`[Connect] Konnte tauri nicht starten: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
