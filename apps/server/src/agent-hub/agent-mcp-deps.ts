/**
 * Die Implementation der `AgentMcpDeps`, die der Server-Router
 * `/api/agent-mcp/*` als Tür benutzt.
 *
 * Stand Stufe 1: `chat` und `query` delegieren an die bestehende
 * `createTurnRunner`-Routine (siehe `routines/run-turn.ts`), `steer` ist
 * ein Stub (schreibt eine Notiz, die der Turn-Runner vor dem User-Prompt
 * liest), und `list_browser_tabs` fragt die Tabelle `agent_browser_tabs` ab.
 *
 * Spätere Stufen ersetzen `list_browser_tabs` durch den echten
 * `computer/gateway.ts` und fügen `codex_run` etc. hinzu.
 */
import { runTurn } from "../routines/run-turn-helper";
import { agentBrowserTabs } from "../db/schema";
import type { Database } from "../db/client";
import { runCli } from "./cli-model";
import { runManus } from "./manus-engine";
import { runBrowserUse, navigateBrowserUse } from "./browser-use-sidecar";
import type {
  AgentAntigravityInvoke,
  AgentBrowserTabsInvoke,
  AgentChatInvoke,
  AgentMcpDeps,
  AgentProfileLookup,
  AgentQueryInvoke,
  AgentSteerInvoke,
} from "./agent-mcp-routes";
import { eq } from "drizzle-orm";
import type { AgentProfileStore } from "../agents/profile-store";
import type { AgentProfile } from "../agents/profile-types";

const STEER_NOTES = new Map<string, string[]>();

/**
 * Liest ein Agent-Profil über den `AgentProfileStore` — derselbe Pfad, den
 * auch der Roster und die Runtime benutzen.
 */
function buildLookup(store: AgentProfileStore | undefined): AgentProfileLookup {
  return async (agentId) => {
    if (!store) return null;
    const profile = await store.get({ id: "system", role: "admin" }, agentId);
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name,
      title: profile.title || null,
      model: profile.endpoint ? "remote" : "built-in",
      systemPrompt: profile.roleDescription,
    };
  };
}

/**
 * Stufe 2 Phase G: Führt den Prompt mit der konfigurierten Engine aus.
 *
 * - CLI-Engine → runCli
 * - Browser-Profile-Engine → Browser-Navigation zu startUrl, dann runCli
 *   (oder Stub wenn keine CLI konfiguriert)
 * - Keine Engine → Stub
 */
