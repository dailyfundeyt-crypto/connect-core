import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-skills-shot-profile";

if (!existsSync(USER_DATA)) mkdirSync(USER_DATA, { recursive: true });

// Start Chrome
const chrome = spawn(CHROME_PATH, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${USER_DATA}`,
  "--window-size=1400,960",
  "--disable-gpu",
  "--no-sandbox",
  "about:blank",
], { stdio: "ignore" });

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPageWsUrl(): Promise<string> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const pages = await res.json() as any[];
        const target = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
        if (target) {
          return target.webSocketDebuggerUrl;
        }
      }
    } catch {
      // waiting
    }
    await wait(300);
  }
  throw new Error("Could not connect to Chrome CDP page target");
}

async function main() {
  try {
    const wsUrl = await getPageWsUrl();
    console.log(`Connecting to CDP target: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let id = 1;
    const send = (method: string, params: any = {}) => {
      const curId = id++;
      return new Promise<any>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.id === curId) {
            ws.removeEventListener("message", handler);
            if (data.error) reject(new Error(JSON.stringify(data.error)));
            else resolve(data.result);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    };

    await send("Page.enable");
    await send("Network.enable");

    const sessionCookieVal = "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

    for (const domain of ["127.0.0.1", "localhost"]) {
      await send("Network.setCookie", {
        name: "better-auth.session_token",
        value: sessionCookieVal,
        domain,
        path: "/",
        httpOnly: true,
        secure: false,
      });
    }

    // 1. Navigate to agents page
    console.log("Navigating to http://127.0.0.1:3101/agents ...");
    await send("Page.navigate", { url: "http://127.0.0.1:3101/agents" });
    await wait(4000);

    const shot1 = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step10-agents-overview.png", Buffer.from(shot1.data, "base64"));
    console.log("Captured screenshot-step10-agents-overview.png");

    // 2. Open agent dialog directly with section=skills
    const agentId = "agent_a2657859-d47a-428e-95eb-b48f81faf71b";
    console.log(`Navigating to http://127.0.0.1:3101/agents?agent=${agentId}&section=skills ...`);
    await send("Page.navigate", { url: `http://127.0.0.1:3101/agents?agent=${agentId}&section=skills` });
    await wait(4000);

    const shot2 = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step10-skills-dialog.png", Buffer.from(shot2.data, "base64"));
    console.log("Captured screenshot-step10-skills-dialog.png");

    // Click "+ Skill hinzufügen"
    console.log("Clicking '+ Skill hinzufügen' ...");
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const addBtn = buttons.find((b) => b.textContent && b.textContent.includes("Skill hinzufügen"));
          if (addBtn) addBtn.click();
        })()
      `,
    });
    await wait(800);

    const shotAdd = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step10-skills-add-form.png", Buffer.from(shotAdd.data, "base64"));
    console.log("Captured screenshot-step10-skills-add-form.png");

    // 3. Open agent dialog with section=general (showing skills in general tab)
    console.log(`Navigating to http://127.0.0.1:3101/agents?agent=${agentId}&section=general ...`);
    await send("Page.navigate", { url: `http://127.0.0.1:3101/agents?agent=${agentId}&section=general` });
    await wait(4000);

    // Scroll down inside dialog body to show Skills section
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          const dialogScroll = document.querySelector(".overflow-y-auto");
          if (dialogScroll) dialogScroll.scrollTop = 500;
        })()
      `,
    });
    await wait(600);

    const shot3 = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step10-skills-general.png", Buffer.from(shot3.data, "base64"));
    console.log("Captured screenshot-step10-skills-general.png");

    ws.close();
    console.log("All screenshots captured successfully!");
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  chrome.kill();
  process.exit(1);
});
