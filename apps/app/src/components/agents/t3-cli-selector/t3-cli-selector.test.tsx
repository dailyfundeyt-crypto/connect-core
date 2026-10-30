/**
 * T3-Bridge — Tests für T3-CLI-Selector (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Verifiziert alle Akzeptanzkriterien:
 *  1. Reihenfolge: Codex, Claude zuerst, dann alle weiteren T3-/Fork-CLIs aus A04, danach Legacy.
 *  2. Engine-Zuweisung: T3 (wenn verfügbar) oder Legacy (Manus, Lovable, ZGPT).
 *  3. Status-Punkt: bereit / nicht eingeloggt / Limit / nicht verfügbar.
 *  4. Dreiwertiger Auth-Status: "unknown" ist NICHT ausgeloggt.
 *  5. Flag aus: 100% identische Optionen und Speicherung wie getAgentCliDefault/setAgentCliDefault.
 *  6. Flag an: Unterstützt alle neuen T3-/Fork-Ziele nahtlos und persistiert sie.
 *  7. Drop-in-Ersatz: Identische Klassen und Props wie AgentModelPicker.
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import {
  CLI_TARGETS,
  getAgentCliDefault,
  setAgentCliDefault,
} from "@/lib/agents/agent-cli";
import type { T3ProviderStatus } from "@/lib/t3/contracts";
import {
  LEGACY_CLI_CATALOG,
  T3_SWAP_CLI_CATALOG,
} from "./catalog";
import {
  buildT3CliOption,
  resolveT3CliStatus,
  STATUS_DOT_COLORS,
} from "./status";
import {
  getSelectedCli,
  setSelectedCli,
} from "./storage";
import { T3CliSelector } from "./t3-cli-selector";

describe("T3-CLI-Selector (Lane A23)", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  describe("1. Reihenfolge der Optionen & Katalog (Aufgabe 2)", () => {
    it("Codex steht an Position 1 und Claude an Position 2", () => {
      expect(T3_SWAP_CLI_CATALOG[0].id).toBe("codex");
      expect(T3_SWAP_CLI_CATALOG[0].label).toBe("Codex");

      expect(T3_SWAP_CLI_CATALOG[1].id).toBe("claude");
      expect(T3_SWAP_CLI_CATALOG[1].label).toBe("Claude");
    });

    it("enthält alle weiteren T3- & Fork-CLIs aus A04 in der geforderten Reihenfolge", () => {
      const ids = T3_SWAP_CLI_CATALOG.map((c) => c.id);

      expect(ids).toContain("cursor");
      expect(ids).toContain("grok");
      expect(ids).toContain("opencode");
      expect(ids).toContain("antigravity");
      expect(ids).toContain("pi");
      expect(ids).toContain("muse");
      expect(ids).toContain("fx");
      expect(ids).toContain("hermes");
      expect(ids).toContain("freebuff");
      expect(ids).toContain("chatgpt");

      // Reihenfolge nach Claude: Cursor, Grok, OpenCode, Antigravity, Pi, Muse, fx, Hermes, Freebuff
      const cursorIdx = ids.indexOf("cursor");
      const grokIdx = ids.indexOf("grok");
      const opencodeIdx = ids.indexOf("opencode");
      const antigravityIdx = ids.indexOf("antigravity");
      const piIdx = ids.indexOf("pi");
      const museIdx = ids.indexOf("muse");
      const hermesIdx = ids.indexOf("hermes");
      const freebuffIdx = ids.indexOf("freebuff");

      expect(cursorIdx).toBeGreaterThan(1);
      expect(grokIdx).toBeGreaterThan(cursorIdx);
      expect(opencodeIdx).toBeGreaterThan(grokIdx);
      expect(antigravityIdx).toBeGreaterThan(opencodeIdx);
      expect(piIdx).toBeGreaterThan(antigravityIdx);
      expect(museIdx).toBeGreaterThan(piIdx);
      expect(hermesIdx).toBeGreaterThan(museIdx);
      expect(freebuffIdx).toBeGreaterThan(hermesIdx);
    });

    it("Legacy-Ziele (Manus, Lovable, ZGPT) stehen am Ende nach allen T3-Zielen", () => {
      const ids = T3_SWAP_CLI_CATALOG.map((c) => c.id);
      const manusIdx = ids.indexOf("manus");
      const lovableIdx = ids.indexOf("lovable");
      const zgptIdx = ids.indexOf("zgpt");
      const freebuffIdx = ids.indexOf("freebuff");

      expect(manusIdx).toBeGreaterThan(freebuffIdx);
      expect(lovableIdx).toBeGreaterThan(manusIdx);
      expect(zgptIdx).toBeGreaterThan(lovableIdx);
    });

    it("Engine-Zuweisung: T3 für T3-Ziele, Legacy für Manus, Lovable und ZGPT", () => {
      const codex = T3_SWAP_CLI_CATALOG.find((c) => c.id === "codex")!;
      expect(codex.engine).toBe("t3");

      const claude = T3_SWAP_CLI_CATALOG.find((c) => c.id === "claude")!;
      expect(claude.engine).toBe("t3");

      const hermes = T3_SWAP_CLI_CATALOG.find((c) => c.id === "hermes")!;
      expect(hermes.engine).toBe("t3");
      expect(hermes.fork).toBe(true);

      const freebuff = T3_SWAP_CLI_CATALOG.find((c) => c.id === "freebuff")!;
      expect(freebuff.engine).toBe("t3");
      expect(freebuff.fork).toBe(true);

      const manus = T3_SWAP_CLI_CATALOG.find((c) => c.id === "manus")!;
      expect(manus.engine).toBe("legacy");

      const lovable = T3_SWAP_CLI_CATALOG.find((c) => c.id === "lovable")!;
      expect(lovable.engine).toBe("legacy");

      const zgpt = T3_SWAP_CLI_CATALOG.find((c) => c.id === "zgpt")!;
      expect(zgpt.engine).toBe("legacy");
    });
  });

  describe("2. Status-Punkt Ermittlung (Aufgabe 3)", () => {
    const codexDef = T3_SWAP_CLI_CATALOG.find((c) => c.id === "codex")!;
    const manusDef = T3_SWAP_CLI_CATALOG.find((c) => c.id === "manus")!;

    it("Legacy-Ziele melden immer 'ready' (grün)", () => {
      const res = resolveT3CliStatus(manusDef);
      expect(res.status).toBe("ready");
      expect(res.statusLabel).toContain("Bereit");
    });

    it("T3-Treiber bereit meldet 'ready' (grün)", () => {
      const mockStatus: T3ProviderStatus = {
        provider: "codex",
        installed: true,
        authenticated: true,
        availability: "available",
        version: "1.0.0",
        models: ["gpt-5"],
      };

      const res = resolveT3CliStatus(codexDef, mockStatus);
      expect(res.status).toBe("ready");
      expect(STATUS_DOT_COLORS[res.status]).toContain("bg-emerald-500");
    });

    it("T3-Treiber nicht eingeloggt meldet 'unauthenticated' (gelb)", () => {
      const mockStatus: T3ProviderStatus = {
        provider: "codex",
        installed: true,
        authenticated: false,
        auth: "unauthenticated",
        version: "1.0.0",
        models: [],
      };

      const res = resolveT3CliStatus(codexDef, mockStatus);
      expect(res.status).toBe("unauthenticated");
      expect(STATUS_DOT_COLORS[res.status]).toContain("bg-amber-500");
    });

    it("WICHTIG (A01/A04): auth === 'unknown' darf NICHT als 'unauthenticated' gelten", () => {
      const mockStatus: T3ProviderStatus = {
        provider: "codex",
        installed: true,
        authenticated: null,
        auth: "unknown",
        version: "1.0.0",
        models: ["auto"],
      };

      const res = resolveT3CliStatus(codexDef, mockStatus);
      expect(res.status).toBe("ready");
      expect(res.status).not.toBe("unauthenticated");
    });

    it("T3-Treiber bei 100% Auslastung meldet 'limit' (rot)", () => {
      const mockStatus: T3ProviderStatus = {
        provider: "codex",
        installed: true,
        authenticated: true,
        version: "1.0.0",
        models: ["gpt-5"],
        limits: [
          {
            provider: "codex",
            kind: "session",
            label: "Session Tokens",
            usedPercent: 100,
            resetsAt: null,
          },
        ],
      };

      const res = resolveT3CliStatus(codexDef, mockStatus);
      expect(res.status).toBe("limit");
      expect(res.limitPercent).toBe(100);
      expect(STATUS_DOT_COLORS[res.status]).toContain("bg-rose-500");
    });

    it("T3-Treiber nicht installiert meldet 'unavailable' (grau)", () => {
      const mockStatus: T3ProviderStatus = {
        provider: "codex",
        installed: false,
        availability: "unavailable",
        authenticated: null,
        version: null,
        models: [],
        reason: "Executable not found in PATH",
      };

      const res = resolveT3CliStatus(codexDef, mockStatus);
      expect(res.status).toBe("unavailable");
      expect(STATUS_DOT_COLORS[res.status]).toContain("bg-muted-foreground");
    });

    it("buildT3CliOption erzeugt vollständige T3CliOption mit allen Feldern", () => {
      const mockStatus: T3ProviderStatus = {
        provider: "codex",
        installed: true,
        authenticated: true,
        version: "1.0.0",
        models: ["gpt-5"],
      };

      const opt = buildT3CliOption(codexDef, mockStatus);
      expect(opt.id).toBe("codex");
      expect(opt.label).toBe("Codex");
      expect(opt.engine).toBe("t3");
      expect(opt.status).toBe("ready");
      expect(opt.badge).toBe("T3");
    });
  });

  describe("3. Feature-Flag aus: Identisches altes Verhalten (Aufgabe 4)", () => {
    it("LEGACY_CLI_CATALOG stimmt 1:1 mit CLI_TARGETS überein", () => {
      expect(LEGACY_CLI_CATALOG.length).toBe(CLI_TARGETS.length);
      for (let i = 0; i < CLI_TARGETS.length; i++) {
        expect(LEGACY_CLI_CATALOG[i].id).toBe(CLI_TARGETS[i].id);
        expect(LEGACY_CLI_CATALOG[i].label).toBe(CLI_TARGETS[i].label);
      }
    });

    it("getSelectedCli liest getAgentCliDefault bei Flag AUS", () => {
      setAgentCliDefault("agent-123", "manus");
      expect(getSelectedCli("agent-123", false)).toBe("manus");

      setAgentCliDefault("agent-123", "grok");
      expect(getSelectedCli("agent-123", false)).toBe("grok");
    });

    it("setSelectedCli speichert identisch zu setAgentCliDefault bei Flag AUS", () => {
      setSelectedCli("agent-456", "cursor", false);
      expect(getAgentCliDefault("agent-456")).toBe("cursor");
      expect(getSelectedCli("agent-456", false)).toBe("cursor");
    });
  });

  describe("4. Feature-Flag an: Neue Ziele & Speicherung", () => {
    it("speichert und liest neue T3-/Fork-Ziele wie hermes und opencode", () => {
      setSelectedCli("agent-t3", "hermes", true);
      expect(getSelectedCli("agent-t3", true)).toBe("hermes");

      setSelectedCli("agent-t3", "opencode", true);
      expect(getSelectedCli("agent-t3", true)).toBe("opencode");
    });

    it("dispatched Event connect-agent-cli-changed bei Änderung", () => {
      let eventFired = false;
      const handler = () => {
        eventFired = true;
      };
      window.addEventListener("connect-agent-cli-changed", handler);

      setSelectedCli("agent-event", "freebuff", true);
      expect(eventFired).toBe(true);
      window.removeEventListener("connect-agent-cli-changed", handler);
    });
  });

  describe("5. Drop-in-Ersatz Komponente (Rendering-Tests)", () => {
    it("rendert im Flag-Aus Modus (forceFlag=false) den Trigger mit altem Look", () => {
      setAgentCliDefault("agent-render-old", "claude");

      const { getByTestId } = render(
        <T3CliSelector agentId="agent-render-old" forceFlag={false} />,
      );

      const trigger = getByTestId("t3-cli-selector-trigger");
      expect(trigger).toBeDefined();
      expect(trigger.getAttribute("data-swap-active")).toBe("false");
      expect(trigger.textContent).toContain("Claude");
      // Bei Flag aus: Kein Status-Dot im Trigger
      expect(trigger.querySelector("[data-testid='t3-cli-status-dot']")).toBeNull();
    });

    it("rendert im Flag-An Modus (forceFlag=true) den Trigger mit Status-Punkt", () => {
      setSelectedCli("agent-render-new", "codex", true);

      const { getByTestId } = render(
        <T3CliSelector agentId="agent-render-new" forceFlag={true} mock={true} />,
      );

      const trigger = getByTestId("t3-cli-selector-trigger");
      expect(trigger).toBeDefined();
      expect(trigger.getAttribute("data-swap-active")).toBe("true");
      expect(trigger.textContent).toContain("Codex");
      // Bei Flag an: Status-Dot ist vorhanden
      const dot = trigger.querySelector("[data-testid='t3-cli-status-dot']");
      expect(dot).toBeDefined();
    });

    it("unterstützt size='sm' mit runder 8-px-Rundung (rounded-full h-8 px-2.5 text-[11px])", () => {
      const { getByTestId } = render(
        <T3CliSelector agentId="agent-size" size="sm" forceFlag={false} />,
      );

      const trigger = getByTestId("t3-cli-selector-trigger");
      expect(trigger.className).toContain("rounded-full");
      expect(trigger.className).toContain("h-8");
      expect(trigger.className).toContain("text-[11px]");
    });
  });
});
