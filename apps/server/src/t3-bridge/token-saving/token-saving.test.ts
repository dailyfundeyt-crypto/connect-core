/**
 * token-saving.test.ts — Umfassende Test-Suite für Token-Sparen (A14)
 *
 * Testet:
 *  - Alle 5 Einzelregeln (Befehlsausgaben, Duplikate, Anhänge, System-Prompt, Economy-Modell)
 *  - T3-Mechanismen (Session-Fortsetzung, Prompt-Cache-Gewinne, Slash-Befehl /compact)
 *  - Sicherheits-Invarianz: Nutzer-Text wird NIEMALS verändert
 *  - Vorher/Nachher-Messung und Ledger-Einträge mit Kennzeichen saving_applied
 *  - Feature-Flag Verhalten (bridge=false führt zu reinem Pass-Through)
 *  - Die 5 geforderten Beispiel-Turns mit gemessenen Einsparungen
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  TokenSavingOptimizer,
  truncateOutputText,
  truncateToolOutputs,
  deduplicateToolOutputs,
  hashToolOutput,
  optimizeAttachmentsForLocalCli,
  compactSystemPrompt,
  resolveEconomyModel,
  calculateAuxiliaryModelCostSavings,
  evaluateSessionContinuation,
  detectSlashCommand,
  estimateTokenCount,
  MockUsageLedgerClient,
  type TurnInputBundle,
} from "./index";

describe("A14: Token-Sparen", () => {
  let mockLedger: MockUsageLedgerClient;
  let optimizer: TokenSavingOptimizer;
  const originalFlags = (globalThis as { __CONNECT_FLAGS_T3?: unknown })
    .__CONNECT_FLAGS_T3;

  beforeEach(() => {
    // Feature-Flag für Tests aktivieren
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: true };
    mockLedger = new MockUsageLedgerClient();
    optimizer = new TokenSavingOptimizer({ enabled: true }, mockLedger);
  });

  afterEach(() => {
    // Wiederherstellen: sonst bleibt bridge=true für alle folgenden Testdateien.
    if (originalFlags === undefined) {
      delete (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3;
    } else {
      (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 =
        originalFlags;
    }
  });

  describe("Regel 1: Befehlsausgaben vor dem Weiterreichen kürzen", () => {
    it("belässt kurze Ausgaben (< 25 Zeilen) unverändert", () => {
      const shortText = "Zeile 1\nZeile 2\nZeile 3\nZeile 4\nZeile 5";
      const res = truncateOutputText(shortText);
      expect(res.wasTruncated).toBe(false);
      expect(res.savedTokens).toBe(0);
      expect(res.output).toBe(shortText);
    });

    it("kürzt lange Ausgaben (> 25 Zeilen) und behält Kopf und Fuß", () => {
      const lines: string[] = [];
      for (let i = 1; i <= 100; i++) {
        lines.push(`Log-Eintrag [Turn-Output] Zeile ${i}: Operation erfolgreich ausgeführt.`);
      }
      const longText = lines.join("\n");

      const res = truncateOutputText(longText, { maxLines: 25, headLines: 10, tailLines: 10 });
      expect(res.wasTruncated).toBe(true);
      expect(res.savedLines).toBe(80);
      expect(res.savedTokens).toBeGreaterThan(500);

      // Kopfzeilen müssen enthalten sein
      expect(res.output).toContain("Log-Eintrag [Turn-Output] Zeile 1:");
      expect(res.output).toContain("Log-Eintrag [Turn-Output] Zeile 10:");

      // Hinweis auf Auslassung vorhanden
      expect(res.output).toContain("80 Zeilen");
      expect(res.output).toContain("ausgeblendet");

      // Fußzeilen müssen enthalten sein
      expect(res.output).toContain("Log-Eintrag [Turn-Output] Zeile 91:");
      expect(res.output).toContain("Log-Eintrag [Turn-Output] Zeile 100:");

      // Mittelteil darf NICHT enthalten sein
      expect(res.output).not.toContain("Zeile 50:");
    });

    it("kürzt Tool-Outputs in einer Liste zuverlässig", () => {
      const lines = Array.from({ length: 60 }, (_, i) => `Output line ${i + 1}`);
      const toolOutputs = [
        { id: "1", toolName: "terminal", output: lines.join("\n") },
        { id: "2", toolName: "read_file", output: "Kurzer Text mit 3 Zeilen\nZeile 2\nZeile 3" },
      ];

      const res = truncateToolOutputs(toolOutputs);
      expect(res.truncatedCount).toBe(1);
      expect(res.savedTokens).toBeGreaterThan(0);
      expect(res.optimizedOutputs[0].truncated).toBe(true);
      expect(res.optimizedOutputs[1].truncated).toBeUndefined();
    });
  });

  describe("Regel 2: Doppelte Tool-Ausgaben entfernen", () => {
    it("erzeugt konsistente Hashes für gleiche Tool-Ausgaben", () => {
      const h1 = hashToolOutput("git_status", "On branch main\nnothing to commit, working tree clean\n");
      const h2 = hashToolOutput("git_status", "On branch main\nnothing to commit, working tree clean");
      expect(h1).toBe(h2);
    });

    it("lässt den ersten Aufruf unverändert und ersetzt den zweiten durch Hash-Referenz", () => {
      const outputText = "On branch feature/auth\nChanges not staged for commit:\n  modified: src/index.ts\n  modified: package.json\nno changes added to commit";
      const outputs = [
        { id: "call-1", toolName: "git_status", output: outputText },
        { id: "call-2", toolName: "git_status", output: outputText }, // Exakt identischer Aufruf
      ];

      const res = deduplicateToolOutputs(outputs);
      expect(res.deduplicatedCount).toBe(1);
      expect(res.savedTokens).toBeGreaterThan(10);

      // Erste Ausgabe bleibt original
      expect(res.optimizedOutputs[0].output).toBe(outputText);
      expect(res.optimizedOutputs[0].deduplicated).toBeUndefined();

      // Zweite Ausgabe wird ersetzt
      expect(res.optimizedOutputs[1].output).toContain("[Token-Sparen: Ausgabe identisch zu vorherigem Aufruf von 'git_status'");
      expect(res.optimizedOutputs[1].deduplicated).toBe(true);
    });
  });

  describe("Regel 3: Anhänge nur als Pfad statt Volltext wenn CLI Dateizugriff hat", () => {
    const sampleCode = `
      import { Hono } from "hono";
      export const app = new Hono();
      app.get("/health", (c) => c.text("ok"));
      // 500 Zeilen weiterer Code ...
    `.repeat(20);

    it("ersetzt Volltext durch Pfad-Referenz bei vorhandenem Dateizugriff", () => {
      const attachments = [
        {
          name: "large-server.ts",
          path: "C:/project/src/large-server.ts",
          content: sampleCode,
          sizeBytes: 15_000,
        },
      ];

      const res = optimizeAttachmentsForLocalCli(attachments, true);
      expect(res.replacedCount).toBe(1);
      expect(res.savedTokens).toBeGreaterThan(400);

      const optContent = res.optimizedAttachments[0].content!;
      expect(optContent).toContain("[Token-Sparen: Anhang 'large-server.ts' im Arbeitsordner 'C:/project/src/large-server.ts'");
      expect(optContent).not.toContain("export const app = new Hono()");
    });

    it("behält Volltext vollständig bei, wenn KEIN lokaler Dateizugriff besteht", () => {
      const attachments = [
        {
          name: "remote-doc.txt",
          path: "/remote/path/doc.txt",
          content: sampleCode,
          sizeBytes: 15_000,
        },
      ];

      const res = optimizeAttachmentsForLocalCli(attachments, false); // hasLocalFileAccess = false
      expect(res.replacedCount).toBe(0);
      expect(res.savedTokens).toBe(0);
      expect(res.optimizedAttachments[0].content).toBe(sampleCode);
    });
  });

  describe("Regel 4: Kurze System-Anweisungen je Agent", () => {
    it("entfernt redundante Höflichkeits- und Füllfloskeln", () => {
      const verbosePrompt = `
        Du bist ein hochqualifizierter, extrem hilfsbereiter und intelligenter KI-Assistent.
        Bitte stelle sicher, dass du stets und unter allen Umständen fehlerfreien Code schreibst.
        Antworte bitte immer höflich, zuvorkommend, freundlich und hilfsbereit.


        Regel 1: Verwende TypeScript.
      `;

      const res = compactSystemPrompt(verbosePrompt);
      expect(res.wasCompacted).toBe(true);
      expect(res.savedTokens).toBeGreaterThan(15);
      expect(res.optimizedPrompt).toContain("Du bist ein KI-Assistent.");
      expect(res.optimizedPrompt).toContain("Achte darauf, dass du fehlerfreien Code schreibst.");
      expect(res.optimizedPrompt).toContain("Regel 1: Verwende TypeScript.");
      expect(res.optimizedPrompt).not.toContain("extrem hilfsbereiter und intelligenter");
    });
  });

  describe("Regel 5: Günstiges Modell für Zusammenfassungen/Titel", () => {
    it("wählt Claude 3.5 Haiku als Economy-Modell für Claude 3.5 Sonnet", () => {
      const res = resolveEconomyModel("anthropic", "claude-3-5-sonnet", "summary");
      expect(res.selectedModel).toBe("claude-3-5-haiku");
      expect(res.isEconomyModel).toBe(true);
      expect(res.costReductionFactor).toBeLessThan(0.3); // Mehr als 70% Ersparnis
    });

    it("wählt GPT-4o-mini für GPT-4o", () => {
      const res = resolveEconomyModel("openai", "gpt-4o", "title");
      expect(res.selectedModel).toBe("gpt-4o-mini");
      expect(res.isEconomyModel).toBe(true);
    });

    it("wählt Gemini 1.5 Flash für Gemini 1.5 Pro", () => {
      const res = resolveEconomyModel("google", "gemini-1.5-pro", "summary");
      expect(res.selectedModel).toBe("gemini-1.5-flash");
      expect(res.isEconomyModel).toBe(true);
    });

    it("berechnet die finanzielle Ersparnis korrekt", () => {
      const savings = calculateAuxiliaryModelCostSavings("claude-3-5-sonnet", "claude-3-5-haiku", 100_000, 2_000);
      expect(savings).toBeGreaterThan(0.2); // Bei 100k Tokens spart Haiku über 20 Cent
    });
  });

  describe("T3-Mechanismen: Sessions fortsetzen & /compact", () => {
    it("erkennt den Slash-Befehl /compact ohne Nutzer-Text zu verändern", () => {
      const detection = detectSlashCommand("/compact nach Refactoring");
      expect(detection.isSlashCommand).toBe(true);
      expect(detection.isCompactCommand).toBe(true);
      expect(detection.command).toBe("/compact");
      expect(detection.args).toBe("nach Refactoring");
    });

    it("berechnet Prompt-Cache-Ersparnis bei fortgesetzter Session", () => {
      const bundle: TurnInputBundle = {
        turnId: "turn-resume-1",
        threadId: "thread-abc-123",
        isResumedSession: true,
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Wie geht es weiter?",
        systemPrompt: "Standard-System-Instruktion mit vielen Tools...".repeat(50),
        history: [
          { role: "user", content: "Schritt 1 ausgeführt." },
          { role: "assistant", content: "Schritt 1 bestätigt, hier sind die Resultate...".repeat(20) },
        ],
      };

      const analysis = evaluateSessionContinuation(bundle);
      expect(analysis.isResumed).toBe(true);
      expect(analysis.estimatedCachedTokens).toBeGreaterThan(1000);
      expect(analysis.cacheSavingsUsd).toBeGreaterThan(0.001);
      expect(analysis.cacheHitRatio).toBeGreaterThan(0.7);
    });
  });

  describe("STRIKTE INVARIANZ: Nutzer-Text darf NIE verändert werden", () => {
    it("lässt den userPrompt zeichen- und byte-exakt unverändert, auch bei doppelten Wörtern und Whitespace", async () => {
      const holyUserPrompt = "  Hallo   Stefan!   \n\nDas ist mein originaler   Nutzer-Text   mit   doppelten   Leerzeichen  und  /compact  Test!  ";

      const bundle: TurnInputBundle = {
        turnId: "turn-holy-user",
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: holyUserPrompt,
        systemPrompt: "Du bist ein hochqualifizierter, extrem hilfsbereiter und intelligenter KI-Assistent.",
      };

      const result = await optimizer.optimizeTurn(bundle);
      expect(result.bundle.userPrompt).toBe(holyUserPrompt);
      expect(result.bundle.userPrompt.length).toBe(holyUserPrompt.length);
    });
  });

  describe("Messung und Ledger-Integration", () => {
    it("schreibt Messung mit saving_applied ins Ledger", async () => {
      const lines = Array.from({ length: 80 }, (_, i) => `Terminal Ausgabe ${i}`);
      const bundle: TurnInputBundle = {
        turnId: "turn-ledger-1",
        agentId: "agent-kunc",
        companyId: "comp-42",
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Führe den Test aus.",
        toolOutputs: [{ id: "t1", toolName: "terminal", output: lines.join("\n") }],
      };

      const result = await optimizer.optimizeTurn(bundle);
      expect(result.measurement.saving_applied).toBe(true);
      expect(result.measurement.savedTokens).toBeGreaterThan(100);

      const entries = await mockLedger.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].turnId).toBe("turn-ledger-1");
      expect(entries[0].saving_applied).toBe(true);
      expect(entries[0].savedTokens).toBe(result.measurement.savedTokens);
      expect(entries[0].rulesApplied).toContain("truncate_command_output");
    });
  });

  describe("Feature-Flag Prüfung (A01)", () => {
    it("schaltet Optimierung ab und fungiert als reiner Pass-Through wenn bridge=false", async () => {
      (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: false };

      const lines = Array.from({ length: 100 }, (_, i) => `Zeile ${i}`);
      const bundle: TurnInputBundle = {
        turnId: "turn-disabled-flag",
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Hallo",
        toolOutputs: [{ id: "t1", toolName: "terminal", output: lines.join("\n") }],
      };

      const result = await optimizer.optimizeTurn(bundle);
      expect(result.measurement.saving_applied).toBe(false);
      expect(result.measurement.savedTokens).toBe(0);
      expect(result.appliedRules.length).toBe(0);
      expect(result.bundle.toolOutputs?.[0].output).toBe(lines.join("\n"));
    });
  });

  describe("Messung der 5 geforderten Beispiel-Turns", () => {
    it("misst Turn 1: Riesiger Compiler- und Test-Output gekürzt", async () => {
      const compilerOutput = Array.from({ length: 250 }, (_, i) =>
        `[INFO] Compiling module src/pkg_${i}.ts - finished in ${i * 4}ms without warnings.`
      ).join("\n");

      const bundle: TurnInputBundle = {
        turnId: "example-turn-1-compiler",
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Baue das Projekt.",
        toolOutputs: [{ id: "build-1", toolName: "bash", output: compilerOutput }],
      };

      const res = await optimizer.optimizeTurn(bundle);
      expect(res.measurement.saving_applied).toBe(true);
      expect(res.measurement.rawInputTokens).toBeGreaterThan(2000);
      expect(res.measurement.optimizedInputTokens).toBeLessThan(900);
      expect(res.measurement.savedTokens).toBeGreaterThan(1500);
      expect(res.appliedRules).toContain("truncate_command_output");
    });

    it("misst Turn 2: Wiederholte Tool-Ausgabe dedupliziert", async () => {
      const gitStatusOutput = "On branch master\nYour branch is up to date with 'origin/master'.\nUntracked files:\n  (use \"git add <file>...\" to include in what will be committed)\n\ttemp_check.log\n\nno changes added to commit (use \"git add\" to track)";

      const bundle: TurnInputBundle = {
        turnId: "example-turn-2-dedup",
        threadId: "session-repo-1",
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Prüfe den Git-Status.",
        toolOutputs: [
          { id: "call-a", toolName: "git_status", output: gitStatusOutput },
          { id: "call-b", toolName: "git_status", output: gitStatusOutput },
        ],
      };

      const res = await optimizer.optimizeTurn(bundle);
      expect(res.measurement.saving_applied).toBe(true);
      expect(res.appliedRules).toContain("deduplicate_tool_output");
      expect(res.bundle.toolOutputs?.[1].output).toContain("[Token-Sparen: Ausgabe identisch zu vorherigem Aufruf von 'git_status'");
    });

    it("misst Turn 3: Großer Datei-Anhang durch Workspace-Pfad ersetzt", async () => {
      const fileCode = "export class ComplexDatabaseManager {\n  // Implementation\n}\n".repeat(100);

      const bundle: TurnInputBundle = {
        turnId: "example-turn-3-attachment",
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Analysiere diese Datei.",
        hasLocalFileAccess: true,
        attachments: [
          {
            name: "DatabaseManager.ts",
            path: "C:/workspace/connect/DatabaseManager.ts",
            content: fileCode,
            sizeBytes: 8_500,
          },
        ],
      };

      const res = await optimizer.optimizeTurn(bundle);
      expect(res.measurement.saving_applied).toBe(true);
      expect(res.appliedRules).toContain("attachments_as_path");
      expect(res.measurement.savedTokens).toBeGreaterThan(500);
      expect(res.bundle.attachments?.[0].content).toContain("[Token-Sparen: Anhang 'DatabaseManager.ts' im Arbeitsordner");
    });

    it("misst Turn 4: Fortgesetzte Session mit System-Prompt-Optimierung und Caching", async () => {
      const verboseSystemPrompt = `
        Du bist ein hochqualifizierter, extrem hilfsbereiter und intelligenter KI-Assistent.
        Bitte stelle sicher, dass du stets und unter allen Umständen fehlerfrei arbeitest.
        Antworte bitte immer höflich, zuvorkommend, freundlich und hilfsbereit.
        Instruktionen für den Coding-Agenten: Beachte Clean Code.
      `;

      const bundle: TurnInputBundle = {
        turnId: "example-turn-4-cache",
        threadId: "persistent-thread-42",
        isResumedSession: true,
        provider: "claude",
        model: "claude-3-5-sonnet",
        userPrompt: "Nächster Schritt im Plan.",
        systemPrompt: verboseSystemPrompt,
        history: Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `Vorheriger Schritt ${i} im Refactoring: Modul ${i} erfolgreich migriert und getestet.`,
        })),
      };

      const res = await optimizer.optimizeTurn(bundle);
      expect(res.measurement.saving_applied).toBe(true);
      expect(res.appliedRules).toContain("compact_system_prompt");
      expect(res.appliedRules).toContain("session_prompt_cache");
      expect(res.measurement.cacheSavingsUsd).toBeGreaterThan(0);
    });

    it("misst Turn 5: Auxiliary Task mit Economy-Modell Claude 3.5 Haiku", async () => {
      // Hilfsaufgabe: Zusammenfassung bei 100 000 Tokens Kontext-Rotation
      const bundle: TurnInputBundle = {
        turnId: "example-turn-5-auxiliary",
        provider: "anthropic",
        model: "claude-3-5-sonnet", // Primärmodell des Agenten
        primaryModel: "claude-3-5-sonnet",
        taskType: "summary", // Kennzeichnung als Hilfsaufgabe
        userPrompt: "Fasse das bisherige Gespräch zusammen.",
        systemPrompt: "Erstelle eine strukturierte Zusammenfassung der Meilensteine.".repeat(20),
      };

      const res = await optimizer.optimizeTurn(bundle);
      expect(res.bundle.model).toBe("claude-3-5-haiku");
      expect(res.appliedRules).toContain("economy_model_selected");
      expect(res.measurement.saving_applied).toBe(true);
      expect(res.measurement.estimatedCostSavingsUsd).toBeGreaterThan(0.0005);
    });
  });
});
