/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Tests
 *
 * Akzeptanzkriterien:
 *  - Test mit langem Beispielverlauf → alle Pflichtabschnitte vorhanden
 *  - Keine Secrets in der Zusammenfassung (Filter)
 *  - Gleicher Provider/Modell wie der Agent (Standard), optional günstigeres Modell
 *  - Grenze: Übergabe ≤ 8 000 Tokens; Text im Chat sichtbar und bearbeitbar
 *  - Letzte Nutzerbitte exakt und wörtlich zitiert
 *  - Hinter dem passenden Feature-Flag (A01); Flag aus = altes Verhalten
 */

import { describe, expect, it } from "bun:test";
import { resolveSummarizerModel } from "./model-selector.js";
import { parseHandoffResponse, renderHandoffMarkdown } from "./parser.js";
import { extractLastUserRequest } from "./prompt.js";
import { filterSecrets } from "./secrets-filter.js";
import { SummarizerSubAgent } from "./subagent.js";
import { enforceTokenBudget, estimateTokens, MAX_HANDOFF_TOKENS } from "./token-counter.js";
import type { IT3RpcSummarizerClient, SummarizerMessage } from "./types.js";

describe("A16: Komprimierungs-Sub-Agent", () => {
  /* -------------------------------------------------------------------------------------- *
   * 1. Feste Übergabe-Struktur & Pflichtabschnitte
   * -------------------------------------------------------------------------------------- */
  describe("Pflichtabschnitte (7-teilige Gliederung)", () => {
    it("AKZEPTANZKRITERIUM: Test mit langem Beispielverlauf → alle 7 Pflichtabschnitte vorhanden", async () => {
      // Simuliere einen langen, komplexen Entwicklerverlauf
      const longHistory: SummarizerMessage[] = [
        {
          role: "user",
          content:
            "Wir integrieren T3-Code in Connect. Ziel ist es, dass jeder Connect-Agent ein dauerhaftes Gespräch führt und alle 100.000 Tokens automatisch der Kontext rotiert wird.",
        },
        {
          role: "assistant",
          content:
            "Verstanden. Ich habe die Architektur analysiert. Wir benötigen die Brücken-Verbindung über den Sidecar auf Port 3773.",
        },
        {
          role: "user",
          content:
            "Architektur-Entscheidung: Wir nutzen Bun + Hono und kommunizieren über WebSockets via Effect-RPC mit dem T3-Sidecar.",
        },
        {
          role: "assistant",
          content:
            "Ich habe apps/server/src/t3-bridge/rpc angelegt und 29 Unit-Tests geschrieben. Alles läuft fehlerfrei.",
          toolCalls: [
            {
              name: "bun test apps/server/src/t3-bridge/rpc",
              output: "29 pass, 0 fail",
            },
          ],
        },
        {
          role: "user",
          content:
            "Stil-Hinweis: Antworte immer auf Deutsch, halte die Connect-Designvorgaben ein und lege vor Änderungen Backups (.bak-helium) an.",
        },
        {
          role: "assistant",
          content:
            "Ich halte alle Stilregeln ein. Als Nächstes steht die Kontext-Rotation und der Komprimierungs-Sub-Agent an.",
        },
        {
          role: "user",
          content:
            "Wichtig: Implementiere jetzt bitte den Komprimierungs-Sub-Agenten in Lane A16 mit allen 7 Pflichtabschnitten!",
        },
      ];

      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: true });

      const result = await agent.summarize({
        agentId: "agent-hermes-01",
        provider: "claudeAgent",
        model: "claude-3-7-sonnet",
        history: longHistory,
        generation: 0,
      });

      expect(result.success).toBe(true);
      expect(result.summary).toBeTruthy();

      // Prüfe, ob alle 7 Pflicht-Überschriften im gerenderten Markdown vorkommen
      expect(result.summary).toContain("### 1. Ziel");
      expect(result.summary).toContain("### 2. Stand");
      expect(result.summary).toContain("### 3. Entscheidungen");
      expect(result.summary).toContain("### 4. Offene Aufgaben");
      expect(result.summary).toContain("### 5. Wichtige Dateien und Pfade");
      expect(result.summary).toContain("### 6. Stil-Hinweise");
      expect(result.summary).toContain("### 7. Letzte Nutzerbitte (wörtlich)");

      // Prüfe strukturierte Felder
      expect(result.sections.goal.length).toBeGreaterThan(0);
      expect(result.sections.currentState.length).toBeGreaterThan(0);
      expect(result.sections.decisions.length).toBeGreaterThan(0);
      expect(result.sections.openTasks.length).toBeGreaterThan(0);
      expect(result.sections.importantFiles.length).toBeGreaterThan(0);
      expect(result.sections.styleNotes.length).toBeGreaterThan(0);
      expect(result.sections.lastUserRequest.length).toBeGreaterThan(0);
    });

    it("AKZEPTANZKRITERIUM: Letzte Nutzerbitte wird EXAKT und WÖRTLICH übernommen", async () => {
      const verbatimRequest =
        "Stefan sagt: Bitte stelle sicher, dass Token-Zahlen und Limits auf keinen Fall verloren gehen!";

      const history: SummarizerMessage[] = [
        { role: "user", content: "Hallo Agent, starte das Projekt." },
        { role: "assistant", content: "Projekt gestartet." },
        { role: "user", content: verbatimRequest },
      ];

      const extracted = extractLastUserRequest(history);
      expect(extracted).toBe(verbatimRequest);

      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: true });
      const result = await agent.summarize({
        agentId: "test-agent",
        provider: "codex",
        model: "gpt-4o",
        history,
      });

      expect(result.sections.lastUserRequest).toBe(verbatimRequest);
      expect(result.summary).toContain(verbatimRequest);
    });

    it("Synthetisiert fehlende Abschnitte defensiv, falls LLM-Ausgabe unvollständig ist", () => {
      const incompleteLlmOutput = `### 1. Ziel
Projektziel umsetzen.

### 2. Stand
Erste Schritte fertig.`;

      const parsed = parseHandoffResponse(incompleteLlmOutput, {
        verbatimLastUserRequest: "Mach bitte mit Schritt 3 weiter.",
      });

      expect(parsed.goal).toBe("Projektziel umsetzen.");
      expect(parsed.currentState).toBe("Erste Schritte fertig.");
      // Fehlende Abschnitte wurden defensiv ergänzt:
      expect(parsed.decisions.length).toBeGreaterThan(0);
      expect(parsed.openTasks.length).toBeGreaterThan(0);
      expect(parsed.importantFiles.length).toBeGreaterThan(0);
      expect(parsed.styleNotes.length).toBeGreaterThan(0);
      expect(parsed.lastUserRequest).toBe("Mach bitte mit Schritt 3 weiter.");

      const rendered = renderHandoffMarkdown(parsed);
      expect(rendered).toContain("### 1. Ziel");
      expect(rendered).toContain("### 7. Letzte Nutzerbitte (wörtlich)");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 2. Secret-Filterung (Keine Secrets in der Zusammenfassung)
   * -------------------------------------------------------------------------------------- */
  describe("Secret-Filter (Keine Secrets in der Zusammenfassung)", () => {
    it("AKZEPTANZKRITERIUM: Filtert alle gängigen API-Keys, Tokens und Passwörter heraus", () => {
      const textWithSecrets = `
Hier sind sensible Zugangsdaten:
OpenAI Key: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234
Anthropic Key: sk-ant-api03-abcdef1234567890abcdef1234567890
Gemini Key: AIzaSyD-1234567890abcdefghijklmnopqrst
GitHub Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz
AWS Access Key: AKIAIOSFODNN7EXAMPLE
Bearer Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMC6Y9nTcqXd40MMMVEQ5RINDuPa
Slack Token: xoxb-123456789012-1234567890123-abcdefghijklmnop
DB URI: postgres://postgres:SuperSecretPassword123@localhost:5432/connect_prod
Umgebungsvariable: KEY_ENCRYPTION_KEY=my_ultra_secret_key_998877
Pairing URL: https://connect.local/pair#token=abcdef12345678901234567890
`;

      const result = filterSecrets(textWithSecrets);

      expect(result.redactedCount).toBeGreaterThanOrEqual(10);
      expect(result.text).not.toContain("sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234");
      expect(result.text).not.toContain("sk-ant-api03-abcdef1234567890abcdef1234567890");
      expect(result.text).not.toContain("AIzaSyD-1234567890abcdefghijklmnopqrst");
      expect(result.text).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyz");
      expect(result.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(result.text).not.toContain("SuperSecretPassword123");
      expect(result.text).not.toContain("my_ultra_secret_key_998877");
      expect(result.text).not.toContain("abcdef12345678901234567890");

      expect(result.text).toContain("[REDACTED_API_KEY]");
      expect(result.text).toContain("[REDACTED_PASSWORD]");
      expect(result.text).toContain("[REDACTED_KEY_ENCRYPTION_KEY]");
    });

    it("AKZEPTANZKRITERIUM: Filtert Private Keys vollständig heraus", () => {
      const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+abcdefghijklmnopqrstuvwxyz1234567890
MIIEowIBAAKCAQEA0Y1+abcdefghijklmnopqrstuvwxyz1234567890
-----END RSA PRIVATE KEY-----`;

      const result = filterSecrets(`Zertifikat: ${privateKey}`);
      expect(result.text).not.toContain("MIIEowIBAAKCAQEA0Y1+");
      expect(result.text).toContain("[REDACTED_PRIVATE_KEY]");
    });

    it("Sub-Agent schwärzt Secrets sowohl im Input als auch in der finalen Zusammenfassung", async () => {
      const historyWithSecret: SummarizerMessage[] = [
        {
          role: "user",
          content: "Ich habe den OpenAI-Key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz im Terminal hinterlegt.",
        },
        {
          role: "assistant",
          content: "Alles klar, ich nutze ihn für den Test.",
        },
        {
          role: "user",
          content: "Letzter Schritt: Starte den Server.",
        },
      ];

      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: true });
      const result = await agent.summarize({
        agentId: "agent-sec",
        provider: "codex",
        model: "gpt-4o",
        history: historyWithSecret,
      });

      expect(result.success).toBe(true);
      expect(result.summary).not.toContain("sk-proj-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(result.redactedSecretsCount).toBeGreaterThan(0);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 3. Modell-Auswahl (Gleicher Provider/Modell, optional günstiger)
   * -------------------------------------------------------------------------------------- */
  describe("Modell-Auswahl", () => {
    it("AKZEPTANZKRITERIUM: Standardmäßig exakt gleicher Provider und gleiches Modell wie der Agent", () => {
      const resolvedCodex = resolveSummarizerModel({
        provider: "codex",
        agentModel: "gpt-4o",
      });
      expect(resolvedCodex.provider).toBe("codex");
      expect(resolvedCodex.model).toBe("gpt-4o");
      expect(resolvedCodex.isCheaperModel).toBe(false);

      const resolvedClaude = resolveSummarizerModel({
        provider: "claudeAgent",
        agentModel: "claude-3-7-sonnet",
      });
      expect(resolvedClaude.provider).toBe("claudeAgent");
      expect(resolvedClaude.model).toBe("claude-3-7-sonnet");
      expect(resolvedClaude.isCheaperModel).toBe(false);
    });

    it("AKZEPTANZKRITERIUM: Optional günstigeres Modell desselben Providers", () => {
      // Claude: sonnet -> haiku
      const cheapClaude = resolveSummarizerModel({
        provider: "claudeAgent",
        agentModel: "claude-3-5-sonnet",
        useCheaperModel: true,
      });
      expect(cheapClaude.provider).toBe("claudeAgent");
      expect(cheapClaude.model).toBe("claude-3-5-haiku");
      expect(cheapClaude.isCheaperModel).toBe(true);

      // Codex: gpt-4o -> gpt-4o-mini
      const cheapCodex = resolveSummarizerModel({
        provider: "codex",
        agentModel: "gpt-4o",
        useCheaperModel: true,
      });
      expect(cheapCodex.provider).toBe("codex");
      expect(cheapCodex.model).toBe("gpt-4o-mini");
      expect(cheapCodex.isCheaperModel).toBe(true);

      // Grok: grok-2 -> grok-2-mini
      const cheapGrok = resolveSummarizerModel({
        provider: "grok",
        agentModel: "grok-2",
        useCheaperModel: true,
      });
      expect(cheapGrok.provider).toBe("grok");
      expect(cheapGrok.model).toBe("grok-2-mini");
      expect(cheapGrok.isCheaperModel).toBe(true);
    });

    it("Vorgabe aus ContextPolicy.summarizerModel hat Vorrang", () => {
      const policyModel = resolveSummarizerModel({
        provider: "codex",
        agentModel: "gpt-4o",
        policy: { thresholdTokens: 100_000, summarizerModel: "custom-cheaper-model", showSummary: true, keepOldThreadsReadable: true },
        useCheaperModel: false,
      });
      expect(policyModel.model).toBe("custom-cheaper-model");
      expect(policyModel.isCheaperModel).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 4. Token-Grenze (≤ 8 000 Tokens)
   * -------------------------------------------------------------------------------------- */
  describe("Token-Grenze (≤ 8 000 Tokens)", () => {
    it("AKZEPTANZKRITERIUM: Einhaltung der Obergrenze von 8 000 Tokens", () => {
      const normalText = `### 1. Ziel\nProjektziel.\n\n### 7. Letzte Nutzerbitte (wörtlich)\nBitte fortfahren.`;
      expect(estimateTokens(normalText)).toBeLessThan(MAX_HANDOFF_TOKENS);

      // Simuliere einen riesigen Text (z. B. 12.000 Tokens)
      const giantContent = "Sehr lange Log-Ausgabe mit vielen Token-Details und Stacktraces. ".repeat(2000);
      const giantMarkdown = `### 1. Ziel
Wichtiges Hauptziel.

### 2. Stand
${giantContent}

### 3. Entscheidungen
- Entscheidung 1

### 4. Offene Aufgaben
- Aufgabe 1

### 5. Wichtige Dateien und Pfade
- pfad/zur/datei.ts

### 6. Stil-Hinweise
- Präzise bleiben

### 7. Letzte Nutzerbitte (wörtlich)
Dies ist die allerletzte Bitte des Nutzers.
`;

      const initialTokens = estimateTokens(giantMarkdown);
      expect(initialTokens).toBeGreaterThan(8000);

      // Kürze auf Budget
      const trimmed = enforceTokenBudget(giantMarkdown, 8000);
      const trimmedTokens = estimateTokens(trimmed);

      expect(trimmedTokens).toBeLessThanOrEqual(8000);
      // Wichtig: Ziel und letzte Nutzerbitte bleiben erhalten
      expect(trimmed).toContain("### 1. Ziel");
      expect(trimmed).toContain("Wichtiges Hauptziel.");
      expect(trimmed).toContain("### 7. Letzte Nutzerbitte (wörtlich)");
      expect(trimmed).toContain("Dies ist die allerletzte Bitte des Nutzers.");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 5. Feature-Flag Guard
   * -------------------------------------------------------------------------------------- */
  describe("Feature-Flag Guard (A01)", () => {
    it("AKZEPTANZKRITERIUM: Blockiert Ausführung sauber, wenn Feature-Flag aus ist", async () => {
      // Explizit OHNE bypassFlagCheckForTests
      // Stelle sicher, dass Flag aus ist
      (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: false, contextRotation: false };

      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: false });
      const result = await agent.summarize({
        agentId: "flag-test-agent",
        provider: "codex",
        model: "gpt-4o",
        history: [{ role: "user", content: "Test" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Feature-Flag");
      expect(result.summary).toBe("");

      delete (globalThis as any).__CONNECT_FLAGS_T3;
    });

    it("Führt Ausführung durch, wenn Feature-Flag aktiv ist", async () => {
      (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: true, contextRotation: true };

      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: false });
      const result = await agent.summarize({
        agentId: "flag-test-agent-active",
        provider: "codex",
        model: "gpt-4o",
        history: [{ role: "user", content: "Hallo" }],
      });

      expect(result.success).toBe(true);
      expect(result.summary).toContain("### 1. Ziel");

      delete (globalThis as any).__CONNECT_FLAGS_T3;
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 6. Mock-RPC Integration
   * -------------------------------------------------------------------------------------- */
  describe("T3-RPC Sub-Agent Aufruf", () => {
    it("Startet Sub-Agenten-Turn über Mock-RPC Client", async () => {
      let createdThreadPayload: any = null;
      let startedTurnPayload: any = null;

      const mockRpc: IT3RpcSummarizerClient = {
        async createThread(cmd) {
          createdThreadPayload = cmd;
          return { ok: true };
        },
        async startTurn(cmd) {
          startedTurnPayload = cmd;
          return {
            text: `### 1. Ziel
RPC Ziel erreicht.

### 2. Stand
RPC Stand aktualisiert.

### 3. Entscheidungen
- Entscheidung via RPC

### 4. Offene Aufgaben
- Aufgabe via RPC

### 5. Wichtige Dateien und Pfade
- rpc/datei.ts

### 6. Stil-Hinweise
- Stil via RPC

### 7. Letzte Nutzerbitte (wörtlich)
Wörtliche Bitte aus dem Mock.`,
          };
        },
      };

      const agent = new SummarizerSubAgent({
        rpcClient: mockRpc,
        bypassFlagCheckForTests: true,
      });

      const result = await agent.summarize({
        agentId: "rpc-agent-01",
        provider: "codex",
        model: "gpt-4o",
        history: [{ role: "user", content: "Wörtliche Bitte aus dem Mock." }],
      });

      expect(result.success).toBe(true);
      expect(createdThreadPayload).not.toBeNull();
      expect(createdThreadPayload.interactionMode).toBe("subagent");
      expect(startedTurnPayload).not.toBeNull();
      expect(startedTurnPayload.text).toContain("### 1. Ziel");
      expect(result.summary).toContain("RPC Ziel erreicht.");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 7. Hilfsfunktionen, Konvertierung & Randfälle
   * -------------------------------------------------------------------------------------- */
  describe("Zusätzliche Integrationen & Randfälle", () => {
    it("Verarbeitet gemischte ConnectChatItem- und T3MessageRecord-Eingaben nahtlos", async () => {
      const mixedHistory = [
        {
          kind: "text",
          role: "user",
          text: "Erstelle die SQLite-Tabelle für die Notizen.",
          createdAt: "2026-10-29T10:00:00Z",
        },
        {
          kind: "tool",
          type: "db_migrate",
          title: "create table notes",
          output: "Table notes created successfully",
        },
        {
          role: "assistant",
          text: "Die Tabelle wurde angelegt und indiziert.",
          createdAt: "2026-10-29T10:01:00Z",
        },
        {
          kind: "text",
          role: "user",
          text: "Bitte schreibe jetzt die Drizzle-Queries dazu.",
          createdAt: "2026-10-29T10:02:00Z",
        },
      ];

      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: true });
      const result = await agent.summarize({
        agentId: "agent-mixed",
        provider: "freebuff",
        model: "gemini-1.5-pro",
        history: mixedHistory,
      });

      expect(result.success).toBe(true);
      expect(result.sections.lastUserRequest).toBe("Bitte schreibe jetzt die Drizzle-Queries dazu.");
      expect(result.summary).toContain("### 1. Ziel");
      expect(result.summary).toContain("### 7. Letzte Nutzerbitte (wörtlich)");
    });

    it("Behandelt leere Verläufe robust und ohne Absturz", async () => {
      const agent = new SummarizerSubAgent({ bypassFlagCheckForTests: true });
      const result = await agent.summarize({
        agentId: "empty-agent",
        provider: "hermes",
        model: "hermes-3-llama-3.1-405b",
        history: [],
      });

      expect(result.success).toBe(true);
      expect(result.sections.lastUserRequest).toBe("(Keine vorherige Nutzerbitte im Verlauf)");
      expect(result.summary).toContain("### 1. Ziel");
      expect(result.summary).toContain("### 7. Letzte Nutzerbitte (wörtlich)");
    });

    it("Unterstützt benutzerdefinierte llmRunner-Funktionen", async () => {
      let passedPrompt = "";
      let passedModel = "";
      let passedProvider = "";

      const agent = new SummarizerSubAgent({
        bypassFlagCheckForTests: true,
        llmRunner: async (prompt, model, provider) => {
          passedPrompt = prompt;
          passedModel = model;
          passedProvider = provider;
          return `### 1. Ziel
Custom LLM Ziel.

### 2. Stand
Custom Stand.

### 3. Entscheidungen
- Custom Entscheidung

### 4. Offene Aufgaben
- Custom Aufgabe

### 5. Wichtige Dateien und Pfade
- custom/file.ts

### 6. Stil-Hinweise
- Custom Stil

### 7. Letzte Nutzerbitte (wörtlich)
Eigene Bitte.`;
        },
      });

      const result = await agent.summarize({
        agentId: "custom-llm-agent",
        provider: "codex",
        model: "gpt-4o",
        history: [{ role: "user", content: "Eigene Bitte." }],
      });

      expect(result.success).toBe(true);
      expect(passedModel).toBe("gpt-4o");
      expect(passedProvider).toBe("codex");
      expect(passedPrompt).toContain("Eigene Bitte.");
      expect(result.summary).toContain("Custom LLM Ziel.");
      expect(result.sections.lastUserRequest).toBe("Eigene Bitte.");
    });
  });
});
