import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9234;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-lane4-profile";

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
  const sessionCookieVal =
    "MMHNZJ3XXnRPoTlZsa7Afe7QmKw5PMyI.53f7mIMtcQtsOzc8+m66roKn3HQEkPAcV9CxInavY0c=";

  console.log("Starting Chrome for Lane 4 screenshots...");
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA}`,
      "--window-size=1440,900",
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

    // Set cookie for authentication
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

    // Emulate dark mode
    await send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-color-scheme", value: "dark" }],
    });

    // 1. Desktop Screenshot (1440x900)
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log("Navigating to http://127.0.0.1:3101/ (Desktop Dark)...");
    await send("Page.navigate", { url: "http://127.0.0.1:3101/" });
    await wait(4000);

    // Ensure dark theme class on document
    await send("Runtime.evaluate", {
      expression: `
        (() => {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
          localStorage.setItem('vite-ui-theme', 'dark');
          localStorage.setItem('connect-theme', 'dark');
        })()
      `,
    });
    await wait(1000);

    const desktopShot = await send("Page.captureScreenshot", { format: "png" });
    const desktopPath = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-lane4-desktop.png";
    writeFileSync(desktopPath, Buffer.from(desktopShot.data, "base64"));
    console.log(`Captured ${desktopPath}`);

    // 2. Mobile Screenshot (390px width)
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log("Navigating to http://127.0.0.1:3101/ (Mobile 390px Dark)...");
    await wait(2000);

    const mobileShot = await send("Page.captureScreenshot", { format: "png" });
    const mobilePath = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-lane4-mobile.png";
    writeFileSync(mobilePath, Buffer.from(mobileShot.data, "base64"));
    console.log(`Captured ${mobilePath}`);

    ws.close();
    console.log("Lane 4 screenshots captured successfully!");
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
