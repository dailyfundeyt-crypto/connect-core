import { chromium } from "playwright";
import * as path from "path";
import * as os from "os";
import { getTestSessionCookie } from "./fixtures";

async function main() {
  const cookieVal = await getTestSessionCookie();
  const testProfileDir = path.join(os.tmpdir(), "connect-test-A39");
  const reportsDir = path.resolve(__dirname, "../../docs/v06/reports");

  const ctx = await chromium.launchPersistentContext(testProfileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });

  await ctx.addCookies([
    {
      name: "better-auth.session_token",
      value: cookieVal,
      url: "http://localhost:3101",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await ctx.newPage();
  await page.goto("http://localhost:3101/agents", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(reportsDir, "A39-desktop.png") });
  console.log("Desktop screenshot saved.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3101/agents", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(reportsDir, "A39-mobile.png") });
  console.log("Mobile screenshot saved.");

  await ctx.close();
}

main().catch(console.error);
