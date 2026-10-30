/**
 * T3-Bridge — Agent-Freigabe-Richtlinie (Lane A13).
 *
 * Verbindliche Richtlinie von Stefan Kunc (ENTSCHIEDEN, 29.10.2026):
 *  „Agent arbeitet frei im eigenen Arbeitsordner ohne Rückfrage;
 *   für alles außerhalb erscheint eine Freigabe-Karte.“
 *
 * Akzeptanzkriterium (STRENG):
 *  Freigabe außerhalb des Arbeitsordners wird NIE automatisch erteilt!
 */

import { isAbsolute, normalize, resolve, sep } from "node:path";
import { isPathInside, isPathWithin } from "../workspaces/paths.js";
import type {
  ApprovalEvaluationResult,
  ConnectChatApprovalItem,
  T3ApprovalDecision,
} from "./types.js";

/** Standard-Optionen für die Freigabe-Karte im Connect-Chat. */
export const DEFAULT_APPROVAL_OPTIONS: readonly {
  readonly id: string;
  readonly label: string;
  readonly decision: T3ApprovalDecision;
}[] = [
  { id: "allow", label: "Ausführen (einmalig)", decision: "allow" },
  { id: "allow_always", label: "In dieser Sitzung immer erlauben", decision: "allow_always" },
  { id: "deny", label: "Ablehnen", decision: "deny" },
];

/**
 * Normalisiert einen Pfad plattformunabhängig für den Vergleich.
 */