async function executeEnginePrompt(
  input: { agentId: string; prompt: string; engine: AgentProfile["engine"]; database: Database | undefined },
): Promise<string> {
  if (!input.engine) {
    // Keine Engine: Stub
    if (!input.database) throw new Error("Datenbank ist nicht konfiguriert.");
    return runTurn({ database: input.database, agentId: input.agentId, prompt: input.prompt, ephemeral: false });
  }
  if (input.engine.kind === "browser_profile") {
    // Browser-Profile-Engine: zuerst zu startUrl navigieren
    const { ensureAgentChromeRunning, cdpNavigate, cdpPortFor } = await import("./agent-cdp");
    const { listBrowserTabsFor } = await import("./agent-browser");
    if (input.database) {
      const tabs = await listBrowserTabsFor(input.database, input.agentId);
      const myTab = tabs.find((t) => !t.closedAt);
      if (myTab && input.engine.startUrl) {
        try {
          await ensureAgentChromeRunning(myTab.profileDir);
          await cdpNavigate(cdpPortFor(myTab.profileDir), input.engine.startUrl);
        } catch (err) {
          // Navigation-Fehler ist nicht fatal — wir führen den Chat trotzdem aus
          console.warn(`[agent-mcp] browser-navigate failed:`, err);
        }
      }
    }
    // Browser-Profile ohne CLI → Stub mit Hinweis
    return `[Browser-Profile-Engine: ${input.engine.profileName}]\n\nBrowser ist geladen (${input.engine.startUrl}).\n\nDer Prompt kann jetzt über die Browser-Steuerung an den User gegeben werden:\n\n${input.prompt}\n\n(Hinweis: aktuell ist keine CLI parallel konfiguriert — der Browser-Profile-Modus ist read-only.)`;
  }
  if (input.engine.kind === "manus") {
    // Stufe 3: Manus-Cloud-Engine — Server ruft Manus-API auf.
    return runManus({
      agentId: input.agentId,
      prompt: input.prompt,
      model: input.engine.model,
      profileName: input.engine.profileName,
    });
  }
  if (input.engine.kind === "browser_use") {
    // Stufe 3: browser-use Sidecar — Server ruft den lokalen Sidecar.
    if (input.engine.startUrl) {
      // Vor dem Task zur Start-URL navigieren
      try {
        await navigateBrowserUse(input.engine.startUrl);
      } catch (err) {
        console.warn(`[agent-mcp] browser-use navigate failed:`, err);
      }
    }
    return runBrowserUse({
      agentId: input.agentId,
      prompt: input.prompt,
      allowWrite: input.engine.allowWrite,
    });
  }
  // CLI-Engine
  let collected = "";
  try {
    for await (const event of runCli({
      kind: input.engine.kind,
      model: input.engine.model,
      agentId: input.agentId,
      prompt: input.prompt,
      allowWrite: input.engine.allowWrite,
    })) {
      if (event.text) collected += event.text;
      if (event.error) throw new Error(event.error);
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  return collected.trim() || "(keine Antwort erhalten.)";
}

/**
 * Stufe 1.1 + 2: Liest die Engine-Konfiguration aus dem Agent-Profil
 * und führt den Prompt über die Engine aus.
 */
function buildChat(
  database: Database | undefined,
  store: AgentProfileStore | undefined,
): AgentChatInvoke {
  return async ({ agentId, prompt }) => {
    const profile = store ? await store.get({ id: "system", role: "admin" }, agentId) : null;
    if (!profile?.engine && !database) throw new Error("Datenbank ist nicht konfiguriert.");
    return executeEnginePrompt({
      agentId,
      prompt,
      engine: profile?.engine ?? null,
      database,
    });
  };
}

/**
 * Stufe 1.1 + 2: einmalige Frage, kein History. Nutzt die Engine.
 */
function buildQuery(
  database: Database | undefined,
  store: AgentProfileStore | undefined,
): AgentQueryInvoke {
  return async ({ agentId, question }) => {
    const profile = store ? await store.get({ id: "system", role: "admin" }, agentId) : null;
    if (!profile?.engine && !database) throw new Error("Datenbank ist nicht konfiguriert.");
    return executeEnginePrompt({
      agentId,
      prompt: question,
      engine: profile?.engine ?? null,
      database,
    });
  };
}

/**
 * Stufe 1: `steer` schreibt eine Notiz, die der Turn-Runner vor dem
 * User-Prompt sieht.
 */
function buildSteer(store: AgentProfileStore | undefined): AgentSteerInvoke {
  return async ({ agentId, instruction }) => {
    if (!store) throw new Error("Agent-Store ist nicht konfiguriert.");
    const list = STEER_NOTES.get(agentId) ?? [];
    list.push(instruction);
    while (list.length > 5) list.shift();
    STEER_NOTES.set(agentId, list);
    const agent = await buildLookup(store)(agentId);
    return { delivered: Boolean(agent) };
  };
}

/** Wird vom Turn-Runner gelesen, BEVOR der User-Prompt ins Modell geht. */
export function takeSteerNotes(agentId: string): string[] {
  const list = STEER_NOTES.get(agentId) ?? [];
  STEER_NOTES.delete(agentId);
  return list;
}

/**
 * Stufe 2a: listet die Tabs, die zu diesem Agent in `agent_browser_tabs` stehen.
 * Die Tabelle wird in Stufe 1.2 angelegt — bis dahin ist die Liste leer.
 */
function buildBrowserTabs(database: Database | undefined): AgentBrowserTabsInvoke {
  return async ({ agentId }) => {
    if (!database) return [];
    const rows = await database
      .select()
      .from(agentBrowserTabs)
      .where(eq(agentBrowserTabs.agentId, agentId));
    return rows.map((row) => ({
      tabId: row.tabId,
      url: row.url ?? null,
      title: row.title ?? null,
      openedAt: row.openedAt.toISOString(),
    }));
  };
}

/**
 * Stufe 2a: ruft die Antigravity-CLI (`agy`) auf. Die CLI hat ein
 * eingebautes Browser-Tool, also genügt es, den Task zu schicken — der
 * Agent klickt selbst, sobald er Web-Aktionen braucht.
 *
 * Wir sammeln alle `text`-Events zu einem einzigen String und geben den
 * zurück. Eine spätere Stufe (2.1+) kann das streamen, damit die
 * Frontend-UI live mitlesen kann.
 */
function buildAntigravity(): AgentAntigravityInvoke {
  return async ({ agentId, task, model, allowWrite }) => {
    let collected = "";
    try {
      for await (const event of runCli({
        kind: "antigravity",
        model,
        agentId,
        prompt: task,
        allowWrite,
      })) {
        if (event.text) collected += event.text;
        if (event.error) {
          // Wir werfen, statt den Fehler in den Text zu mischen — die
          // Tool-Handler zeichnen sonst einen erfolgreichen Call, der
          // aber Text mit Fehlermeldung enthält.
          throw new Error(event.error);
        }
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return collected.trim() || "(Antigravity hat ohne Text geantwortet.)";
  };
}

export function buildAgentMcpDeps(
  database: Database | undefined,
  profileStore: AgentProfileStore | undefined,
): AgentMcpDeps {
  return {
    lookupAgent: buildLookup(profileStore),
    invokeChat: buildChat(database, profileStore),
    invokeQuery: buildQuery(database, profileStore),
    invokeSteer: buildSteer(profileStore),
    listBrowserTabs: buildBrowserTabs(database),
    invokeAntigravity: buildAntigravity(),
  };
}
