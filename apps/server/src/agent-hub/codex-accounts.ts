/**
 * Codex Start / Mehrkonten-Software Integration.
 *
 * Bindet das Instanz-Register aus:
 * C:\Users\Kunc GmbH\Documents\001_Mini Apps\000_Codex Start\Instanz-Register_files\apps.js
 * in Connect ein.
 *
 * Verwaltet:
 * 1. Einlesen aller registrierten Apps und Instanzen (Codex, Cursor, Figma, Perplexity, etc.)
 * 2. Auslesen der konfigurierten Konten & E-Mail-Adressen (z. B. skunc3021@gmail.com)
 * 3. Automatische Zuordnung von Agenten zu Register-Instanzen (codexHome / userDataDir)
 * 4. Bereitstellung isolierter CLI-Verzeichnisse für ALLE 5 CLIs pro Agent:
 *    - Codex:       CODEX_HOME -> Register codexHome oder %LOCALAPPDATA%\ConnectAgents\<agentId>\codex-home
 *    - Claude:      CLAUDE_CONFIG_DIR -> %LOCALAPPDATA%\ConnectAgents\<agentId>\claude-config
 *    - Hermes:      HERMES_HOME -> %LOCALAPPDATA%\ConnectAgents\<agentId>\hermes-home
 *    - Freebuff:    FREEBUFF_CONFIG_DIR -> %LOCALAPPDATA%\ConnectAgents\<agentId>\freebuff-config
 *    - Antigravity: USERPROFILE / HOME / ANTIGRAVITY_CONFIG_DIR -> %LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home
 *                   mit AGY_ACCOUNT und isoliertem .gemini-Verzeichnis
 * 5. Dynamisches Nachladen bei Dateiänderung (mtime-Check) statt starrer 10-Sekunden-Cache.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { listAccounts } from "../cli-bridge/accounts/storage";

export function getCodexStartDir(): string {
  return process.env.CODEX_START_DIR?.trim() || "C:\\Users\\Kunc GmbH\\Documents\\001_Mini Apps\\000_Codex Start";
}

export function getCodexRegisterFile(): string {
  return (
    process.env.CODEX_REGISTER_FILE?.trim() ||
    join(getCodexStartDir(), "Instanz-Register_files", "apps.js")
  );
}

export function getDefaultGoogleAccount(): string {
  return (
    process.env.DEFAULT_BOT_GOOGLE_ACCOUNT?.trim() ||
    process.env.CONNECT_SINGLE_USER_EMAIL?.trim() ||
    "dailyfunde.yt@gmail.com"
  );
}

export const CODEX_START_DIR = getCodexStartDir();
export const CODEX_REGISTER_FILE = getCodexRegisterFile();
export const DEFAULT_GOOGLE_ACCOUNT = getDefaultGoogleAccount();

export type RegisteredInstance = {
  appId: string;
  appName: string;
  n: number;
  name: string;
  isOriginal?: boolean;
  enabled?: boolean;
  email?: string;
  userDataDir?: string | null;
  codexHome?: string | null;
  note?: string;
};

export type RegisteredApp = {
  id: string;
  name: string;
  kind?: string;
  exe?: string | null;
  appUserModelId?: string | null;
  multi?: string;
  maxSuggested?: number;
  instances?: RegisteredInstance[];
};

export type RegisteredAccountsManifest = {
  version: number;
  namingConvention?: string;
  updated?: string;
  sourceFile: string;
  exists: boolean;
  apps: RegisteredApp[];
  accounts: RegisteredInstance[];
  availableEmails: Array<{ email: string; label: string; appId: string; appName: string }>;
};

let cachedManifest: RegisteredAccountsManifest | null = null;
let lastFileMtimeMs = 0;

/**
 * Liest das Instanz-Register aus 000_Codex Start ein.
 * Prüft den Änderungszeitpunkt (mtimeMs) der Datei und lädt nur bei echter Änderung neu.
 */
/**
 * helium-agymulti: Antigravity-Konten aus dem Connect-Multi-Login-Register
 * (%LOCALAPPDATA%\ConnectAgents\accounts\accounts-registry.json) – damit jede dort
 * angelegte Google-Adresse auch in der CLI-Kontoauswahl (Agent-CLI) erscheint.
 */
export type AntigravityRegistryAccount = { id: string; email: string; label: string; cliHome: string | null; isDefault: boolean };

export function listAntigravityRegistryAccounts(): AntigravityRegistryAccount[] {
  try {
    return listAccounts("antigravity")
      .filter((a) => typeof a.email === "string" && a.email.trim())
      .map((a) => {
        const meta = (a.metadata || {}) as Record<string, unknown>;
        return {
          id: a.id,
          email: String(a.email).trim(),
          label: a.label || String(a.email),
          cliHome: typeof meta.cliHome === "string" && meta.cliHome ? meta.cliHome : null,
          isDefault: meta.isDefault === true,
        };
      });
  } catch {
    return [];
  }
}

