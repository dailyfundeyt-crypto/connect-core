/**
 * Die MCP-Tools, die jeder Agent über /api/agent-mcp/:id/tools/* anbietet.
 *
 * Ein Eintrag = ein Tool, das andere Agents/Tools aufrufen können. Die Liste
 * wächst mit jeder Stufe (Browser, Codex-CLI, Manus, Perplexity, GitHub).
 * Der Router kennt nur die Liste, also ist Erweitern eine Code-Zeile.
 *
 * `inputSchema` ist JSON-Schema, wie MCP-Clients es erwarten — Anthropic
 * Desktop, Codex-CLI, Manus, alle parsen das hier.
 */

export type AgentMcpContext = {
  agentId: string;
  actorId: string;
  deps: {
    lookupAgent: (agentId: string) => Promise<{
      id: string;
      name: string;
      title: string | null;
      model: string | null;
      systemPrompt: string | null;
    } | null>;
    invokeChat: (input: {
      agentId: string;
      prompt: string;
      attachments?: Array<{ name: string; contentType: string; dataUrl: string }>;
    }) => Promise<string>;
    invokeSteer: (input: {
      agentId: string;
      instruction: string;
    }) => Promise<{ delivered: boolean; reason?: string }>;
    invokeQuery: (input: {
      agentId: string;
      question: string;
    }) => Promise<string>;
    listBrowserTabs: (input: {
      agentId: string;
    }) => Promise<Array<{
      tabId: string;
      url: string | null;
      title: string | null;
      openedAt: string;
    }>>;
    /**
     * Antigravity-CLI als Sub-Runner aufrufen. Optional: wenn der Server
     * die CLI nicht eingebunden hat, fällt das Tool auf einen ehrlichen
     * Stub zurück (siehe mcp-tools.ts).
     */
    invokeAntigravity?: (input: {
      agentId: string;
      task: string;
      model: string;
      allowWrite: boolean;
    }) => Promise<string>;
  };
};

export type AgentMcpToolResult =
  | { content: Array<{ type: "text"; text: string }>; isError?: false }
  | { content: Array<{ type: "text"; text: string }>; isError: true };

export type AgentMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (ctx: AgentMcpContext, args: Record<string, unknown>) => Promise<AgentMcpToolResult>;
};

function text(text: string): AgentMcpToolResult {
  return { content: [{ type: "text", text }] };
}

