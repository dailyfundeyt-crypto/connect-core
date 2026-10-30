/**
 * A32 — Tests für die Browser-Andockleiste.
 *
 * EIGENTÜMER: A32.
 *
 * Geprüft:
 *  1. Flag aus → nichts gerendert (altes Verhalten).
 *  2. Render im angedockten Modus mit gemerkter Breite.
 *  3. Render im schwebenden Modus; Umschalter wechselt und merkt.
 *  4. Breite wird geklemmt und defensiv aus localStorage gelesen.
 *  5. T3-Vorschau wird mit Connects Browser-Steuerung kombiniert (Frame + Label).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React from "react";
import { BrowserDock } from "./browser-dock";
import { BrowserDockView } from "./browser-dock-view";
import {
  BROWSER_DOCK_STORAGE_KEY,
  clampBrowserDockWidth,
  parseBrowserDockSettings,
} from "./storage";
import { isT3PreviewTab, T3_PREVIEW_RPC_METHODS } from "./t3-preview";
import type { T3PreviewBridge } from "./types";

/**
 * Bun führt alle Testdateien in EINEM Prozess aus. Mehrere Dateien melden ihr
 * happy-dom per `GlobalRegistrator.unregister()` wieder ab; danach ist
 * `document` weg.
 *
 * `@/test/dom` (`ensureDom`) merkt das nicht — sein Modul-Flag sagt noch
 * „registriert". Deshalb prüft diese Datei den echten Zustand statt dem
 * Modul-Flag zu glauben und stellt das Fenster bei Bedarf wieder her.
 *
 * WICHTIG: `@testing-library/react` bindet sein globales `screen` an das
 * `document`, das beim Import der Bibliothek gerade existiert. Wird die
 * Bibliothek geladen, BEVOR ein Fenster da ist, ist dieser Anker für immer
 * kaputt — und jede Datei, die danach `screen` benutzt, scheitert mit
 * „a global document has to be available". Deshalb wird sie hier erst nach
 * dem DOM-Setup dynamisch geladen.
 */
function ensureDocument(): void {
  if (typeof globalThis.document !== "undefined") return;
  if (GlobalRegistrator.isRegistered) return;
  GlobalRegistrator.register({ url: "http://localhost/" });
}

ensureDocument();

const { act, cleanup, fireEvent, render } = await import("@testing-library/react");

function stubContent() {
  return <p data-testid="browser-dock-stub">Browser-Inhalt</p>;
}

describe("BrowserDock (Lane A32)", () => {
  beforeEach(() => {
    // Eine andere Datei kann ihr DOM abgemeldet haben, während diese Datei
    // schon geladen war — dann hier wieder herstellen.
    ensureDocument();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    // Fenster für die nachfolgenden Dateien stehen lassen.
    ensureDocument();
  });

  it("1. rendert bei Flag aus nichts — altes Verhalten", () => {
    const view = render(
      <BrowserDock agentId="agent-1" agentName="Willi" forceFlag={false} />,
    );
    expect(view.container.innerHTML).toBe("");
    expect(view.queryByTestId("browser-dock")).toBeNull();
  });

  it("2. rendert angedockt mit gemerkter Breite", () => {
    window.localStorage.setItem(
      BROWSER_DOCK_STORAGE_KEY,
      JSON.stringify({ mode: "docked", width: 512 }),
    );
    const view = render(
      <BrowserDock
        agentId="agent-1"
        agentName="Willi"
        forceFlag
        renderContent={stubContent}
      />,
    );
    const dock = view.getByTestId("browser-dock");
    expect(dock.dataset.mode).toBe("docked");
    expect((dock as HTMLElement).style.width).toBe("512px");
    expect(view.getByTestId("browser-dock-resize")).toBeTruthy();
    expect(view.getByTestId("browser-dock-stub")).toBeTruthy();
  });

  it("3. rendert schwebend und schaltet auf angedockt (gemerkt)", () => {
    window.localStorage.setItem(
      BROWSER_DOCK_STORAGE_KEY,
      JSON.stringify({ mode: "floating", width: 400 }),
    );
    const view = render(
      <BrowserDock
        agentId="agent-1"
        agentName="Willi"
        forceFlag
        renderContent={stubContent}
      />,
    );
    expect(view.getByTestId("browser-dock").dataset.mode).toBe("floating");

    fireEvent.click(view.getByTestId("browser-dock-mode-docked"));

    expect(view.getByTestId("browser-dock").dataset.mode).toBe("docked");
    const stored = JSON.parse(
      window.localStorage.getItem(BROWSER_DOCK_STORAGE_KEY) ?? "{}",
    ) as { mode?: string; width?: number };
    expect(stored.mode).toBe("docked");
    expect(stored.width).toBe(400);

    fireEvent.click(view.getByTestId("browser-dock-mode-floating"));
    expect(view.getByTestId("browser-dock").dataset.mode).toBe("floating");
  });

  it("4. klemmt die Breite und liest defekte Speicherwerte defensiv", () => {
    expect(clampBrowserDockWidth(9_999, 1_200)).toBe(660);
    expect(clampBrowserDockWidth(10, 1_200)).toBe(300);
    expect(clampBrowserDockWidth(Number.NaN, 1_200)).toBe(420);
    expect(parseBrowserDockSettings(null)).toEqual({
      mode: "floating",
      width: 420,
    });
    expect(
      parseBrowserDockSettings({ mode: "quatsch", width: "breit" }),
    ).toEqual({ mode: "floating", width: 420 });
    expect(parseBrowserDockSettings({ mode: "docked", width: 500 })).toEqual({
      mode: "docked",
      width: 500,
    });
  });

  it("5. kombiniert T3-Vorschau mit Connects Browser-Steuerung", async () => {
    const bridge: T3PreviewBridge = {
      listTabs: async () => [
        {
          threadId: "thread-1",
          tabId: "tab-1",
          url: "https://example.com/t3",
          title: "T3 Beispiel",
          canGoBack: false,
          canGoForward: false,
          frameUrl:
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
          updatedAt: "2026-10-29T10:00:00.000Z",
        },
      ],
    };

    // Kein Netz: alle Hintergrund-Abfragen der bestehenden Komponenten laufen ins Leere.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "offline" }), {
        headers: { "content-type": "application/json" },
        status: 404,
      })) as unknown as typeof fetch;
    try {
      const view = render(<BrowserDockView agentId="agent-1" t3Preview={bridge} />);

      // Der T3-Tab kommt asynchron aus der Brücke. Im Gesamtlauf hängt
      // `waitFor` manchmal an einem MutationObserver, der inzwischen auf ein
      // anderes Fenster zeigt — deshalb hier aktiv flushen statt pollen.
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(view.getByTestId("browser-dock-t3-frame")).toBeTruthy();
      expect(view.getByTestId("browser-dock-source").textContent).toContain(
        "T3-Vorschau",
      );
      expect(view.getByLabelText("Webadresse im Browser-Dock")).toBeTruthy();
      expect(isT3PreviewTab(bridge.listTabs("agent-1"))).toBe(false);
      expect(T3_PREVIEW_RPC_METHODS).toContain("preview.open");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
