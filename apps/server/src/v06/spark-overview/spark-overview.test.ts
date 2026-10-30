/**
 * Tests A17 – Spark-Übersicht (kleiner Fixture-Vault, keine externe API).
 * Ausführen: `cd apps/server && bun test src/v06/spark-overview`
 */
import { describe, expect, it, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Hono } from "hono";
import {
  buildCompanyStructureOverview,
  clusterIdOf,
  folderOf,
  tokenize,
  parseTags,
  extractFacts,
  wikiLinkTargets,
  resolveWikiTarget,
  ROOT_FOLDER,
  clusterIdOfTag,
} from "./aggregate";
import { agentDataAccess, logAgentAccess, setAgentAccessBackend, type AgentAccessEvent } from "./agentAccess";
import { createSparkOverviewRouter } from "./routes";

/* ------------------------------------------------------------------ Fixture-Vault */
type FixtureEntry = [relPath: string, mtimeOffsetDays: number, content: string];
const FIXTURE: FixtureEntry[] = [
  // [relPath, mtimeOffsetDays, content]
  ["Kern/Strategie.md", 1, "---\ntags: [strategie, tema1]\n---\n# Strategie\n## Prioritäten 2026\n## Connect Swarm\n[[Marketing/Ton.md]]"],
  ["Kern/Agenten.md", 40, "# Agenten\n## Rollen\nagent rollen connect"],
  ["Marketing/Ton.md", 2, "# Ton\n## Markenstimme\ntags: #marke #tema1"],
  ["Marketing/Kampagne.md", 3, "# Kampagne\n## Kanäle\n[[Kern/Strategie.md]]"],
  ["Projects/flux/Plan.md", 29, "# Flux\n## Phase 1\n[[Kern/Strategie.md]]"],
  ["Notizen am Root.md", 2, "# Wurzelnotiz\n## Loud and clear\nroot notiz"],
];

let vaultDir: string | null = null;

async function fixture(): Promise<string> {
  if (vaultDir) return vaultDir;
  vaultDir = await mkdtemp(path.join(tmpdir(), "spark-overview-a17-"));
  for (const [rel, , content] of FIXTURE) {
    const full = path.join(vaultDir, ...rel.split("/"));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  return vaultDir;
}

const fixtureFiles = () =>
  FIXTURE.map(([rel, mtimeOffsetDays]) => ({
    path: rel,
    size: 100,
    mtime: new Date(Date.now() - mtimeOffsetDays * 24 * 60 * 60 * 1000).toISOString(),
  }));

afterAll(async () => {
  if (vaultDir) await rm(vaultDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ Aggregation */

describe("A17 – Cluster-Aggregation", () => {
  it("bildet oberste Ordner als Cluster mit noteCount", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    expect(overview.companyId).toBe("c-17");
    expect(overview.available).toBe(true);
    const folderIds = overview.clusters.filter((c) => !c.id.startsWith("tag:")).map((c) => c.id);
    expect(folderIds.sort()).toEqual(["", "Kern", "Marketing", "Projects"]);
  });

  it("heat zählt nur Änderungen der letzten 30 Tage", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    const kern = overview.clusters.find((c) => c.id === "Kern")!;
    // Strategie.md (vor 1 Tag) zählt, Agenten.md (vor 40 Tagen) nicht.
    expect(kern.heat).toBe(1);
    expect(kern.noteCount).toBe(2);
  });

  it("topTerms sind per TF-IDF berechnet und ohne Stoppwörter", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    const marketing = overview.clusters.find((c) => c.id === "Marketing")!;
    expect(marketing.topTerms.length).toBeGreaterThan(0);
    for (const term of marketing.topTerms) {
      expect(term.length).toBeGreaterThan(2);
      expect(["der", "die", "das", "och", "und"]).not.toContain(term);
    }
  });

  it("Tags ab zwei Notizen werden eigene Cluster", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    const tagIds = overview.clusters.filter((c) => c.id.startsWith("tag:")).map((c) => c.id);
    expect(tagIds).toContain(clusterIdOfTag("tema1"));
    expect(tagIds).not.toContain(clusterIdOfTag("strategie")); // nur eine Notiz
    const tema = overview.clusters.find((c) => c.id === clusterIdOfTag("tema1"))!;
    expect(tema.noteCount).toBe(2);
  });

  it("liefert facts (Häufige Fakten) und neueste Notizen für den Drill-down", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    const kern = overview.clusters.find((c) => c.id === "Kern")!;
    expect(kern.facts).toContain("Prioritäten 2026");
    expect(kern.latestNotes?.length).toBeGreaterThan(0);
    expect(kern.latestNotes?.[0]?.title.length ?? 0).toBeGreaterThan(0);
  });

  it("erzeugt Wiki-Link-Kanten zwischen Ordner-Clustern", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    // Kern/Strategie.md verlinkt Marketing/Ton.md und umgekehrt; mindestens eine Kante Kern↔Marketing.
    expect(overview.links.some((l) => (l.from === "Kern" && l.to === "Marketing") || (l.from === "Marketing" && l.to === "Kern"))).toBe(true);
  });

  it("notiert Notizen ohne Ordner unter ROOT_FOLDER", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: fixtureFiles(),
    });
    const root = overview.clusters.find((c) => c.id === "");
    expect(root).toBeDefined();
    expect(root?.noteCount).toBe(1);
  });

  it("antwortet mit available:false bei einem leeren Vault", async () => {
    const overview = await buildCompanyStructureOverview(await fixture(), {
      companyId: "c-17",
      files: [],
    });
    expect(overview.available).toBe(false);
    expect(overview.clusters).toEqual([]);
  });
});