export function findAntigravityRegistryAccount(email?: string | null): AntigravityRegistryAccount | null {
  if (!email || !email.trim()) return null;
  const clean = email.trim().toLowerCase();
  return listAntigravityRegistryAccounts().find((a) => a.email.toLowerCase() === clean) ?? null;
}

export function loadCodexRegister(forceReload = false): RegisteredAccountsManifest {
  const base = loadCodexRegisterBase(forceReload);
  const extra = listAntigravityRegistryAccounts();
  if (extra.length === 0) return base;
  const seen = new Set(base.availableEmails.map((e) => e.email.toLowerCase()));
  const availableEmails = [...base.availableEmails];
  for (const acc of extra) {
    const key = acc.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    availableEmails.push({
      email: acc.email,
      label: `Antigravity (${acc.email})`,
      appId: "antigravity",
      appName: "Antigravity / Google",
    });
  }
  return { ...base, availableEmails };
}

function loadCodexRegisterBase(forceReload = false): RegisteredAccountsManifest {
  const regFile = getCodexRegisterFile();
  let currentMtime = 0;
  try {
    if (existsSync(regFile)) {
      currentMtime = statSync(regFile).mtimeMs;
    }
  } catch {
    currentMtime = 0;
  }

  if (!forceReload && cachedManifest && currentMtime > 0 && currentMtime === lastFileMtimeMs) {
    return cachedManifest;
  }

  const defaultAccount = getDefaultGoogleAccount();
  const result: RegisteredAccountsManifest = {
    version: 1,
    sourceFile: regFile,
    exists: false,
    apps: [],
    accounts: [],
    availableEmails: [
      {
        email: defaultAccount,
        label: `Google Default (${defaultAccount})`,
        appId: "antigravity",
        appName: "Antigravity / Google",
      },
    ],
  };

  try {
    if (existsSync(regFile)) {
      result.exists = true;
      let raw = readFileSync(regFile, "utf8");
      // Strip UTF-8 BOM und führende Kommentare
      raw = raw.replace(/^\uFEFF/, "").trim();
      const jsonMatch = raw.match(/window\.APP_INSTANCES\s*=\s*(\{[\s\S]*\});?\s*$/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as {
          version?: number;
          namingConvention?: string;
          updated?: string;
          apps?: Array<{
            id: string;
            name: string;
            kind?: string;
            exe?: string | null;
            appUserModelId?: string | null;
            multi?: string;
            maxSuggested?: number;
            instances?: Array<{
              n: number;
              name: string;
              isOriginal?: boolean;
              enabled?: boolean;
              email?: string;
              userDataDir?: string | null;
              codexHome?: string | null;
              note?: string;
            }>;
          }>;
        };

        result.version = parsed.version ?? 1;
        result.namingConvention = parsed.namingConvention;
        result.updated = parsed.updated;

        const seenEmails = new Set<string>([defaultAccount.toLowerCase()]);

        for (const app of parsed.apps ?? []) {
          const instances: RegisteredInstance[] = [];
          for (const inst of app.instances ?? []) {
            const registeredInst: RegisteredInstance = {
              appId: app.id,
              appName: app.name,
              n: inst.n,
              name: inst.name,
              isOriginal: inst.isOriginal,
              enabled: inst.enabled,
              email: inst.email || "",
              userDataDir: inst.userDataDir,
              codexHome: inst.codexHome,
              note: inst.note,
            };
            instances.push(registeredInst);
            result.accounts.push(registeredInst);

            if (inst.email && inst.email.trim()) {
              const cleanEmail = inst.email.trim();
              const lower = cleanEmail.toLowerCase();
              if (!seenEmails.has(lower)) {
                seenEmails.add(lower);
                result.availableEmails.push({
                  email: cleanEmail,
                  label: `${app.name} (${inst.name}: ${cleanEmail})`,
                  appId: app.id,
                  appName: app.name,
                });
              }
            }
          }

          result.apps.push({
            id: app.id,
            name: app.name,
            kind: app.kind,
            exe: app.exe,
            appUserModelId: app.appUserModelId,
            multi: app.multi,
            maxSuggested: app.maxSuggested,
            instances,
          });
        }
      }
    }
  } catch (err) {
    console.error("[codex-accounts] Fehler beim Einlesen des Codex Start Registers:", err);
  }

  cachedManifest = result;
  lastFileMtimeMs = currentMtime;
  return result;
}

/**
 * Ordnet eine E-Mail oder einen Namen einer passenden Register-Instanz aus 000_Codex Start zu.
 */
