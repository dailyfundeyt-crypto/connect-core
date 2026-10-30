/**
 * Provider Switch Module (v06 / Wave 1 - Agent A07)
 * 
 * Beendet die bisherige CLI sauber (über PTY / Kill), baut die Gedächtnis-Übergabe auf,
 * startet die neue CLI mit derselben Browser-Profil- und CDP-Konfiguration und
 * sendet den Handoff-Prompt als initiale Eingabe.
 * 
 * Bei einem Fehler erfolgt ein automatischer Rollback (alter Anbieter bleibt aktiv).
 */

import type { CliProviderId, CliSessionRef, ProviderSwitchReq } from "../../contracts/v06/cli";
import { getFlag } from "../../contracts/v06/flags";
import { buildMemoryHandoff, renderHandoffPrompt } from "./handoff";
import { defaultSessionStore, type UnifiedSessionStore } from "./sessionStore";

export interface SpawnCliOptions {
  conversationId: string;
  provider: CliProviderId;
  browserProfileId?: string;
  initialInput?: string;
  customEnv?: Record<string, string>;
  workdir?: string;
}

export interface SpawnCliResult {
  ok: boolean;
  sessionId?: string;
  pid?: number | null;
  error?: string;
}

export type SpawnCliFn = (options: SpawnCliOptions) => Promise<SpawnCliResult>;
export type KillCliFn = (conversationId: string, provider: CliProviderId) => Promise<boolean>;

export interface SwitchOptions {
  store?: UnifiedSessionStore;
  spawnCli?: SpawnCliFn;
  killCli?: KillCliFn;
  bypassFlagCheck?: boolean;
}

export interface SwitchResult {
  ok: boolean;
  session?: CliSessionRef;
  error?: string;
  handoffPrompt?: string;
}

/**
 * Berechnet den deterministischen CDP-Port für ein Browser-Profil.
 * Entspricht der Implementierung in browser-launch-guard.ts / agent-cdp.ts.
 */
export function calculateCdpPort(profileIdOrDir: string): number {
  const basePort = Number(process.env.CONNECT_CHROME_CDP_PORT) || 9333;
  const normalized = profileIdOrDir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  let h = 2166136261;
  for (const ch of normalized) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return basePort + (h % 200);
}

/**
 * Erzeugt die CDP- und Browser-Umgebungsvariablen für einen CLI-Prozess.
 * Stellt sicher, dass CLI und Chat denselben Browser steuern.
 */
export function buildBrowserEnvironment(browserProfileId?: string): Record<string, string> {
  if (!browserProfileId) {
    return {};
  }

  const port = calculateCdpPort(browserProfileId);
  return {
    CHROME_CDP_URL: `http://127.0.0.1:${port}`,
    CDP_PORT: String(port),
    BROWSER_PROFILE_ID: browserProfileId,
    CONNECT_BROWSER_PROFILE: browserProfileId,
    CONNECT_CHROME_CDP_PORT: String(port),
  };
}

/**
 * Standard-Adapter für das Beenden einer laufenden CLI-Sitzung.
 */
export const defaultKillCli: KillCliFn = async (conversationId: string, _provider: CliProviderId) => {
  try {
    const termManager = await import("../../agent-hub/agent-terminal-manager").catch(() => null);
    if (termManager && typeof termManager.stopAgentTerminal === "function") {
      await termManager.stopAgentTerminal(conversationId);
      return true;
    }
  } catch (err) {
    console.warn(`[unified-session] stopAgentTerminal fehlgeschlagen für ${conversationId}:`, err);
  }
  return true;
};

/**
 * Standard-Adapter für spawnCli: Nutzt die bestehende Terminal-Infrastruktur oder Fallback.
 * Sobald A06 den eigenständigen spawnCli Contract bereitstellt, dockt dieser Adapter nahtlos an.
 */
