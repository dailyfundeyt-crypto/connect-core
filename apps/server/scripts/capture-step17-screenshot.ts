import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import postgres from "postgres";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-step17-shot-profile";

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
    const agents = await sql`SELECT id, name FROM agents ORDER BY created_at DESC LIMIT 1`;
    const targetAgentId = agents[0]?.id || "agent_test_step13_1792535584495";
    console.log(`Using target agent: ${agents[0]?.name} (${targetAgentId})`);

    const sessionCookieVal =
      "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

    // Start Chrome headless
    console.log("Starting Chrome for screenshots...");
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

      // 1. Screenshot 1: Chat-Interface mit dem neuen Toggle Chat ↔ CLI im Header
      const chatUrl = `http://127.0.0.1:3101/agent/${targetAgentId}`;
      console.log(`Navigating to ${chatUrl} ...`);
      await send("Page.navigate", { url: chatUrl });
      await wait(4500);

      const shot1 = await send("Page.captureScreenshot", { format: "png" });
      const path1 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step17-chat-toggle.png";
      writeFileSync(path1, Buffer.from(shot1.data, "base64"));
      console.log(`Captured ${path1}`);

      // 2. Screenshot 2: Klick auf "CLI" Toggle -> Umschalten auf echtes Terminal (xterm.js)
      console.log("Clicking 'CLI' toggle button...");
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const cliBtn = document.querySelector('[data-testid="toggle-cli-view"]');
            if (cliBtn) {
              cliBtn.click();
              return true;
            }
            return false;
          })()
        `,
      });
      await wait(3500);

      const shot2 = await send("Page.captureScreenshot", { format: "png" });
      const path2 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step17-cli-terminal.png";
      writeFileSync(path2, Buffer.from(shot2.data, "base64"));
      console.log(`Captured ${path2}`);

      // 3. Screenshot 3: CLI Terminal mit Eingabe / Interaktion
      console.log("Sending keyboard input into terminal...");
      // Focus terminal container and click inside
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const container = document.querySelector('[data-testid="agent-cli-terminal-container"]');
            if (container) {
              container.click();
              const textarea = container.querySelector('textarea');
              if (textarea) textarea.focus();
              return true;
            }
            return false;
          })()
        `,
      });
      await wait(1000);

      // Sende etwas Text ueber WebSocket / Terminal
      await fetch(`http://127.0.0.1:3101/api/agent-hub/terminal/${encodeURIComponent(targetAgentId)}/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `better-auth.session_token=${sessionCookieVal}`,
        },
        body: JSON.stringify({ input: "echo 'CLI Interaktiv Test Schritt 17'", raw: false }),
      });
      await wait(2000);

      const shot3 = await send("Page.captureScreenshot", { format: "png" });
      const path3 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step17-cli-active.png";
      writeFileSync(path3, Buffer.from(shot3.data, "base64"));
      console.log(`Captured ${path3}`);

      ws.close();
      console.log("All Step 17 screenshots captured successfully!");
    } finally {
      chrome.kill();
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
