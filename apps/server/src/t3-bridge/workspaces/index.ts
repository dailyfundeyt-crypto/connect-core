/**
 * T3-Bridge — Workspace-Manager: Einstiegspunkt.
 *
 * Lane: A07 (Welle W1).
 *
 * Der einzige Ort, an dem der Manager als Singleton lebt. A37 (Server-
 * Verdrahtung) und A11/A18 holen ihn hier:
 *
 * ```ts
 * const manager = getAgentWorkspaceManager();
 * if (!manager) return legacyWorkspaceBehaviour();   // Flag aus → altes Verhalten
 *
 * const result = await manager.ensure({ agentId, agentName });
 * if (!result.ok) return respondWithError(result.reason);
 * return startCli({ cwd: result.workspace.path });
 * ```
 *
 * Feature-Flag: `connect.t3.bridge` (A01-Vertrag). Ist es aus, gibt es keine
 * Instanz — Connect verhält sich exakt wie heute.
 */

import { getT3Flag } from "../contracts";
import {
  AgentWorkspaceManager,
  WORKSPACE_MANAGER_DISABLED_REASON,
} from "./manager";
import { getWorkspacesRootDir } from "./paths";
import type { AgentWorkspaceManagerOptions, WorkspaceOutcome } from "./types";

export * from "./db-store";
export * from "./disk-usage";
export * from "./manager";
export * from "./paths";
export * from "./registry";
export * from "./slug";
export * from "./types";

/** True, wenn der Workspace-Manager überhaupt arbeiten darf. */
export function isT3WorkspaceManagerEnabled(): boolean {
  return getT3Flag("bridge");
}

/** Wurzel aller Agentenordner: `%LOCALAPPDATA%\ConnectAgents\workspaces`. */
export function getAgentWorkspaceRootDir(): string {
  return getWorkspacesRootDir();
}

/**
 * Manager bauen. Die Flag-Prüfung passiert bei jedem Aufruf seiner Methoden,
 * nicht nur hier — ein zur Laufzeit abgeschaltetes Flag legt nichts mehr an.
 */
export function createAgentWorkspaceManager(
  options: AgentWorkspaceManagerOptions = {},
): AgentWorkspaceManager {
  return new AgentWorkspaceManager(options);
}

let singleton: AgentWorkspaceManager | null = null;

/**
 * Der Manager dieses Prozesses — oder `null`, wenn `connect.t3.bridge` aus ist.
 *
 * Mit `options` wird bewusst eine frische Instanz gebaut (Tests, andere
 * Datenbank); ohne bleibt die vorhandene Instanz bestehen.
 */
export function getAgentWorkspaceManager(
  options?: AgentWorkspaceManagerOptions,
): AgentWorkspaceManager | null {
  if (!isT3WorkspaceManagerEnabled()) return null;
  if (options) return new AgentWorkspaceManager(options);
  if (!singleton) singleton = new AgentWorkspaceManager();
  return singleton;
}

/** Nur für Tests: Singleton zurücksetzen. */
export function resetAgentWorkspaceManagerForTests(): void {
  singleton = null;
}

/**
 * Bequemer Einstieg für A11/A18: Ordner sicherstellen.
 *
 * Flag aus → `{ ok: false, code: "disabled" }`, kein Verzeichnis, keine Datei.
 */
export async function ensureAgentWorkspace(
  input: { agentId: string; agentName?: string },
  options?: AgentWorkspaceManagerOptions,
): Promise<WorkspaceOutcome> {
  const manager = getAgentWorkspaceManager(options);
  if (!manager) {
    return {
      ok: false,
      enabled: false,
      code: "disabled",
      reason: WORKSPACE_MANAGER_DISABLED_REASON,
    };
  }
  return manager.ensure(input);
}
