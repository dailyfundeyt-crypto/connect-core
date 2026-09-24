/* Headless renderer.
 *
 * Loads src/index.html in headless Chromium, scrubs the timeline forward by
 * calling window.__renderFrame(0, t) where t is a timestamp in seconds,
 * then dumps the canvas as a JPEG via toDataURL for every frame.
 * Output: out/frames/frame_NNNNN.jpg
 *
 * Design choices:
 *   - Canvas is 1920x1080 (true 1080p) at deviceScaleFactor=1.
 *   - JPEG @ q=0.92 — visually indistinguishable from PNG for this aesthetic,
 *     ~4× smaller, much faster encode inside the browser.
 *   - We don't stop the real-time loop; rendering is fast enough that it
 *     just paints over the same frame, and stopping it costs a round-trip.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out", "frames");
const HTML = "file:///" + join(__dirname, "src", "index.html").replace(/\\/g, "/");

const FPS = 30;
const DURATION = 50;            // seconds
const TOTAL = DURATION * FPS;   // 1500
const QUALITY = 0.92;

await mkdir(OUT_DIR, { recursive: true });

console.log("→ Launching headless Chromium…");
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1.0,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("CONSOLE:", m.text());
});

console.log("→ Loading", HTML);
await page.goto(HTML, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.__renderFrame === "function");
await page.evaluate(() => window.__renderFrame(0, 0));
console.log("  ready");

console.log(`→ Rendering ${TOTAL} frames at ${FPS}fps (${DURATION}s)…`);
const t0 = Date.now();
for (let i = 0; i < TOTAL; i++) {
  const t = i / FPS;
  await page.evaluate(([t, q]) => {
    window.__renderFrame(0, t);
    return null;
  }, [t, QUALITY]);
  const dataUrl = await page.evaluate((q) => document.getElementById("c").toDataURL("image/jpeg", q), QUALITY);
  const b64 = dataUrl.split(",")[1];
  const bytes = Buffer.from(b64, "base64");
  const fname = join(OUT_DIR, `frame_${String(i).padStart(5, "0")}.jpg`);
  await Bun.write(fname, bytes);
  if (i % 60 === 0) {
    const pct = ((i / TOTAL) * 100).toFixed(1);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const fps = (i / Math.max(elapsed, 0.01)).toFixed(2);
    console.log(`  ${pct}%  (${i}/${TOTAL})  elapsed=${elapsed}s  rate=${fps}fps`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`✓ Captured ${TOTAL} frames in ${elapsed}s (${(TOTAL / elapsed).toFixed(2)} fps)`);
await browser.close();
