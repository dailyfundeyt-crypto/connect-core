const { chromium } = require(process.env.PW_CORE);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", e => console.log("ERR", e.message.slice(0,300)));
p.on("response", r => { if (r.status() >= 400) console.log(r.status(), r.url().slice(0,120)); });
await p.goto("http://127.0.0.1:3199/brain"); await p.waitForTimeout(15000); console.log("URL", p.url());
console.log((await p.innerText("body")).slice(0, 600)); await p.screenshot({ path: process.argv[2] }); await b.close(); })();
