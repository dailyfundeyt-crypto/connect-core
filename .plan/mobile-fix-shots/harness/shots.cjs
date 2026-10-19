// helium-mobilefix Playwright: 390px (Android) + 1280px (PC). node shots.cjs <outDir> <tunnelBase> <vercelBase>
const { chromium } = require(process.env.PW_CORE);
const out = process.argv[2], base = process.argv[3], baseVercel = process.argv[4];
const results = [];
const log = (...a) => { console.log(...a); };
const check = (name, ok, extra = "") => { results.push(`${ok ? "OK  " : "FAIL"} ${name}${extra ? " – " + extra : ""}`); log(ok ? "OK  " : "FAIL", name, extra); };
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
async function phone(browser, startPage) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE", userAgent: ANDROID_UA });
  await ctx.addInitScript(`try{if(!sessionStorage.getItem("shot-init")){sessionStorage.setItem("shot-init","1");localStorage.setItem("connect.mobile.page",${JSON.stringify(startPage)});localStorage.setItem("connect.locale","de");localStorage.removeItem("connect.mobileShell");}}catch(e){}`);
  return ctx;
}
async function boot(page, url) {
  page.on("pageerror", (e) => log("pageerror", e.message.slice(0, 200)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const de = page.locator("text=Weiter auf Deutsch");
  if (await de.count()) { await de.first().click(); await page.waitForTimeout(1500); }
}
const desktopSidebarVisible = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-slot="sidebar"], [data-sidebar="sidebar"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP connect-tunnel.test 127.0.0.1,MAP connect-vercel.test 127.0.0.1"] });
  // 1) Browser-Bereich (Tunnel-Host, kein localhost)
  let ctx = await phone(browser, "browser");
  let p = await ctx.newPage();
  await boot(p, `${base}/`);
  await p.waitForSelector('[data-testid="mobile-brain-notes"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/01-handy-browser-gruppen-390.png` });
  await p.screenshot({ path: `${out}/01b-handy-browser-ganz-390.png`, fullPage: true });
  const browserText = await p.locator('section[aria-label="Browser"]').innerText();
  for (const g of ["Planung", "YouTube", "Stefan Kunc YouTube Kanal", "Bücher", "Studium", "Musik", "Gesundheit"]) check(`Gruppe sichtbar: ${g}`, browserText.includes(g));
  check("Brain-Notizen-Bereich sichtbar", browserText.includes("Brain-Notizen"));
  const folders = await p.locator('[data-testid="mobile-brain-folder"]').count();
  check("Brain-Ordner gelistet", folders > 0, `${folders} Ordner`);
  check("keine PC-Seitenleiste (Browser)", !(await desktopSidebarVisible(p)));
  await p.locator('[data-testid="mobile-brain-folder"]').first().click();
  await p.waitForSelector('[data-testid="mobile-brain-folder-sheet"]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/02-handy-brain-ordner-390.png` });
  // in Unterordner gehen, bis eine Datei da ist
  for (let i = 0; i < 4 && (await p.locator('[data-testid="mobile-brain-folder-sheet"] [data-testid="mobile-brain-file"]').count()) === 0; i++) {
    await p.locator('[data-testid="mobile-brain-folder-sheet"] [data-testid="mobile-brain-folder"]').first().click();
    await p.waitForTimeout(300);
  }
  await p.locator('[data-testid="mobile-brain-folder-sheet"] [data-testid="mobile-brain-file"]').first().click();
  await p.waitForSelector('[data-testid="mobile-markdown-view"] .brain-reader', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/03-handy-markdown-ansicht-390.png` });
  check("Markdown-Ansicht geöffnet", (await p.locator('[data-testid="mobile-markdown-view"] .brain-reader h1').count()) > 0);
  check("'Im Brain zeigen' vorhanden", (await p.locator('[data-testid="mobile-markdown-show-in-brain"]').count()) === 1);
  check("Breite passt (kein Querscrollen)", (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await ctx.close();

  // 2) Firmenmenü -> Neue Firma / Firmenprofil / Firmen verwalten / Einstellungen
  ctx = await phone(browser, "chats");
  p = await ctx.newPage();
  await boot(p, `${base}/`);
  await p.locator('button[aria-label="Profil und Unternehmen wechseln"]').first().click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/04-handy-firmenmenue-390.png` });
  await p.locator("button:has-text('Neue Firma')").first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/05-handy-neue-firma-390.png` });
  check("Neue Firma: mobiler Rahmen", (await p.locator('[data-testid="mobile-page-frame"]').count()) === 1, p.url());
  check("Neue Firma: keine PC-Seitenleiste", !(await desktopSidebarVisible(p)));
  check("Neue Firma: kein 'Websearch'/'GRUPPEN'", !/Websearch|GRUPPEN/.test(await p.locator("body").innerText()));
  await p.locator('[data-testid="mobile-page-back"]').click();
  await p.waitForTimeout(1500);
  check("Zurück führt zur Handy-Startseite", new URL(p.url()).pathname === "/");
  const pages = [
    ["06-handy-firmenprofil-390.png", "/company/spark?profile=true"],
    ["07-handy-firmen-verwalten-390.png", "/settings#companies"],
    ["08-handy-einstellungen-390.png", "/settings"],
    ["09-handy-browser-gruppen-einstellung-390.png", "/settings#browser-groups"],
    ["10-handy-settings-brain-390.png", "/settings/brain"],
    ["11-handy-brain-seite-390.png", "/brain"],
    ["12-handy-agenten-390.png", "/agents"],
    ["13-handy-firma-level3-390.png", "/company/spark?level=3"],
  ];
  for (const [file, url] of pages) {
    await p.goto(`${base}${url}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${file}` });
    const sb = await desktopSidebarVisible(p);
    const txt = await p.locator("body").innerText().catch(() => "");
    check(`${url}: keine PC-Seitenleiste`, !sb && !/Websearch \(lokal\)/.test(txt));
    if (url === "/settings/brain") check("/settings/brain: kein 'online'-Hinweis über Tunnel", !txt.includes("Öffne Connect über deinen PC"));
  }
  await ctx.close();

  // 3) Android: Link im Browser-Bereich -> Chrome-Intent
  ctx = await phone(browser, "browser");
  p = await ctx.newPage();
  const intents = [];
  p.on("request", (r) => { if (r.url().startsWith("intent:")) intents.push(r.url()); });
  p.on("framenavigated", (f) => { if (f.url().startsWith("intent:")) intents.push(f.url()); });
  await boot(p, `${base}/`);
  const popups = [];
  p.on("popup", (pp) => popups.push(pp.url()));
  const row = p.locator('section[aria-label="Browser"] ul li button').first();
  const rowText = (await row.innerText().catch(() => "")).split("\n")[0];
  await row.click().catch((e) => log("row click", e.message));
  await p.waitForTimeout(1500);
  check("Android: Link öffnet per Chrome-Intent (kein Popup/In-App)", intents.length > 0 && popups.length === 0, `${rowText} -> ${intents[0] ?? "kein Intent"}`);
  await ctx.close();

  // 4) Vercel-Vorschau (keine Brain-API): sauberer Hinweis
  ctx = await phone(browser, "browser");
  p = await ctx.newPage();
  await boot(p, `${baseVercel}/`);
  await p.waitForTimeout(1500);
  await p.locator('[data-testid="mobile-brain-notes"]').scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${out}/14-vercel-browser-brain-hinweis-390.png` });
  check("Vercel: Brain-Hinweis statt leer", (await p.locator('[data-testid="mobile-brain-unavailable"]').count()) === 1);
  await ctx.close();

  // 5) PC 1280: unverändert mit Seitenleiste
  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-DE" });
  await pc.addInitScript(`try{if(!sessionStorage.getItem("i")){sessionStorage.setItem("i","1");localStorage.setItem("connect.locale","de");}}catch(e){}`);
  const d = await pc.newPage();
  for (const [file, url, lvl] of [["20-pc-start-1280.png", "/", "2"], ["21-pc-browser-bereich-1280.png", "/company/spark?level=3", "3"], ["22-pc-neue-firma-1280.png", "/company/new", "3"], ["23-pc-einstellungen-1280.png", "/settings", null]]) {
    if (lvl) await d.evaluate((l) => localStorage.setItem("connect.activeLevel", l), lvl).catch(() => {});
    await boot(d, `${base}${url}`);
    await d.screenshot({ path: `${out}/${file}` });
    check(`PC ${url}: Seitenleiste da, kein Handy-Rahmen`, (await desktopSidebarVisible(d)) && (await d.locator('[data-testid="mobile-page-frame"]').count()) === 0);
  }
  await pc.close();
  await browser.close();
  require("fs").writeFileSync(`${out}/ergebnis.txt`, results.join("\n") + "\n");
})().catch((e) => { console.error(e); require("fs").writeFileSync(`${out}/ergebnis.txt`, results.join("\n") + "\nABBRUCH: " + e.message + "\n"); process.exit(1); });
