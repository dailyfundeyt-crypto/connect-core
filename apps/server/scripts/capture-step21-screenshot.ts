import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import postgres from "postgres";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9226;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-step21-shot-profile";

if (!existsSync(USER_DATA)) mkdirSync(USER_DATA, { recursive: true });

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPageWsUrl(): Promise<string> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const pages = (await res.json()) as any[];
        const target = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
        if (target) {
          return target.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await wait(300);
  }
  throw new Error("Could not connect to Chrome CDP page target");
}

async function main() {
  const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  const sql = postgres(`postgres://connect:${pgPass}@127.0.0.1:5544/connect`);

  try {
    const agents = await sql`SELECT id, name FROM agents ORDER BY created_at DESC LIMIT 5`;
    const targetAgentId = agents[0]?.id;
    console.log(`Using target agent for Step 21 screenshots: ${agents[0]?.name} (${targetAgentId})`);

    const sessionCookieVal =
      "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

    // Start Chrome headless
    console.log("Starting Chrome for Step 21 screenshots...");
    const chrome = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA}`,
        "--window-size=1560,1100",
        "--disable-gpu",
        "--no-sandbox",
        "about:blank",
      ],
      { stdio: "ignore" }
    );

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

      // Initial navigation to set localStorage
      await send("Page.navigate", { url: "http://127.0.0.1:3101/" });
      await wait(1500);

      await send("Runtime.evaluate", {
        expression: `
          (() => {
            localStorage.setItem('connect.activeLevel', '2');
            localStorage.setItem('connect-active-level', '2');
          })()
        `,
      });

      // 1. Screenshot 1: /swarm Vollbild-Route (Swarm-Dashboard mit Gesamtfortschritt und 20 Kacheln)
      const swarmUrl = "http://127.0.0.1:3101/swarm";
      console.log(`Navigating to ${swarmUrl} ...`);
      await send("Page.navigate", { url: swarmUrl });
      await wait(4500);

      const shot1 = await send("Page.captureScreenshot", { format: "png" });
      const path1 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step21-swarm-fullpage.png";
      writeFileSync(path1, Buffer.from(shot1.data, "base64"));
      console.log(`Captured ${path1}`);

      // 2. Screenshot 2: Raster mit 20 Kacheln herangescrollt
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const h4 = Array.from(document.querySelectorAll('h4')).find(h => h.textContent && h.textContent.includes('Swarm-Raster'));
            if (h4) {
              h4.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
          })()
        `,
      });
      await wait(1200);

      const shot2 = await send("Page.captureScreenshot", { format: "png" });
      const path2 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step21-swarm-dashboard-grid.png";
      writeFileSync(path2, Buffer.from(shot2.data, "base64"));
      console.log(`Captured ${path2}`);

      // 3. Screenshot 3: Swarm Panel in Agent-Dialog Browser Section (/agents?agent=...&section=browser)
      const agentBrowserUrl = `http://127.0.0.1:3101/agents?agent=${targetAgentId}&section=browser`;
      console.log(`Navigating to ${agentBrowserUrl} ...`);
      await send("Page.navigate", { url: agentBrowserUrl });
      await wait(4500);

      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const dashboard = document.querySelector('[data-testid="swarm-dashboard"]');
            if (dashboard) {
              dashboard.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
          })()
        `,
      });
      await wait(1200);

      const shot3 = await send("Page.captureScreenshot", { format: "png" });
      const path3 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step21-swarm-agent-browser.png";
      writeFileSync(path3, Buffer.from(shot3.data, "base64"));
      console.log(`Captured ${path3}`);

      // 4. Screenshot 4: REST API /api/connect-mcp/swarm/status
      const statusApiUrl = "http://127.0.0.1:3101/api/connect-mcp/swarm/status";
      console.log(`Navigating to ${statusApiUrl} ...`);
      await send("Page.navigate", { url: statusApiUrl });
      await wait(2500);

      const shot4 = await send("Page.captureScreenshot", { format: "png" });
      const path4 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step21-swarm-status-api.png";
      writeFileSync(path4, Buffer.from(shot4.data, "base64"));
      console.log(`Captured ${path4}`);

      ws.close();
      console.log("All Step 21 screenshots captured successfully!");
    } finally {
      chrome.kill();
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Error capturing Step 21 screenshots:", err);
  process.exit(1);
});