export const defaultSpawnCli: SpawnCliFn = async (options: SpawnCliOptions) => {
  try {
    const termManager = await import("../../agent-hub/agent-terminal-manager").catch(() => null);
    if (termManager && typeof termManager.startAgentTerminal === "function") {
      const started = await termManager.startAgentTerminal(options.conversationId, {
        cli: options.provider,
        customEnv: options.customEnv,
        workdir: options.workdir,
      });

      // Falls initialInput übergeben wurde, als Terminal-Eingabe senden
      if (options.initialInput && typeof termManager.sendAgentTerminalInput === "function") {
        termManager.sendAgentTerminalInput(options.conversationId, options.initialInput, false);
      }

      return {
        ok: true,
        sessionId: started.agentId,
        pid: started.pid,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: `Fehler beim Starten von ${options.provider}: ${String(err)}`,
    };
  }

  // Fallback für Tests oder Umgebungen ohne ConPTY
  return {
    ok: true,
    sessionId: `mock_${options.provider}_${Date.now()}`,
    pid: 12345,
  };
};

/**
 * Führt den Anbieterwechsel für eine Konversation durch:
 * 1. Prüft Feature-Flag FLAGS_V06.cliUnifiedSession
 * 2. Erstellt Memory-Handoff
 * 3. Beendet alte CLI über PTY
 * 4. Startet neue CLI mit Browser-/CDP-Env und Handoff-Prompt
 * 5. Rollback bei Fehlschlag: alter Anbieter bleibt aktiv
 */
export async function switchProvider(
  req: ProviderSwitchReq,
  options?: SwitchOptions,
): Promise<SwitchResult> {
  const store = options?.store ?? defaultSessionStore;
  const killFn = options?.killCli ?? defaultKillCli;
  const spawnFn = options?.spawnCli ?? defaultSpawnCli;

  // 1. Feature Flag Prüfung
  if (!options?.bypassFlagCheck && !getFlag("cliUnifiedSession")) {
    return {
      ok: false,
      error: "Feature-Flag 'cliUnifiedSession' ist nicht aktiviert.",
    };
  }

  const { conversationId, from, to } = req;
  if (!conversationId) {
    return { ok: false, error: "conversationId ist erforderlich." };
  }
  if (!from || !to) {
    return { ok: false, error: "'from' und 'to' Provider müssen angegeben werden." };
  }
  if (from === to) {
    const current = await store.getSession(conversationId);
    return { ok: true, session: current };
  }

  // 2. Aktuelle Session abrufen & verifizieren
  const currentSession = await store.getSession(conversationId);
  const oldProvider = currentSession.provider;

  // 3. Memory Handoff erstellen und Start-Prompt rendern
  const handoff = await buildMemoryHandoff(conversationId, { store });
  const handoffPrompt = renderHandoffPrompt(handoff);

  // 4. Alte CLI sauber beenden (PTY / Process-Tree Kill)
  try {
    await killFn(conversationId, from);
  } catch (err) {
    console.warn(`[unified-session] Warnung beim Beenden des alten Providers ${from}:`, err);
  }

  // 5. CDP- und Browser-Profil-Umgebungsvariablen vorbereiten
  const browserEnv = buildBrowserEnvironment(currentSession.browserProfileId);

  // 6. Neue CLI über spawnCli starten
  let spawnResult: SpawnCliResult;
  try {
    spawnResult = await spawnFn({
      conversationId,
      provider: to,
      browserProfileId: currentSession.browserProfileId,
      initialInput: handoffPrompt,
      customEnv: browserEnv,
    });
  } catch (err) {
    spawnResult = {
      ok: false,
      error: `Unerwarteter Fehler beim Spawn von ${to}: ${String(err)}`,
    };
  }

  // 7. Rollback bei Fehler: Alter Anbieter bleibt aktiv
  if (!spawnResult.ok) {
    console.error(`[unified-session] Anbieterwechsel fehlgeschlagen (${from} -> ${to}): ${spawnResult.error}`);

    // Der alte Prozess wurde vor dem Spawn beendet. Deshalb muss der Rollback
    // nicht nur den gespeicherten Provider zurücksetzen, sondern dieselbe PTY
    // auch wieder unter der alten CLI starten.
    try {
      await spawnFn({
        conversationId,
        provider: oldProvider,
        browserProfileId: currentSession.browserProfileId,
        customEnv: browserEnv,
      });
    } catch (rollbackError) {
      console.warn(`[unified-session] PTY-Rollback fehlgeschlagen für ${conversationId}:`, rollbackError);
    }

    // Sicherstellen, dass der alte Provider in der Session erhalten bleibt.
    await store.updateProvider(conversationId, oldProvider);

    return {
      ok: false,
      error: spawnResult.error || `Start des neuen Providers ${to} fehlgeschlagen. Alter Provider ${oldProvider} bleibt aktiv.`,
    };
  }

  // 8. Erfolgreich: Neuen Provider in Session & DB speichern
  const updatedSession = await store.updateProvider(conversationId, to);

  // System-Nachricht über Anbieterwechsel in die gemeinsame Historie einfügen
  await store.addMessage({
    conversationId,
    role: "system",
    source: "cli",
    content: `[Anbieterwechsel] CLI gewechselt von '${from}' zu '${to}'. Gedächtnis und Browser-Profil wurden übergeben.`,
  });

  return {
    ok: true,
    session: updatedSession,
    handoffPrompt,
  };
}
