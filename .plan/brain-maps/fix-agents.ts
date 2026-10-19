// Phase 1b: Projekt-Ordner in agents.json 1:1 auf die tatsaechlichen neuen Orte setzen (keine Rechte erweitern)
// und connectAgentId fuer eindeutig gleichnamige Connect-Agenten setzen. Sicherung vorher.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { resolveAreas, worldOf } from "../../apps/server/src/brain/maps";
import { appendLogLine, berlinStamp, listAllMarkdown, readAgents } from "../../apps/server/src/brain/store";
const root = process.argv[2];
const agentsJson = process.argv[3]; // [{id,name,type}]
const w = worldOf(root);
const file = path.join(w.core, "agents.json");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
copyFileSync(file, `${file}.bak-helium-maps1b-${stamp}`);
const raw = JSON.parse(readFileSync(file, "utf8"));
const cfg = await readAgents(w.core);
const areas = resolveAreas(w, await listAllMarkdown(root), cfg.projects);
const report: string[] = [];
for (const p of raw.projects ?? []) {
  const a = areas.find((x) => x.id === p.id);
  if (!a) continue;
  const moved = new Map(a.moved.map((m) => [m.from, m.to]));
  p.folders = (p.folders ?? []).map((f: string) => { const to = moved.get(f.replace(/\\/g, "/").replace(/\/+$/, "")); if (to) report.push(`${p.id}: Ordner ${f} -> ${to}`); return to ?? f; });
  p.files = (p.files ?? []).map((f: string) => { const to = moved.get(f.replace(/\\/g, "/")); if (to) report.push(`${p.id}: Datei ${f} -> ${to}`); return to ?? f; });
  for (const m of a.missing) report.push(`${p.id}: UNKLAR, nicht gefunden (nur in Sicherungen?): ${m}`);
}
// connectAgentId: nur wenn genau ein Connect-Agent denselben Namen hat (ohne Leer-/Sonderzeichen, Gross/klein egal)
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const connect = JSON.parse(readFileSync(agentsJson, "utf8")) as { id: string; name: string }[];
const used = new Set<string>();
for (const a of raw.agents ?? []) {
  if (a.connectAgentId) continue;
  const names = new Set([key(a.slug), key(a.name ?? "")]);
  const hits = connect.filter((c) => names.has(key(c.name)));
  if (hits.length === 1 && !used.has(hits[0].id)) { a.connectAgentId = hits[0].id; used.add(hits[0].id); report.push(`agent ${a.slug} <- Connect "${hits[0].name}" (${hits[0].id})`); }
  else report.push(`agent ${a.slug}: UNKLAR (${hits.length} Treffer)`);
}
for (const c of connect) if (!used.has(c.id) && !(raw.agents ?? []).some((a: { connectAgentId?: string }) => a.connectAgentId === c.id)) report.push(`Connect-Agent "${c.name}" (${c.id}): kein Brain-Eintrag - offen`);
raw.updated = new Date().toISOString();
writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
await appendLogLine(w.core, "connect-ui", "scope", ["agents.json"], "Phase 1b: Projekt-Ordner auf neue Vault-Orte (1:1), connectAgentId fuer gleichnamige Connect-Agenten - Stefan-Auftrag");
// Braucht dich: Ordner-Punkt als erledigt vermerken
const needs = path.join(w.core, "Braucht-dich.md");
const t = readFileSync(needs, "utf8");
writeFileSync(needs, t.replace(/- \[ \] (Lint: \d+ Bereichs-Ordner[^\n]*)/, (_m, rest) => `- [x] ${rest.replace(/\s+$/, "")} (erledigt ${berlinStamp()} durch Stefan-Auftrag Phase 1b: Ordner 1:1 korrigiert)`), "utf8");
console.log(report.join("\n"));
