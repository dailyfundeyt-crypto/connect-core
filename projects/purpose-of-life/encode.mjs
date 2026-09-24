/* Encode captured frames into an MP4 video using ffmpeg.
 * Output: out/purpose-of-life.mp4 (no audio — voiceover is added later).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = join(__dirname, "out", "frames");
const OUT = join(__dirname, "out", "purpose-of-life.mp4");

if (!existsSync(FRAMES_DIR)) {
  console.error(`✗ Missing frames dir: ${FRAMES_DIR}`);
  console.error("  Run `bun run render.mjs` first.");
  process.exit(1);
}

const args = [
  "-y",
  "-framerate", "30",
  "-i", join(FRAMES_DIR, "frame_%05d.jpg"),
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-preset", "slow",
  "-crf", "18",
  "-movflags", "+faststart",
  OUT,
];

console.log("→ ffmpeg", args.join(" "));
const proc = spawn("ffmpeg", args, { stdio: "inherit" });
proc.on("exit", (code) => {
  if (code === 0) {
    console.log(`✓ Wrote ${OUT}`);
  } else {
    console.error(`✗ ffmpeg exited with code ${code}`);
    process.exit(code ?? 1);
  }
});
