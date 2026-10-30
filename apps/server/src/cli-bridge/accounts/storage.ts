import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { AppAccountRecord, CreateAccountInput } from "./types";

function getBaseAccountsDir(): string {
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || "C:\\Users\\Kunc GmbH", "AppData", "Local");
  const accountsDir = path.join(localAppData, "ConnectAgents", "accounts");
  if (!fs.existsSync(accountsDir)) {
    fs.mkdirSync(accountsDir, { recursive: true });
  }
  return accountsDir;
}

function getRegistryFilePath(): string {
  return path.join(getBaseAccountsDir(), "accounts-registry.json");
}

function ensureInitialSeedAccounts(baseDir: string): AppAccountRecord[] {
  const now = new Date().toISOString();
  const seed: AppAccountRecord[] = [
    {
      id: "codex-original",
      companyId: null,
      userId: "local-user",
      app: "codex",
      provider: "codex",
      label: "Codex · Haupt-Account",
      accountName: "Codex · Haupt-Account",
      email: "skunc3021@gmail.com",
      avatarUrl: undefined,
      dataDir: path.join(baseDir, "codex", "codex-original"),
      isActive: true,
      metadata: { slot: 1, isOriginal: true },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "codex-instanz-2",
      companyId: null,
      userId: "local-user",
      app: "codex",
      provider: "codex",
      label: "Codex · Instanz 2",
      accountName: "Codex · Instanz 2",
      email: "stefan@nordwind-capital.de",
      avatarUrl: undefined,
      dataDir: path.join(baseDir, "codex", "codex-instanz-2"),
      isActive: false,
      metadata: { slot: 2, isOriginal: false },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "antigravity-default",
      companyId: null,
      userId: "local-user",
      app: "antigravity",
      provider: "antigravity",
      label: "Antigravity Workspace",
      accountName: "Antigravity Workspace",
      email: "skunc3021@gmail.com",
      avatarUrl: undefined,
      dataDir: path.join(baseDir, "antigravity", "antigravity-default"),
      isActive: true,
      metadata: { isDefault: true },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "manus-primary",
      companyId: null,
      userId: "local-user",
      app: "manus",
      provider: "manus",
      label: "Manus Agenten-Profil",
      accountName: "Manus Agenten-Profil",
      email: "skunc3021@gmail.com",
      avatarUrl: undefined,
      dataDir: path.join(baseDir, "manus", "manus-primary"),
      isActive: true,
      metadata: { profile: "primary" },
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const acc of seed) {
    if (!fs.existsSync(acc.dataDir)) {
      fs.mkdirSync(acc.dataDir, { recursive: true });
    }
  }

  return seed;
}

export function loadAccounts(): AppAccountRecord[] {
  const registryFile = getRegistryFilePath();
  const baseDir = getBaseAccountsDir();

  if (!fs.existsSync(registryFile)) {
    const initial = ensureInitialSeedAccounts(baseDir);
    saveAccounts(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(registryFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    const initial = ensureInitialSeedAccounts(baseDir);
    saveAccounts(initial);
    return initial;
  } catch {
    const initial = ensureInitialSeedAccounts(baseDir);
    saveAccounts(initial);
    return initial;
  }
}

export function saveAccounts(accounts: AppAccountRecord[]): void {
  const registryFile = getRegistryFilePath();
  fs.writeFileSync(registryFile, JSON.stringify(accounts, null, 2), "utf-8");
}

export function listAccounts(appFilter?: string): AppAccountRecord[] {
  const all = loadAccounts();
  if (appFilter) {
    return all.filter(
      (a) => a.app.toLowerCase() === appFilter.toLowerCase() ||
             a.provider.toLowerCase() === appFilter.toLowerCase(),
    );
  }
  return all;
}

export function getAccount(id: string): AppAccountRecord | undefined {
  const all = loadAccounts();
  return all.find((a) => a.id === id);
}

export function createAccount(input: CreateAccountInput): AppAccountRecord {
  const all = loadAccounts();
  const baseDir = getBaseAccountsDir();
  const id = `${input.app.toLowerCase()}-${crypto.randomBytes(4).toString("hex")}`;
  const dataDir = path.join(baseDir, input.app.toLowerCase(), id);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const now = new Date().toISOString();
  const newAccount: AppAccountRecord = {
    id,
    companyId: input.companyId || null,
    userId: input.userId || "local-user",
    app: input.app.toLowerCase(),
    provider: input.app.toLowerCase(),
    label: input.label,
    accountName: input.label,
    email: input.email || undefined,
    dataDir,
    isActive: false,
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  all.push(newAccount);
  saveAccounts(all);
  return newAccount;
}

export function activateAccount(id: string): AppAccountRecord | undefined {
  const all = loadAccounts();
  const target = all.find((a) => a.id === id);
  if (!target) return undefined;

  // Deactivate others with the same app, activate target
  for (const acc of all) {
    if (acc.app === target.app) {
      acc.isActive = acc.id === id;
      acc.updatedAt = new Date().toISOString();
    }
  }

  saveAccounts(all);
  return target;
}

export function deleteAccount(id: string): boolean {
  const all = loadAccounts();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return false;

  const [removed] = all.splice(idx, 1);
  saveAccounts(all);
  return true;
}
