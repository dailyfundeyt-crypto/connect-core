/**
 * T3-Bridge — Chat-Bausteine Tests (Lane A22).
 *
 * Testet alle 5 Bausteine & Rendering:
 * 1. T3AgentChat: Verlauf, Live-Text & Feature-Flag
 * 2. T3ToolLine & parseToolName: Tool-Chips & Befehlsausgabe
 * 3. T3ApprovalCard & formatApprovalQuestion: Freigaben (Erlauben / Ablehnen)
 * 4. T3ContextSeparator: I5 100k-Kontextwechsel, Aufklappen & Bearbeiten
 * 5. T3StopButton & T3QueueNotice: Stopp-Knopf, Warteschlangen-Hinweis „wartet (Platz 3)“
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";

const { cleanup, render, screen, fireEvent, waitFor } = await import("@testing-library/react");

import {
  T3AgentChat,
  T3ChatTranscript,
  T3ToolLine,
  T3ToolChip,
  T3ToolChipGroup,
  parseToolName,
  T3ApprovalCard,
  formatApprovalQuestion,
  T3ContextSeparator,
  T3StopButton,
  T3QueueNotice,
  T3MessageStatusLine,
} from "./index";
import {
  setT3MockMode,
  type ConnectChatToolItem,
  type ConnectChatApprovalItem,
  type ConnectChatContextSwitchItem,
  type ConnectChatTextItem,
} from "@/lib/t3";

beforeEach(() => {
  setT3MockMode(true);
});

afterEach(() => {
  cleanup();
});

afterAll(async () => {
  cleanup();
  setT3MockMode(false);
  await new Promise((resolve) => setTimeout(resolve, 50));
});

/* ---------------------------------------------------------------------------------------- *
 * 1. Tool-Line & Tool-Chips
 * ---------------------------------------------------------------------------------------- */

