import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import postgres from "postgres";
import { brainRootFor, resolveBrainRoot, saveAgentScopes } from "../src/brain/store";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-spark-shot-profile";

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
    console.log(`Setting up sample Spark scopes for ${targetAgentId} ...`);

    // Ensure sample scopes exist for realistic UI
    const brainConfig = brainRootFor(null);
    const brain = await resolveBrainRoot(brainConfig);
    if (brain.available) {
      await saveAgentScopes(brain.root, {
        slug: "persistenz-test-agent",
        name: "Persistenz-Test-Agent",
        kind: "connect",
        connectAgentId: targetAgentId,
        read: ["Knowledge", "Projects", "Vault"],
        write: ["Knowledge", "Projects"],
        files: [
          { path: "Knowledge/Spark/", read: true, write: true },
          { path: "Projects/Projekt Spark.md", read: true, write: true },
          { path: "Vault/Spark/", read: true, write: false },
          { path: "Shared/Sperrdatei.md", read: false, write: false },
        ],
      });
      console.log("Saved spark scopes and map for persistenz-test-agent");
    }

    // Start Chrome
    console.log("Starting Chrome...");
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

      const sessionCookieVal =
        "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

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

      // 1. Navigate to Agent dialog Spark/Brain section
      const brainUrl = `http://127.0.0.1:3101/agents?agent=${targetAgentId}&section=brain`;
      console.log(`Navigating to ${brainUrl} ...`);
      await send("Page.navigate", { url: brainUrl });
      await wait(4500);

      // 1. Scroll directly to the Spark specific folder & file rules section
      console.log("Scrolling to specific Spark folder/file rules section...");
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const h4 = Array.from(document.querySelectorAll("h4")).find(h => h.textContent && h.textContent.includes("Spezifische Spark-Ordner"));
            if (h4) {
              h4.scrollIntoView({ behavior: "instant", block: "start" });
              return true;
            }
            const scroller = document.querySelector(".overflow-y-auto") || document.querySelector("[role='dialog']");
            if (scroller) scroller.scrollTop = 650;
            return false;
          })()
        `,
      });
      await wait(1000);

      const shot1 = await send("Page.captureScreenshot", { format: "png" });
      const path1 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step11-spark-memory.png";
      writeFileSync(path1, Buffer.from(shot1.data, "base64"));
      console.log(`Captured ${path1}`);

      // 2. Scroll to top to focus on Map-Datei box and click "Karte ansehen"
      console.log("Scrolling to top and clicking 'Karte ansehen' button...");
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const scroller = document.querySelector(".overflow-y-auto") || document.querySelector("[role='dialog']");
            if (scroller) scroller.scrollTop = 0;
            const buttons = Array.from(document.querySelectorAll("button"));
            const mapBtn = buttons.find((b) => b.textContent && b.textContent.includes("Karte ansehen"));
            if (mapBtn) {
              mapBtn.click();
              return true;
            }
            return false;
          })()
        `,
      });
      await wait(1500);

      const shot2 = await send("Page.captureScreenshot", { format: "png" });
      const path2 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step11-map-preview.png";
      writeFileSync(path2, Buffer.from(shot2.data, "base64"));
      console.log(`Captured ${path2}`);

      ws.close();
      console.log("Screenshots captured successfully!");
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
