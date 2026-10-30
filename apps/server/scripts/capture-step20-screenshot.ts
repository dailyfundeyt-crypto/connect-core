import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import postgres from "postgres";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9225;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-step20-shot-profile-v2";

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
    console.log(`Using target agent for Step 20 screenshots: ${agents[0]?.name} (${targetAgentId})`);

    const sessionCookieVal =
      "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

    // Browser für den Agenten aktivieren
    try {
      await fetch(`http://127.0.0.1:3101/api/agent-hub/agents/${targetAgentId}/browser`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${sessionCookieVal}`,
        },
        body: JSON.stringify({ enabled: true, headless: false }),
      });
    } catch (e) {
      console.warn("Could not activate browser:", e);
    }

    // Start Chrome headless
    console.log("Starting Chrome for Step 20 screenshots...");
    const chrome = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA}`,
        "--window-size=1440,950",
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

      // Force level = 2 (Messages / HQ Shell / Agents view) in localStorage
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            localStorage.setItem('connect.activeLevel', '2');
            localStorage.setItem('connect-active-level', '2');
          })()
        `,
      });

      // 1. Screenshot 1: /agents Übersicht
      const listUrl = "http://127.0.0.1:3101/agents";
      console.log(`Navigating to ${listUrl} ...`);
      await send("Page.navigate", { url: listUrl });
      await wait(4500);

      const shot1 = await send("Page.captureScreenshot", { format: "png" });
      const path1 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step20-agents-list.png";
      writeFileSync(path1, Buffer.from(shot1.data, "base64"));
      console.log(`Captured ${path1}`);

      // 2. Screenshot 2: Agent Dialog Browser Section mit dem Swarm-Controller
      const agentsUrl = `http://127.0.0.1:3101/agents?agent=${targetAgentId}&section=browser`;
      console.log(`Navigating to ${agentsUrl} ...`);
      await send("Page.navigate", { url: agentsUrl });
      await wait(5000);

      // Scroll into the Swarm-Controller panel
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const h3s = Array.from(document.querySelectorAll('h3'));
            const swarmH3 = h3s.find(h => h.textContent && h.textContent.includes('Swarm'));
            if (swarmH3) {
              swarmH3.scrollIntoView({ behavior: 'instant', block: 'center' });
            } else {
              window.scrollTo(0, document.body.scrollHeight);
            }
          })()
        `,
      });
      await wait(1200);

      const shot2 = await send("Page.captureScreenshot", { format: "png" });
      const path2 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step20-swarm-controller.png";
      writeFileSync(path2, Buffer.from(shot2.data, "base64"));
      console.log(`Captured ${path2}`);

      // 3. Screenshot 3: /api/connect-mcp/swarm/status
      const statusUrl = "http://127.0.0.1:3101/api/connect-mcp/swarm/status";
      console.log(`Navigating to ${statusUrl} ...`);
      await send("Page.navigate", { url: statusUrl });
      await wait(2500);

      const shot3 = await send("Page.captureScreenshot", { format: "png" });
      const path3 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step20-swarm-status.png";
      writeFileSync(path3, Buffer.from(shot3.data, "base64"));
      console.log(`Captured ${path3}`);

      // 4. Screenshot 4: /api/connect-mcp/manifest
      const manifestUrl = "http://127.0.0.1:3101/api/connect-mcp/manifest";
      console.log(`Navigating to ${manifestUrl} ...`);
      await send("Page.navigate", { url: manifestUrl });
      await wait(2500);

      const shot4 = await send("Page.captureScreenshot", { format: "png" });
      const path4 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step20-mcp-manifest.png";
      writeFileSync(path4, Buffer.from(shot4.data, "base64"));
      console.log(`Captured ${path4}`);

      ws.close();
      console.log("All Step 20 screenshots captured successfully!");
    } finally {
      chrome.kill();
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Error capturing Step 20 screenshots:", err);
  process.exit(1);
});
