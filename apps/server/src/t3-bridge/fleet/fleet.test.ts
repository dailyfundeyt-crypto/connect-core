/**
 * T3-Bridge — Tests für die Flotten-Lane (A36).
 *
 * Lane: A36 (Welle W3)
 *
 * Geprüft werden die Annahmen, auf denen die Lane steht:
 *
 *  1. Der Backlog-Parser liest eine Zeile = eine Idee und meldet Unlesbares.
 *  2. 40 Mock-Zeilen werden zu 40 Agenten (Akzeptanzkriterium).
 *  3. **Ohne Bestätigung wird nichts angelegt** (Akzeptanzkriterium).
 *  4. Das Feature-Flag `bridge` sperrt die Endpunkte.
 *  5. Die PC-Last (A09) landet in der Flotten-Ansicht.
 */

import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import {
  dedupeIdeas,
  deriveAgentName,
  isSeparatorRow,
  isTableRow,
  parseCliCell,
  parseIdeaBacklog,
  splitTableRow,
} from "./backlog-parser";
import { createFleetRoutes, sanitizeIdea } from "./routes";
import { FleetService, summarizeFleet, todayInBerlin } from "./service";
import type { FleetAgentRow, FleetIdea } from "./types";

const ACTOR = { id: "user-1", role: "admin" as const };

/* ---------------------------------------------------------------------------------------- *
 * Hilfen
 * ---------------------------------------------------------------------------------------- */

/** 40 Mock-Ideen — so viele, wie Stefan Agenten haben wollte. */
function mockIdeas(count: number): FleetIdea[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `I${index + 1}`,
    title: `Idee Nummer ${index + 1}`,
    cli: "codex",
    name: `Agent Nummer ${index + 1}`,
    description: `Arbeitsanweisung für Idee ${index + 1}.`,
  }));
}

/** Ein Agenten-Store, der nur zählt und Namen zurückgibt. */
function countingStore(created: { name: string }[]) {
  return {
    list: async () => [],
    get: async () => null,
    create: async (_actor: unknown, input: { name: string }) => {
      created.push({ name: input.name });
      return { id: `agent-${created.length}`, name: input.name };
    },
  } as never;
}

/* ---------------------------------------------------------------------------------------- *
 * 1. Der Backlog-Parser
 * ---------------------------------------------------------------------------------------- */