function error(text: string): AgentMcpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function readString(args: Record<string, unknown>, key: string, label = key): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Argument "${label}" ist erforderlich und muss ein nicht-leerer String sein.`);
  }
  return value;
}

export const agentMcpTools: AgentMcpTool[] = [
  {
    name: "chat",
    description:
      "Schickt dem Agenten eine Nachricht und liefert seine Antwort. " +
      "Andere Agents/Tools rufen das auf, um mit diesem Agenten zu reden — " +
      "wie ein Side-Kick im Team-Chat.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Die Nachricht an den Agenten." },
        attachments: {
          type: "array",
          description: "Optional: Dateien (Name, MIME-Type, Data-URL) als Anhang.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              contentType: { type: "string" },
              dataUrl: { type: "string" },
            },
            required: ["name", "contentType", "dataUrl"],
          },
        },
      },
      required: ["prompt"],
    },
    handler: async (ctx, args) => {
      const prompt = readString(args, "prompt");
      const rawAttachments = args.attachments;
      const attachments = Array.isArray(rawAttachments)
        ? rawAttachments
            .filter(
              (a): a is { name: unknown; contentType: unknown; dataUrl: unknown } =>
                a !== null && typeof a === "object",
            )
            .map((a) => ({
              name: String(a.name ?? "attachment"),
              contentType: String(a.contentType ?? "application/octet-stream"),
              dataUrl: String(a.dataUrl ?? ""),
            }))
            .filter((a) => a.dataUrl.length > 0)
        : undefined;
      const reply = await ctx.deps.invokeChat({
        agentId: ctx.agentId,
        prompt,
        ...(attachments ? { attachments } : {}),
      });
      return text(reply);
    },
  },

  {
    name: "steer",
    description:
      "Lenkt eine laufende Konversation dieses Agenten um — wie ein flüstern " +
      "über die Schulter. Liefert delivered=false, wenn der Agent gerade idle ist.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Die Anweisung, die der Agent umsetzen soll.",
        },
      },
      required: ["instruction"],
    },
    handler: async (ctx, args) => {
      const instruction = readString(args, "instruction");
      const result = await ctx.deps.invokeSteer({
        agentId: ctx.agentId,
        instruction,
      });
      if (result.delivered) {
        return text("Anweisung wurde an die laufende Konversation übermittelt.");
      }
      return text(
        `Anweisung nicht übermittelt: ${result.reason ?? "der Agent ist gerade idle."}`,
      );
    },
  },

  {
    name: "query",
    description:
      "Stellt dem Agenten eine einmalige Frage — ohne History, ohne Kontext " +
      "aus früheren Nachrichten. Nützlich für Fact-Checks oder schnelles Nachschlagen.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Die Frage an den Agenten." },
      },
      required: ["question"],
    },
    handler: async (ctx, args) => {
      const question = readString(args, "question");
      const answer = await ctx.deps.invokeQuery({
        agentId: ctx.agentId,
        question,
      });
      return text(answer);
    },
  },

  {
    name: "profile",
    description:
      "Liest das Profil des Agenten — Name, Titel, Modell und welche Tools er " +
      "anbietet. Nützlich, um zu entscheiden, welchen Agenten man anspricht.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (ctx) => {
      const agent = await ctx.deps.lookupAgent(ctx.agentId);
      if (!agent) return error("Agent nicht gefunden.");
      return text(
        [
          `Name: ${agent.name}`,
          `Titel: ${agent.title ?? "(keiner)"}`,
          `Modell: ${agent.model ?? "(nicht konfiguriert)"}`,
          `ID: ${agent.id}`,
          `System-Prompt Länge: ${agent.systemPrompt?.length ?? 0} Zeichen`,
          `Tools: chat, steer, query, profile, list_browser_tabs`,
        ].join("\n"),
      );
    },
  },

  {
    name: "list_browser_tabs",
    description:
      "Listet die Browser-Tabs, die diesem Agenten gehören — also sein " +
      "eigener Browser-Tab mit persistiertem Profil. Jeder Agent hat einen.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (ctx) => {
      const tabs = await ctx.deps.listBrowserTabs({ agentId: ctx.agentId });
      if (tabs.length === 0) {
        return text(
          "Kein Browser-Tab offen für diesen Agent. Der Tab wird beim ersten Klick auf „Browser“ angelegt und bekommt ein eigenes persistentes Profil.",
        );
      }
      return text(
        tabs
          .map(
            (t, i) =>
              `${i + 1}. ${t.title ?? "(kein Titel)"}\n   ${t.url ?? "(keine URL)"}\n   seit ${t.openedAt}`,
          )
          .join("\n\n"),
      );
    },
  },

  /**
   * Antigravity-CLI als Sub-Runner.
   *
   * Antigravity (`agy`) hat ein eingebautes Browser-Tool: der Agent
   * klickt selbst, sobald der Prompt Web-Aktionen braucht. Wir exposieren
   * das als MCP-Tool, damit ein anderer Agent (z.B. Hermes-CTO) eine
   * Aufgabe an Antigravity delegieren kann, ohne den vollen Chat zu öffnen.
   *
   * Stufe 2a: Stub. Stufe 2.1+ ersetzt das durch einen echten
   * `runCli({ kind: "antigravity", ... })`-Aufruf und streamt das
   * Ergebnis zurück. Heute sagen wir ehrlich, was passieren wird.
   */
  {
    name: "antigravity_run",
    description:
      "Startet die Antigravity-CLI (agy) als Sub-Runner — ideal für " +
      "Recherche- und Schreib-Tasks, die Browser-Use brauchen. Die CLI " +
      "hat ein eingebautes Browser-Tool: der Agent klickt selbst, sobald " +
      "der Prompt Web-Aktionen braucht.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Die Aufgabe, die Antigravity erledigen soll.",
        },
        model: {
          type: "string",
          description:
            "Optionales Modell. Default „auto“ überlässt der CLI die Wahl. " +
            "Andere Optionen: gemini-3.8-flash-high/medium/low, " +
            "gemini-3.7-flash-high/medium/low, gemini-3.1-pro-high/low.",
        },
        allowWrite: {
          type: "boolean",
          description:
            "Wenn true, darf Antigravity Dateien schreiben (sandbox=on). " +
            "Default false: read-only.",
        },
      },
      required: ["task"],
    },
    handler: async (ctx, args) => {
      const task = readString(args, "task");
      const model = typeof args.model === "string" && args.model.length > 0 ? args.model : "auto";
      const allowWrite = Boolean(args.allowWrite);
      // Stufe 2a: ehrlicher Stub. Die volle Anbindung kommt in 2.1+,
      // dann wird invokeAntigravity durch einen echten runCli-Aufruf
      // ersetzt.
      if (typeof ctx.deps.invokeAntigravity === "function") {
        try {
          const result = await ctx.deps.invokeAntigravity({
            agentId: ctx.agentId,
            task,
            model,
            allowWrite,
          });
          return text(result);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught);
          return error(message);
        }
      }
      return text(
        [
          "[Antigravity-Stub]",
          "",
          "Diese Session hat die Antigravity-CLI noch nicht eingebunden.",
          "Stufe 2.1+ ersetzt diesen Stub durch den echten Aufruf:",
          "",
          `   runCli({ kind: "antigravity", model: "${model}", allowWrite: ${allowWrite}, ... })`,
          "",
          "Aufgabe, die an Antigravity gehen würde:",
          task.length > 200 ? `${task.slice(0, 200)}…` : task,
        ].join("\n"),
      );
    },
  },
];
