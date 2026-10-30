/**
 * T3-Einstellungen — Umfassende Render- und Unit-Tests (Lane A25).
 *
 * Prüft alle Akzeptanzkriterien:
 *  1. Render-Tests aller 5 Bereiche (Sidecar, CLIs, Concurrency, Context, Token-Saving)
 *  2. STRIKTE REGEL: Keine Eingabefelder für Keys (nur Hinweis auf vorhandene Key-Verwaltung)
 *  3. Gleichzeitigkeit: Gesamtlimit (5), Codex (3), Claude (2)
 *  4. Kontext: Schwelle 100 000 Tokens, Zusammenfassung sichtbar
 *  5. Token-Sparen: 5 Regeln an/aus, Invarianz-Garantie
 *  6. Feature-Flag Guard (Flag bridge an vs. aus)
 *  7. Storage & Reaktivität (Save, Reset, Get)
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
/*
 * `@testing-library/react` bindet `screen` an das `document`, das beim Import
 * existiert. Statischer Import würde vor `ensureDom()` laufen (ESM-Hoist) und
 * `screen` für immer an `undefined` binden. Deshalb dynamisch danach.
 */
const { cleanup, fireEvent, render, screen, waitFor } = await import(
  "@testing-library/react"
);
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DEFAULT_T3_UNIFIED_SETTINGS,
  getT3UnifiedSettings,
  resetT3UnifiedSettings,
  saveT3UnifiedSettings,
  T3ClisSection,
  T3ConcurrencySection,
  T3ContextSection,
  T3SettingsPanel,
  T3SidecarCard,
  T3TokenSavingSection,
} from "./index";
import { setT3MockMode } from "@/lib/t3";

