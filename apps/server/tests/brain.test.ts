import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createBrainRoutes } from "../src/brain/routes";
import { brainRootFromEnv, parseLog, readMarkdown, safeMarkdownPath, saveAgentScopes } from "../src/brain/store";

let root = "";
const passUser = (async (_c: unknown, next: () => Promise<void>) => next()) as never;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "brain-test-"));
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await mkdir(path.join(root, "Memory", "bot-a"), { recursive: true });
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(path.join(root, "hot.md"), "# Hot\nConnect Notch läuft");
  await writeFile(path.join(root, "Shared", "Stefan.md"), "# Stefan\nDeutsch");
  await writeFile(path.join(root, "secret.txt"), "nope");
  await writeFile(path.join(root, ".git", "config.md"), "nope");
  await writeFile(path.join(root, "log.md"), "# Log\n- 2026-10-04 12:25 | bot-a | write | Memory/bot-a/x.md | angelegt\n- 2026-10-04 12:30 | bot-b | read | hot.md | gelesen\n");
  await writeFile(path.join(root, "agents.json"), JSON.stringify({ version: 1, defaults: { read: ["Kern"], write: ["Inbox"] }, agents: [{ slug: "bot-a", read: ["Kern", "Bogus"], write: [] }] }));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("brain paths", () => {
  test("rejects traversal, absolute, dot folders and non-markdown", async () => {
    for (const bad of ["../x.md", "Shared/../../x.md", "C:/Windows/win.ini", "/etc/passwd", ".git/config.md", "secret.txt", "Shared\\..\\..\\x.md", "a\0.md"]) {
      await expect(safeMarkdownPath(root, bad)).rejects.toThrow();
    }
  });
  test("reads markdown inside the brain", async () => {
    const file = await readMarkdown(root, "Shared/Stefan.md");
    expect(file.content).toContain("Deutsch");
    expect(file.path).toBe("Shared/Stefan.md");
  });
  test("env: off, serverless and explicit path", () => {
    expect(brainRootFromEnv({ CONNECT_BRAIN_PATH: "off" } as never)).toBeNull();
    expect(brainRootFromEnv({ CONNECT_SERVERLESS: "1", CONNECT_BRAIN_PATH: root } as never)).toBeNull();
    expect(brainRootFromEnv({ CONNECT_BRAIN_PATH: root } as never)).toBe(path.resolve(root));
  });
});

describe("brain log and scopes", () => {
  test("parses log lines", () => {
    const entries = parseLog("x\n- 2026-10-04 9:05 | a | write | f1, f2 | note | more\n");
    expect(entries).toEqual([{ date: "2026-10-04", time: "09:05", agent: "a", action: "write", files: ["f1", "f2"], note: "note | more" }]);
  });
  test("saves scopes, drops unknown areas, logs a line", async () => {
    const saved = await saveAgentScopes(root, { slug: "connect-test", name: "Test", read: ["Kern", "Shared", "Hack"], write: ["Inbox"] });
    expect(saved.agent.read).toEqual(["Kern", "Shared"]);
    const json = JSON.parse(await readFile(path.join(root, "agents.json"), "utf8"));
    expect(json.agents.map((a: { slug: string }) => a.slug)).toEqual(["bot-a", "connect-test"]);
    expect(await readFile(path.join(root, "log.md"), "utf8")).toContain("| connect-ui | scope | agents.json | connect-test");
  });
  test("rejects bad slugs", async () => {
    await expect(saveAgentScopes(root, { slug: "../x", read: [], write: [] })).rejects.toThrow();
  });
});

describe("brain routes", () => {
  const app = () => createBrainRoutes(passUser, root);
  test("serves status, tree and file on loopback", async () => {
    const status = await (await app().request("/status", { headers: { host: "localhost:3101" } })).json();
    expect(status.available).toBe(true);
    const tree = await (await app().request("/tree", { headers: { host: "127.0.0.1:3101" } })).json();
    expect(tree.files.map((f: { path: string }) => f.path).sort()).toEqual(["Shared/Stefan.md", "hot.md", "log.md"]);
    const res = await app().request("/file?path=..%2Fsecret.txt", { headers: { host: "localhost" } });
    expect(res.status).toBe(400);
  });
  test("refuses non-loopback host and foreign origin", async () => {
    expect((await app().request("/status", { headers: { host: "evil.example" } })).status).toBe(403);
    const put = await app().request("/agents/bot-a", {
      method: "PUT",
      headers: { host: "localhost", origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ read: ["Kern"], write: [] }),
    });
    expect(put.status).toBe(403);
  });
  test("missing folder answers not available", async () => {
    const res = await createBrainRoutes(passUser, path.join(root, "nope")).request("/status", { headers: { host: "localhost" } });
    const body = await res.json();
    expect(body.available).toBe(false);
  });
  test("log filters by agent", async () => {
    const body = await (await app().request("/log?agent=bot-b", { headers: { host: "localhost" } })).json();
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].action).toBe("read");
  });
});