export function normalizeWorkspacePath(filePath: string): string {
  if (!filePath || typeof filePath !== "string") return "";
  const trimmed = filePath.trim();
  if (!trimmed) return "";
  const resolved = resolve(trimmed);
  // Auf Windows case-insensitive normalisieren
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Prüft, ob ein Zielpfad strikt innerhalb des erlaubten Arbeitsordners liegt.
 *
 * @param agentWorkspace Der zugewiesene Arbeitsordner des Agenten
 * @param targetPath Der vom Agenten angefragte Dateipfad
 */
export function isPathInAgentWorkspace(
  agentWorkspace: string,
  targetPath: string,
): boolean {
  if (!agentWorkspace || !targetPath) return false;

  const ws = resolve(agentWorkspace.trim());
  let target = targetPath.trim();

  // Relative Pfade gegen den Arbeitsordner auflösen
  if (!isAbsolute(target)) {
    target = resolve(ws, target);
  } else {
    target = resolve(target);
  }

  // Pfad muss innerhalb oder gleich dem Arbeitsordner sein
  return isPathWithin(target, ws);
}

/**
 * Wertet eine Datei-Operation gegen die Agenten-Richtlinie aus.
 */
export function evaluatePathApproval(params: {
  readonly agentWorkspace: string;
  readonly targetPath: string;
  readonly actionKind?: string;
}): ApprovalEvaluationResult {
  const { agentWorkspace, targetPath, actionKind = "file_write" } = params;

  if (!agentWorkspace || !agentWorkspace.trim()) {
    return {
      allowed: false,
      requiresUserApproval: true,
      violationCode: "outside_workspace",
      reason: "Agent besitzt keinen gültigen Arbeitsordner. Freigabe erforderlich.",
      suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
      normalizedPath: targetPath,
    };
  }

  if (!targetPath || !targetPath.trim()) {
    return {
      allowed: false,
      requiresUserApproval: true,
      violationCode: "empty_path",
      reason: "Leerer Dateipfad angefordert. Freigabe erforderlich.",
      suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
    };
  }

  const ws = resolve(agentWorkspace.trim());
  let resolvedTarget: string;

  if (!isAbsolute(targetPath.trim())) {
    resolvedTarget = resolve(ws, targetPath.trim());
  } else {
    resolvedTarget = resolve(targetPath.trim());
  }

  // Liegt der Pfad strikt im Arbeitsordner?
  if (isPathWithin(resolvedTarget, ws)) {
    return {
      allowed: true,
      requiresUserApproval: false,
      reason: `Agent arbeitet frei im eigenen Arbeitsordner (${actionKind}).`,
      normalizedPath: resolvedTarget,
    };
  }

  // Pfad liegt AUSSERHALB des Arbeitsordners!
  // AKZEPTANZKRITERIUM: Freigabe außerhalb des Arbeitsordners wird nie automatisch erteilt!
  return {
    allowed: false,
    requiresUserApproval: true,
    violationCode: "outside_workspace",
    reason: `Zugriff auf Datei außerhalb des Arbeitsordners angefordert (${resolvedTarget}). Freigabe-Karte erforderlich.`,
    suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
    normalizedPath: resolvedTarget,
  };
}

/**
 * Durchsucht einen Befehlstext nach Pfadangaben und prüft, ob er den Arbeitsordner verlässt.
 */
export function evaluateCommandApproval(params: {
  readonly agentWorkspace: string;
  readonly command: string;
  readonly cwd?: string;
}): ApprovalEvaluationResult {
  const { agentWorkspace, command, cwd } = params;

  if (!agentWorkspace || !agentWorkspace.trim()) {
    return {
      allowed: false,
      requiresUserApproval: true,
      violationCode: "outside_workspace",
      reason: "Agent besitzt keinen Arbeitsordner. Freigabe erforderlich.",
      suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
      command,
    };
  }

  if (!command || !command.trim()) {
    return {
      allowed: false,
      requiresUserApproval: true,
      violationCode: "unknown_command",
      reason: "Leerer Befehl angefordert. Freigabe erforderlich.",
      suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
    };
  }

  const ws = resolve(agentWorkspace.trim());

  // 1. cwd prüfen: Falls angegeben, MUSS cwd im Arbeitsordner liegen!
  if (cwd && cwd.trim()) {
    const resolvedCwd = resolve(cwd.trim());
    if (!isPathWithin(resolvedCwd, ws)) {
      return {
        allowed: false,
        requiresUserApproval: true,
        violationCode: "outside_workspace",
        reason: `Befehl soll in fremdem Arbeitsverzeichnis ausgeführt werden (${resolvedCwd}).`,
        suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
        command,
      };
    }
  }

  // 2. Befehl auf Directory-Traversal und absolute Pfade prüfen
  const trimmedCmd = command.trim();

  // Traversal-Muster ("..\" oder "../")
  if (/\.\.[/\\]/.test(trimmedCmd)) {
    return {
      allowed: false,
      requiresUserApproval: true,
      violationCode: "directory_traversal",
      reason: "Befehl enthält Directory-Traversal ('..'). Freigabe erforderlich.",
      suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
      command,
    };
  }

  // Absolute Windows-Pfade (z. B. C:\..., D:\...)
  const winAbsMatches = trimmedCmd.match(/[a-zA-Z]:\\[^"'\s]*/g);
  if (winAbsMatches) {
    for (const match of winAbsMatches) {
      const resolved = resolve(match);
      if (!isPathWithin(resolved, ws)) {
        return {
          allowed: false,
          requiresUserApproval: true,
          violationCode: "outside_workspace",
          reason: `Befehl greift auf absoluten Pfad außerhalb des Arbeitsordners zu (${resolved}).`,
          suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
          command,
          normalizedPath: resolved,
        };
      }
    }
  }

  // Absolute Unix-Pfade (/etc/..., /var/..., /home/..., /usr/...)
  const posixAbsMatches = trimmedCmd.match(/(?:^|\s)(\/(?:etc|usr|var|home|bin|sbin|opt|tmp|root)\/[^\s"']*)/g);
  if (posixAbsMatches) {
    for (const match of posixAbsMatches) {
      const p = match.trim();
      const resolved = resolve(p);
      if (!isPathWithin(resolved, ws)) {
        return {
          allowed: false,
          requiresUserApproval: true,
          violationCode: "outside_workspace",
          reason: `Befehl greift auf Systempfad zu (${resolved}).`,
          suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
          command,
          normalizedPath: resolved,
        };
      }
    }
  }

  // Alles sicher im Arbeitsordner: freies Arbeiten ohne Rückfrage
  return {
    allowed: true,
    requiresUserApproval: false,
    reason: "Befehl arbeitet im zugewiesenen Arbeitsordner.",
    command,
  };
}

/**
 * Gesamtbewertung eines beliebigen Runtime-Requests nach Stefans Richtlinie.
 */
export function evaluateRuntimeRequestAction(params: {
  readonly agentWorkspace: string;
  readonly request: {
    readonly kind: string;
    readonly prompt?: string;
    readonly targetPath?: string;
    readonly command?: string;
    readonly cwd?: string;
  };
}): ApprovalEvaluationResult {
  const { agentWorkspace, request } = params;
  const kind = request.kind.toLowerCase();

  // Datei-Aktionen: file_write, file-change, file-read, write_file, edit_file
  if (
    kind.includes("file") ||
    kind.includes("write") ||
    kind.includes("edit") ||
    request.targetPath !== undefined
  ) {
    const target = request.targetPath || request.prompt || "";
    return evaluatePathApproval({
      agentWorkspace,
      targetPath: target,
      actionKind: kind,
    });
  }

  // Befehls-Aktionen: command, execute, bash, terminal, run
  if (
    kind.includes("command") ||
    kind.includes("exec") ||
    kind.includes("bash") ||
    request.command !== undefined
  ) {
    const cmd = request.command || request.prompt || "";
    return evaluateCommandApproval({
      agentWorkspace,
      command: cmd,
      cwd: request.cwd,
    });
  }

  // Nutzerfragen, Berechtigungen oder Secrets erfordern immer Freigabe
  if (kind === "user_input" || kind === "permission" || kind === "secret_request") {
    return {
      allowed: false,
      requiresUserApproval: true,
      violationCode: "outside_workspace",
      reason: `Rückfrage-Typ '${request.kind}' erfordert Bestätigung durch den Nutzer.`,
      suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
    };
  }

  // Vorsichtsprinzip: Unbekannte Request-Arten erfordern stets Freigabe-Karte
  return {
    allowed: false,
    requiresUserApproval: true,
    violationCode: "outside_workspace",
    reason: `Aktion '${request.kind}' liegt nicht zweifelsfrei im Arbeitsordner. Freigabe-Karte erforderlich.`,
    suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
  };
}

/**
 * Engine für session-spezifische Richtlinien und Freigaben je Agent.
 */
export class AgentApprovalPolicyEngine {
  /** Gespeicherte Sitzungs-Erlaubnisse (agentId + normalizedTarget -> allow_always) */
  readonly #sessionGrants = new Map<string, Set<string>>();

  /**
   * Registriert eine vom Nutzer erteilte Dauer-Freigabe für eine Sitzung ("allow_always").
   */
  grantSessionApproval(agentId: string, targetKey: string): void {
    const norm = normalizeWorkspacePath(targetKey);
    if (!norm) return;
    let set = this.#sessionGrants.get(agentId);
    if (!set) {
      set = new Set<string>();
      this.#sessionGrants.set(agentId, set);
    }
    set.add(norm);
  }

  /**
   * Prüft, ob für eine Zielressource bereits eine Sitzungs-Freigabe vorliegt.
   */
  hasSessionApproval(agentId: string, targetKey: string): boolean {
    const norm = normalizeWorkspacePath(targetKey);
    if (!norm) return false;
    const set = this.#sessionGrants.get(agentId);
    return set ? set.has(norm) : false;
  }

  /**
   * Löscht die Sitzungs-Freigaben für einen Agenten (z. B. bei Sitzungsende).
   */
  clearSessionGrants(agentId: string): void {
    this.#sessionGrants.delete(agentId);
  }

  /**
   * Prüft einen RuntimeRequest vollständig gegen Richtlinie und Session-Grants.
   */
  evaluateRequest(params: {
    readonly agentId: string;
    readonly agentWorkspace: string | null;
    readonly request: {
      readonly kind: string;
      readonly prompt?: string;
      readonly targetPath?: string;
      readonly command?: string;
      readonly cwd?: string;
    };
  }): ApprovalEvaluationResult {
    const { agentId, agentWorkspace, request } = params;

    if (!agentWorkspace) {
      return {
        allowed: false,
        requiresUserApproval: true,
        violationCode: "outside_workspace",
        reason: "Kein Agenten-Arbeitsordner vorhanden. Freigabe erforderlich.",
        suggestedOptions: DEFAULT_APPROVAL_OPTIONS,
      };
    }

    // Liegt eine explizite Session-Freigabe des Nutzers vor?
    const target = request.targetPath || request.command || request.prompt || "";
    if (target && this.hasSessionApproval(agentId, target)) {
      return {
        allowed: true,
        requiresUserApproval: false,
        reason: "Vom Nutzer in dieser Sitzung dauerhaft erlaubt ('allow_always').",
        normalizedPath: target,
      };
    }

    // Ansonsten Standard-Prüfung gegen Arbeitsordner
    return evaluateRuntimeRequestAction({
      agentWorkspace,
      request,
    });
  }
}
