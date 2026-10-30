/**
 * helium-agyshare (Variante c): Uebergabe-Datei fuer einen Kontowechsel.
 *
 * Liest das letzte Antigravity-Gespraech eines Projektordners (cache\last_conversations.json
 * bzw. conversation_metadata.json) und dessen Verlauf
 * (brain\<id>\.system_generated\logs\transcript.jsonl) und schreibt eine Zusammenfassung nach
 *   <projektordner>\.connect\handoff.md
 * Das neue Konto startet dann mit dem Prompt "Lies .connect/handoff.md und mach weiter".
 * Funktioniert unabhaengig davon, ob das Backend fremde Gespraeche per `-c` akzeptiert.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { agyCliDir, agyshareStamp, getAgySharedRoot } from "./agy-shared-sessions";

export const AGY_HANDOFF_PROMPT = "Lies .connect/handoff.md und mach weiter";

type TranscriptStep = {
  step_index?: number;
  type?: string;
  source?: string;
  status?: string;
  created_at?: string;
  content?: string;
  error?: string;
  tool_calls?: Array<{ name?: string; args?: Record<string, unknown> }>;
};

function normDir(p: string): string {
  let full = resolve(p);
  try {
    // Kurze 8.3-Namen (KUNCGM~1) in lange Pfade umwandeln, wie agy sie speichert.
    full = realpathSync.native(full);
  } catch {
    // Pfad existiert evtl. nicht mehr
  }
  return full.replace(/[\\/]+$/, "").toLowerCase();
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Basisordner, in denen nach Gespraechen gesucht wird (gemeinsamer Speicher zuerst). */
function storageRoots(homes: string[]): string[] {
  const roots = [getAgySharedRoot(), ...homes.map(agyCliDir)];
  const seen = new Set<string>();
  return roots.filter((r) => {
    const k = normDir(r);
    if (seen.has(k) || !existsSync(r)) return false;
    seen.add(k);
    return true;
  });
}

function fileUriToPath(uri: string): string | null {
  try {
    const u = new URL(uri);
    if (u.protocol !== "file:") return null;
    let p = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p.replace(/\//g, "\\");
  } catch {
    return null;
  }
}

function transcriptPath(root: string, id: string): string {
  return join(root, "brain", id, ".system_generated", "logs", "transcript.jsonl");
}

/**
 * Findet die letzte Gespraechs-ID fuer einen Projektordner.
 * Reihenfolge: last_conversations.json (gemeinsam + Homes), dann conversation_metadata.json.
 * Bei mehreren Treffern gewinnt das zuletzt geaenderte Gespraech.
 */
export function findLastAgyConversation(workdir: string, homes: string[] = []): { id: string; root: string } | null {
  const want = normDir(workdir);
  const candidates: Array<{ id: string; root: string; t: number }> = [];
  const roots = storageRoots(homes);
  for (const root of roots) {
    const last = readJson<Record<string, string>>(join(root, "cache", "last_conversations.json"));
    for (const [dir, id] of Object.entries(last ?? {})) {
      if (typeof id === "string" && normDir(dir) === want) candidates.push({ id, root, t: 0 });
    }
    const meta = readJson<{ conversations?: Record<string, { summary?: { UpdatedAt?: string; WorkspaceURIs?: string[] } }> }>(
      join(root, "cache", "conversation_metadata.json"),
    );
    for (const [id, entry] of Object.entries(meta?.conversations ?? {})) {
      const uris = entry?.summary?.WorkspaceURIs ?? [];
      if (uris.some((u) => {
        const p = fileUriToPath(u);
        return p ? normDir(p) === want : false;
      })) {
        candidates.push({ id, root, t: Date.parse(entry?.summary?.UpdatedAt ?? "") || 0 });
      }
    }
  }
  let best: { id: string; root: string; t: number } | null = null;
  for (const c of candidates) {
    // Wo liegt der Verlauf wirklich? (gemeinsamer Speicher oder eines der Homes)
    const root = roots.find((r) => existsSync(transcriptPath(r, c.id)));
    if (!root) continue;
    let t = c.t;
    try {
      t = Math.max(t, statSync(transcriptPath(root, c.id)).mtimeMs);
    } catch {
      // ignorieren
    }
    if (!best || t > best.t) best = { id: c.id, root, t };
  }
  return best ? { id: best.id, root: best.root } : null;
}

function parseArg(v: unknown): string {
  if (typeof v !== "string") return v == null ? "" : JSON.stringify(v);
  try {
    const parsed = JSON.parse(v) as unknown;
    return typeof parsed === "string" ? parsed : v;
  } catch {
    return v;
  }
}

function clip(text: string, max: number): string {
  const t = text.replace(/\r/g, "").trim();
  return t.length > max ? `${t.slice(0, max)} …[gekürzt]` : t;
}

function stripUserTags(text: string): string {
  return text.replace(/<\/?USER_REQUEST>/g, "").replace(/<(ADDITIONAL_METADATA|USER_SETTINGS_CHANGE)>[\s\S]*?<\/\1>/g, "").trim();
}

const EDIT_TOOLS = /^(write_to_file|write_file|edit_file|replace_file_content|multi_replace_file_content|create_file|apply_patch|delete_file)$/i;

function readTranscript(p: string): TranscriptStep[] {
  const out: TranscriptStep[] = [];
  let text = "";
  try {
    text = readFileSync(p, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as TranscriptStep);
    } catch {
      // kaputte Zeile ueberspringen
    }
  }
  return out;
}

