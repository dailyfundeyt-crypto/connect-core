import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import postgres from "postgres";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-step13-shot-profile";

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
    console.log(`Setting up sample website entries for ${targetAgentId} ...`);

    const sampleWebsites = [
      {
        id: "web-preview-vercel",
        url: "https://connect-kunc-preview.vercel.app",
        purpose: "Vorschau-Deployment testen und UI verifizieren",
        enabled: true,
      },
      {
        id: "web-google-apps",
        url: "https://workspace.google.com",
        purpose: "dailyfunde.yt@gmail.com Google Workspace & Dokumente",
        enabled: true,
      },
      {
        id: "web-github-repo",
        url: "https://github.com",
        purpose: "Quellcode-Repository, Commits & PRs",
        enabled: true,
      },
      {
        id: "web-hn",
        url: "https://news.ycombinator.com",
        purpose: "Tech News und Trends beobachten",
        enabled: false,
      },
    ];

    await sql.unsafe(
      "UPDATE agents SET website_list = $1::jsonb WHERE id = $2",
      [JSON.stringify(sampleWebsites), targetAgentId],
    );
    console.log("Updated website_list in database for target agent.");

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

      // 1. Navigate to Agent Dialog with Websites section
      const websitesUrl = `http://127.0.0.1:3101/agents?agent=${targetAgentId}&section=websites`;
      console.log(`Navigating to ${websitesUrl} ...`);
      await send("Page.navigate", { url: websitesUrl });
      await wait(4500);

      const shot1 = await send("Page.captureScreenshot", { format: "png" });
      const path1 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step13-websites-table.png";
      writeFileSync(path1, Buffer.from(shot1.data, "base64"));
      console.log(`Captured ${path1}`);

      // 2. Click "Webseite hinzufügen" to show the inline add form
      console.log("Clicking 'Webseite hinzufügen' button...");
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const addBtn = buttons.find((b) => b.textContent && b.textContent.includes("Webseite hinzufügen"));
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
      const path2 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step13-websites-add-form.png";
      writeFileSync(path2, Buffer.from(shot2.data, "base64"));
      console.log(`Captured ${path2}`);

      // 3. Navigate to Agent Overview Profile Card (settings drawer)
      const overviewUrl = `http://127.0.0.1:3101/agent/${targetAgentId}?settings=true`;
      console.log(`Navigating to ${overviewUrl} (Overview Profile Drawer)...`);
      await send("Page.navigate", { url: overviewUrl });
      await wait(4500);

      // Scroll to AgentWebsitesCard
      await send("Runtime.evaluate", {
        expression: `
          (() => {
            const h2 = Array.from(document.querySelectorAll("h2")).find(h => h.textContent && h.textContent.includes("Webseiten-Liste"));
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
      const path3 = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-step13-websites-card.png";
      writeFileSync(path3, Buffer.from(shot3.data, "base64"));
      console.log(`Captured ${path3}`);

      ws.close();
      console.log("All Step 13 screenshots captured successfully!");
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
