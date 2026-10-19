import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
const [src, server] = process.argv.slice(2);
function patch(full, fn) {
  const bak = `${full}.bak-helium-maps1b`;
  if (!existsSync(bak)) copyFileSync(full, bak);
  const raw = readFileSync(bak, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  const rep = (a, b) => { if (!s.includes(a)) throw new Error(`${full}: Anker fehlt: ${a.slice(0, 90)}`); s = s.replace(a, b); };
  fn(rep);
  writeFileSync(full, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
  console.log("ok", full.split("/").pop());
}

patch(`${src}/components/companies/vault-note-editor.tsx`, (rep) => {
  rep('import type { NoteBlock } from "@/lib/companies/notes";', `import type { NoteBlock } from "@/lib/companies/notes";

/**
 * YAML-Frontmatter (\`---\\n…\\n---\`) wird vor dem Block-Editor abgetrennt und Byte fuer Byte
 * unveraendert gehalten. Der Block-Editor kennt kein YAML: frueher wurde \`---\` zur Trennlinie und
 * jede Zeile zu einem Absatz, Listen verloren die Einrueckung. Beim Speichern wird der Kopf exakt
 * wieder vorangestellt; bearbeitbar ist er nur als Rohtext.
 */
export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = /^\\uFEFF?---[ \\t]*\\r?\\n[\\s\\S]*?\\r?\\n---[ \\t]*(?:\\r?\\n|$)/.exec(text);
  return match ? { frontmatter: match[0], body: text.slice(match[0].length) } : { frontmatter: "", body: text };
}

function FrontmatterField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const lines = value.replace(/\\r?\\n$/, "").split(/\\r?\\n/).length - 2;
  const valid = splitFrontmatter(value).frontmatter === value;
  return (
    <div className="mb-6" data-testid="frontmatter-field">
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] text-neutral-500 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        Eigenschaften (YAML) · {lines} Zeilen · geschuetzt {open ? "▾" : "▸"}
      </button>
      {open ? (
        <>
          <textarea
            className="mt-2 block w-full rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-[12px] leading-5 text-neutral-800 outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            onChange={(e) => onChange(e.target.value)}
            rows={Math.min(18, lines + 3)}
            spellCheck={false}
            value={value}
          />
          {!valid ? <p className="mt-1 text-[11px] text-amber-600">Muss mit einer Zeile „---“ beginnen und enden, sonst liest Obsidian die Eigenschaften nicht.</p> : null}
        </>
      ) : null}
    </div>
  );
}`);
  rep("  const baseline = useRef<string>(\"\");", "  const baseline = useRef<string>(\"\");\n  /** Frontmatter wie geladen, und wie gerade bearbeitet. */\n  const fmBase = useRef<string>(\"\");\n  const [fm, setFm] = useState(\"\");");
  rep("    const loaded = markdownToBlocks(file.data.content);", "    const parts = splitFrontmatter(file.data.content);\n    fmBase.current = parts.frontmatter;\n    setFm(parts.frontmatter);\n    const loaded = markdownToBlocks(parts.body);");
  rep("    return blocksToMarkdown(blocks) !== baseline.current;\n  }, [blocks]);", "    return blocksToMarkdown(blocks) !== baseline.current || fm !== fmBase.current;\n  }, [blocks, fm]);");
  rep("        { path, content: currentMarkdown, mode: \"write\" },", "        { path, content: fm + currentMarkdown, mode: \"write\" },");
  rep("            baseline.current = currentMarkdown;", "            baseline.current = currentMarkdown;\n            fmBase.current = fm;");
  rep("  }, [blocks, dirty, path, save]);", "  }, [blocks, dirty, fm, path, save]);");
  rep("  const pathRef = useRef(path);\n  pathRef.current = path;", "  const pathRef = useRef(path);\n  pathRef.current = path;\n  const fmRef = useRef(fm);\n  fmRef.current = fm;");
  rep("        if (md !== baseline.current) {\n          save.mutate({ path: pathRef.current, content: md, mode: \"write\" });", "        if (md !== baseline.current || fmRef.current !== fmBase.current) {\n          save.mutate({ path: pathRef.current, content: fmRef.current + md, mode: \"write\" });");
  rep("              <NoteBlockEditor blocks={blocks} onBlocksChange={setBlocks} />", "              {fm ? <FrontmatterField onChange={setFm} value={fm} /> : null}\n              <NoteBlockEditor blocks={blocks} onBlocksChange={setBlocks} />");
});

patch(`${server}/store.ts`, (rep) => {
  rep('import { readdir, readFile, realpath, rename, stat, writeFile, appendFile, mkdir } from "node:fs/promises";', 'import { readdir, readFile, realpath, rename, stat, writeFile, appendFile, mkdir, copyFile, unlink } from "node:fs/promises";');
  rep("  if (!exists) await mkdir(path.dirname(full), { recursive: true });\n  await writeFile(full, content, \"utf8\");", "  if (!exists) await mkdir(path.dirname(full), { recursive: true });\n  if (exists) await backupBeforeWrite(root, full, content);\n  await writeFile(full, content, \"utf8\");");
  rep("/**\n * A folder path that may not exist yet, validated the same way `writableMarkdownPath`", `const HISTORY_DIR = ".connect-history";
const HISTORY_KEEP = 30;
const HISTORY_GAP_MS = 10 * 60_000;

/**
 * Sicherung vor jedem Ueberschreiben: \`<root>/.connect-history/<ordner>/<name>.<zeit>.md\`.
 *
 * Der Editor speichert automatisch alle paar hundert Millisekunden; eine Sicherung pro Schreibvorgang
 * wuerde den Originalstand in Minuten aus der Rotation druecken. Deshalb: neue Sicherung nur, wenn die
 * letzte aelter als 10 Minuten ist (der Stand vor einer Bearbeitungs-Sitzung bleibt so immer erhalten),
 * hoechstens 30 pro Datei, die aeltesten fallen heraus. Punkt-Ordner zeigt weder Obsidian noch Connect.
 */
export async function backupBeforeWrite(root: string, full: string, next?: string) {
  try {
    const old = await readFile(full, "utf8");
    if (next !== undefined && old === next) return;
    const realRoot = await realpath(root).catch(() => root);
    const rel = path.relative(realRoot, full);
    if (rel.startsWith("..")) return;
    const dir = path.join(realRoot, HISTORY_DIR, path.dirname(rel));
    const name = path.basename(rel, ".md");
    await mkdir(dir, { recursive: true });
    const mine = (await readdir(dir).catch(() => [] as string[]))
      .filter((n) => n.startsWith(\`\${name}.\`) && /^\\d{4}-\\d{2}-\\d{2}T/.test(n.slice(name.length + 1)) && n.endsWith(".md"))
      .sort();
    const newest = mine[mine.length - 1];
    if (newest) {
      const info = await stat(path.join(dir, newest)).catch(() => null);
      if (info && Date.now() - info.mtimeMs < HISTORY_GAP_MS) return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await copyFile(full, path.join(dir, \`\${name}.\${stamp}.md\`));
    mine.push(\`\${name}.\${stamp}.md\`);
    for (const extra of mine.slice(0, Math.max(0, mine.length - HISTORY_KEEP))) await unlink(path.join(dir, extra)).catch(() => {});
  } catch {
    // Ohne Sicherung wird nicht geschrieben.
    throw new BrainPathError("Sicherung vor dem Speichern fehlgeschlagen - nichts geschrieben.");
  }
}

/**
 * A folder path that may not exist yet, validated the same way \`writableMarkdownPath\``);
});