describe("A36 — Backlog-Parser", () => {
  test("eine Tabellenzeile wird in Zellen zerlegt", () => {
    expect(splitTableRow("| I1 | Idee | codex | Nova | Kurz |")).toEqual([
      "I1",
      "Idee",
      "codex",
      "Nova",
      "Kurz",
    ]);
  });

  test("Trennzeilen und Tabellenzeilen werden unterschieden", () => {
    expect(isSeparatorRow("|---|---|")).toBe(true);
    expect(isSeparatorRow("| I1 | Idee |")).toBe(false);
    expect(isTableRow("| I1 | Idee |")).toBe(true);
    expect(isTableRow("Ein Absatz")).toBe(false);
  });

  test("CLI-Synonyme werden aufgelöst", () => {
    expect(parseCliCell("codex")).toEqual({ ok: true, cli: "codex" });
    expect(parseCliCell("ClaudeAgent")).toEqual({ ok: true, cli: "claude" });
    expect(parseCliCell("claude")).toEqual({ ok: true, cli: "claude" });
    expect(parseCliCell("")).toEqual({ ok: true, cli: "codex" });
  });

  test("eine unbekannte CLI wird gemeldet, nicht stillschweigend ersetzt", () => {
    const result = parseCliCell("gpt-9000");
    expect(result.ok).toBe(false);
  });

  test("ein Backlog mit 40 Zeilen ergibt 40 Ideen", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) => `| I${i + 1} | Idee ${i + 1} | codex | Agent ${i + 1} | Text ${i + 1} |`,
    );
    const markdown = [
      "| ID | Idee | CLI | Agent | Beschreibung |",
      "|---|---|---|---|---|",
      ...rows,
    ].join("\n");

    const book = parseIdeaBacklog(markdown);
    expect(book.ideas).toHaveLength(40);
    expect(book.ideas[0]?.id).toBe("I1");
    expect(book.ideas[39]?.name).toBe("Agent 40");
    expect(book.skipped).toHaveLength(0);
  });

  test("Zeilen ohne Idee werden als übersprungen gemeldet", () => {
    const markdown = [
      "| ID | Idee | CLI |",
      "|---|---|---|",
      "| I1 | Nutzung | codex |",
      "| I2 |  | codex |",
    ].join("\n");

    const book = parseIdeaBacklog(markdown);
    expect(book.ideas).toHaveLength(1);
    expect(book.skipped).toHaveLength(1);
    expect(book.skipped[0]?.reason).toContain("Titel");
  });

  test("eine unbekannte CLI in einer Zeile macht die Zeide unlesbar", () => {
    const markdown = ["| I1 | Idee | quatsch |", "|---|---|---|"].join("\n");
    const book = parseIdeaBacklog(markdown);
    expect(book.ideas).toHaveLength(0);
    expect(book.skipped[0]?.reason).toContain("Unbekannte CLI");
  });

  test("der Agentenname wird aus der Idee abgeleitet, wenn keiner dasteht", () => {
    expect(deriveAgentName("Nutzung & Limits", "I1")).toBe("Nutzung Limits");
    expect(deriveAgentName("", "I7")).toBe("Agent I7");
  });

  test("Code-Blöcke werden nicht als Ideen gelesen", () => {
    const markdown = [
      "| ID | Idee |",
      "|---|---|",
      "| I1 | Echte Idee |",
      "```",
      "| I2 | Beispielzeile |",
      "```",
    ].join("\n");

    const book = parseIdeaBacklog(markdown);
    expect(book.ideas).toHaveLength(1);
    expect(book.ideas[0]?.title).toBe("Echte Idee");
  });

  test("doppelte Namen werden abgefangen", () => {
    const { unique, duplicates } = dedupeIdeas([
      { id: "I1", title: "A", cli: "codex", name: "Nova", description: "" },
      { id: "I2", title: "B", cli: "codex", name: "nova", description: "" },
    ]);
    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 2. Die Massen-Anlage
 * ---------------------------------------------------------------------------------------- */

describe("A36 — Massen-Anlage", () => {
  test("40 Ideen ergeben 40 Agenten", async () => {
    const created: { name: string }[] = [];
    const service = new FleetService({
      createAgent: async (_actor, input) => {
        created.push({ name: input.name });
        return { id: `agent-${created.length}`, name: input.name };
      },
    });

    const result = await service.createFromIdeas(ACTOR, {
      ideas: mockIdeas(40),
      confirm: true,
    });

    expect(result.requested).toBe(40);
    expect(result.created).toHaveLength(40);
    expect(result.failed).toHaveLength(0);
    expect(created).toHaveLength(40);
  });

  test("ohne Bestätigung wird NICHTS angelegt", async () => {
    const created: { name: string }[] = [];
    const service = new FleetService({
      createAgent: async (_actor, input) => {
        created.push({ name: input.name });
        return { id: `agent-${created.length}`, name: input.name };
      },
    });

    const result = await service.createFromIdeas(ACTOR, {
      ideas: mockIdeas(40),
      confirm: false,
    });

    expect(result.requested).toBe(40);
    expect(result.created).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  test("auch ohne das Feld `confirm` wird nichts angelegt", async () => {
    const created: { name: string }[] = [];
    const service = new FleetService({
      createAgent: async (_actor, input) => {
        created.push({ name: input.name });
        return { id: `agent-${created.length}`, name: input.name };
      },
    });

    await service.createFromIdeas(ACTOR, { ideas: mockIdeas(3) });
    expect(created).toHaveLength(0);
  });

  test("ein fehlgeschlagener Agent stoppt die anderen nicht", async () => {
    let counter = 0;
    const service = new FleetService({
      createAgent: async (_actor, input) => {
        counter += 1;
        if (counter === 2) throw new Error("Name ist belegt");
        return { id: `agent-${counter}`, name: input.name };
      },
    });

    const result = await service.createFromIdeas(ACTOR, {
      ideas: mockIdeas(3),
      confirm: true,
    });

    expect(result.created).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.reason).toContain("belegt");
  });

  test("doppelte Namen in einer Auswahl werden als Fehler gemeldet", async () => {
    const service = new FleetService({
      createAgent: async (_actor, input) => ({
        id: `agent-${input.name}`,
        name: input.name,
      }),
    });

    const ideas = mockIdeas(2);
    ideas[1] = { ...ideas[1]!, name: ideas[0]!.name };

    const result = await service.createFromIdeas(ACTOR, { ideas, confirm: true });
    expect(result.created).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
  });

  test("die Vorschau legt nichts an", async () => {
    const created: { name: string }[] = [];
    const service = new FleetService({
      createAgent: async (_actor, input) => {
        created.push({ name: input.name });
        return { id: `agent-${created.length}`, name: input.name };
      },
    });

    const preview = await service.preview(mockIdeas(40));
    expect(preview).toHaveLength(40);
    expect(created).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 3. Die Flotten-Ansicht
 * ---------------------------------------------------------------------------------------- */

describe("A36 — Flotten-Ansicht", () => {
  test("die PC-Last (A09) landet in der Ansicht", async () => {
    const service = new FleetService({
      metrics: {
        getDetailedMetrics: () =>
          ({
            at: "2026-10-29T10:00:00.000Z",
            timestamp: 1,
            throttled: false,
            reasons: [],
            cpu: {
              currentPercent: 42,
              average30sPercent: 38,
              cores: 16,
              samplesCount: 6,
              highCpuSince: null,
              highCpuDurationMs: 0,
            },
            ram: { freeGb: 12, totalGb: 32, usedGb: 20, percentUsed: 62 },
            disk: {
              drive: "C:\\",
              freeGb: 180,
              totalGb: 512,
              usedGb: 332,
              percentUsed: 65,
            },
            cliProcesses: { count: 7, pids: [], details: [] },
            limits: {
              maxCpuPercent: 85,
              minFreeRamGb: 4,
              minFreeDiskGb: 20,
            },
          }) as never,
      },
    });

    const overview = await service.overview(ACTOR);
    expect(overview.load.cpuPercent).toBe(42);
    expect(overview.load.ramFreeGb).toBe(12);
    expect(overview.load.diskFreeGb).toBe(180);
    expect(overview.load.cliProcessCount).toBe(7);
    expect(overview.load.throttled).toBe(false);
  });

  test("die Summen zählen die Zustände", () => {
    const rows: FleetAgentRow[] = [
      {
        agentId: "a",
        name: "A",
        title: "",
        cli: "codex",
        provider: "codex",
        state: "running",
        queuePosition: null,
        tokensToday: 100,
        costTodayUsd: 0.5,
        lastActivityAt: null,
        workspacePath: null,
        avatar: null,
        visibility: "private",
        canManage: true,
      },
      {
        agentId: "b",
        name: "B",
        title: "",
        cli: "codex",
        provider: "codex",
        state: "queued",
        queuePosition: 3,
        tokensToday: 0,
        costTodayUsd: 0,
        lastActivityAt: null,
        workspacePath: null,
        avatar: null,
        visibility: "private",
        canManage: true,
      },
    ];

    const summary = summarizeFleet(rows);
    expect(summary.total).toBe(2);
    expect(summary.running).toBe(1);
    expect(summary.queued).toBe(1);
    expect(summary.tokensToday).toBe(100);
    expect(summary.costTodayUsd).toBe(0.5);
  });

  test("ohne Quellen bleibt die Ansicht trotzdem benutzbar", async () => {
    const service = new FleetService();
    const overview = await service.overview(ACTOR);
    expect(overview.agents).toHaveLength(0);
    expect(overview.summary.total).toBe(0);
    expect(overview.limits.maxConcurrentTurns).toBeGreaterThan(0);
  });

  test("der heutige Tag wird in Europe/Berlin bestimmt", () => {
    expect(todayInBerlin(new Date("2026-10-29T23:30:00.000Z"))).toBe("2026-10-30");
    expect(todayInBerlin(new Date("2026-10-29T09:30:00.000Z"))).toBe("2026-10-29");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 4. Die Routen & das Feature-Flag
 * ---------------------------------------------------------------------------------------- */

describe("A36 — Flotten-Routen", () => {
  test("ohne Feature-Flag antworten die Endpunkte mit 503", async () => {
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: false };
    try {
      const app = new Hono();
      app.route("/api/t3/fleet", createFleetRoutes());

      const res = await app.request("/api/t3/fleet");
      expect(res.status).toBe(503);
    } finally {
      delete (globalThis as any).__CONNECT_FLAGS_T3;
    }
  });

  test("mit Feature-Flag liefert GET die Flotten-Ansicht", async () => {
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: true };
    try {
      const app = new Hono();
      app.route("/api/t3/fleet", createFleetRoutes());

      const res = await app.request("/api/t3/fleet");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { agents: unknown[]; summary: unknown };
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.summary).toBeTruthy();
    } finally {
      delete (globalThis as any).__CONNECT_FLAGS_T3;
    }
  });

  test("POST /batch-create legt ohne `confirm` nichts an", async () => {
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: true };
    try {
      const created: { name: string }[] = [];
      const app = new Hono();
      app.route(
        "/api/t3/fleet",
        createFleetRoutes({
          createAgent: async (_actor, input) => {
            created.push({ name: input.name });
            return { id: `agent-${created.length}`, name: input.name };
          },
        }),
      );

      const res = await app.request("/api/t3/fleet/batch-create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ideas: mockIdeas(40) }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { created: unknown[]; requested: number };
      expect(body.requested).toBe(40);
      expect(body.created).toHaveLength(0);
      expect(created).toHaveLength(0);
    } finally {
      delete (globalThis as any).__CONNECT_FLAGS_T3;
    }
  });

  test("POST /batch-create legt mit `confirm` an", async () => {
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: true };
    try {
      const created: { name: string }[] = [];
      const app = new Hono();
      app.route(
        "/api/t3/fleet",
        createFleetRoutes({
          createAgent: async (_actor, input) => {
            created.push({ name: input.name });
            return { id: `agent-${created.length}`, name: input.name };
          },
        }),
      );

      const res = await app.request("/api/t3/fleet/batch-create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ideas: mockIdeas(40), confirm: true }),
      });

      const body = (await res.json()) as { created: unknown[] };
      expect(body.created).toHaveLength(40);
      expect(created).toHaveLength(40);
    } finally {
      delete (globalThis as any).__CONNECT_FLAGS_T3;
    }
  });

  test("POST /parse-backlog liest Markdown", async () => {
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: true };
    try {
      const app = new Hono();
      app.route("/api/t3/fleet", createFleetRoutes());

      const res = await app.request("/api/t3/fleet/parse-backlog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown:
            "| ID | Idee | CLI |\n|---|---|---|\n| I1 | Nutzung | codex |\n| I2 | Avatar | claude |",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ideas: { id: string; cli: string }[];
        count: number;
      };
      expect(body.count).toBe(2);
      expect(body.ideas[1]?.cli).toBe("claude");
    } finally {
      delete (globalThis as any).__CONNECT_FLAGS_T3;
    }
  });

  test("eine Idee mit kaputter CLI wird vom Server abgewiesen", () => {
    expect(sanitizeIdea({ title: "X", cli: "quatsch" })).toBeNull();
    expect(sanitizeIdea({ title: "", cli: "codex" })).toBeNull();
    expect(sanitizeIdea({ title: "X", cli: "codex" })?.name).toBe("X");
  });
});
