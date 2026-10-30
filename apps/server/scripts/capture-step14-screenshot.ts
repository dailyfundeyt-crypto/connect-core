import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import postgres from "postgres";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-step14-shot-profile";

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
    } catch {
      // waiting
    }
    await wait(300);
  }
  throw new Error("Could not connect to Chrome CDP page target");
}

async function main() {
  const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  const sql = postgres(`postgres://connect:${pgPass}@127.0.0.1:5544/connect`);

  try {
    const targetAgentId = "agent_a2657859-d47a-428e-95eb-b48f81faf71b";
    console.log(`Setting up sample subagents entries for ${targetAgentId} ...`);

    const sampleSubagents = [
      {
        id: "subagent-manus",
        name: "Manus",
        url: "https://manus.im/app",
        description: "komplexe Browsernutzung",
        enabled: true,
      },
      {
        id: "subagent-perplexity-computer",
        name: "Perplexity Computer",
        url: "https://perplexity.ai/computer",
        description: "Recherche",
        enabled: true,
      },
      {
        id: "subagent-ottermind",
        name: "Ottermind",
        url: "https://ottermind.ai/studio/task",
        description: "Datenauswertung",
        enabled: true,
      },
      {
        id: "subagent-lovable",
        name: "Lovable",
        url: "https://lovable.dev/dashboard",
        description: "Landing Pages",
        enabled: true,
      },
    ];

    await sql.unsafe(
      "UPDATE agents SET subagents = $1::jsonb WHERE id = $2",
      [JSON.stringify(sampleSubagents), targetAgentId],
    );
    console.log("Updated subagents in database for target agent.");

    const sessionCookieVal =
      "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

    // Start Chrome
    console.log("Starting Chrome for screenshots...");
    const chrome = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA}`,
        "--window-size=1440,1050",
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

      // 1. Navigate to Agent Dialog with Subagenten section
      const subagentsUrl = `http://127.0.0.1:3101/agents?agent=${targetAgentId}&section=subagents`;
      console.log(`Navigating to ${subagentsUrl} ...`);
      await send("Page.navigate", { url: subagentsUrl });
      await wait(4500);

      const shot1 = await send("Page.captureScreenshot", { format: "png" });
      const path1 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step14-subagents-table.png";
      writeFileSync(path1, Buffer.from(shot1.data, "base64"));
      console.log(`Captured ${path1}`);

      // 2. Click "Subagent hinzufügen" to show the inline form
      console.log("Clicking 'Subagent hinzufügen' button...");
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const addBtn = buttons.find((b) => b.textContent && b.textContent.includes("Subagent hinzufügen"));
            if (addBtn) {
              addBtn.click();
              return true;
            }
            return false;
          })()
        `,
      });
      await wait(1200);

      const shot2 = await send("Page.captureScreenshot", { format: "png" });
      const path2 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step14-subagents-add-form.png";
      writeFileSync(path2, Buffer.from(shot2.data, "base64"));
      console.log(`Captured ${path2}`);

      // 3. Navigate to Agent Overview Profile Card (settings drawer)
      const overviewUrl = `http://127.0.0.1:3101/agent/${targetAgentId}?settings=true`;
      console.log(`Navigating to ${overviewUrl} (Overview Profile Drawer)...`);
      await send("Page.navigate", { url: overviewUrl });
      await wait(4500);

      // Scroll to AgentSubagentsCard
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const h2 = Array.from(document.querySelectorAll("h2")).find(h => h.textContent && h.textContent.includes("Subagenten"));
            if (h2) {
              h2.scrollIntoView({ behavior: "instant", block: "center" });
              return true;
            }
            return false;
          })()
        `,
      });
      await wait(1500);

      const shot3 = await send("Page.captureScreenshot", { format: "png" });
      const path3 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step14-subagents-card.png";
      writeFileSync(path3, Buffer.from(shot3.data, "base64"));
      console.log(`Captured ${path3}`);

      ws.close();
      console.log("All Step 14 screenshots captured successfully!");
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
