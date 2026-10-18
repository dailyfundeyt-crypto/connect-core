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
 * Stufe 1.1: Liest die CLI-Engine-Konfiguration aus dem Agent-Profil
 * und führt den Prompt über die CLI aus (oder den Stub, wenn keine Engine).
 */
function buildChat(
  database: Database | undefined,
  store: AgentProfileStore | undefined,
): AgentChatInvoke {
  return async ({ agentId, prompt }) => {
    if (!database) throw new Error("Datenbank ist nicht konfiguriert.");
    const profile = store ? await store.get({ id: "system", role: "admin" }, agentId) : null;
    const engine = profile?.engine;
    if (engine) {
      // Stufe 1.1+: echter CLI-Run
      let collected = "";
      try {
        for await (const event of runCli({
          kind: engine.kind,
          model: engine.model,
          agentId,
          prompt,
          allowWrite: engine.allowWrite,
        })) {
          if (event.text) collected += event.text;
          if (event.error) {
            throw new Error(event.error);
          }
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      return collected.trim() || "(keine Antwort erhalten.)";
    }
    // Fallback: Stub (bis Stufe 1.1+ den echten Turn-Runner einbaut)
    return runTurn({ database, agentId, prompt, ephemeral: false });
  };
}

/**
 * Stufe 1.1: einmalige Frage, kein History. Nutzt die CLI wenn konfiguriert.
 */
function buildQuery(
  database: Database | undefined,
  store: AgentProfileStore | undefined,
): AgentQueryInvoke {
  return async ({ agentId, question }) => {
    if (!database) throw new Error("Datenbank ist nicht konfiguriert.");
    const profile = store ? await store.get({ id: "system", role: "admin" }, agentId) : null;
    const engine = profile?.engine;
    if (engine) {
      let collected = "";
      try {
        for await (const event of runCli({
          kind: engine.kind,
          model: engine.model,
          agentId,
          prompt: question,
          allowWrite: engine.allowWrite,
        })) {
          if (event.text) collected += event.text;
          if (event.error) throw new Error(event.error);
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      return collected.trim() || "(keine Antwort erhalten.)";
    }
    return runTurn({ database, agentId, prompt: question, ephemeral: true });
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