export function findMatchingRegisterInstance(
  email?: string | null,
  preferredAppId?: string,
): RegisteredInstance | null {
  if (!email || !email.trim()) return null;
  const clean = email.trim().toLowerCase();
  const manifest = loadCodexRegister();

  // 1. Suche nach E-Mail-Match (falls preferredAppId, zuerst dort)
  if (preferredAppId) {
    const appMatch = manifest.accounts.find(
      (a) => a.appId.toLowerCase() === preferredAppId.toLowerCase() && a.email?.trim().toLowerCase() === clean,
    );
    if (appMatch) return appMatch;
  }

  const emailMatch = manifest.accounts.find((a) => a.email && a.email.trim().toLowerCase() === clean);
  if (emailMatch) return emailMatch;

  // 2. Suche nach Instanz-Name oder App-Name
  const nameMatch = manifest.accounts.find(
    (a) =>
      a.name.toLowerCase() === clean ||
      a.appName.toLowerCase() === clean ||
      a.appId.toLowerCase() === clean,
  );
  return nameMatch ?? null;
}

export type AgentCliPaths = {
  agentBase: string;
  workspace: string;
  codexHome: string;
  claudeConfig: string;
  hermesHome: string;
  freebuffConfig: string;
  antigravityHome: string;
  antigravityConfig: string; // Kompatibilitäts-Alias
  browserProfile: string;
  googleAccount: string;
  matchedInstance: RegisteredInstance | null;
  isRegisteredInstanceUsed: boolean;
};

/**
 * Erstellt und liefert die dedizierten Verzeichnisse und Umgebungsvariablen für einen Agenten.
 *
 * Trennung für ALLE fünf CLIs:
 * - Codex:       CODEX_HOME (Register codexHome oder %LOCALAPPDATA%\ConnectAgents\<agentId>\codex-home)
 * - Claude:      CLAUDE_CONFIG_DIR (%LOCALAPPDATA%\ConnectAgents\<agentId>\claude-config)
 * - Hermes:      HERMES_HOME (%LOCALAPPDATA%\ConnectAgents\<agentId>\hermes-home)
 * - Freebuff:    FREEBUFF_CONFIG_DIR (%LOCALAPPDATA%\ConnectAgents\<agentId>\freebuff-config)
 * - Antigravity: USERPROFILE / HOME (%LOCALAPPDATA%\ConnectAgents\<agentId>\antigravity-home)
 * - Browser:     Helium-Profil (Register userDataDir oder %LOCALAPPDATA%\ConnectAgents\browser-profiles\<agentId>)
 */
