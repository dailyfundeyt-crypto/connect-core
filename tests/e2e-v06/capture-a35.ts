import { chromium } from "playwright";
import * as path from "path";
import * as os from "os";
import { getTestSessionCookie, injectFeatureFlags } from "./fixtures";

async function main() {
  const mode = process.argv[2] || "vorher"; // "vorher" | "nachher"
  const cookieVal = await getTestSessionCookie();
  const testProfileDir = path.join(os.tmpdir(), "connect-test-A35");
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

  // 1. Settings (Dark)
  await injectFeatureFlags(page, {
    settingsV2: true,
    designV2: mode === "nachher",
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("http://localhost:3101/settings", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(reportsDir, `A35-${mode}-settings-dark.png`) });
  console.log(`Saved A35-${mode}-settings-dark.png`);

  // 2. Settings (Light)
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(reportsDir, `A35-${mode}-settings-light.png`) });
  console.log(`Saved A35-${mode}-settings-light.png`);

  // 3. Onboarding (Dark)
  await injectFeatureFlags(page, {
    onboardingV2: true,
    designV2: mode === "nachher",
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("http://localhost:3101/onboarding?restart=true", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(reportsDir, `A35-${mode}-onboarding-dark.png`) });
  console.log(`Saved A35-${mode}-onboarding-dark.png`);

  // 4. Onboarding (Light)
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(reportsDir, `A35-${mode}-onboarding-light.png`) });
  console.log(`Saved A35-${mode}-onboarding-light.png`);

  await ctx.close();
}

main().catch(console.error);
