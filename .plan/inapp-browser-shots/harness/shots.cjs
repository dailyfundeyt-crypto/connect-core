const { chromium } = require(process.env.PW_CORE);
const out = process.argv[2];
const base = process.argv[3]; // Tunnel-Nachbau (nicht localhost)
const baseVercel = process.argv[4];
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
  await page.waitForTimeout(1000);
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP connect-tunnel.test 127.0.0.1,MAP connect-vercel.test 127.0.0.1"] });
  const ctx = await ctxFor(browser);
  const page = await ctx.newPage();
  await boot(page, `${base}/?mobile=1`);
  await page.screenshot({ path: `${out}/01-unternehmen-390.png` });
  log("scrollWidth", await page.evaluate(() => document.documentElement.scrollWidth));
  await page.locator('section[aria-label="Unternehmen"] button:has-text("Spark")').first().click();
  await page.waitForSelector('[data-testid="mobile-company-apps"]');
  await page.waitForTimeout(2500); // Hintergrund-Prüfung der Links
  await page.screenshot({ path: `${out}/02-firma-spark-apps-390.png` });
  const cache = await page.evaluate(() => localStorage.getItem("connect.mobile.embedCheck.v1"));
  log("embed-cache", cache);

  // 1) einbettbar
  await page.locator('[data-testid="mobile-app-link"]:has-text("Example Domain")').click();
  await page.waitForSelector('[data-testid="mobile-app-frame"]', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/03-vollbild-einbettbar-example-390.png` });
  const fx = page.frameLocator('[data-testid="mobile-app-frame"]');
  log("example frame h1:", await fx.locator("h1").innerText().catch((e) => "FEHLER " + e.message.slice(0, 80)));
  log("frame box", JSON.stringify(await page.locator('[data-testid="mobile-app-frame"]').boundingBox()));
  await page.locator('[data-testid="mobile-app-browser"] button[aria-label="Zurück"]').click();
  await page.waitForTimeout(500);

  // 2) nicht einbettbar: Liste -> direkt extern (Popup)
  const popupP = page.waitForEvent("popup", { timeout: 6000 }).catch(() => null);
  await page.locator('[data-testid="mobile-app-link"]:has-text("GitHub")').click();
  const popup = await popupP;
  log("GitHub-Tipp: extern geoeffnet =", popup ? popup.url() : "NEIN", "| Overlay offen:", await page.locator('[data-testid="mobile-app-browser"]').count());
  if (popup) { await popup.waitForTimeout(1500); await popup.close().catch(() => {}); }
  await page.screenshot({ path: `${out}/04-github-extern-geoeffnet-390.png` });
  // 2b) noch nicht geprüfte gesperrte Adresse über die Link-Eingabe -> Hinweis statt leerem Frame
  await page.fill('input[aria-label="Adresse öffnen"]', "github.com/features");
  await page.keyboard.press("Enter");
  await page.waitForSelector('text=Öffnet im Browser', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/05-nicht-einbettbar-hinweis-390.png` });
  await page.locator('[data-testid="mobile-app-browser"] button[aria-label="Zurück"]').click();

  // 3) localhost über den Proxy
  await page.locator('[data-testid="mobile-app-link"]:has-text("Spark Dashboard")').click();
  await page.waitForSelector('[data-testid="mobile-app-frame"]', { timeout: 15000 });
  await page.waitForTimeout(3500);
  const src = await page.locator('[data-testid="mobile-app-frame"]').getAttribute("src");
  const lf = page.frameLocator('[data-testid="mobile-app-frame"]');
  const vals = {};
  for (const id of ["js", "imp", "api", "loc"]) vals[id] = await lf.locator("#" + id).innerText().catch(() => "?");
  log("localhost frame src", src, JSON.stringify(vals));
  await page.screenshot({ path: `${out}/06-localhost-ueber-proxy-390.png` });
  // Adresse bearbeiten (freie URL wie am PC)
  await page.locator('button[aria-label="Adresse bearbeiten"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/07-adresse-bearbeiten-390.png` });
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="mobile-app-browser"] button[aria-label="Zurück"]').click().catch(() => {});
  await page.waitForTimeout(400);
  // Link anlegen
  await page.locator('button:has-text("App-Link hinzufügen")').click();
  await page.fill('input[aria-label="Name"]', "Vite Dev");
  await page.fill('input[aria-label="URL"]', "localhost:5173");
  await page.screenshot({ path: `${out}/08-app-link-anlegen-390.png` });
  await page.locator('button:has-text("Speichern")').click();
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("connect.level3.browser") || "{}").spark?.customApps?.map((a) => a.label + "=" + a.url));
  log("gespeicherte Links spark:", JSON.stringify(stored));
  await page.screenshot({ path: `${out}/09-app-link-gespeichert-390.png` });
  await ctx.close();

  // 4) Vercel (kein Proxy): Hinweis
  const ctx2 = await ctxFor(browser);
  const p2 = await ctx2.newPage();
  await boot(p2, `${baseVercel}/?mobile=1`);
  await p2.locator('section[aria-label="Unternehmen"] button:has-text("Spark")').first().click();
  await p2.waitForSelector('[data-testid="mobile-company-apps"]');
  await p2.locator('[data-testid="mobile-app-link"]:has-text("Spark Dashboard")').click();
  await p2.waitForSelector("text=Läuft auf deinem PC", { timeout: 15000 });
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${out}/10-vercel-localhost-hinweis-390.png` });
  log("vercel hint ok");
  await ctx2.close();

  // 5) Browser-Bereich: Plus -> Link speichern -> Antippen -> Vollbild
  const ctx3 = await ctxFor(browser, "browser");
  const p3 = await ctx3.newPage();
  await boot(p3, `${base}/?mobile=1`);
  await p3.evaluate(() => { const s = JSON.parse(localStorage.getItem("connect.level3.browser") || "{}"); if (s.spark) { s.spark.customApps = []; localStorage.setItem("connect.level3.browser", JSON.stringify(s)); window.dispatchEvent(new Event("connect-level3-browser-changed")); } });
  await p3.waitForTimeout(800);
  await p3.screenshot({ path: `${out}/11-browser-leer-mit-plus-390.png` });
  await p3.locator('button[aria-label="Link speichern"]').click();
  await p3.waitForSelector('[data-testid="mobile-add-link"]');
  await p3.fill('[data-testid="mobile-add-link"] input[aria-label="URL"]', "example.com");
  await p3.fill('[data-testid="mobile-add-link"] input[aria-label="Name"]', "Beispiel");
  await p3.waitForTimeout(600);
  await p3.screenshot({ path: `${out}/12-browser-plus-link-speichern-390.png` });
  await p3.locator('[data-testid="mobile-add-link"] button:has-text("Speichern")').click();
  await p3.waitForTimeout(1200);
  await p3.screenshot({ path: `${out}/13-browser-link-gespeichert-390.png` });
  const pop3 = p3.waitForEvent("popup", { timeout: 6000 }).catch(() => null);
  await p3.locator('section[aria-label="Browser"] button:has-text("Beispiel")').click();
  const pp3 = await pop3;
  log("Browser-Bereich: Standardbrowser =", pp3 ? pp3.url() : "NEIN", "| In-App offen:", await p3.locator('[data-testid="mobile-app-browser"]').count());
  if (pp3) await pp3.close().catch(() => {});
  await ctx3.close();

  // 6) Firmenprofil mobil (dunkel) + Link-Menue
  const ctx4 = await ctxFor(browser, "companies");
  const p4 = await ctx4.newPage();
  await boot(p4, `${base}/?mobile=1`);
  await p4.goto(`${base}/company/spark?profile=true&mobile=1`, { waitUntil: "domcontentloaded" });
  await p4.waitForSelector('[data-testid="mobile-company-profile"]', { timeout: 15000 });
  await p4.waitForTimeout(2500);
  await p4.screenshot({ path: `${out}/15-firmenprofil-mobil-390.png` });
  await p4.screenshot({ path: `${out}/15b-firmenprofil-mobil-ganz-390.png`, fullPage: true });
  log("profil scrollWidth", await p4.evaluate(() => document.documentElement.scrollWidth));
  await p4.locator('button[aria-label="Mehr zu Spark Dashboard"]').click();
  await p4.waitForSelector('[data-testid="mobile-link-menu"]');
  await p4.waitForTimeout(400);
  await p4.screenshot({ path: `${out}/16-link-menue-390.png` });
  await p4.locator('[data-testid="mobile-link-menu"] button:has-text("In Connect öffnen")').click();
  await p4.waitForSelector('[data-testid="mobile-app-frame"]', { timeout: 15000 });
  await p4.waitForTimeout(2500);
  await p4.screenshot({ path: `${out}/17-profil-localhost-inapp-390.png` });
  await ctx4.close();

  // 7) PC: Markier-Vorschau mit nicht einbettbarer Seite (app.notion.com)
  const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "de-DE" });
  await ctx5.addInitScript(`try{if(!sessionStorage.getItem("i")){sessionStorage.setItem("i","1");localStorage.setItem("connect.activeLevel","4");localStorage.setItem("connect.lab.prefs",JSON.stringify({keepLoggedIn:true}));}}catch(e){}`);
  const p5 = await ctx5.newPage();
  await boot(p5, `${base}/company/spark?level=4&mobile=0`);
  await p5.waitForSelector("text=Diese Seite lässt sich nicht einbetten", { timeout: 20000 }).catch(() => log("PC-Karte NICHT gefunden"));
  await p5.waitForTimeout(1200);
  await p5.screenshot({ path: `${out}/18-pc-markier-vorschau-nicht-einbettbar-1440.png` });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
