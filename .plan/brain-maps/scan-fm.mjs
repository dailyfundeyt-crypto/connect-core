// Sucht Notizen, deren YAML-Frontmatter vom Block-Editor zerlegt wurde. Nur lesen, ausser --fix.
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
const [vault, backupRoot, brainGit, mode] = process.argv.slice(2);
const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith(".")) continue; const f = join(d, e.name); if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".md")) out.push(f); } return out; };
const norm = (s) => s.replace(/\r\n/g, "\n");
const FM = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
function damaged(text) {
  // Spur des Block-Editors: "---" wurde zur Trennlinie, jede YAML-Zeile zu einem Absatz (Leerzeile dazwischen),
  // Listen verlieren die Einrueckung. Gueltiges YAML hat fast nie "Schluessel, Leerzeile, Schluessel" durchgehend.
  const t = norm(text);
  const lines = t.split("\n");
  const start = lines[0].trim() === "---" ? 1 : 0;
  let pairs = 0, keys = 0, i = start;
  for (; i < Math.min(lines.length, start + 60); i++) {
    const l = lines[i];
    if (l.trim() === "---" || l.trim() === "***" || l.trim() === "___") break;
    if (/^[A-Za-z_][\w-]*:\s/.test(l)) { keys++; if ((lines[i + 1] ?? "").trim() === "") pairs++; }
  }
  if (keys >= 3 && pairs >= keys - 1) return { kind: start ? "absaetze-mit-zaun" : "absaetze-ohne-zaun", end: start && i < lines.length ? lines.slice(0, i + 1).join("\n").length + 1 : -1 };
  return null;
}
const index = new Map();
if (backupRoot && existsSync(backupRoot)) for (const f of walk(backupRoot)) { const k = basename(f).toLowerCase(); (index.get(k) ?? index.set(k, []).get(k)).push(f); }
const res = [];
for (const f of walk(vault)) {
  if (f.includes(".bak")) continue;
  let text; try { text = readFileSync(f, "utf8"); } catch { continue; }
  const d = damaged(text);
  if (!d) continue;
  const rel = relative(vault, f).replace(/\\/g, "/");
  const cands = (index.get(basename(f).toLowerCase()) ?? []).map((b) => ({ b, t: norm(readFileSync(b, "utf8")) })).filter((x) => FM.exec(x.t) && !damaged(x.t));
  // eindeutig: genau ein Kandidat mit gueltigem Frontmatter, dessen Schluessel alle im kaputten Kopf vorkommen
  const head = d.end > 0 ? norm(text).slice(0, d.end) : norm(text).split("\n").slice(0, 30).join("\n");
  const fits = cands.filter((x) => FM.exec(x.t)[1].split("\n").filter((l) => /^[A-Za-z_][\w-]*:/.test(l)).every((l) => head.includes(l.split(":")[0] + ":")));
  res.push({ rel, kind: d.kind, mtime: statSync(f).mtime.toISOString().slice(0, 16), backups: cands.length, fits: fits.length, src: fits[0]?.b ?? null });
  if (mode === "--fix" && fits.length === 1 && d.end > 0) {
    const fm = FM.exec(fits[0].t)[0];
    const hist = join(vault, ".connect-history", dirname(rel));
    mkdirSync(hist, { recursive: true });
    copyFileSync(f, join(hist, `${basename(rel, ".md")}.vor-frontmatter-reparatur-${new Date().toISOString().replace(/[:.]/g, "-")}.md`));
    const crlf = text.includes("\r\n");
    const fixed = fm + norm(text).slice(d.end);
    writeFileSync(f, crlf ? fixed.replace(/\n/g, "\r\n") : fixed, "utf8");
    res[res.length - 1].fixed = true;
  }
}
console.log(JSON.stringify(res, null, 1));
