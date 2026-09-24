/**
 * Ask / Allow / Deny for shell commands on a Bot's computer — same shape as MCP permissions.
 *
 * Default is Ask: every `computer_run_command` waits for a person before it runs. Settings can
 * raise that to Allow for trusted sessions or Deny to refuse the shell outright.
 */

export type ShellPermission = "ask" | "allow" | "deny";

const KEY = "connect.computer-shell-permission";

export function readShellPermission(): ShellPermission {
  if (typeof localStorage === "undefined") return "ask";
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "allow" || raw === "deny" || raw === "ask") return raw;
  } catch {
    // Private mode / blocked storage — fail closed to Ask.
  }
  return "ask";
}

export function writeShellPermission(permission: ShellPermission): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, permission);
  } catch {
    // Ignore quota / private-mode failures; next read still defaults to Ask.
  }
}
