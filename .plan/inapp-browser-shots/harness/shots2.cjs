const { chromium } = require(process.env.PW_CORE);
const out = process.argv[2]; const base = process.argv[3];
const log = (...a) => console.log(...a);
async function ctxFor(browser, startPage = "companies") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  await ctx.addInitScript(`try{if(!sessionStorage.getItem("shot-init")){sessionStorage.setItem("shot-init","1");localStorage.setItem("connect.mobile.page",${JSON.stringify(startPage)});localStorage.setItem("connect.locale","de");}}catch(e){}`);
  return ctx;
}
async function boot(page, url) {
  page.on("pageerror", (e) => log("pageerror", e.message.slice(0, 160)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const de = page.locator("text=Weiter auf Deutsch");
  if (await de.count()) { await de.first().click(); await page.waitForTimeout(2000); }
}
const company = (p, name) => p.locator(`section[aria-label="Unternehmen"] button:has-text("${name}")`).first();
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP connect-tunnel.test 127.0.0.1"] });
  const ctx = await ctxFor(browser); const p = await ctx.newPage();
  await boot(p, `${base}/?mobile=1`);
  // Spark: Standard-App = localhost:5199 -> Proxy
  await company(p, "Spark").click();
  await p.waitForSelector('[data-testid="mobile-app-frame"]', { timeout: 15000 });
  await p.waitForTimeout(3000);
  log("Spark src", await p.locator('[data-testid="mobile-app-frame"]').getAttribute("src"), "js:", await p.frameLocator('[data-testid="mobile-app-frame"]').locator("#js").innerText().catch(() => "?"));
  await p.screenshot({ path: `${out}/19-firma-spark-standard-app-localhost-390.png` });
  await p.locator('[data-testid="app-browser-company"]').click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/20-firmen-knopf-link-liste-390.png` });
  await p.locator('[data-testid="mobile-company-apps"] button[aria-label="Zurück"]').click();
  // Flux: Standard-App gesperrt (Notion) -> Chrome
  const pop = p.waitForEvent("popup", { timeout: 15000 }).catch(() => null);
  await company(p, "Flux").click();
  const pp = await pop;
  log("Flux: extern =", pp ? pp.url() : "NEIN");
  await p.waitForSelector("text=Öffnet im Browser", { timeout: 15000 }).catch(() => log("keine Karte"));
  await p.bringToFront(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/21-firma-flux-standard-nicht-einbettbar-390.png` });
  if (pp) await pp.close().catch(() => {});
  await p.locator('[data-testid="mobile-app-browser"] button[aria-label="Zurück"]').click();
  // Hyper: kein Standard -> Link-Liste wie bisher
  await company(p, "Hyper").click();
  await p.waitForTimeout(800);
  log("Hyper overlay:", await p.locator('[data-testid="mobile-app-browser"]').count(), "liste:", await p.locator('[data-testid="mobile-company-apps"]').count());
  await p.screenshot({ path: `${out}/22-firma-hyper-ohne-standard-390.png` });
  // Firmenprofil-Route: Connect (example.com)
  await p.goto(`${base}/company/connect?profile=true&mobile=1`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="mobile-app-frame"]', { timeout: 15000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/23-firmenprofil-connect-startet-standard-app-390.png` });
  await p.locator('[data-testid="app-browser-company"]').click();
  await p.waitForSelector('[data-testid="mobile-company-profile"]');
  await p.waitForTimeout(800);
  log("Apps-Tab:", await p.locator("text=App-Link hinzufügen").count(), await p.locator("button:has-text(\"Apps\")").count());
  await p.screenshot({ path: `${out}/24-firmenprofil-dahinter-mit-standard-knopf-390.png` });
  log("scrollWidth", await p.evaluate(() => document.documentElement.scrollWidth));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