/* ------------------------------------------------------------------ Log & Routen */

describe("A17 – Agenten-Datenzugriff", () => {
  it("logAgentAccess schreibt ins Lager und agentDataAccess aggregiert es", async () => {
    const events: AgentAccessEvent[] = [];
    setAgentAccessBackend({
      append: async (event) => {
        events.push(event);
      },
      listByAgent: async (agentId) => events.filter((e) => e.agentId === agentId).map((e) => ({ kind: e.kind, ref: e.ref, at: e.at })),
    });
    try {
      await logAgentAccess("agent-17", "Kern/Strategie.md");
      await logAgentAccess("agent-17", { kind: "link", ref: "https://example.com" });
      await logAgentAccess("agent-17", "Kern/Strategie.md");
      await logAgentAccess("", "ignorieren");
      expect(events.length).toBe(3);
      expect(events[0].kind).toBe("note");
      expect(events[1].kind).toBe("link");

      const access = await agentDataAccess("agent-17");
      const note = access.sources.find((s) => s.ref === "Kern/Strategie.md");
      expect(note?.count).toBe(2);
      expect(access.sources.some((s) => s.kind === "link" && s.ref === "https://example.com")).toBe(true);
    } finally {
      setAgentAccessBackend(null);
    }
  });

  it("liest Checkbox-Zugriffe aus agents.json des Fixture-Vaults", async () => {
    setAgentAccessBackend({
      append: async () => {},
      listByAgent: async () => [],
    });
    try {
      // agents.json mit einem Agenten, der die Bereiche Kern (read) und Daily (write) besitzt.
      await writeFile(path.join(await fixture(), "agents.json"), JSON.stringify(
        {
          version: 1,
          agents: [
            { slug: "forscher", name: "Forscher", connectAgentId: "agent-17", read: ["Kern"], write: ["Daily"] },
          ],
        },
        null,
        2,
      ), "utf8");
      await writeFile(
        path.join(await fixture(), "log.md"),
        "- 2026-10-20 09:15 | forscher | read | Kern/Strategie.md | 3 Zugriffe (brain_read)\n",
        "utf8",
      );
      const access = await agentDataAccess("agent-17", { rootOverride: await fixture() });
      const bereiche = access.sources.filter((s) => s.kind === "folder" && s.ref.startsWith("Bereich:"));
      expect(bereiche.map((s) => s.ref).sort()).toEqual(["Bereich:Daily", "Bereich:Kern"]);
      const logNote = access.sources.find((s) => s.kind === "note" && s.ref === "Kern/Strategie.md");
      expect(logNote).toBeDefined();
      expect(logNote?.access).toBe("read");
    } finally {
      setAgentAccessBackend(null);
    }
  });
});

describe("A17 – Routen & Flag", () => {
  it("antwortet 503 solange das Flag aus ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "-sparkoverview";
    try {
      const app = new Hono();
      app.route("/api/v06/spark", createSparkOverviewRouter({ brainRoot: await fixture() }));
      const res = await app.fetch(new Request("http://localhost/api/v06/spark/overview/c-17"));
      expect(res.status).toBe(503);
    } finally {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });

  it("liefert die Übersicht, wenn das Flag an ist (Localhost-Guard genügt)", async () => {
    process.env.CONNECT_FLAGS_V06 = "sparkoverview";
    try {
      const app = new Hono();
      app.route("/api/v06/spark", createSparkOverviewRouter({ brainRoot: await fixture() }));
      const res = await app.fetch(new Request("http://localhost/api/v06/spark/overview/c-17"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.companyId).toBe("c-17");
      expect(Array.isArray(body.clusters)).toBe(true);
      expect(body.clusters.length).toBeGreaterThan(0);

      const accessRes = await app.fetch(new Request("http://localhost/api/v06/spark/agent-access/agent-17"));
      expect(accessRes.status).toBe(200);
      const accessBody = await accessRes.json();
      expect(accessBody.agentId).toBe("agent-17");
      expect(Array.isArray(accessBody.sources)).toBe(true);
    } finally {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });
});
