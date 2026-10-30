import { launchCodexAccount } from "./providers/codex";
import { launchAntigravityAccount } from "./providers/antigravity";
import { launchManusAccount } from "./providers/manus";
import { launchPcAppAccount } from "./providers/pc-app";
import { getAccount } from "./storage";
import type { LaunchAccountResult } from "./types";

export async function launchAccountById(
  id: string,
  options: { restart?: boolean } = {},
): Promise<LaunchAccountResult> {
  const account = getAccount(id);
  if (!account) {
    return {
      ok: false,
      app: "unknown",
      accountId: id,
      label: id,
      dataDir: "",
      message: `Account with ID "${id}" not found.`,
    };
  }

  const appKey = account.app.toLowerCase();
  switch (appKey) {
    case "codex":
      return launchCodexAccount(account, options);
    case "antigravity":
      return launchAntigravityAccount(account, options);
    case "manus":
      return launchManusAccount(account, options);
    case "pc":
    case "obsidian":
      // PC-Apps: einfach das installierte Programm auf diesem Rechner oeffnen.
      return launchPcAppAccount(account);
    default:
      // Generic fallback for any other registered apps
      return launchCodexAccount(account, options);
  }
}
