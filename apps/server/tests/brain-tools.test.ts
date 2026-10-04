import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { backlinksFor, buildGraph, referencedImage } from "../src/brain/graph";
import { assertAllowed, normalisePath } from "../src/brain/policy";
import { brainTools, flushAllBrainReads } from "../src/brain/tools";

let root = "";
let vault = "";
const entry = (read: string[], write: string[]) => ({ slug: "bot-a", connectAgentId: "id-a", read, write }) as never;

beforeAll(async () => {
  vault = await mkdtemp(path.join(os.tmpdir(), "brain-vault-"));
  root = path.join(vault, "Brain");
  for (const dir of ["Shared", "Projects", "Memory/bot-a", "Memory/bot-b", "Inbox", "Daily"]) await mkdir(path.join(root, dir), { recursive: true });
  await mkdir(path.join(vault, "Bilder"), { recursive: true });
  await mkdir(path.join(vault, ".obsidian"), { recursive: true });
  await mkdir(path.join(vault, "Flux"), { recursive: true });
  await mkdir(path.join(vault, "Spark"), { recursive: true });
  await mkdir(path.join(vault, "Neu"), { recursive: true });
  await writeFile(path.join(vault, "Flux", "Flux Idee.md"), "# Flux Idee\nStores ![[flux.png]] [[Projekt Flux]]");
  await writeFile(path.join(vault, "Bilder", "flux.png"), "PNG");
  await writeFile(path.join(vault, "Spark", "Tagebuch.md"), "privat spark");
  await writeFile(path.join(vault, "Neu", "Geheim.md"), "neuer ordner");
  await writeFile(path.join(vault, "Spark", "Alt.md.bak"), "bak");
  await writeFile(path.join(root, "Projects", "Projekt Flux.md"), "# Projekt Flux\n[[Flux/Flux Idee|Flux Idee]]");
  await writeFile(path.join(root, "Projects", "Projekt Spark.md"), "# Projekt Spark");
  await writeFile(path.join(vault, "Bilder", "plan.png"), "PNGDATA");
  await writeFile(path.join(vault, "Bilder", "privat.png"), "PRIVATE");
  await writeFile(path.join(root, "index.md"), "# Index\n[[hot]] [[Shared/Stefan|Stefan]] [[Connect Idee]]\n![[plan.png]]");
  await writeFile(path.join(root, "hot.md"), "# Hot\nsiehe [[index]]");
  await writeFile(path.join(root, "AGENTS.md"), "# Regeln");
  await writeFile(path.join(root, "Shared", "Stefan.md"), "# Stefan\n[zurück](../index.md)");
  await writeFile(path.join(root, "Memory", "bot-b", "x.md"), "geheim von b");
  await writeFile(path.join(root, "log.md"), "# Log\n");
  await writeFile(
    path.join(root, "agents.json"),
    JSON.stringify({
      version: 1,
      defaults: { read: ["Kern"], write: [] },
      projects: [
        { id: "flux", name: "Flux", moc: "Projects/Projekt Flux.md", folders: ["Flux"], files: [] },
        { id: "spark", name: "Spark", moc: "Projects/Projekt Spark.md", folders: ["Spark"], files: [] },
      ],
      vault: { root: ".." },
      agents: [{ slug: "bot-a", connectAgentId: "id-a", read: ["Kern", "Shared", "Memory:eigen", "Projekt:flux"], write: ["Memory:eigen", "Inbox", "Projekt:flux"] }],
    }),
  );
});
afterAll(async () => {
  await rm(vault, { recursive: true, force: true });
});

describe("policy", () => {
  test("normalises and refuses bad paths", () => {
    expect(normalisePath("Brain\\Shared\\Stefan.md")).toBe("Shared/Stefan.md");
    for (const bad of ["../x.md", "C:/x.md", "/etc/x.md", ".git/x.md", "Shared/x.txt", "a/b/c/d/e.md"]) expect(() => normalisePath(bad)).toThrow();
  });
  test("areas and ops", () => {
    const e = entry(["Kern", "Shared", "Memory:eigen"], ["Memory:eigen", "Inbox"]);
    expect(assertAllowed(e, "Shared/Stefan.md", "read", true)).toBe("Shared");
    expect(() => assertAllowed(e, "Memory/bot-b/x.md", "read", true)).toThrow(/Lesezugriff/);
    expect(() => assertAllowed(e, "Shared/Stefan.md", "append", true)).toThrow(/Schreibzugriff/);
    expect(() => assertAllowed(e, "Inbox/a.md", "append", true)).toThrow(/nur neue Dateien/);
    expect(assertAllowed(e, "Inbox/neu.md", "create", false)).toBe("Inbox");
    expect(() => assertAllowed(e, "Memory/bot-a/a.md", "create", true)).toThrow(/Überschreiben/);
    const kern = entry(["Kern"], ["Kern"]);
    expect(() => assertAllowed(kern, "AGENTS.md", "append", true)).toThrow(/geschützt/);
    expect(assertAllowed(kern, "hot.md", "append", true)).toBe("Kern");
  });
});