/** Offene/erledigte Aufgaben aus Markdown-Artefakten im brain-Ordner (z. B. task.md). */
function readTaskArtifacts(root: string, id: string): { open: string[]; done: string[] } {
  const open: string[] = [];
  const done: string[] = [];
  const dir = join(root, "brain", id);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    return { open, done };
  }
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*[-*]\s*\[( |x|X|\/)\]\s*(.+)$/.exec(line);
      if (!m) continue;
      if (m[1] === " " || m[1] === "/") open.push(m[2].trim());
      else done.push(m[2].trim());
    }
  }
  return { open, done };
}

export type AgyHandoffResult = {
  ok: boolean;
  path: string | null;
  conversationId: string | null;
  prompt: string;
  reason?: string;
};

/**
 * Baut die Uebergabe-Datei. `homes` = HOMEs, die zusaetzlich zum gemeinsamen Speicher
 * durchsucht werden (z. B. das HOME des bisherigen Kontos).
 */
export function buildAgyHandoff(
  workdir: string,
  homes: string[] = [],
  info: { fromAccount?: string | null; toAccount?: string | null } = {},
): AgyHandoffResult {
  const found = findLastAgyConversation(workdir, homes);
  if (!found) {
    return { ok: false, path: null, conversationId: null, prompt: AGY_HANDOFF_PROMPT, reason: "Kein Gespräch für diesen Ordner gefunden." };
  }
  const steps = readTranscript(transcriptPath(found.root, found.id));
  const userInputs = steps.filter((s) => s.type === "USER_INPUT" && s.content);
  const goal = userInputs.length ? stripUserTags(userInputs[0].content ?? "") : "(unbekannt)";
  const latestRequest = userInputs.length > 1 ? stripUserTags(userInputs[userInputs.length - 1].content ?? "") : "";

  const completed: string[] = [];
  const changed = new Map<string, number>();
  for (const s of steps) {
    for (const tc of s.tool_calls ?? []) {
      const args = tc.args ?? {};
      const summary = parseArg(args.toolSummary) || parseArg(args.Description) || "";
      if (summary && s.status === "DONE") completed.push(`${tc.name}: ${clip(summary, 160)}`);
      if (tc.name && EDIT_TOOLS.test(tc.name)) {
        const file = parseArg(args.TargetFile) || parseArg(args.Path) || parseArg(args.AbsolutePath) || parseArg(args.FilePath);
        if (file) changed.set(file, (changed.get(file) ?? 0) + 1);
      }
    }
  }
  const tasks = readTaskArtifacts(found.root, found.id);
  const errors = steps.filter((s) => s.type === "ERROR_MESSAGE" && s.error).slice(-3);
  const lastAssistant = [...steps].reverse().find((s) => s.type === "PLANNER_RESPONSE" && s.content);

  const messages = steps
    .filter((s) => (s.type === "USER_INPUT" || s.type === "PLANNER_RESPONSE") && (s.content || s.tool_calls?.length))
    .slice(-30)
    .map((s) => {
      const who = s.type === "USER_INPUT" ? "Nutzer" : "Agent";
      const body = s.content
        ? clip(s.type === "USER_INPUT" ? stripUserTags(s.content) : s.content, 1200)
        : (s.tool_calls ?? []).map((tc) => `→ ${tc.name}: ${clip(parseArg(tc.args?.toolSummary) || parseArg(tc.args?.CommandLine) || parseArg(tc.args?.TargetFile) || parseArg(tc.args?.Path) || "", 200)}`).join("\n");
      return `### ${who}${s.created_at ? ` (${s.created_at})` : ""}\n${body}`;
    });

  const lines: string[] = [];
  lines.push("# Übergabe: Gespräch mit anderem Konto fortsetzen");
  lines.push("");
  lines.push(`- Erstellt: ${new Date().toISOString()}`);
  lines.push(`- Projektordner: ${workdir}`);
  lines.push(`- Ursprüngliches Gespräch: ${found.id} (${steps.length} Schritte)`);
  if (info.fromAccount) lines.push(`- Bisheriges Konto: ${info.fromAccount}`);
  if (info.toAccount) lines.push(`- Neues Konto: ${info.toAccount}`);
  lines.push(`- Vollständiger Verlauf: ${transcriptPath(found.root, found.id)}`);
  lines.push("");
  lines.push("> Anweisung: Lies diese Datei, prüfe kurz den aktuellen Stand im Projektordner und mach dort weiter, wo das vorige Konto aufgehört hat. Frag nicht nach, sondern arbeite die offenen Schritte ab.");
  lines.push("");
  lines.push("## Ziel (erste Anfrage)");
  lines.push(clip(goal, 4000));
  if (latestRequest && latestRequest !== goal) {
    lines.push("");
    lines.push("## Letzte Anfrage des Nutzers");
    lines.push(clip(latestRequest, 3000));
  }
  lines.push("");
  lines.push("## Erledigte Schritte");
  const doneList = [...tasks.done.map((t) => `[x] ${t}`), ...completed.slice(-40)];
  lines.push(doneList.length ? doneList.map((t) => `- ${t}`).join("\n") : "- (keine erkannt)");
  lines.push("");
  lines.push("## Offene Schritte");
  if (tasks.open.length) {
    lines.push(tasks.open.map((t) => `- [ ] ${t}`).join("\n"));
  } else {
    lines.push("- Aus dem Verlauf ableiten: siehe letzte Agent-Antwort und letzte Nachrichten unten.");
  }
  if (errors.length) {
    lines.push("");
    lines.push("## Letzte Fehler (vermutlich Grund für den Kontowechsel)");
    lines.push(errors.map((e) => `- ${clip(e.error ?? "", 400)}`).join("\n"));
  }
  lines.push("");
  lines.push("## Geänderte Dateien");
  lines.push(changed.size ? [...changed.entries()].map(([f, n]) => `- ${f} (${n}×)`).join("\n") : "- (keine erkannt)");
  if (lastAssistant?.content) {
    lines.push("");
    lines.push("## Letzte Antwort des Agenten");
    lines.push(clip(lastAssistant.content, 3000));
  }
  lines.push("");
  lines.push("## Letzte Nachrichten (max. 30)");
  lines.push(messages.join("\n\n"));
  lines.push("");

  const dir = join(workdir, ".connect");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "handoff.md");
  if (existsSync(out)) {
    // Fruehere Uebergabe nicht verlieren
    copyFileSync(out, join(dir, `handoff.bak-helium-agyshare-${agyshareStamp()}.md`));
  }
  writeFileSync(out, lines.join("\n"), "utf8");
  return { ok: true, path: out, conversationId: found.id, prompt: AGY_HANDOFF_PROMPT };
}