export function getAgentCliConfigDirs(
  agentId: string,
  accountEmail?: string | null,
): AgentCliPaths {
  const safeId = agentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "agent";
  const baseRoot = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectAgents")
    : join(homedir(), ".connect-app", "agents");

  const agentBase = join(baseRoot, safeId);
  const workspace = join(agentBase, "workspace");

  // Prüfe Zuordnung zu Instanz im Codex-Start-Register
  const matchedInstance = findMatchingRegisterInstance(accountEmail);

  // Codex-Home: Bei Instanz-Match das registrierte codexHome nutzen
  let codexHome: string;
  let isRegisteredInstanceUsed = false;
  if (matchedInstance?.codexHome && matchedInstance.codexHome.trim()) {
    codexHome = matchedInstance.codexHome.trim();
    isRegisteredInstanceUsed = true;
  } else {
    codexHome = join(agentBase, "codex-home");
  }

  const claudeConfig = join(agentBase, "claude-config");
  const hermesHome = join(agentBase, "hermes-home");
  const freebuffConfig = join(agentBase, "freebuff-config");
  // helium-agymulti: Ist die E-Mail ein eigener Antigravity-Slot im Multi-Login-Register,
  // nutzt die CLI das CLI-Home dieses Slots (geteilt von allen Agenten mit diesem Konto).
  const agyRegistryAccount = findAntigravityRegistryAccount(accountEmail);
  const agySlotHome = agyRegistryAccount && !agyRegistryAccount.isDefault ? agyRegistryAccount.cliHome : null;
  const antigravityHome = agySlotHome || join(agentBase, "antigravity-home");

  // Browser-Profile (Helium): Bei Instanz-Match userDataDir nutzen, sonst bot-spezifisch
  let browserProfile: string;
  if (matchedInstance?.userDataDir && matchedInstance.userDataDir.trim()) {
    browserProfile = matchedInstance.userDataDir.trim();
  } else {
    browserProfile = join(baseRoot, "browser-profiles", safeId);
  }

  // Verzeichnisse anlegen
  mkdirSync(agentBase, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(claudeConfig, { recursive: true });
  mkdirSync(hermesHome, { recursive: true });
  mkdirSync(freebuffConfig, { recursive: true });
  mkdirSync(join(antigravityHome, ".gemini"), { recursive: true });
  mkdirSync(browserProfile, { recursive: true });

  const googleAccount = (accountEmail && accountEmail.trim()) || getDefaultGoogleAccount();

  // Für Antigravity: Falls die Standard-E-Mail verwendet wird und im Agenten-Ordner
  // noch keine eigene OAuth-Datei liegt, kopieren wir die vorhandenen globalen Google-Zugangsdaten,
  // damit der Agent direkt startklar ist, ohne dass Stefan sich erneut einloggen muss.
  try {
    const globalGemini = join(homedir(), ".gemini");
    const agentGemini = join(antigravityHome, ".gemini");
    const globalCreds = join(globalGemini, "oauth_creds.json");
    const agentCreds = join(agentGemini, "oauth_creds.json");
    const globalAccounts = join(globalGemini, "google_accounts.json");
    const agentAccounts = join(agentGemini, "google_accounts.json");

    // Keine fremden Google-Zugangsdaten in einen eigenen Antigravity-Slot kopieren.
    if (!agySlotHome && existsSync(globalCreds) && !existsSync(agentCreds)) {
      copyFileSync(globalCreds, agentCreds);
    }
    if (!agySlotHome && existsSync(globalAccounts) && !existsSync(agentAccounts)) {
      copyFileSync(globalAccounts, agentAccounts);
    }

    // Für Freebuff: nur die Einstellungen übernehmen — NIEMALS credentials.json.
    // freebuff liest seinen Config-Ordner aus FREEBUFF_CONFIG_DIR; würde jeder
    // Agent die globalen Zugangsdaten erben, wäre die Konten-Trennung wertlos.
    const globalManicode = join(homedir(), ".config", "manicode");
    const globalFreebuffSettings = join(globalManicode, "settings.json");
    const agentFreebuffSettings = join(freebuffConfig, "settings.json");

    if (existsSync(globalFreebuffSettings) && !existsSync(agentFreebuffSettings)) {
      copyFileSync(globalFreebuffSettings, agentFreebuffSettings);
    }

    // Für Codex: Falls im globalen ~/.codex Zugangsdaten liegen, in den isolierten
    // Codex-Home-Ordner des Agenten kopieren (auth.json und config.toml)
    const globalCodex = join(homedir(), ".codex");
    const globalCodexAuth = join(globalCodex, "auth.json");
    const agentCodexAuth = join(codexHome, "auth.json");
    const globalCodexConfig = join(globalCodex, "config.toml");
    const agentCodexConfig = join(codexHome, "config.toml");

    if (existsSync(globalCodexAuth) && !existsSync(agentCodexAuth)) {
      copyFileSync(globalCodexAuth, agentCodexAuth);
    }
    if (existsSync(globalCodexConfig) && !existsSync(agentCodexConfig)) {
      copyFileSync(globalCodexConfig, agentCodexConfig);
    }
  } catch {
    // Best-effort Seeding
  }

  return {
    agentBase,
    workspace,
    codexHome,
    claudeConfig,
    hermesHome,
    freebuffConfig,
    antigravityHome,
    antigravityConfig: antigravityHome,
    browserProfile,
    googleAccount,
    matchedInstance,
    isRegisteredInstanceUsed,
  };
}

/**
 * Erstellt das vollständige ProcessEnv für einen Agenten mit allen isolierten CLI-Konfigurationen
 * für ALLE fünf unterstützten CLIs.
 */
export function buildAgentIsolatedEnv(
  agentId: string,
  accountEmail?: string | null,
  customEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
  const paths = getAgentCliConfigDirs(agentId, accountEmail);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONNECT_AGENT_ID: agentId,
    AGENT_ID: agentId,
    AGENT_WORKDIR: paths.workspace,
    AGENT_BROWSER_PROFILE: paths.browserProfile,
    // 1. Codex
    CODEX_HOME: paths.codexHome,
    // 2. Claude
    CLAUDE_CONFIG_DIR: paths.claudeConfig,
    // 3. Hermes
    HERMES_HOME: paths.hermesHome,
    // 4. Freebuff (liest FREEBUFF_CONFIG_DIR absolut; XDG_CONFIG_HOME ignoriert die CLI)
    FREEBUFF_CONFIG_DIR: paths.freebuffConfig,
    // 5. Antigravity: agy liest USERPROFILE / HOME zur Lokalisierung von ~/.gemini
    ANTIGRAVITY_CONFIG_DIR: paths.antigravityHome,
    ANTIGRAVITY_HOME: paths.antigravityHome,
    // Google-Apps & Account-E-Mail
    AGY_ACCOUNT: paths.googleAccount,
    GOOGLE_ACCOUNT: paths.googleAccount,
    CONNECT_ACCOUNT_EMAIL: paths.googleAccount,
    NO_COLOR: "1",
    TERM: "xterm-256color",
    ...(customEnv ?? {}),
  };

  return env;
}