describe("T3ToolLine & Tool-Chips", () => {
  test("parseToolName trennt Titel und Details sauber auf", () => {
    expect(parseToolName("bash: npm test")).toEqual({
      label: "bash",
      detail: "npm test",
    });

    expect(parseToolName("git status -s")).toEqual({
      label: "git",
      detail: "status -s",
    });

    expect(parseToolName("browser_navigate", "Browser")).toEqual({
      label: "Browser",
      detail: "browser_navigate",
    });

    expect(parseToolName("read_file")).toEqual({
      label: "read_file",
      detail: undefined,
    });
  });

  test("rendert ToolLine mit laufendem, beendetem und fehlerhaftem Status", () => {
    const itemDone: ConnectChatToolItem = {
      kind: "tool",
      id: "tool-test-1",
      label: "bash",
      title: "npm run build",
      status: "done",
      output: "Build completed successfully",
    };

    const { unmount } = render(<T3ToolLine item={itemDone} />);
    expect(screen.getByText("bash")).toBeDefined();
    expect(screen.getByText("npm run build")).toBeDefined();
    expect(screen.getByText("Build completed successfully")).toBeDefined();
    unmount();

    const itemRunning: ConnectChatToolItem = {
      kind: "tool",
      id: "tool-test-2",
      label: "curl",
      title: "curl -s https://api.connect.local",
      status: "running",
    };

    const { unmount: unmount2 } = render(<T3ToolLine item={itemRunning} />);
    expect(screen.getByText("curl")).toBeDefined();
    expect(screen.getByText("Befehl läuft…")).toBeDefined();
    unmount2();
  });

  test("T3ToolChip und T3ToolChipGroup rendern kompakte Chips", () => {
    let clicked = false;
    const { unmount } = render(
      <T3ToolChip label="Bash" detail="npm test" onClick={() => (clicked = true)} />
    );
    expect(screen.getByText("Bash")).toBeDefined();
    expect(screen.getByText("npm test")).toBeDefined();

    fireEvent.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
    unmount();

    const tools: ConnectChatToolItem[] = [
      { kind: "tool", id: "t1", label: "git", title: "git diff", status: "done" },
      { kind: "tool", id: "t2", label: "tsc", title: "tsc --noEmit", status: "running" },
    ];

    const { unmount: unmount2 } = render(<T3ToolChipGroup tools={tools} />);
    expect(screen.getByText("git")).toBeDefined();
    expect(screen.getByText("tsc")).toBeDefined();
    unmount2();
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 2. Freigabe-Karte
 * ---------------------------------------------------------------------------------------- */

describe("T3ApprovalCard", () => {
  test("formatApprovalQuestion formuliert die Frage korrekt", () => {
    expect(formatApprovalQuestion("Darf Codex Datei schreiben?", "Codex")).toBe(
      "Darf Codex Datei schreiben?"
    );

    expect(formatApprovalQuestion("Terminal-Befehl ausführen", "Claude")).toBe(
      "Darf Claude Terminal-Befehl ausführen ?"
    );

    expect(formatApprovalQuestion("Freigabe für Netzwerkzugriff", "Grok")).toBe(
      "Darf Grok diese Aktion ausführen?"
    );
  });

  test("rendert Freigabe-Karte und reagiert auf Erlauben & Ablehnen", async () => {
    const item: ConnectChatApprovalItem = {
      kind: "approval",
      id: "app-test-1",
      requestId: "req-999",
      requestKind: "Befehlsausführung",
      title: "Darf Codex rm -rf dist ausführen?",
      prompt: "Löschen von Build-Dateien erfordert Freigabe",
      detail: "rm -rf dist",
      options: [
        { id: "opt-1", label: "Erlauben", decision: "allow" },
        { id: "opt-2", label: "Ablehnen", decision: "deny" },
      ],
      status: "waiting",
      blocking: true,
    };

    let decided: string | null = null;
    const { unmount } = render(
      <T3ApprovalCard
        item={item}
        cliName="Codex"
        onRespond={(_reqId, decision) => {
          decided = decision;
        }}
      />
    );

    expect(screen.getByText("Darf Codex rm -rf dist ausführen?")).toBeDefined();
    expect(screen.getByText("rm -rf dist")).toBeDefined();

    // Klick auf exakten "Erlauben"-Button (nicht "Immer erlauben")
    const allowBtn = screen.getByRole("button", { name: /^erlauben$/i });
    fireEvent.click(allowBtn);

    await waitFor(() => {
      expect(decided).toBe("allow");
      expect(screen.getByText(/aktion erlaubt/i)).toBeDefined();
    });

    unmount();
  });

  test("Klick auf Ablehnen setzt Entscheidung auf deny", async () => {
    const item: ConnectChatApprovalItem = {
      kind: "approval",
      id: "app-test-2",
      requestId: "req-888",
      requestKind: "Dateizugriff",
      title: "Datei überschreiben",
      prompt: "Möchtest du die Datei überschreiben?",
      options: [],
      status: "waiting",
      blocking: true,
    };

    let decided: string | null = null;
    const { unmount } = render(
      <T3ApprovalCard
        item={item}
        cliName="Claude"
        onRespond={(_reqId, decision) => {
          decided = decision;
        }}
      />
    );

    const denyBtn = screen.getByRole("button", { name: /^ablehnen$/i });
    fireEvent.click(denyBtn);

    await waitFor(() => {
      expect(decided).toBe("deny");
      expect(screen.getByText(/aktion abgelehnt/i)).toBeDefined();
    });

    unmount();
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 3. Kontext-Trenner (I5)
 * ---------------------------------------------------------------------------------------- */

describe("T3ContextSeparator", () => {
  test("rendert Kontext-Trenner mit Tokens und klappt Zusammenfassung auf", () => {
    const item: ConnectChatContextSwitchItem = {
      kind: "context_switch",
      id: "ctx-test-1",
      tokensAtSwitch: 100000,
      summary: "Zusammenfassung der vorherigen 100.000 Tokens.",
      previousThreadId: "th-1",
      newThreadId: "th-2",
      createdAt: new Date().toISOString(),
    };

    const { unmount } = render(<T3ContextSeparator item={item} defaultExpanded={false} />);

    expect(screen.getByText(/Neues Kontextfenster · Zusammenfassung/i)).toBeDefined();
    expect(screen.getByText("100.000 Tokens")).toBeDefined();

    // Zusammenfassung ist zunächst zugeklappt
    expect(screen.queryByText("Zusammenfassung der vorherigen 100.000 Tokens.")).toBeNull();

    // Aufklappen
    const toggleBtn = screen.getByRole("button", { name: /Neues Kontextfenster/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("Zusammenfassung der vorherigen 100.000 Tokens.")).toBeDefined();
    unmount();
  });

  test("erlaubt das Bearbeiten und Speichern der Zusammenfassung", async () => {
    const item: ConnectChatContextSwitchItem = {
      kind: "context_switch",
      id: "ctx-test-2",
      tokensAtSwitch: 100000,
      summary: "Ursprüngliche Zusammenfassung",
      previousThreadId: "th-1",
      newThreadId: "th-2",
      createdAt: new Date().toISOString(),
    };

    let updatedText: string | null = null;
    const { unmount } = render(
      <T3ContextSeparator
        item={item}
        defaultExpanded={true}
        onUpdateSummary={(_id, newSummary) => {
          updatedText = newSummary;
        }}
      />
    );

    const editBtn = screen.getByRole("button", { name: /bearbeiten/i });
    fireEvent.click(editBtn);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Manuell korrigierte Zusammenfassung" } });

    const saveBtn = screen.getByRole("button", { name: /speichern/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updatedText).toBe("Manuell korrigierte Zusammenfassung");
      expect(screen.getByText("Manuell korrigierte Zusammenfassung")).toBeDefined();
      expect(screen.getByText("(manuell angepasst)")).toBeDefined();
    });

    unmount();
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 4. Stopp-Knopf & Warteschlangen-Hinweis
 * ---------------------------------------------------------------------------------------- */

describe("T3StopButton & T3QueueNotice", () => {
  test("T3StopButton löst onInterrupt aus", () => {
    let interrupted = false;
    const { unmount } = render(
      <T3StopButton
        isRunning={true}
        onInterrupt={() => {
          interrupted = true;
        }}
      />
    );

    const btn = screen.getByRole("button", { name: /t3-turn anhalten/i });
    fireEvent.click(btn);
    expect(interrupted).toBe(true);
    unmount();

    // Bei isRunning=false wird nichts gerendert
    const { unmount: unmount2 } = render(
      <T3StopButton isRunning={false} onInterrupt={() => {}} />
    );
    expect(screen.queryByRole("button", { name: /t3-turn anhalten/i })).toBeNull();
    unmount2();
  });

  test("T3QueueNotice rendert Warteschlangen-Hinweis „wartet (Platz 3)“", () => {
    const { unmount } = render(<T3QueueNotice position={3} />);
    expect(screen.getByText("wartet (Platz 3)")).toBeDefined();
    unmount();

    let cancelled = false;
    const { unmount: unmount2 } = render(
      <T3QueueNotice position={1} onCancel={() => (cancelled = true)} />
    );
    expect(screen.getByText("wartet (Platz 1)")).toBeDefined();
    const cancelBtn = screen.getByRole("button", { name: /abbrechen/i });
    fireEvent.click(cancelBtn);
    expect(cancelled).toBe(true);
    unmount2();
  });

  test("T3MessageStatusLine rendert Statuszeile unter Nachrichten", () => {
    const { unmount } = render(
      <T3MessageStatusLine status="queued" queuePosition={3} />
    );
    expect(screen.getByText("wartet (Platz 3)")).toBeDefined();
    unmount();

    const { unmount: unmount2 } = render(
      <T3MessageStatusLine status="done" tokens={12500} />
    );
    expect(screen.getByText(/Erledigt · 12\.500 Tokens/i)).toBeDefined();
    unmount2();
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 5. T3AgentChat & T3ChatTranscript
 * ---------------------------------------------------------------------------------------- */

describe("T3AgentChat & T3ChatTranscript", () => {
  test("T3ChatTranscript rendert User- und Assistant-Bubbles sowie Tools", () => {
    const items: (ConnectChatTextItem | ConnectChatToolItem)[] = [
      {
        kind: "text",
        id: "m1",
        role: "user",
        text: "Hallo T3!",
        status: "done",
      },
      {
        kind: "text",
        id: "m2",
        role: "assistant",
        text: "Hallo! Ich bin dein T3-Agent.",
        status: "done",
      },
      {
        kind: "tool",
        id: "m3",
        label: "terminal",
        title: "uptime",
        status: "done",
        output: "up 5 days",
      },
    ];

    const { unmount } = render(<T3ChatTranscript items={items} cliName="Codex" />);
    expect(screen.getByText("Hallo T3!")).toBeDefined();
    expect(screen.getByText("Hallo! Ich bin dein T3-Agent.")).toBeDefined();
    expect(screen.getByText("terminal")).toBeDefined();
    unmount();
  });

  test("T3AgentChat rendert im Mock-Modus ohne Fehler", async () => {
    const { unmount } = render(
      <T3AgentChat agentId="test-agent-123" cliName="Codex" mock={true} />
    );

    // Nach dem Laden sollte das Eingabefeld sichtbar sein
    expect(screen.getByPlaceholderText(/Nachricht an Codex…/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /senden/i })).toBeDefined();
    unmount();
  });

  test("T3AgentChat verhält sich defensiv bei deaktiviertem Flag", () => {
    // Flag aus und mock=false
    setT3MockMode(false);
    const { unmount } = render(
      <T3AgentChat agentId="test-agent-456" cliName="Codex" mock={false} />
    );

    // Sollte Hinweis auf deaktivierte Bridge anzeigen (kein Crash)
    expect(screen.getByText(/T3-Bridge deaktiviert/i)).toBeDefined();
    unmount();
  });
});
