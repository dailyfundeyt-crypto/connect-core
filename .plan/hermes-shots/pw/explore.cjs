const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://localhost:3101/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6000);
  const de = p.locator("text=Weiter auf Deutsch"); if (await de.count()) { await de.first().click(); await p.waitForTimeout(1500); }
  await p.screenshot({ path: "../01-start.png" });
  console.log(p.url());
  console.log((await p.locator("body").innerText()).slice(0, 2500));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

