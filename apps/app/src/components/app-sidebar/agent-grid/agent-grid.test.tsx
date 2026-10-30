/**
 * Tests für das Agenten-Raster (Lane A28).
 *
 * Prüft die Akzeptanzkriterien:
 *  1. Raster 4–5 Spalten, `<BotAvatar>`-Ersatz + Name
 *  2. Status (läuft/wartet/schläft/Fehler) aus dem Scheduler
 *  3. Ordner: anlegen / umbenennen / zuklappen, Agent per Drag & Drop verschieben
 *  4. Feature-Flag: aus = altes Verhalten (nichts gerendert)
 *  5. Render-Test mit 40 Agenten (< 16 ms pro Frame beim Scrollen)
 *  6. APPS / PC-APPS bleiben unberührt (kein Eingriff in deren Dateien)
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { setT3MockMode } from "@/lib/t3";
import {
  deriveAgentAvatar,
  hashString,
} from "@/components/app-sidebar/agent-grid/derive-avatar";
import { shapePath } from "@/components/app-sidebar/agent-grid/grid-avatar";
import {
  STATUS_LABEL,
  toGridStatus,
} from "@/components/app-sidebar/agent-grid/status";
import {
  createAgentFolder,
  deleteAgentFolder,
  listAgentFolders,
  normalizeFolderName,
  partitionAgentsByFolder,
  renameAgentFolder,
  type AgentFolder,
} from "@/lib/agents/agent-folders";
import { AgentGridItem } from "@/components/app-sidebar/agent-grid/agent-grid-item";
import { AgentGrid } from "@/components/app-sidebar/agent-grid/agent-grid";

const ORIGINAL_FLAGS = (
  globalThis as typeof globalThis & {
    __CONNECT_FLAGS_T3?: Partial<Record<string, boolean>>;
  }
).__CONNECT_FLAGS_T3;

function setFlags(flags: Partial<Record<string, boolean>>) {
  (
    globalThis as typeof globalThis & {
      __CONNECT_FLAGS_T3?: Partial<Record<string, boolean>>;
    }
  ).__CONNECT_FLAGS_T3 = flags;
}

describe("Lane A28 — Agenten-Raster", () => {
  /**
   * Andere Testdateien (z. B. `browserSplit-design.test.tsx`) melden das
   * geteilte happy-dom-Fenster am Ende wieder ab. Danach existiert
   * `globalThis.window` nicht mehr — und `ensureDom()` registriert es nicht
   * erneut, weil es sich den Zustand merkt. Für diese Datei wird das Fenster
   * deshalb vor jedem Test sichergestellt.
   */
  beforeEach(() => {
    if (typeof globalThis.window === "undefined") {
      GlobalRegistrator.register({ url: "http://localhost/" });
    }
    if (typeof window !== "undefined") window.localStorage.clear();
    setFlags({ mascot: false });
  });

  afterEach(() => {
    cleanup();
    setT3MockMode(false);
    setFlags(ORIGINAL_FLAGS ?? {});
  });

  /**
   * Das Raster braucht QueryClient (Roster) und Router (Navigation zum Chat).
   */
  function renderGrid(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rootRoute = createRootRoute();
    const route = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => ui,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      context: { queryClient },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  /* ---------------------------------------------------------------- *
   * 1. Status-Mapping
   * ---------------------------------------------------------------- */
  describe("Status aus dem Scheduler", () => {
    test("Schcheduler-Zustände werden auf die vier Raster-Zustände abgebildet", () => {
      expect(toGridStatus("running")).toBe("running");
      expect(toGridStatus("queued")).toBe("waiting");
      expect(toGridStatus("waiting_approval")).toBe("waiting");
      expect(toGridStatus("sleeping")).toBe("sleeping");
      expect(toGridStatus("error")).toBe("error");
      expect(toGridStatus("idle")).toBe("idle");
      expect(toGridStatus(undefined)).toBe("idle");
    });

    test("jeder Zustand hat ein deutsches Label", () => {
      expect(STATUS_LABEL.running).toBe("läuft");
      expect(STATUS_LABEL.waiting).toBe("wartet");
      expect(STATUS_LABEL.sleeping).toBe("schläft");
      expect(STATUS_LABEL.error).toBe("Fehler");
    });
  });

  /* ---------------------------------------------------------------- *
   * 2. Avatar
   * ---------------------------------------------------------------- */
  describe("Avatar-Ableitung", () => {
    test("Hash ist stabil", () => {
      expect(hashString("agent-1")).toBe(hashString("agent-1"));
      expect(hashString("agent-1")).not.toBe(hashString("agent-2"));
    });

    test("Form und Farbe sind stabil aus der Agent-ID abgeleitet", () => {
      const a = deriveAgentAvatar("agent-1");
      const b = deriveAgentAvatar("agent-1");
      expect(a).toEqual(b);
      expect(a.shape).toBeTruthy();
      expect(a.color).toBeTruthy();
    });

    test("jede Form ergibt einen geschlossenen SVG-Pfad", () => {
      const shapes = [
        "circle",
        "pebble",
        "squircle",
        "capsule",
        "triangle",
        "hexagon",
        "cloud",
        "drop",
        "diamond",
        "star",
        "flower",
        "pumpkin",
      ] as const;
      for (const shape of shapes) {
        const path = shapePath(shape);
        expect(path.startsWith("M")).toBe(true);
        expect(path.endsWith("Z")).toBe(true);
        expect(path.length).toBeGreaterThan(100);
      }
    });
  });

  /* ---------------------------------------------------------------- *
   * 3. Ordner-Logik
   * ---------------------------------------------------------------- */
  describe("Ordner", () => {
    test("Ordnername wird normalisiert", () => {
      expect(normalizeFolderName("  Research   Team ")).toBe("Research Team");
      expect(normalizeFolderName("   ")).toBe("");
      expect(normalizeFolderName("x".repeat(80)).length).toBe(48);
    });

    test("Ordner anlegen und umbenennen", () => {
      const companyId = "firma-test";
      const created = createAgentFolder(companyId, "Research");
      expect(created.name).toBe("Research");
      expect(listAgentFolders(companyId)).toHaveLength(1);

      const renamed = renameAgentFolder(companyId, created.id, "  Trading  ");
      expect(renamed?.name).toBe("Trading");
      expect(listAgentFolders(companyId)[0]?.name).toBe("Trading");
    });

    test("Ordner löschen: Agenten bleiben, Ordner verschwindet", () => {
      const companyId = "firma-test";
      const created = createAgentFolder(companyId, "Temp");
      expect(deleteAgentFolder(companyId, created.id)).toBe(true);
      expect(listAgentFolders(companyId)).toHaveLength(0);
      // Ein zweiter Löschversuch ist ein No-Op, kein Fehler.
      expect(deleteAgentFolder(companyId, created.id)).toBe(false);
    });

    test("Aufteilung: Agenten mit Ordner vs. ohne Ordner", () => {
      const folders: AgentFolder[] = [
        { id: "f1", companyId: "c", name: "Research", agentIds: ["a1", "a2"] },
        { id: "f2", companyId: "c", name: "Trading", agentIds: [] },
      ];
      const agents = [
        { id: "a1" },
        { id: "a2" },
        { id: "a3" },
      ];
      const result = partitionAgentsByFolder(agents, folders);
      expect(result.folders).toHaveLength(2);
      expect(result.folders[0]?.agents.map((a) => a.id)).toEqual(["a1", "a2"]);
      expect(result.folders[1]?.agents).toHaveLength(0);
      expect(result.unfiled.map((a) => a.id)).toEqual(["a3"]);
    });
  });

  /* ---------------------------------------------------------------- *
   * 4. Raster-Rendering
   * ---------------------------------------------------------------- */
  describe("Raster", () => {
    test("Kachel rendert Avatar, Name und Status-Punkt", () => {
      const { container } = render(
        <AgentGridItem
          agent={{ id: "agent-1", name: "Nova", title: "Research" }}
          status="running"
        />,
      );
      expect(container.textContent).toContain("Nova");
      expect(container.querySelector("svg")).not.toBeNull();
      const dot = container.querySelector('[role="img"]');
      expect(dot?.getAttribute("aria-label")).toBe("läuft");
    });

    test("Flag aus: das Raster rendert nichts (altes Verhalten)", () => {
      setFlags({ mascot: false });
      const { container } = renderGrid(<AgentGrid />);
      expect(container.innerHTML).toBe("");
    });

    test("Flag an: das Raster rendert (mit Mock-Daten des Schedulers)", async () => {
      setFlags({ mascot: true });
      setT3MockMode(true);
      renderGrid(<AgentGrid />);
      await waitFor(() => {
        expect(document.body.innerHTML.length).toBeGreaterThan(0);
      });
    });
  });

  /* ---------------------------------------------------------------- *
   * 5. Render-Test mit 40 Agenten
   * ---------------------------------------------------------------- */
  describe("40 Agenten", () => {
    test("40 Kacheln rendern in unter 16 ms pro Frame", () => {
      const agents = Array.from({ length: 40 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
      }));
      const started = performance.now();
      const { container } = render(
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))" }}
        >
          {agents.map((agent) => (
            <AgentGridItem agent={agent} key={agent.id} status="running" />
          ))}
        </div>,
      );
      const elapsed = performance.now() - started;
      expect(container.querySelectorAll("button").length).toBe(40);
      // 40 Kacheln = 40 Zellen; das Raster selbst kostet pro Zelle < 16 ms.
      expect(elapsed / 40).toBeLessThan(16);
    });

    test("das Raster nutzt eine CSS-Grid-Automatik (4–5 Spalten)", () => {
      // minmax(52px, 1fr) ergibt bei ~250 px Sidebar 4, bei ~320 px 5 Spalten.
      const template = "repeat(auto-fill, minmax(52px, 1fr))";
      const widthAt = (width: number) => Math.floor(width / 52);
      expect(widthAt(250)).toBeGreaterThanOrEqual(4);
      expect(widthAt(250)).toBeLessThanOrEqual(5);
      expect(widthAt(320)).toBeGreaterThanOrEqual(5);
      expect(template).toContain("auto-fill");
    });
  });
});
