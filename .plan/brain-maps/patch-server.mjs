// Patcht apps/server/src/brain/{policy,store,routes,tools}.ts. Bricht ab, wenn ein Anker fehlt.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
const dir = process.argv[2];
function patch(file, fn) {
  const full = `${dir}/${file}`;
  if (!existsSync(`${full}.bak-helium-maps`)) copyFileSync(full, `${full}.bak-helium-maps`);
  const raw = readFileSync(`${full}.bak-helium-maps`, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  const rep = (a, b) => { if (!s.includes(a)) throw new Error(`${file}: Anker fehlt: ${a.slice(0, 80)}`); s = s.replace(a, b); };
  fn(rep, () => s, (v) => (s = v));
  writeFileSync(full, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
  console.log("ok", file);
}

patch("policy.ts", (rep, get, set) => {
  rep("export class BrainDenied extends Error {}", `export class BrainDenied extends Error {}

/** Die genaueste Datei-/Ordner-Regel eines Agenten fuer einen Pfad (Ordner enden auf "/"). */
export function fileRule(entry: BrainAgentEntry, path: string): BrainFileRule | undefined {
  const p = path.toLowerCase();
  let best: BrainFileRule | undefined;
  for (const rule of entry.files ?? []) {
    const rp = rule.path.toLowerCase();
    const hit = rp.endsWith("/") ? p.startsWith(rp) : p === rp;
    if (hit && (!best || rp.length > best.path.length)) best = rule;
  }
  return best;
}

/** Darf der Agent diese Datei schreiben (generierte Dateien, Pulse)? Vault und log.md nie. */
export function canWrite(entry: BrainAgentEntry, path: string, projects: BrainProject[] = []): boolean {
  if (path.startsWith("Vault/") || path.toLowerCase() === "log.md") return false;
  const rule = fileRule(entry, path);
  if (rule && typeof rule.write === "boolean") return rule.write;
  const area = areaOf(path, entry.slug, projects);
  if (!area || area === "log" || !has(entry.write, area)) return false;
  if (area === "Kern") return ROOT_APPENDABLE.has(path);
  return true;
}`);
  rep('import type { BrainAgentEntry, BrainArea, BrainProject } from "./store";', 'import type { BrainAgentEntry, BrainArea, BrainFileRule, BrainProject } from "./store";');
  rep('    case "_templates":\n      return "Kern";', '    case "_templates":\n      return "Kern";\n    case "Maps":\n      return "Kern";\n    case "Pulse":\n      return "log";\n    case "Drafts":\n      return "Inbox";');
  const s = get();
  const a = s.indexOf("export function canRead(");
  const b = s.indexOf("const SECRET_PATTERNS");
  if (a < 0 || b < 0) throw new Error("policy: canRead/SECRET_PATTERNS fehlt");
  const body = `export function canRead(entry: BrainAgentEntry, path: string, projects: BrainProject[] = []): boolean {
  const rule = fileRule(entry, path);
  if (rule && typeof rule.read === "boolean") return rule.read;
  const area = areaOf(path, entry.slug, projects);
  return area !== null && has(entry.read, area);
}

/** Throws BrainDenied with the reason in German, or returns the area. Datei-Regeln gehen vor Bereichen. */
export function assertAllowed(
  entry: BrainAgentEntry,
  path: string,
  op: BrainOp,
  exists: boolean,
  projects: BrainProject[] = [],
): BrainArea {
  const area = areaOf(path, entry.slug, projects);
  const rule = fileRule(entry, path);
  if (!area && !rule) throw new BrainDenied(\`Kein Zugriff: "\${path}" liegt in keinem Brain-Bereich.\`);
  const project = area?.startsWith("Projekt:") ? projects.find((p) => \`Projekt:\${p.id}\` === area) : undefined;
  const label = project ? \`Projekt \${project.name}\` : area ? (AREA_DE[area] ?? area) : path;
  if (op === "read") {
    if (rule && typeof rule.read === "boolean") {
      if (!rule.read) throw new BrainDenied(\`Kein Lesezugriff auf "\${path}" fuer \${entry.slug} (Datei-Regel).\`);
      return (area ?? "Shared") as BrainArea;
    }
    if (!area || !has(entry.read, area)) throw new BrainDenied(\`Kein Lesezugriff auf \${label} fuer \${entry.slug}.\`);
    return area;
  }
  if (path.startsWith("Vault/")) {
    throw new BrainDenied("Vault-Notizen ausserhalb des Brains sind schreibgeschuetzt. Ergaenzungen an die Projekt-Uebersicht in Projects/ anhaengen.");
  }
  if (path.toLowerCase() === "log.md") throw new BrainDenied("log.md schreibt Connect selbst - direkt schreiben ist nicht erlaubt.");
  if (rule && typeof rule.write === "boolean") {
    if (!rule.write) throw new BrainDenied(\`Kein Schreibzugriff auf "\${path}" fuer \${entry.slug} (Datei-Regel).\`);
    if (op === "create" && exists) throw new BrainDenied(\`"\${path}" gibt es schon. Ueberschreiben ist nicht erlaubt - nutze brain_append.\`);
    return (area ?? "Shared") as BrainArea;
  }
  if (!area || !has(entry.write, area)) throw new BrainDenied(\`Kein Schreibzugriff auf \${label} fuer \${entry.slug}.\`);
  if (area === "log") throw new BrainDenied("log.md schreibt Connect selbst - direkt schreiben ist nicht erlaubt.");
  const parts = path.split("/");
  if (area === "Kern") {
    if (parts.length !== 1 || !ROOT_APPENDABLE.has(path)) {
      throw new BrainDenied(\`"\${path}" ist geschuetzt (Regeln, Vorlagen, Karten, agents.json) und wird nur von Stefan geaendert.\`);
    }
    if (op === "create") throw new BrainDenied("Im Kern werden keine neuen Dateien angelegt.");
  }
  if (area === "Inbox") {
    if (op === "append") throw new BrainDenied("In der Inbox werden nur neue Dateien angelegt, bestehende werden nicht veraendert.");
    if (exists) throw new BrainDenied(\`"\${path}" gibt es schon - in der Inbox nur neue Dateien.\`);
  }
  if (op === "create" && exists) {
    throw new BrainDenied(\`"\${path}" gibt es schon. Ueberschreiben ist nicht erlaubt - nutze brain_append.\`);
  }
  if (op === "append" && !exists && area !== "Memory:eigen" && area !== "Memory" && area !== "Daily") {
    throw new BrainDenied(\`"\${path}" gibt es nicht. Neue Dateien mit brain_write anlegen.\`);
  }
  return area;
}

`;
  set(s.slice(0, a) + body + s.slice(b));
});

patch("store.ts", (rep, get, set) => {
  rep("  write: BrainArea[];\n  note?: string;\n};", "  write: BrainArea[];\n  /** Datei-/Ordner-Regeln (Kern-Pfade, Vault als Vault/..; Ordner mit /). Gehen vor Bereichen. */\n  files?: BrainFileRule[];\n  note?: string;\n};");
  rep("        write: cleanAreas(entry.write),\n      })),", "        write: cleanAreas(entry.write),\n        files: cleanRules((entry as { files?: unknown }).files),\n      })),");
  rep("connectAgentId?: string; read: unknown; write: unknown }", "connectAgentId?: string; read: unknown; write: unknown; files?: unknown }");
  rep("    read,\n    write,\n  };", "    read,\n    write,\n    files: input.files !== undefined ? cleanRules(input.files) : existing?.files,\n  };");
  set(get() + `
/* ------------------------------------------------------------------ *
 * MAPS: Datei-Regeln und Brain-Kern
 * ------------------------------------------------------------------ */

export type BrainFileRule = { path: string; read?: boolean; write?: boolean };

export function cleanRules(value: unknown): BrainFileRule[] {
  if (!Array.isArray(value)) return [];
  const out: BrainFileRule[] = [];
  for (const item of value.slice(0, 300)) {
    if (!item || typeof item !== "object") continue;
    const raw = (item as { path?: unknown }).path;
    if (typeof raw !== "string") continue;
    const p = raw.trim().replace(/\\\\/g, "/").replace(/^\\.\\//, "").replace(/^Brain\\//i, "").slice(0, 300);
    if (!p || p.startsWith("/") || /^[a-zA-Z]:/.test(p) || p.split("/").some((x) => x === "..") || p.includes("\\0")) continue;
    const read = (item as { read?: unknown }).read;
    const write = (item as { write?: unknown }).write;
    const rule: BrainFileRule = { path: p };
    if (typeof read === "boolean") rule.read = read;
    if (typeof write === "boolean") rule.write = write;
    if (rule.read === undefined && rule.write === undefined) continue;
    const at = out.findIndex((r) => r.path.toLowerCase() === p.toLowerCase());
    if (at >= 0) out[at] = rule;
    else out.push(rule);
  }
  return out;
}

/**
 * Wo der Brain-Kern (agents.json, log.md, AGENTS.md) liegt, relativ zum Root: der Root selbst oder
 * \`Knowledge/Brain\` / \`Brain\` darunter. Bei Stefan zeigt CONNECT_BRAIN_PATH auf den ganzen Vault
 * (\`Plannung\`), der Kern liegt seit der Vault-Umstellung vom 06.10. in \`Knowledge/Brain\`.
 */
export function coreRelOf(root: string): string {
  for (const rel of ["", "Knowledge/Brain", "Brain"]) {
    if (existsSync(path.join(root, ...rel.split("/").filter(Boolean), "agents.json"))) return rel;
  }
  return "";
}

export function coreOf(root: string): string {
  const rel = coreRelOf(root);
  return rel ? path.join(root, ...rel.split("/")) : root;
}
`);
});

patch("routes.ts", (rep, get, set) => {
  rep('} from "./store";', '  coreOf,\n} from "./store";\nimport { accessFor, dashboard, readRoutines, resumeRoutine, runRoutine, startPulse, toggleNeed, worldOf } from "./maps";');
  rep("readAgents(brain.root), readLog(brain.root), memoryFolders(brain.root)", "readAgents(coreOf(brain.root)), readLog(coreOf(brain.root)), memoryFolders(coreOf(brain.root))");
  rep("let entries = await readLog(brain.root);", "let entries = await readLog(coreOf(brain.root));");
  rep("const saved = await saveAgentScopes(brain.root, {", "const saved = await saveAgentScopes(coreOf(brain.root), {");
  rep("        write: body.write,\n", "        write: body.write,\n        files: body.files,\n");
  rep("head: await gitHead(brain.root),", "head: await gitHead(coreOf(brain.root)),\n      core: worldOf(brain.root).prefix,");
  const s = get();
  const at = s.lastIndexOf("  return app;\n}");
  if (at < 0) throw new Error("routes: return app fehlt");
  const add = `  /* ---------------------------------------------------------------- MAPS (Screen + Pulse) */
  const jsonBody = async (context: { req: { header: (n: string) => string | undefined; json: () => Promise<unknown> } }) => {
    if (!(context.req.header("content-type") ?? "").includes("application/json")) return null;
    return (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
  };

  app.get("/maps", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason));
    return context.json(await dashboard(brain.root));
  });

  app.get("/access", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const p = context.req.query("path") ?? "";
    if (!p || p.includes("..") || p.length > 400) return context.json({ error: "Ungueltiger Pfad." }, 400);
    return context.json({ available: true, ...(await accessFor(brain.root, p)) });
  });

  app.post("/pulse/run", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const body = await jsonBody(context);
    if (!body || typeof body.name !== "string") return context.json({ error: "Name fehlt." }, 400);
    const { routines } = await readRoutines(worldOf(brain.root).core);
    const routine = routines.find((r) => r.name === body.name);
    if (!routine) return context.json({ error: "Routine nicht gefunden." }, 404);
    return context.json({ available: true, ...(await runRoutine(brain.root, routine, "hand")) });
  });

  app.post("/pulse/resume", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const body = await jsonBody(context);
    if (!body || typeof body.name !== "string") return context.json({ error: "Name fehlt." }, 400);
    await resumeRoutine(brain.root, body.name.slice(0, 60));
    return context.json({ available: true });
  });

  /** Nur Stefan (eingeloggt, lokal): einen Punkt in Braucht-dich ab- oder aufhaken. Agenten haben dafuer kein Tool. */
  app.put("/needs", async (context) => {
    const brain = await root();
    if (!brain.available) return context.json(unavailable(brain.reason), 404);
    const body = await jsonBody(context);
    if (!body || typeof body.index !== "number" || typeof body.done !== "boolean") return context.json({ error: "index und done fehlen." }, 400);
    try {
      await toggleNeed(worldOf(brain.root).core, body.index, body.done);
      return context.json({ available: true });
    } catch (error) {
      return context.json({ error: (error as Error).message }, 400);
    }
  });

  startPulse(async () => {
    const brain = await root();
    return brain.available ? brain.root : null;
  });

`;
  set(s.slice(0, at) + add + s.slice(at));
});

patch("tools.ts", (rep) => {
  rep('  safeMarkdownPath,\n} from "./store";', '  safeMarkdownPath,\n  coreOf,\n} from "./store";\nimport { askHuman } from "./maps";');
  rep("accessForBot(initial.root, context.botId)", "accessForBot(coreOf(initial.root), context.botId)");
  rep("const access = await accessForBot(brain.root, context.botId)", "const access = await accessForBot(coreOf(brain.root), context.botId)");
  rep("const result = await run(brain.root, entry, projects);", "const result = await run(coreOf(brain.root), entry, projects);");
  rep("await logDenied(brain.root, entry.slug, tool, target, reason)", "await logDenied(coreOf(brain.root), entry.slug, tool, target, reason)");
  rep("Starte mit hot.md und index.md.", "Starte mit deiner Karte Maps/${slug}.md (nur deine Bereiche, max. 2 Spruenge), dann hot.md.");
  rep("export type BrainToolContext", 'const askArgs = z.object({ text: z.string().min(3).max(400).describe("Was Stefan entscheiden, freigeben oder beantworten soll - ein Satz") });\n\nexport type BrainToolContext');
  rep("  ];\n  return tools;", `    {
      name: "brain_ask_human",
      ref: "brain/ask-human",
      description: "Bittet Stefan um eine Entscheidung, Freigabe oder Antwort: haengt eine Zeile an Braucht-dich.md an (mit deinem Kuerzel). Nur anhaengen - abhaken darf nur Stefan.",
      parameters: askArgs,
      execute: (args) =>
        guard("brain_ask_human", "Braucht-dich.md", async (root, entry) => {
          const { text } = askArgs.parse(args ?? {});
          assertNoSecrets(text);
          const added = await askHuman(root, entry.slug, text);
          await appendLogLine(root, entry.slug, "write", ["Braucht-dich.md"], \`brain_ask_human: \${text.slice(0, 80)}\`);
          return { ok: true, added };
        }),
    },
  ];
  return tools;`);
});