// Aktiviert den T3-Mock-Modus für deterministische Tests
setT3MockMode(true);

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Lane A25 — T3-Einstellungen", () => {
  beforeEach(() => {
    resetT3UnifiedSettings();
    if (typeof window !== "undefined") {
      (window as typeof window & {
        __CONNECT_FLAGS_T3?: Record<string, boolean>;
      }).__CONNECT_FLAGS_T3 = {
        bridge: true,
        cliSwap: true,
        contextRotation: true,
      };
    }
  });

  afterEach(() => {
    cleanup();
    if (typeof window !== "undefined") {
      delete (window as typeof window & { __CONNECT_FLAGS_T3?: unknown })
        .__CONNECT_FLAGS_T3;
    }
  });

  /* ---------------------------------------------------------------------------------------- *
   * 1. Storage & Settings-State
   * ---------------------------------------------------------------------------------------- */
  describe("Storage & State (storage.ts)", () => {
    test("liefert standardmäßig die DEFAULT_T3_UNIFIED_SETTINGS", () => {
      const s = getT3UnifiedSettings();
      expect(s.sidecar.port).toBe(3773);
      expect(s.sidecar.host).toBe("127.0.0.1");
      expect(s.concurrency.maxConcurrentTurns).toBe(5);
      expect(s.concurrency.providerLimits.codex).toBe(3);
      expect(s.concurrency.providerLimits.claudeAgent).toBe(2);
      expect(s.context.thresholdTokens).toBe(100_000);
      expect(s.context.showContextSwitchBadge).toBe(true);
      expect(s.tokenSaving.enabled).toBe(true);
      expect(s.tokenSaving.truncateCommandOutputs).toBe(true);
      expect(s.tokenSaving.deduplicateToolOutputs).toBe(true);
    });

    test("speichert partielle Änderungen atomar ab", () => {
      saveT3UnifiedSettings({
        concurrency: {
          ...DEFAULT_T3_UNIFIED_SETTINGS.concurrency,
          maxConcurrentTurns: 8,
        },
        context: {
          ...DEFAULT_T3_UNIFIED_SETTINGS.context,
          thresholdTokens: 50_000,
        },
      });

      const updated = getT3UnifiedSettings();
      expect(updated.concurrency.maxConcurrentTurns).toBe(8);
      expect(updated.context.thresholdTokens).toBe(50_000);
      expect(updated.sidecar.port).toBe(3773); // unverändert
    });

    test("setzt Einstellungen vollständig auf Standardwerte zurück", () => {
      saveT3UnifiedSettings({
        context: {
          ...DEFAULT_T3_UNIFIED_SETTINGS.context,
          thresholdTokens: 25_000,
        },
      });
      expect(getT3UnifiedSettings().context.thresholdTokens).toBe(25_000);

      resetT3UnifiedSettings();
      expect(getT3UnifiedSettings().context.thresholdTokens).toBe(100_000);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 2. Sidecar-Status
   * ---------------------------------------------------------------------------------------- */
  describe("Sidecar-Status (T3SidecarCard)", () => {
    test("rendert Loopback-Host 127.0.0.1, Port 3773 und Sicherheits-Garantie", async () => {
      const settings = getT3UnifiedSettings().sidecar;
      let changedPatch = {};
      renderWithClient(
        <T3SidecarCard
          onChange={(patch) => {
            changedPatch = patch;
          }}
          settings={settings}
        />,
      );

      expect(screen.getByTestId("t3-sidecar-card")).toBeDefined();
      expect(screen.getByText("T3 Sidecar-Dienst")).toBeDefined();
      expect(screen.getByText("Nur Loopback")).toBeDefined();
      expect(screen.getByText(/Sicherheits-Garantie/)).toBeDefined();
      expect(screen.getAllByText(/127\.0\.0\.1/).length).toBeGreaterThan(0);
    });

    test("zeigt Status-Badge für aktive Loopback-Verbindung", async () => {
      const settings = getT3UnifiedSettings().sidecar;
      renderWithClient(<T3SidecarCard onChange={() => {}} settings={settings} />);

      await waitFor(() => {
        expect(screen.getByTestId("sidecar-status-badge")).toBeDefined();
      });
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 3. CLIs & Provider (AKZEPTANZKRITERIUM: KEINE Key-Felder)
   * ---------------------------------------------------------------------------------------- */
  describe("CLIs & Provider (T3ClisSection)", () => {
    test("enthält KEINE Eingabefelder für API-Keys oder Passwörter", () => {
      const { container } = renderWithClient(<T3ClisSection />);

      // Strengste Prüfung: Kein einziges Password- oder Key-Inputfeld darf existieren
      const passwordInputs = container.querySelectorAll('input[type="password"]');
      expect(passwordInputs.length).toBe(0);

      const allInputs = container.querySelectorAll("input");
      expect(allInputs.length).toBe(0);

      // Verweis auf Connect-Key-Verwaltung muss gerendert werden
      expect(screen.getByTestId("no-keys-notice")).toBeDefined();
      expect(screen.getByText(/Keine API-Key-Eingabe an dieser Stelle/)).toBeDefined();
      expect(screen.getByText(/Einstellungen › Globale API-Keys/)).toBeDefined();
    });

    test("rendert Provider-Karten mit Hinweis 'In T3 anmelden'", async () => {
      renderWithClient(<T3ClisSection />);

      await waitFor(() => {
        // Codex & Claude als Top-Treiber
        expect(screen.getByTestId("t3-provider-card-codex")).toBeDefined();
        expect(screen.getByTestId("t3-provider-card-claudeAgent")).toBeDefined();
      });

      // Login-Hinweis für Stefan
      const loginHints = screen.getAllByTestId("t3-login-hint");
      expect(loginHints.length).toBeGreaterThan(0);
      expect(loginHints[0].textContent).toContain("In T3 anmelden");
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 4. Gleichzeitigkeit & Concurrency
   * ---------------------------------------------------------------------------------------- */
  describe("Gleichzeitigkeit (T3ConcurrencySection)", () => {
    test("rendert Gesamtlimit (Standard 5) und Provider-Limits (Codex 3, Claude 2)", () => {
      const settings = getT3UnifiedSettings().concurrency;
      let changed: Record<string, unknown> = {};

      renderWithClient(
        <T3ConcurrencySection
          onChange={(patch) => {
            changed = patch;
          }}
          settings={settings}
        />,
      );

      expect(screen.getByTestId("t3-concurrency-section")).toBeDefined();
      expect(screen.getByTestId("max-concurrent-turns-value").textContent).toBe("5");
      expect(screen.getByText("Codex")).toBeDefined();
      expect(screen.getByText("Claude")).toBeDefined();
      expect(screen.getByText("OpenAI Standard: max. 3")).toBeDefined();
      expect(screen.getByText("Anthropic Standard: max. 2")).toBeDefined();
    });

    test("erlaubt Ändern des Gesamtlimits über Stepper", () => {
      const settings = getT3UnifiedSettings().concurrency;
      let changed: Record<string, unknown> = {};

      renderWithClient(
        <T3ConcurrencySection
          onChange={(patch) => {
            changed = patch;
          }}
          settings={settings}
        />,
      );

      const plusBtn = screen.getAllByText("+")[0];
      fireEvent.click(plusBtn);

      expect(changed.maxConcurrentTurns).toBe(6);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 5. Kontext-Rotation (100k)
   * ---------------------------------------------------------------------------------------- */
  describe("Kontext-Rotation (T3ContextSection)", () => {
    test("rendert Standard-Schwelle 100 000 Tokens (I5) und Trenner-Option", () => {
      const settings = getT3UnifiedSettings().context;
      let changed: Record<string, unknown> = {};

      renderWithClient(
        <T3ContextSection
          onChange={(patch) => {
            changed = patch;
          }}
          settings={settings}
        />,
      );

      expect(screen.getByTestId("t3-context-section")).toBeDefined();
      expect(screen.getByTestId("preset-100000")).toBeDefined();
      expect(screen.getByText(/Zusammenfassung & Trenner im Chat sichtbar/)).toBeDefined();
      expect(screen.getByText(/Das Prinzip: Immer im selben Gespräch bleiben/)).toBeDefined();
    });

    test("erlaubt Umschalten der Schwelle auf ein anderes Preset", () => {
      const settings = getT3UnifiedSettings().context;
      let changed: Record<string, unknown> = {};

      renderWithClient(
        <T3ContextSection
          onChange={(patch) => {
            changed = patch;
          }}
          settings={settings}
        />,
      );

      const preset50k = screen.getByTestId("preset-50000");
      fireEvent.click(preset50k);

      expect(changed.thresholdTokens).toBe(50_000);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 6. Token-Sparen (A14) & Invarianz
   * ---------------------------------------------------------------------------------------- */
  describe("Token-Sparen (T3TokenSavingSection)", () => {
    test("hebt die strikte Invarianz-Garantie für Nutzer-Text explizit hervor", () => {
      const settings = getT3UnifiedSettings().tokenSaving;

      renderWithClient(<T3TokenSavingSection onChange={() => {}} settings={settings} />);

      expect(screen.getByTestId("t3-token-saving-section")).toBeDefined();
      expect(screen.getByTestId("invariance-guarantee-box")).toBeDefined();
      expect(screen.getByText(/Strikte Invarianz-Garantie für Nutzer-Text/)).toBeDefined();
      expect(screen.getByText(/Keine Spar-Regel darf jemals deine eingegebene Nachricht verändern/)).toBeDefined();
    });

    test("rendert alle 5 Sparregeln einzeln schaltbar", () => {
      const settings = getT3UnifiedSettings().tokenSaving;

      renderWithClient(<T3TokenSavingSection onChange={() => {}} settings={settings} />);

      expect(screen.getByText("Regel 1: Lange Befehlsausgaben kürzen")).toBeDefined();
      expect(screen.getByText("Regel 2: Doppelte Tool-Ausgaben deduplizieren")).toBeDefined();
      expect(screen.getByText("Regel 3: Große Anhänge nur als Pfad")).toBeDefined();
      expect(screen.getByText("Regel 4: Redundante System-Prompts verdichten")).toBeDefined();
      expect(screen.getByText("Regel 5: Kostengünstige Economy-Modelle für Hilfsaufgaben")).toBeDefined();
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 7. Haupt-Panel & Feature-Flag Guard
   * ---------------------------------------------------------------------------------------- */
  describe("Haupt-Panel & Feature-Flag (T3SettingsPanel)", () => {
    test("rendert das Haupt-Panel vollständig, wenn das Feature-Flag aktiv ist", () => {
      renderWithClient(<T3SettingsPanel />);

      expect(screen.getByTestId("t3-settings-panel")).toBeDefined();
      expect(screen.getByText("T3 Backend-Einstellungen")).toBeDefined();
      expect(screen.getByText("Alle Bereiche")).toBeDefined();
    });

    test("rendert einen Ruhezustand-Hinweis, wenn das Feature-Flag deaktiviert ist", () => {
      if (typeof window !== "undefined") {
        (window as typeof window & {
          __CONNECT_FLAGS_T3?: Record<string, boolean>;
        }).__CONNECT_FLAGS_T3 = {
          bridge: false,
        };
      }

      renderWithClient(<T3SettingsPanel />);

      expect(screen.getByTestId("t3-flag-disabled")).toBeDefined();
      expect(screen.getByText("T3-Integration inaktiv")).toBeDefined();
      expect(screen.queryByTestId("t3-settings-panel")).toBeNull();
    });
  });
});
