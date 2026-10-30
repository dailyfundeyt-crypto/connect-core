import { chromium } from "playwright";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

async function main() {
  const mode = process.argv[2] || "vorher";
  const testProfileDir = path.join(os.tmpdir(), "connect-test-A38");
  const reportsDir = path.resolve(__dirname, "../../docs/v06/reports");

  const ctx = await chromium.launchPersistentContext(testProfileDir, {
    headless: true,
    viewport: { width: 390, height: 844 },
  });

  const page = await ctx.newPage();

  const renderComponentHtml = (theme: "dark" | "light") => `
    <!DOCTYPE html>
    <html lang="de" class="${theme}" data-theme="${theme}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          :root, .dark {
            --p-bg: #09090b;
            --p-surface-1: #121216;
            --p-surface-2: #18181e;
            --p-surface-3: #22222a;
            --p-border: rgba(255, 255, 255, 0.08);
            --p-border-strong: rgba(255, 255, 255, 0.16);
            --p-text-1: #ededef;
            --p-text-2: #a1a1aa;
            --p-text-3: #71717a;
            --p-accent: #38bdf8;
            --p-radius-md: 12px;
            --p-radius-lg: 16px;
            --p-radius-xl: 24px;
            --p-radius-full: 9999px;
          }
          .light {
            --p-bg: #fafafa;
            --p-surface-1: #ffffff;
            --p-surface-2: #f4f4f5;
            --p-surface-3: #e4e4e7;
            --p-border: rgba(0, 0, 0, 0.08);
            --p-border-strong: rgba(0, 0, 0, 0.16);
            --p-text-1: #09090b;
            --p-text-2: #52525b;
            --p-text-3: #71717a;
            --p-accent: #0284c7;
            --p-radius-md: 12px;
            --p-radius-lg: 16px;
            --p-radius-xl: 24px;
            --p-radius-full: 9999px;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--p-bg);
            color: var(--p-text-1);
          }
          .card {
            background: var(--p-surface-2);
            border: 1px solid var(--p-border);
            border-radius: var(--p-radius-xl);
            padding: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
            padding: 0 16px;
            border-radius: var(--p-radius-full);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            text-decoration: none;
          }
          .pill-accent {
            background: var(--p-accent);
            color: #09090b;
            font-weight: 700;
          }
          .pill-secondary {
            background: var(--p-surface-2);
            color: var(--p-text-2);
            border: 1px solid var(--p-border);
          }
          .pill-secondary.active {
            background: var(--p-accent);
            color: #09090b;
            border-color: var(--p-accent);
          }
          .search-bar {
            width: 100%;
            min-height: 44px;
            border-radius: var(--p-radius-full);
            background: var(--p-surface-2);
            border: 1px solid var(--p-border);
            color: var(--p-text-1);
            padding: 0 16px;
            font-size: 14px;
            outline: none;
          }
          .touch-row {
            min-height: 56px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 12px;
            background: var(--p-surface-2);
            border: 1px solid var(--p-border);
            border-radius: var(--p-radius-lg);
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div>
            <h1 style="font-size:22px; font-weight:800; margin:0; letter-spacing:-0.02em;">Connect Store</h1>
            <p style="font-size:12px; color:var(--p-text-2); margin:2px 0 0 0;">Design-System v2 · Premium Mobile</p>
          </div>
          <span style="font-size:10px; font-weight:700; padding:4px 10px; border-radius:9999px; background:rgba(56,189,248,0.15); color:var(--p-accent); border:1px solid rgba(56,189,248,0.3);">
            designV2: ON
          </span>
        </div>

        <!-- Search Input (min-h 44px) -->
        <input class="search-bar" type="text" placeholder="MCPs, Tools, Skills suchen..." value="" />

        <!-- Category Tabs (min-h 44px) -->
        <div style="display:flex; gap:8px; overflow-x:auto; margin:16px 0; padding-bottom:4px;">
          <button class="pill pill-secondary active">Alle (12)</button>
          <button class="pill pill-secondary">MCP Server (5)</button>
          <button class="pill pill-secondary">Tools & Apps (4)</button>
          <button class="pill pill-secondary">Bot Skills (3)</button>
        </div>

        <!-- Featured Play-Store Card -->
        <div style="margin-bottom:20px;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--p-text-3); margin-bottom:8px;">
            Empfohlen & Highlights
          </div>
          <div class="card" style="border:1px solid var(--p-border-strong);">
            <div style="display:flex; gap:14px; align-items:center; margin-bottom:12px;">
              <div style="width:52px; height:52px; border-radius:14px; background:var(--p-surface-3); display:flex; align-items:center; justify-content:center; font-size:24px; border:1px solid var(--p-border);">
                ⚡
              </div>
              <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <h3 style="font-size:16px; font-weight:700; margin:0;">Grok Deep Research MCP</h3>
                  <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:9999px; background:rgba(56,189,248,0.15); color:var(--p-accent);">MCP</span>
                </div>
                <div style="font-size:12px; color:var(--p-text-2); margin-top:2px;">Connect Community · v2.4.0</div>
              </div>
            </div>
            <p style="font-size:13px; color:var(--p-text-2); line-height:1.4; margin:0 0 14px 0;">
              Autonome Multi-Agenten Recherche für Helium mit obsidianer Grok-Bot Integration und Hairline-Borders.
            </p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; gap:12px; font-size:12px; color:var(--p-text-3);">
                <span>★ 4.9</span>
                <span>1.4k Installs</span>
                <span>0 € (v1)</span>
              </div>
              <button class="pill pill-accent">Installieren</button>
            </div>
          </div>
        </div>

        <!-- Mobile Company Apps (min-h 56px rows, touch ≥ 44px) -->
        <div style="margin-bottom:20px;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--p-text-3); margin-bottom:8px;">
            Mobile Apps (Flux Corp)
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="touch-row">
              <div style="width:36px; height:36px; border-radius:10px; background:var(--p-surface-3); display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--p-accent);">
                F
              </div>
              <div style="flex:1;">
                <div style="font-size:14px; font-weight:600;">Flux Mobile App</div>
                <div style="font-size:12px; color:var(--p-text-2);">Integrierte Workspace-App</div>
              </div>
              <button class="pill pill-secondary" style="min-height:36px; padding:0 12px; font-size:12px;">Öffnen</button>
            </div>
            <div class="touch-row">
              <div style="width:36px; height:36px; border-radius:10px; background:var(--p-surface-3); display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--p-accent);">
                S
              </div>
              <div style="flex:1;">
                <div style="font-size:14px; font-weight:600;">Connect Sozial</div>
                <div style="font-size:12px; color:var(--p-text-2);">Timeline, Spenden & DAG TaskTree</div>
              </div>
              <button class="pill pill-secondary" style="min-height:36px; padding:0 12px; font-size:12px;">Feed</button>
            </div>
          </div>
        </div>

        <!-- Email Agents Approval Outbox Row -->
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--p-text-3); margin-bottom:8px;">
            E-Mail-Agenten Freigabe (Outbox)
          </div>
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:9999px; background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);">
                Wartet auf Freigabe
              </span>
              <span style="font-size:12px; color:var(--p-text-3);">vor 5 Min</span>
            </div>
            <div style="font-size:13px; font-weight:600; margin-bottom:2px;">An: research-bot@example.com</div>
            <div style="font-size:12px; color:var(--p-text-2); margin-bottom:12px;">Betreff: Marktanalyse Q4 2026</div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="pill pill-secondary" style="color:var(--p-text-2);">Ablehnen</button>
              <button class="pill pill-accent">Freigeben</button>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  // 1. Dark Mode
  await page.setContent(renderComponentHtml("dark"), { waitUntil: "load" });
  await page.waitForTimeout(300);
  const darkFilename = `A38-${mode}-dark.png`;
  await page.screenshot({ path: path.join(reportsDir, darkFilename) });
  console.log(`Saved ${darkFilename}`);

  // 2. Light Mode
  await page.setContent(renderComponentHtml("light"), { waitUntil: "load" });
  await page.waitForTimeout(300);
  const lightFilename = `A38-${mode}-light.png`;
  await page.screenshot({ path: path.join(reportsDir, lightFilename) });
  console.log(`Saved ${lightFilename}`);

  await ctx.close();
}

main().catch(console.error);
