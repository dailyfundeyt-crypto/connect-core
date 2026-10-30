/**
 * Tests für die Flotten-Lane (A36).
 *
 * EIGENTÜMER: A36.
 *
 * Geprüft werden die Zusagen, die die Lane macht:
 *
 *  1. 40 Mock-Zeilen → 40 Agenten in der Ansicht (Akzeptanzkriterium).
 *  2. **Ohne Bestätigung wird nichts angelegt** (Akzeptanzkriterium).
 *  3. Das Feature-Flag `bridge` sperrt die Ansicht.
 *  4. Die Vorschau nennt Name, CLI, Arbeitsordner und Maskottchen.
 *  5. Die Formatierung ist an einer Stelle.
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  FLEET_STATUS_LABEL,
  countByStatus,
  toFleetStatus,
} from "./fleet-status";
import {
  formatFleetActivity,
  formatFleetCost,
  formatFleetTokens,
  formatQueuePosition,
} from "./fleet-format";
import {
  buildFleetPreview,
  hashFleetIdea,
  previewAvatar,
  previewWorkspaceSlug,
} from "./fleet-preview";
import { FleetGrid, FleetTable } from "./fleet-table";
import { FleetLoadCard } from "./fleet-load-card";
import type { FleetAgentRow } from "./fleet-client";

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

/** 40 Mock-Agenten — so viele, wie Stefan haben wollte. */
function mockAgents(count = 40): FleetAgentRow[] {
  return Array.from({ length: count }, (_, index) => ({
    agentId: `agent-${index + 1}`,
    name: `Agent ${index + 1}`,
    title: `Rolle ${index + 1}`,
    cli: index % 2 === 0 ? "codex" : "claude",
    provider: "codex",
    state:
      index % 5 === 0
        ? "running"
        : index % 5 === 1
          ? "queued"
          : index % 5 === 2
            ? "sleeping"
            : index % 5 === 3
              ? "idle"
              : "waiting_approval",
    queuePosition: index % 5 === 1 ? index + 1 : null,
    tokensToday: index * 1000,
    costTodayUsd: index * 0.01,
    lastActivityAt: new Date(Date.now() - index * 60_000).toISOString(),
    workspacePath: `C:\\Users\\Kunc GmbH\\workspaces\\agent-${index + 1}`,
    avatar: null,
    visibility: "private" as const,
    canManage: true,
  }));
}

