import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import {
  UnifiedSessionStore,
  type MessageRole,
  type MessageSource,
} from "./sessionStore";
import {
  buildMemoryHandoff,
  extractOpenTasks,
  extractSummary,
  renderHandoffPrompt,
} from "./handoff";
import {
  buildBrowserEnvironment,
  calculateCdpPort,
  switchProvider,
  type SpawnCliOptions,
  type SpawnCliResult,
} from "./providerSwitch";
import { registerUnifiedSessionRoutes } from "./routes";
import {
  stripAnsi,
  normalizeCarriageReturns,
  isTechnicalBanner,
  stripTrailingPrompt,
  stripUserInputEcho,
  cleanTerminalOutput,
  PtyOutputBridge,
} from "./ptyOutputBridge";
import { CLI_MODELS } from "../../agent-hub/cli-model";

describe("Unified Session & Handoff (A07)", () => {
  let store: UnifiedSessionStore;

  beforeEach(() => {
    store = new UnifiedSessionStore(null);
  });

  describe("1. Ein Gespräch, zwei Ansichten (sessionStore)", () => {
    it("liefert für conversationId genau eine CliSessionRef mit Default antigravity", async () => {
      const convId = "conv-test-1";
      const session1 = await store.getSession(convId);
      expect(session1.conversationId).toBe(convId);
      expect(session1.provider).toBe("antigravity");
      expect(session1.browserProfileId).toBeUndefined();

      const session2 = await store.getSession(convId);
      expect(session2).toEqual(session1);
    });

    it("Nachrichten aus CLI erscheinen im Chat-Verlauf und umgekehrt", async () => {
      const convId = "conv-unified-chat-cli";

      // 1. Benutzer schreibt im Web-Chat
      await store.addMessage({
        conversationId: convId,
        role: "user",
        source: "chat",
        content: "Bitte analysiere die Datei src/index.ts und liste Aufgaben auf.",
      });

      // 2. CLI-Agent führt Werkzeuge aus und antwortet im Terminal
      await store.addMessage({
        conversationId: convId,
        role: "assistant",
        source: "cli",
        content: "Habe src/index.ts geprüft. Offene Aufgaben:\n- [ ] Fehlerbehandlung verbessern\n- [ ] Unit-Tests ergänzen",
      });

      // 3. Benutzer gibt im Chat Feedback
      await store.addMessage({
        conversationId: convId,
        role: "user",
        source: "chat",
        content: "Starte bitte mit den Unit-Tests.",
      });

      // 4. Gemeinsame Historie für Chat & CLI abrufen
      const messages = await store.getMessages(convId);
      expect(messages.length).toBe(3);

      expect(messages[0].source).toBe("chat");
      expect(messages[0].role).toBe("user");
      expect(messages[0].seq).toBe(1);

      expect(messages[1].source).toBe("cli");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].seq).toBe(2);

      expect(messages[2].source).toBe("chat");
      expect(messages[2].role).toBe("user");
      expect(messages[2].seq).toBe(3);

      // Beide Quellen befinden sich im selben Gespräch
      const chatMessages = messages.filter((m) => m.source === "chat");
      const cliMessages = messages.filter((m) => m.source === "cli");
      expect(chatMessages.length).toBe(2);
      expect(cliMessages.length).toBe(1);
    });
  });

  describe("2. Handoff-Struktur & Prompt-Rendering", () => {
    it("extrahiert offene Aufgaben und filtert erledigte heraus", () => {
      const messages = [
        {
          id: "1",
          conversationId: "c1",
          seq: 1,
          role: "assistant" as MessageRole,
          source: "cli" as MessageSource,
          content: "Aufgabenplan:\n- [ ] DB Migration erstellen\n- [x] Architektur prüfen\nTODO: CDP Port verifizieren",
          createdAt: new Date().toISOString(),
        },
      ];

      const tasks = extractOpenTasks(messages);
      expect(tasks).toContain("DB Migration erstellen");
      expect(tasks).toContain("CDP Port verifizieren");
      expect(tasks).not.toContain("Architektur prüfen");
    });

    it("baut MemoryHandoff mit letzten 20 Nachrichten und Browser-Profil", async () => {
      const convId = "conv-handoff-test";
      await store.updateBrowserProfile(convId, "profile-default-kunc");

      // 25 Nachrichten anlegen (nur die letzten 20 dürfen in handoff landen)
      for (let i = 1; i <= 25; i++) {
        await store.addMessage({
          conversationId: convId,
          role: i % 2 === 1 ? "user" : "assistant",
          source: i % 2 === 1 ? "chat" : "cli",
          content: `Nachricht Nummer ${i} im Verlauf`,
        });
      }

      const handoff = await buildMemoryHandoff(convId, { store });
      expect(handoff.conversationId).toBe(convId);
      expect(handoff.browserProfileId).toBe("profile-default-kunc");
      expect(handoff.lastMessages.length).toBe(20);
      expect(handoff.lastMessages[0].text).toBe("Nachricht Nummer 6 im Verlauf");
      expect(handoff.lastMessages[19].text).toBe("Nachricht Nummer 25 im Verlauf");
      expect(handoff.summary).toContain("Nachricht Nummer 1");
    });

    it("rendert Handoff-Prompt mit allen geforderten Sektionen", () => {
      const prompt = renderHandoffPrompt({
        conversationId: "conv-123",
        browserProfileId: "profile-kunc-1",
        summary: "Benutzer möchte Anbieterwechsel testen.",
        openTasks: ["Test ausführen", "Bericht verfassen"],
        lastMessages: [
          { role: "user", text: "Hallo Agent", at: "2026-10-23T12:00:00Z" },
          { role: "assistant", text: "Hallo! Wie kann ich helfen?", at: "2026-10-23T12:00:05Z" },
        ],
      });

      expect(prompt).toContain("# GEDÄCHTNIS-ÜBERGABE (HANDOFF)");
      expect(prompt).toContain("Konversation: conv-123");
      expect(prompt).toContain("Aktives Browser-Profil: profile-kunc-1");
      expect(prompt).toContain("Benutzer möchte Anbieterwechsel testen.");
      expect(prompt).toContain("- [ ] Test ausführen");
      expect(prompt).toContain("- [ ] Bericht verfassen");
      expect(prompt).toContain("USER: Hallo Agent");
      expect(prompt).toContain("ASSISTANT: Hallo! Wie kann ich helfen?");
    });
  });

  describe("3. Browser-Profil & CDP-Umgebungsvariablen", () => {
    it("erzeugt deterministische CDP-Ports und konsistente Variablen", () => {
      const profileId = "agent-profile-stefan";
      const port = calculateCdpPort(profileId);
      expect(port).toBeGreaterThanOrEqual(9333);
      expect(port).toBeLessThan(9333 + 200);

      const env = buildBrowserEnvironment(profileId);
      expect(env.CHROME_CDP_URL).toBe(`http://127.0.0.1:${port}`);
      expect(env.CDP_PORT).toBe(String(port));
      expect(env.BROWSER_PROFILE_ID).toBe(profileId);
      expect(env.CONNECT_BROWSER_PROFILE).toBe(profileId);
    });
  });

  describe("4. Anbieterwechsel (providerSwitch)", () => {
    it("wechselt erfolgreich von antigravity zu codex mit Handoff", async () => {
      const convId = "conv-switch-success";
      await store.updateBrowserProfile(convId, "profile-work");
      await store.addMessage({
        conversationId: convId,
        role: "user",
        source: "chat",
        content: "Offene Aufgabe:\n- [ ] Feature X implementieren",
      });

      let killedProvider: string | null = null;
      let spawnedOptions: SpawnCliOptions | undefined = undefined;

      const result = await switchProvider(
        {
          conversationId: convId,
          from: "antigravity",
          to: "codex",
        },
        {
          store,
          bypassFlagCheck: true,
          killCli: async (_id, provider) => {
            killedProvider = provider;
            return true;
          },
          spawnCli: async (opts) => {
            spawnedOptions = opts;
            return { ok: true, sessionId: "sess-codex-1", pid: 9999 };
          },
        },
      );

      expect(result.ok).toBe(true);
      expect(result.session?.provider).toBe("codex");
      expect(killedProvider as string | null).toBe("antigravity");
      expect(spawnedOptions).toBeDefined();
      expect(spawnedOptions!.provider).toBe("codex");
      expect(spawnedOptions!.browserProfileId).toBe("profile-work");
      expect(spawnedOptions!.initialInput).toContain("Feature X implementieren");
      expect(spawnedOptions!.customEnv?.CHROME_CDP_URL).toBeDefined();

      // SessionStore hat nun codex
      const updated = await store.getSession(convId);
      expect(updated.provider).toBe("codex");

      // System-Nachricht wurde protokolliert
      const msgs = await store.getMessages(convId);
      const systemMsg = msgs.find((m) => m.role === "system");
      expect(systemMsg).toBeDefined();
      expect(systemMsg?.content).toContain("CLI gewechselt von 'antigravity' zu 'codex'");
    });

    it("Rollback bei Fehler: alter Anbieter bleibt aktiv", async () => {
      const convId = "conv-switch-fail";
      // Ursprünglicher Provider ist antigravity
      const initial = await store.getSession(convId);
      expect(initial.provider).toBe("antigravity");

      let killedCalled = false;

      const result = await switchProvider(
        {
          conversationId: convId,
          from: "antigravity",
          to: "claude",
        },
        {
          store,
          bypassFlagCheck: true,
          killCli: async () => {
            killedCalled = true;
            return true;
          },
          spawnCli: async () => {
            // Simulierter Fehler beim Start der neuen CLI
            return {
              ok: false,
              error: "claude binary nicht gefunden im PATH",
            };
          },
        },
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("claude binary nicht gefunden");
      expect(killedCalled).toBe(true);

      // WICHTIG: SessionStore hat immer noch den alten Provider antigravity!
      const finalSession = await store.getSession(convId);
      expect(finalSession.provider).toBe("antigravity");
    });
  });

  describe("5. Hono REST-Routen", () => {
    let app: Hono;
    const terminalCalls: Array<{ kind: string; agentId: string; input?: string; cli?: string; customEnv?: Record<string, string> }> = [];

    beforeEach(() => {
      app = new Hono();
      terminalCalls.length = 0;
      process.env.CONNECT_FLAGS_V06 = "cliunifiedsession";
      registerUnifiedSessionRoutes(app, {
        store,
        requireUser: async (context: any, next: () => Promise<void>) => {
          context.set("actor", { id: "user-a" });
          await next();
        },
        resolveSessionContext: async ({ userId, conversationId }) =>
          userId === "user-a" && conversationId !== "foreign-channel"
            ? {
                conversationId,
                runtimeAgentId: "runtime-agent-a",
                browserProfileId: "profile-agent-a",
              }
            : null,
        terminal: {
          stop: async (agentId) => {
            terminalCalls.push({ kind: "stop", agentId });
          },
          start: async (agentId, input) => {
            terminalCalls.push({ kind: "start", agentId, cli: input.cli, customEnv: input.customEnv });
            return { agentId, pid: 4242 };
          },
          send: (agentId, input) => {
            terminalCalls.push({ kind: "send", agentId, input });
            return true;
          },
        },
      });
    });

    it("löst conversationId serverseitig in denselben Agenten und sein Browser-Profil auf", async () => {
      const res = await app.request("/api/v06/cli/sessions/conv-http-1");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.conversationId).toBe("conv-http-1");
      expect(data.provider).toBe("antigravity");
      expect(data.runtimeAgentId).toBe("runtime-agent-a");
      expect(data.browserProfileId).toBe("profile-agent-a");
    });

    it("POST /api/v06/cli/switch-provider führt Wechsel durch", async () => {
      const res = await app.request("/api/v06/cli/switch-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-http-2",
          from: "antigravity",
          to: "freebuff",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(true);
      expect(data.session.provider).toBe("freebuff");
      expect(terminalCalls.find((call) => call.kind === "stop")?.agentId).toBe("runtime-agent-a");
      expect(terminalCalls.find((call) => call.kind === "start")?.agentId).toBe("runtime-agent-a");
      expect(terminalCalls.find((call) => call.kind === "start")?.cli).toBe("freebuff");
      expect(terminalCalls.find((call) => call.kind === "start")?.customEnv?.BROWSER_PROFILE_ID).toBe("profile-agent-a");
    });

    it("POST /api/v06/cli/handoff liefert MemoryHandoff Struktur", async () => {
      await store.addMessage({
        conversationId: "conv-http-3",
        role: "user",
        source: "chat",
        content: "Offene Punkte:\n- [ ] Handoff testen",
      });

      const res = await app.request("/api/v06/cli/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-http-3",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(true);
      expect(data.handoffId).toBeDefined();
      expect(data.conversationId).toBe("conv-http-3");
      expect(data.openTasks).toContain("Handoff testen");
      expect(data.lastMessages.length).toBe(1);
    });

    it("GET & POST Nachrichten für gemeinsame Historie", async () => {
      // Nachricht aus Chat senden
      const postRes = await app.request("/api/v06/cli/sessions/conv-http-4/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          source: "chat",
          content: "Nachricht über REST-Route",
        }),
      });
      expect(postRes.status).toBe(201);

      // Nachrichten abrufen
      const getRes = await app.request("/api/v06/cli/sessions/conv-http-4/messages");
      expect(getRes.status).toBe(200);
      const data = (await getRes.json()) as any;
      expect(data.messages.length).toBe(1);
      expect(data.messages[0].content).toBe("Nachricht über REST-Route");
    });

    it("leitet Freebuff-Eingabe an dieselbe Agenten-PTY weiter und speichert sie im Verlauf", async () => {
      const res = await app.request("/api/v06/cli/sessions/conv-http-5/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "freebuff-line-1",
          role: "user",
          source: "cli",
          content: "Bitte öffne die TODO-Liste",
        }),
      });
      expect(res.status).toBe(201);
      expect(terminalCalls.at(-1)).toEqual({
        kind: "send",
        agentId: "runtime-agent-a",
        input: "Bitte öffne die TODO-Liste",
      });
      const messages = await store.getMessages("conv-http-5");
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ source: "cli", content: "Bitte öffne die TODO-Liste" });
    });

    it("lehnt nicht zugeordnete conversationIds trotz gültiger Anmeldung ab", async () => {
      const res = await app.request("/api/v06/cli/sessions/foreign-channel");
      expect(res.status).toBe(404);
      expect(terminalCalls).toHaveLength(0);
    });

    it("blockiert Zugriff mit 403 wenn Feature-Flag deaktiviert ist", async () => {
      process.env.CONNECT_FLAGS_V06 = "no-cliunifiedsession";
      const res = await app.request("/api/v06/cli/sessions/conv-flag-off");
      expect(res.status).toBe(403);
      const data = (await res.json()) as any;
      expect(data.error).toContain("nicht aktiviert");
    });
  });

  describe("6. PTY-Ausgabe Pipeline & Filterung (ptyOutputBridge)", () => {
    it("stripAnsi entfernt ANSI Escape-Sequenzen", () => {
      const raw = "\u001b[32mErfolg!\u001b[0m Datei \u001b[1mgespeichert\u001b[22m.";
      expect(stripAnsi(raw)).toBe("Erfolg! Datei gespeichert.");
    });

    it("normalizeCarriageReturns verarbeitet Zeilenüberschreibungen korrekt", () => {
      const raw = "Fortschritt: 10%\rFortschritt: 50%\rFortschritt: 100% fertig\nZweite Zeile";
      expect(normalizeCarriageReturns(raw)).toBe("Fortschritt: 100% fertig\nZweite Zeile");
    });

    it("isTechnicalBanner filtert System-Banner und Statusmeldungen", () => {
      expect(isTechnicalBanner("--- [agy-share] Context Handover ---")).toBe(true);
      expect(isTechnicalBanner("[Connect · Kontext-Übergabe]")).toBe(true);
      expect(isTechnicalBanner("--- [Anbieterwechsel] antigravity -> gemini ---")).toBe(true);
      expect(isTechnicalBanner("Terminal gestartet: gemini (PID 1234)")).toBe(true);
      expect(isTechnicalBanner("Das ist eine reguläre Antwort des Assistenten.")).toBe(false);
    });

    it("stripTrailingPrompt entfernt Terminal-Prompts am Ende", () => {
      expect(stripTrailingPrompt("Antwort fertig.\n> ")).toBe("Antwort fertig.");
      expect(stripTrailingPrompt("Ergebnis berechnet.\n❯ ")).toBe("Ergebnis berechnet.");
      expect(stripTrailingPrompt("Hier ist die Antwort.\ngemini> ")).toBe("Hier ist die Antwort.");
      expect(stripTrailingPrompt("Hier ist die Antwort.\nantigravity> ")).toBe("Hier ist die Antwort.");
    });

    it("stripUserInputEcho entfernt vorangestelltes Benutzerecho", () => {
      const userMsg = "Erstelle eine Zusammenfassung";
      const ptyOutput = "> Erstelle eine Zusammenfassung\nHier ist die Zusammenfassung der Datei.";
      expect(stripUserInputEcho(ptyOutput, userMsg)).toBe("Hier ist die Zusammenfassung der Datei.");
    });

    it("cleanTerminalOutput bereinigt rohen PTY-Output vollständig", () => {
      const rawPty = [
        "--- [Connect · Kontext-Übergabe] ---",
        "> Was ist der Status?",
        "\u001b[32mSystem läuft stabil.\u001b[0m",
        "Alle Tests sind grün.",
        "gemini> ",
      ].join("\n");

      const cleaned = cleanTerminalOutput(rawPty, "Was ist der Status?");
      expect(cleaned).toBe("System läuft stabil.\nAlle Tests sind grün.");
    });

    it("PtyOutputBridge puffert Chunks und speichert fertige Assistant-Nachricht mit source: cli", async () => {
      const bridgeStore = new UnifiedSessionStore(null);
      const bridge = new PtyOutputBridge(bridgeStore, 50); // 50ms Idle delay für Tests

      bridge.bindConversation({
        conversationId: "conv-bridge-1",
        runtimeAgentId: "agent-x",
        generation: 1,
      });

      bridge.recordUserInput("agent-x", "Wie heißen die Dateien?");

      // Chunks einspeisen
      bridge.onChunk("agent-x", "> Wie heißen die Dateien?\n", 1);
      bridge.onChunk("agent-x", "Die Dateien \u001b[34mheißen:\u001b[0m\n- index.ts\n", 1);
      bridge.onChunk("agent-x", "- styles.css\n> ", 1);

      // Flush manuell oder über Idle
      await bridge.flush("agent-x");

      const messages = await bridgeStore.getMessages("conv-bridge-1");
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("assistant");
      expect(messages[0].source).toBe("cli");
      expect(messages[0].content).toBe("Die Dateien heißen:\n- index.ts\n- styles.css");
    });

    it("PtyOutputBridge speichert identische Antworten nicht doppelt (Idempotenz)", async () => {
      const bridgeStore = new UnifiedSessionStore(null);
      const bridge = new PtyOutputBridge(bridgeStore, 50);

      bridge.bindConversation({
        conversationId: "conv-bridge-idem",
        runtimeAgentId: "agent-idem",
        generation: 1,
      });

      bridge.onChunk("agent-idem", "Erste Antwort fertig.\n> ", 1);
      await bridge.flush("agent-idem");

      // Erneuter Flush ohne neue Inhalte
      await bridge.flush("agent-idem");

      const messages = await bridgeStore.getMessages("conv-bridge-idem");
      expect(messages.length).toBe(1);
    });
  });

  describe("7. Generationen-Schutz (Generation Isolation)", () => {
    it("Ausgaben alter Generationen werden nach Anbieterwechsel ignoriert", async () => {
      const bridgeStore = new UnifiedSessionStore(null);
      const bridge = new PtyOutputBridge(bridgeStore, 50);

      // Anfangs: Generation 1 (z.B. antigravity)
      bridge.bindConversation({
        conversationId: "conv-gen-test",
        runtimeAgentId: "agent-gen",
        generation: 1,
      });

      // Anbieterwechsel erhöht Generation auf 2
      bridge.bindConversation({
        conversationId: "conv-gen-test",
        runtimeAgentId: "agent-gen",
        generation: 2,
      });

      // Alter Prozess schickt verspäteten Chunk mit generation 1
      bridge.onChunk("agent-gen", "Späte Ausgabe aus altem antigravity Prozess", 1);
      await bridge.flush("agent-gen");

      // Keine Nachricht gespeichert
      const messagesGen1 = await bridgeStore.getMessages("conv-gen-test");
      expect(messagesGen1.length).toBe(0);

      // Neuer Prozess schickt Chunk mit generation 2
      bridge.onChunk("agent-gen", "Frische Antwort aus neuem gemini Prozess\ngemini> ", 2);
      await bridge.flush("agent-gen");

      const messagesGen2 = await bridgeStore.getMessages("conv-gen-test");
      expect(messagesGen2.length).toBe(1);
      expect(messagesGen2[0].content).toBe("Frische Antwort aus neuem gemini Prozess");
    });
  });

  describe("8. Gemini Provider Support & CLI-Dispatch", () => {
    it("CLI_MODELS enthält gemini mit den standardisierten Modell-IDs", () => {
      expect(CLI_MODELS.gemini).toBeDefined();
      expect(CLI_MODELS.gemini).toContain("gemini-2.5-pro");
      expect(CLI_MODELS.gemini).toContain("gemini-2.5-flash");
    });

    it("Wechsel zu Gemini startet den Prozess mit gemini CLI und Browser-Profil", async () => {
      process.env.CONNECT_FLAGS_V06 = "cliunifiedsession";
      const switchStore = new UnifiedSessionStore(null);
      const calls: any[] = [];

      const appSwitch = new Hono();
      registerUnifiedSessionRoutes(appSwitch, {
        store: switchStore,
        requireUser: async (c: any, next: any) => {
          c.set("actor", { id: "user-test" });
          await next();
        },
        resolveSessionContext: async () => ({
          conversationId: "conv-gemini-switch",
          runtimeAgentId: "runtime-agent-gemini",
          browserProfileId: "profile-browser-123",
          userId: "user-test",
        }),
        terminal: {
          start: async (agentId: string, options: any) => {
            calls.push({ kind: "start", agentId, cli: options?.cli, customEnv: options?.customEnv });
            return { agentId, pid: 1234 };
          },
          stop: async (agentId: string) => {
            calls.push({ kind: "stop", agentId });
            return true;
          },
          send: () => true,
        },
      });

      const res = await appSwitch.request("/api/v06/cli/switch-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-gemini-switch",
          from: "antigravity",
          to: "gemini",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(true);
      expect(data.session.provider).toBe("gemini");
      expect(data.session.browserProfileId).toBe("profile-browser-123");

      const startCall = calls.find((c) => c.kind === "start");
      expect(startCall).toBeDefined();
      expect(startCall.cli).toBe("gemini");
      expect(startCall.customEnv?.BROWSER_PROFILE_ID).toBe("profile-browser-123");
    });
  });

});
