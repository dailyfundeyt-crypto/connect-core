import { describe, expect, test } from "bun:test";
import {
  beginSwitch,
  cliMessagesPath,
  cliSessionPath,
  displayedProvider,
  failSwitch,
  initialSwitchState,
  isBrokerNotStarted,
  isCliProviderId,
  mergeConversationMessages,
  parseSwitchResponse,
  succeedSwitch,
  type UnifiedMessageLike,
} from "./unifiedCli";
import { CLI_UNIFIED_SESSION_FLAG_DEFAULT } from "./unifiedCli";

describe("Anbieterwechsel (Wähler)", () => {
  test("Erfolg Antigravity → Codex: Chat-Anbieter wird mitgewechselt, kein Fehler", () => {
    let state = initialSwitchState("antigravity");
    state = beginSwitch(state, "codex");
    expect(state.busy).toBe(true);
    expect(displayedProvider(state)).toBe("codex");

    const parsed = parseSwitchResponse({
      ok: true,
      session: { conversationId: "conv-1", provider: "codex" },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    state = succeedSwitch(state, parsed.session);

    expect(state.committed).toBe("codex");
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
  });

  test("Fehler: alter Wert kommt zurück und Fehlertext liegt für den Toast bereit", () => {
    let state = initialSwitchState("antigravity");
    state = beginSwitch(state, "claude");
    state = failSwitch(state, "Spawn fehlgeschlagen");

    expect(displayedProvider(state)).toBe("antigravity");
    expect(state.committed).toBe("antigravity");
    expect(state.busy).toBe(false);
    expect(state.error).toBe("Spawn fehlgeschlagen");
  });

  test("Während eines Wechsels wird kein zweiter gestartet", () => {
    const busy = beginSwitch(initialSwitchState("antigravity"), "codex");
    const again = beginSwitch(busy, "claude");
    expect(again).toBe(busy);
    expect(again.pending).toBe("codex");
  });

  test("Gleicher Anbieter löst keinen Wechsel aus", () => {
    const state = initialSwitchState("codex");
    expect(beginSwitch(state, "codex")).toBe(state);
  });

  test("Antwort ohne ok oder ohne gültige Sitzung zählt nicht als Erfolg", () => {
    expect(parseSwitchResponse(null).ok).toBe(false);
    expect(parseSwitchResponse({ ok: true }).ok).toBe(false);
    expect(parseSwitchResponse({ ok: true, session: { provider: "mars", conversationId: "c" } }).ok).toBe(false);
    const failed = parseSwitchResponse({ ok: false, error: "kaputt" });
    expect(failed).toEqual({ ok: false, error: "kaputt" });
  });

  test("Freebuff ist gültiger Anbieter", () => {
    expect(isCliProviderId("freebuff")).toBe(true);
    expect(isCliProviderId("hermes")).toBe(false);
  });
});

describe("CLI-Broker-Meldung", () => {
  test("erkennt die Meldung aus dem Terminal-Manager", () => {
    expect(
      isBrokerNotStarted("CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1"),
    ).toBe(true);
    expect(isBrokerNotStarted("Fehler beim Start über CLI-Broker: x")).toBe(false);
    expect(isBrokerNotStarted("Netzwerkfehler")).toBe(false);
    expect(isBrokerNotStarted(null)).toBe(false);
  });
});

describe("Ein Gespräch für Chat und CLI", () => {
  test("beide Tabs nutzen dieselben Pfade für dieselbe conversationId", () => {
    expect(cliSessionPath("conv-42")).toBe("/api/v06/cli/sessions/conv-42");
    expect(cliMessagesPath("conv-42")).toBe("/api/v06/cli/sessions/conv-42/messages");
    expect(cliMessagesPath("a/b")).toContain("a%2Fb");
  });

  test("Historie wird zusammengeführt, ohne Duplikate, chronologisch", () => {
    const chat: UnifiedMessageLike = {
      id: "m1",
      role: "user",
      source: "chat",
      content: "Hallo",
      createdAt: "2026-10-23T10:00:00.000Z",
    };
    const cli: UnifiedMessageLike = {
      id: "m2",
      role: "assistant",
      source: "cli",
      content: "Antwort aus dem Terminal",
      createdAt: "2026-10-23T10:01:00.000Z",
    };
    const merged = mergeConversationMessages([cli], [chat, cli]);
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(merged[1]?.source).toBe("cli");
  });

  test("Flag-Default ist aus", () => {
    expect(CLI_UNIFIED_SESSION_FLAG_DEFAULT).toBe(false);
  });
});
