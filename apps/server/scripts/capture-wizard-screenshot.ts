import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = "C:\\Users\\Kunc GmbH\\AppData\\Local\\Temp\\chrome-shot-profile";

if (!existsSync(USER_DATA)) mkdirSync(USER_DATA, { recursive: true });

// Start Chrome
const chrome = spawn(CHROME_PATH, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${USER_DATA}`,
  "--window-size=1360,920",
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

async function capture(url: string, outputPath: string) {
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

  await send("Network.setCookie", {
    name: "better-auth.session_token",
    value: sessionCookieVal,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
  });

  await send("Network.setCookie", {
    name: "better-auth.session_token",
    value: sessionCookieVal,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
  });

  console.log(`Navigating to ${url} ...`);
  await send("Page.navigate", { url });
  await wait(5000); // Wait for React, TanStack Query & dialog animation to render

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const buffer = Buffer.from(shot.data, "base64");
  writeFileSync(outputPath, buffer);
  console.log(`Saved screenshot to ${outputPath} (${buffer.length} bytes)`);

  ws.close();
}

async function captureWizardFlow() {
  const wsUrl = await getPageWsUrl();
  console.log(`Connecting to CDP target for wizard flow: ${wsUrl}`);
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

  console.log("Navigating to /agents?new=true&tab=mine ...");
  await send("Page.navigate", { url: "http://127.0.0.1:3101/agents?new=true&tab=mine" });
  await wait(4000);

  // 1. Capture Profile step
  console.log("Capturing Step 1 (Profile) ...");
  const shot1 = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-wizard-profile.png", Buffer.from(shot1.data, "base64"));

  // Enter agent name so validation passes (use native value setter for React controlled component)
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const input = document.getElementById("create-agent-name");
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(input, "Research Bot");
          } else {
            input.value = "Research Bot";
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `,
  });
  await wait(500);

  // Click "Weiter" to go to Step 2 (Modellwahl)
  console.log("Clicking 'Weiter' to advance to Step 2 (Modellwahl) ...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const weiterBtn = buttons.find((b) => b.textContent && b.textContent.trim() === "Weiter");
        if (weiterBtn) weiterBtn.click();
      })()
    `,
  });
  await wait(5000); // Wait for transition and cli status query (which runs CLI checks)

  // 2. Capture Step 2 (Modellwahl)
  console.log("Capturing Step 2 (Modellwahl - top) ...");
  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-wizard-model.png", Buffer.from(shot2.data, "base64"));

  // Scroll down to show cards 4 & 5 (Data Analysis & Self-Improving)
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const scrollable = document.querySelector(".max-h-\\\\[460px\\\\]");
        if (scrollable) scrollable.scrollTop = 300;
      })()
    `,
  });
  await wait(600);
  console.log("Capturing Step 2 (Modellwahl - scrolled) ...");
  const shot2b = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-wizard-model-scrolled.png", Buffer.from(shot2b.data, "base64"));

  // Click "Weiter" to go to Step 3 (Installation & Login)
  console.log("Clicking 'Weiter' to advance to Step 3 (Auto-Installation & Login) ...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const weiterBtn = buttons.find((b) => b.textContent && b.textContent.trim() === "Weiter");
        if (weiterBtn) weiterBtn.click();
      })()
    `,
  });
  await wait(3000);

  // 3. Capture Step 3 (Auto-Installation & Login)
  console.log("Capturing Step 3 (Auto-Installation & Login) ...");
  const shotSetup = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-wizard-setup.png", Buffer.from(shotSetup.data, "base64"));

  // Click "Zurück" to go back to Step 2, select Hermes, and advance to show Hermes API-Key field
  console.log("Clicking 'Zurück' to test Hermes API-Key view ...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const backBtn = buttons.find((b) => b.textContent && b.textContent.trim() === "Zurück");
        if (backBtn) backBtn.click();
      })()
    `,
  });
  await wait(1000);

  // Select Hermes card
  console.log("Selecting Hermes card ...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const cards = Array.from(document.querySelectorAll("button"));
        const hermesCard = cards.find((b) => b.textContent && b.textContent.includes("Hermes"));
        if (hermesCard) hermesCard.click();
      })()
    `,
  });
  await wait(500);

  // Advance to Step 3 with Hermes selected
  console.log("Advancing to Step 3 with Hermes selected ...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const weiterBtn = buttons.find((b) => b.textContent && b.textContent.trim() === "Weiter");
        if (weiterBtn) weiterBtn.click();
      })()
    `,
  });
  await wait(2000);

  // Capture Step 3 (Hermes API-Key)
  console.log("Capturing Step 3 (Hermes API-Key field) ...");
  const shotHermes = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-wizard-setup-hermes.png", Buffer.from(shotHermes.data, "base64"));

  // Click "Weiter" to advance to Step 4 (Konto)
  console.log("Clicking 'Weiter' to advance to Step 4 (Konto) ...");
  await send("Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const weiterBtn = buttons.find((b) => b.textContent && b.textContent.trim() === "Weiter");
        if (weiterBtn) weiterBtn.click();
      })()
    `,
  });
  await wait(2000);

  // 4. Capture Step 4 (Konto)
  console.log("Capturing Step 4 (Konto) ...");
  const shot4 = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-wizard-account.png", Buffer.from(shot4.data, "base64"));

  ws.close();
}

async function main() {
  try {
    console.log("Taking screenshot of /agents list ...");
    await capture(
      "http://127.0.0.1:3101/agents",
      "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\screenshot-agents.png",
    );

    console.log("Capturing full wizard flow (Profile -> Modellwahl -> Konto) ...");
    await captureWizardFlow();

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