describe("tools", () => {
  test("no entry, no tools", async () => {
    expect(await brainTools({ botId: "unknown", configuredRoot: root })).toEqual([]);
  });
  test("enforces, writes and logs", async () => {
    const tools = await brainTools({ botId: "id-a", configuredRoot: root });
    const run = (name: string, args: unknown) => tools.find((t) => t.name === name)!.execute(args);
    expect(tools.map((t) => t.name)).toEqual(["brain_list", "brain_read", "brain_search", "brain_append", "brain_write"]);
    expect(await run("brain_read", { path: "Shared/Stefan.md" })).toContain("# Stefan");
    expect(await run("brain_read", { path: "Memory/bot-b/x.md" })).toStartWith("Refused.");
    expect(await run("brain_read", { path: "../../etc/passwd.md" })).toStartWith("Refused.");
    const list = JSON.parse(await run("brain_list", {}));
    expect(list.files).not.toContain("Memory/bot-b/x.md");
    const search = JSON.parse(await run("brain_search", { query: "geheim" }));
    expect(search.hits).toEqual([]);
    const appended = JSON.parse(await run("brain_append", { text: "Stefan mag kurze Antworten", title: "Vorliebe" }));
    expect(appended.path).toMatch(/^Memory\/bot-a\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(await readFile(path.join(root, ...appended.path.split("/")), "utf8")).toContain("Stefan mag kurze Antworten");
    expect(await run("brain_append", { path: "Shared/Stefan.md", text: "x" })).toContain("Kein Schreibzugriff");
    expect(await run("brain_append", { text: "api_key = abcdef123456" })).toContain("Secrets");
    expect(JSON.parse(await run("brain_write", { path: "Inbox/2026-10-04-bot-a-idee.md", content: "# Idee" })).ok).toBe(true);
    expect(await run("brain_write", { path: "Inbox/2026-10-04-bot-a-idee.md", content: "# Nochmal" })).toStartWith("Refused.");
    // Per project: Flux yes (overview and vault notes), Spark and unmapped folders no; vault never writable.
    expect(await run("brain_read", { path: "Vault/Flux/Flux Idee.md" })).toContain("Stores");
    expect(await run("brain_read", { path: "Projects/Projekt Flux.md" })).toContain("Projekt Flux");
    expect(await run("brain_read", { path: "Vault/Spark/Tagebuch.md" })).toContain("Kein Lesezugriff auf Projekt Spark");
    expect(await run("brain_read", { path: "Projects/Projekt Spark.md" })).toStartWith("Refused.");
    expect(await run("brain_read", { path: "Vault/Neu/Geheim.md" })).toStartWith("Refused.");
    expect(await run("brain_read", { path: "Vault/Brain/hot.md" })).toStartWith("Refused.");
    expect(await run("brain_append", { path: "Vault/Flux/Flux Idee.md", text: "x" })).toContain("schreibgeschützt");
    expect(JSON.parse(await run("brain_append", { path: "Projects/Projekt Flux.md", text: "Neuer Store", title: "Stand" })).ok).toBe(true);
    const all = JSON.parse(await run("brain_list", {})).files as string[];
    expect(all).toContain("Vault/Flux/Flux Idee.md");
    expect(all.some((f) => f.startsWith("Vault/Spark") || f.startsWith("Vault/Neu") || f.endsWith(".bak"))).toBe(false);
    expect(JSON.parse(await run("brain_search", { query: "privat spark" })).hits).toEqual([]);
    await flushAllBrainReads();
    const log = await readFile(path.join(root, "log.md"), "utf8");
    expect(log).toContain("| bot-a | write | " + appended.path);
    expect(log).toContain("| bot-a | inbox | Inbox/2026-10-04-bot-a-idee.md");
    expect(log).toContain("| bot-a | denied | Memory/bot-b/x.md");
    expect(log).toMatch(/\| bot-a \| read \| .*Shared\/Stefan\.md.* \| \d+ Zugriffe/);
    expect(log.match(/\| read \|/g)?.length).toBe(1);
  });
});

describe("graph", () => {
  test("nodes, edges, vault nodes and backlinks", async () => {
    const graph = await buildGraph(root, { agents: true });
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("index.md");
    expect(ids).toContain("missing:connect idee");
    expect(ids).toContain("agent:bot-a");
    const links = graph.edges.filter((e) => e.kind === "link").map((e) => [e.source, e.target].sort().join(" "));
    expect(links).toContain(["hot.md", "index.md"].sort().join(" "));
    expect(links).toContain(["Shared/Stefan.md", "index.md"].sort().join(" "));
    expect(graph.nodes.find((n) => n.id === "index.md")!.hub).toBe(true);
    const flux = graph.nodes.find((n) => n.id === "Vault/Flux/Flux Idee.md")!;
    expect(flux.kind).toBe("vault");
    expect(flux.project).toBe("flux");
    expect(graph.nodes.find((n) => n.id === "Projects/Projekt Flux.md")!.group).toBe("Flux");
    expect(graph.edges.some((e) => e.source === "agent:bot-a" && e.target === "Projects/Projekt Flux.md" && e.kind === "write")).toBe(true);
    expect(graph.edges.some((e) => e.source === "agent:bot-a" && e.target === "Projects/Projekt Spark.md")).toBe(false);
    expect((await backlinksFor(root, "Vault/Flux/Flux Idee.md")).map((b) => b.path)).toContain("Projects/Projekt Flux.md");
    const back = await backlinksFor(root, "index.md");
    expect(back.map((b) => b.path).sort()).toEqual(["Shared/Stefan.md", "hot.md"].sort());
  });
  test("serves only referenced images", async () => {
    expect(await referencedImage(root, "plan.png")).toBeTruthy();
    expect(await referencedImage(root, "flux.png")).toBeTruthy();
    expect(await referencedImage(root, "privat.png")).toBeNull();
    expect(await referencedImage(root, "../x.png")).toBeNull();
    expect(await referencedImage(root, "agents.json")).toBeNull();
  });
});