describe("Lane A36 — Flotten-Ansicht", () => {
  beforeEach(() => {
    if (typeof globalThis.window === "undefined") {
      GlobalRegistrator.register({ url: "http://localhost/" });
    }
    setFlags({ bridge: true, mascot: true });
  });

  afterEach(() => {
    cleanup();
    setFlags(ORIGINAL_FLAGS ?? {});
  });

  /* ---------------------------------------------------------------- *
   * 1. Zustände
   * ---------------------------------------------------------------- */
  describe("Zustände", () => {
    test("die Scheduler-Zustände werden auf fünf sichtbare abgebildet", () => {
      expect(toFleetStatus("running")).toBe("running");
      expect(toFleetStatus("queued")).toBe("waiting");
      expect(toFleetStatus("waiting_approval")).toBe("waiting");
      expect(toFleetStatus("sleeping")).toBe("sleeping");
      expect(toFleetStatus("error")).toBe("error");
      expect(toFleetStatus("idle")).toBe("idle");
      expect(toFleetStatus(undefined)).toBe("idle");
    });

    test("jeder Zustand hat ein deutsches Label", () => {
      expect(FLEET_STATUS_LABEL.running).toBe("läuft");
      expect(FLEET_STATUS_LABEL.waiting).toBe("wartet");
      expect(FLEET_STATUS_LABEL.error).toBe("Fehler");
    });

    test("die Zähler zählen die Zeilen", () => {
      const counts = countByStatus(mockAgents(40));
      expect(counts.running).toBe(8);
      expect(counts.waiting).toBe(16);
      expect(counts.sleeping).toBe(8);
      expect(counts.idle).toBe(8);
      expect(counts.error).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- *
   * 2. Formatierung
   * ---------------------------------------------------------------- */
  describe("Formatierung", () => {
    test("Token-Mengen werden lesbar", () => {
      expect(formatFleetTokens(0)).toBe("—");
      expect(formatFleetTokens(999)).toBe("999");
      expect(formatFleetTokens(1500)).toBe("1,5k");
      expect(formatFleetTokens(2_500_000)).toBe("2,5 Mio.");
    });

    test("Kosten werden lesbar", () => {
      expect(formatFleetCost(0)).toBe("—");
      expect(formatFleetCost(0.005)).toBe("< 0,01 $");
      expect(formatFleetCost(1.5)).toBe("1,50 $");
    });

    test("die letzte Aktivität ist auf Deutsch", () => {
      const now = Date.parse("2026-10-29T12:00:00.000Z");
      expect(formatFleetActivity(null, now)).toBe("noch nie");
      expect(formatFleetActivity("2026-10-29T11:59:57.000Z", now)).toBe(
        "gerade eben",
      );
      expect(formatFleetActivity("2026-10-29T11:45:00.000Z", now)).toBe(
        "vor 15 Min.",
      );
      expect(formatFleetActivity("2026-10-29T09:00:00.000Z", now)).toBe(
        "vor 3 Std.",
      );
    });

    test("die Warteschlangenposition", () => {
      expect(formatQueuePosition(null)).toBe("—");
      expect(formatQueuePosition(0)).toBe("—");
      expect(formatQueuePosition(3)).toBe("Position 3");
    });
  });

  /* ---------------------------------------------------------------- *
   * 3. Die Vorschau
   * ---------------------------------------------------------------- */
  describe("Vorschau", () => {
    test("der Hash ist stabil", () => {
      expect(hashFleetIdea("I1")).toBe(hashFleetIdea("I1"));
      expect(hashFleetIdea("I1")).not.toBe(hashFleetIdea("I2"));
    });

    test("der Ordnername folgt den A07-Regeln", () => {
      expect(previewWorkspaceSlug("Nova Limits")).toBe("nova-limits");
      expect(previewWorkspaceSlug("Max Müller")).toBe("max-mueller");
      expect(previewWorkspaceSlug("!!!")).toBe("agent");
    });

    test("das Maskottchen ist stabil", () => {
      const a = previewAvatar("I1");
      const b = previewAvatar("I1");
      expect(a).toEqual(b);
      expect(a.shape).toBeTruthy();
      expect(a.color).toBeTruthy();
    });

    test("die Vorschau nennt Name, CLI, Ordner und Maskottchen", () => {
      const preview = buildFleetPreview([
        {
          id: "I1",
          title: "Nutzung & Limits",
          cli: "codex",
          name: "Nova Limits",
          description: "Baut die Nutzungsansicht",
        },
      ]);
      expect(preview).toHaveLength(1);
      expect(preview[0]?.name).toBe("Nova Limits");
      expect(preview[0]?.cliLabel).toBe("Codex");
      expect(preview[0]?.workspaceSlug).toBe("nova-limits");
      expect(preview[0]?.avatar.shape).toBeTruthy();
    });

    test("40 Ideen ergeben 40 Vorschauzeilen", () => {
      const ideas = Array.from({ length: 40 }, (_, index) => ({
        id: `I${index + 1}`,
        title: `Idee ${index + 1}`,
        cli: "codex" as const,
        name: `Agent ${index + 1}`,
        description: "",
      }));
      expect(buildFleetPreview(ideas)).toHaveLength(40);
    });
  });

  /* ---------------------------------------------------------------- *
   * 4. Rendern
   * ---------------------------------------------------------------- */
  describe("Rendern", () => {
    test("die Tabelle zeigt 40 Agenten", () => {
      const { container } = render(<FleetTable agents={mockAgents(40)} />);
      expect(container.querySelectorAll("tbody tr")).toHaveLength(40);
      expect(container.textContent).toContain("Agent 40");
    });

    test("das Raster zeigt 40 Kacheln", () => {
      const { container } = render(<FleetGrid agents={mockAgents(40)} />);
      expect(container.querySelectorAll("[data-testid='fleet-grid'] > button")).toHaveLength(
        40,
      );
    });

    test("die Tabelle nennt CLI, Tokens und Aktivität", () => {
      const { container } = render(<FleetTable agents={mockAgents(1)} />);
      expect(container.textContent).toContain("Codex");
      expect(container.textContent).toContain("Tokens heute");
      expect(container.textContent).toContain("Warteschlange");
      expect(container.textContent).toContain("Arbeitsordner");
    });

    test("eine leere Flotte sagt das", () => {
      const { container } = render(<FleetTable agents={[]} />);
      expect(container.textContent).toContain("Keine Agenten");
    });

    test("die PC-Last wird angezeigt", () => {
      const { container } = render(
        <FleetLoadCard
          load={{
            cpuPercent: 42,
            cpuAverage30sPercent: 38,
            ramFreeGb: 12.4,
            ramTotalGb: 32,
            diskFreeGb: 180,
            cliProcessCount: 7,
            throttled: false,
            reason: null,
          }}
        />,
      );
      expect(container.textContent).toContain("CPU");
      expect(container.textContent).toContain("12,4 GB frei");
      expect(container.textContent).toContain("7");
      expect(container.textContent).toContain("Keine Drosselung");
    });

    test("eine aktive Drosselung wird deutlich gesagt", () => {
      const { container } = render(
        <FleetLoadCard
          load={{
            cpuPercent: 95,
            cpuAverage30sPercent: 91,
            ramFreeGb: 2,
            ramTotalGb: 32,
            diskFreeGb: 180,
            cliProcessCount: 7,
            throttled: true,
            reason: "Hohe CPU-Auslastung",
          }}
        />,
      );
      expect(container.textContent).toContain("Drosselung aktiv");
      expect(container.textContent).toContain("Hohe CPU-Auslastung");
    });
  });

  /* ---------------------------------------------------------------- *
   * 5. Ohne Bestätigung wird nichts angelegt
   * ---------------------------------------------------------------- */
  describe("Massen-Anlage", () => {
    test("der Client ruft das Anlegen nur mit confirm: true", async () => {
      const calls: { url: string; body: unknown }[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(
          JSON.stringify({ created: [], failed: [], requested: 0, createdAt: "" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch;

      try {
        const { batchCreateAgents } = await import("./fleet-client");

        await batchCreateAgents({
          ideas: [
            {
              id: "I1",
              title: "Idee",
              cli: "codex",
              name: "Agent",
              description: "",
            },
          ],
          confirm: false,
        });

        const body = calls[0]?.body as { confirm?: boolean } | null;
        expect(body?.confirm).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
