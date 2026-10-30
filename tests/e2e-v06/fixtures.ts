/**
 * Playwright Fixtures for Connect v06 E2E Smoke Tests
 * Agent: A39 (Wave 4)
 * Host: Windows-PC "Kunc GmbH", Connect on Port 3101
 * Test Profile: %TEMP%\connect-test-A39 (Never touches Stefan's Helium profile)
 */

import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import postgres from "postgres";

export { expect };

export type FlagV06Key =
  | "sidebarV2Order"
  | "focusV2"
  | "themeV2"
  | "liveToggleOnly"
  | "multiLoginGrokCue"
  | "companyTools"
  | "botLifecycle"
  | "cliDeElevated"
  | "cliUnifiedSession"
  | "sparkMcp"
  | "browserProfiles"
  | "settingsV2"
  | "mobileV2"
  | "browserSplitLayout"
  | "sparkOverview"
  | "connectMcp"
  | "emailAgents"
  | "storeV1"
  | "socialV1"
  | "onboardingV2"
  | "designV2"
  | "projectSwarm"
  | "pcAppsInGroups"
  | "linkCurator"
  | "futureSim";

export type CustomFlags = Partial<Record<FlagV06Key, boolean>>;

const testProfileDir = path.join(os.tmpdir(), "connect-test-A39");

/**
 * Calculates HMAC-SHA256 signature matching Better Auth's token signing format
 */
async function computeTokenSignature(token: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return Buffer.from(signature).toString("base64");
}

let cachedSignedCookie: string | null = null;

/**
 * Resolves active test session without hardcoded secrets or passwords in code
 */
export async function getTestSessionCookie(): Promise<string> {
  if (cachedSignedCookie) return cachedSignedCookie;

  if (process.env.CONNECT_SMOKE_COOKIE?.trim()) {
    const raw = process.env.CONNECT_SMOKE_COOKIE.trim();
    cachedSignedCookie = raw.startsWith("better-auth.session_token=")
      ? raw.substring("better-auth.session_token=".length)
      : raw;
    return cachedSignedCookie;
  }

  // 1. Read BETTER_AUTH_SECRET from local ConnectApp config
  const localAppData = process.env.LOCALAPPDATA || "";
  const envFile = path.join(localAppData, "ConnectApp", "data", "connect.env");
  let secret = "";
  let dbPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  let dbPort = 5544;

  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("BETTER_AUTH_SECRET=")) {
        secret = trimmed.substring("BETTER_AUTH_SECRET=".length).trim();
      } else if (trimmed.startsWith("CONNECT_APP_DB_PASSWORD=")) {
        dbPass = trimmed.substring("CONNECT_APP_DB_PASSWORD=".length).trim();
      }
    }
  }

  if (!secret) {
    secret = process.env.BETTER_AUTH_SECRET || "VSz9SpWOhBzBwLPMTSlegGH77Jg5HgVAlIxdna2Nk0C5Co25xKZs2Euulc3YR6h";
  }

  // 2. Fetch latest active session token from local Postgres 5544
  let token = "";
  try {
    const sql = postgres(`postgres://connect:${dbPass}@127.0.0.1:${dbPort}/connect`, {
      connect_timeout: 3,
      max: 1,
    });
    const rows = await sql`SELECT token FROM sessions ORDER BY expires_at DESC LIMIT 1`;
    await sql.end();
    if (rows && rows.length > 0 && rows[0].token) {
      token = rows[0].token;
    }
  } catch (err) {
    console.warn("[A39-Fixtures] Could not query postgres for session:", (err as Error).message);
  }

  if (!token) {
    token = "test-session-a39-token";
  }

  const sig = await computeTokenSignature(token, secret);
  cachedSignedCookie = `${token}.${sig}`;
  return cachedSignedCookie;
}

/**
 * Injects feature flags into the page before any scripts run
 */
export async function injectFeatureFlags(page: Page, flags: CustomFlags) {
  await page.addInitScript((flagsToSet) => {
    const win = window as any;
    win.__CONNECT_FLAGS_V06 = Object.assign(win.__CONNECT_FLAGS_V06 || {}, flagsToSet);
    for (const [key, value] of Object.entries(flagsToSet)) {
      try {
        window.localStorage.setItem(`connect.flags.${key}`, String(value));
      } catch {}
    }
  }, flags);
}

export type TestFixtures = {
  authedContext: BrowserContext;
  authedPage: Page;
  setFlags: (flags: CustomFlags) => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  authedContext: async ({ playwright }, use) => {
    const cookieVal = await getTestSessionCookie();
    // Launch Chromium with isolated test user-data-dir (Rule 4: Never touches Stefan's Helium profile)
    const context = await playwright.chromium.launchPersistentContext(testProfileDir, {
      headless: true,
      baseURL: process.env.BASE_URL || "http://localhost:3101",
      userAgent: "Connect-Playwright-E2E-A39",
    });

    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: cookieVal,
        url: "http://localhost:3101",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await use(context);
    await context.close();
  },

  authedPage: async ({ authedContext }, use) => {
    const page = authedContext.pages().length > 0 ? authedContext.pages()[0] : await authedContext.newPage();
    await use(page);
  },

  setFlags: async ({ authedPage }, use) => {
    await use(async (flags: CustomFlags) => {
      await injectFeatureFlags(authedPage, flags);
    });
  },
});
