// Legt MAPS-Dateien im Brain-Kern an (nur Knowledge/Brain). Sichert vorhandene Dateien als *.bak-helium-maps.
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
const core = process.argv[2];
const bak = (f) => { const p = `${core}/${f}`; if (existsSync(p) && !existsSync(`${p}.bak-helium-maps`)) copyFileSync(p, `${p}.bak-helium-maps`); };

// agents.json: Routinen-Agent mit Datei-Regeln
bak("agents.json");
const j = JSON.parse(readFileSync(`${core}/agents.json`, "utf8"));
if (!j.agents.some((a) => a.slug === "connect-pulse")) {
  j.agents.push({
    slug: "connect-pulse",
    name: "Pulse (Routinen)",
    kind: "routine",
    read: ["Kern", "Shared", "Projects", "Memory", "Daily", "Inbox", "Skills", "log"],
    write: [],
    files: [
      { path: "MAP.md", write: true },
      { path: "Maps/", write: true },
      { path: "Pulse/", write: true },
      { path: "Drafts/", write: true },
    ],
    note: "Fuehrt routines.yaml aus. Schreibt nur Karten, Lauf-Log, Lint und Entwuerfe. Sendet und loescht nie.",
  });
  j.updated = new Date().toISOString();
  writeFileSync(`${core}/agents.json`, `${JSON.stringify(j, null, 2)}\n`, "utf8");
  console.log("agents.json: connect-pulse ergaenzt");
}

if (!existsSync(`${core}/routines.yaml`)) {
  writeFileSync(`${core}/routines.yaml`, `# Pulse - Routinen der Connect App (MAPS-Schicht 3)
# Ein Eintrag pro Routine. Der Scheduler in der Connect App prueft alle 5 Minuten.
# Jeder Lauf -> Pulse/Laeufe.md (mit Agent). Nach 3 Fehlern in Folge pausiert die Routine (Fehler-Deckel),
# fortsetzen in Connect > Brain > Routinen.
# Jede Routine gehoert einem Agenten aus agents.json und laeuft nur mit dessen Rechten.
# Routinen senden und loeschen nie etwas. Erlaubte Aktionen: map, lint, digest.
#
# Felder: name, zweck, agent, aktion, at: "HH:MM" (taeglich, Europe/Berlin) oder every: "30m"/"2h",
#         machine: pc (spaeter: server), aktiv: true/false

routines:
  - name: brain-neuaufbau
    zweck: MAP.md, Agent-Karten (Maps/<agent>.md) und Bereichs-Wegweiser neu erzeugen
    agent: connect-pulse
    aktion: map
    at: "03:00"
    machine: pc

  - name: vault-lint
    zweck: Kaputte Wegweiser, Links und verschobene Bereichs-Ordner finden -> Pulse/Lint.md, Meldung in Braucht dich
    agent: connect-pulse
    aktion: lint
    at: "03:15"
    machine: pc

  - name: morgen-digest
    zweck: Entwurf Tagesueberblick (Heute, naechste 14 Tage, Braucht dich) -> Drafts/ (wird nicht verschickt)
    agent: connect-pulse
    aktion: digest
    at: "07:00"
    machine: pc
`, "utf8");
  console.log("routines.yaml angelegt");
}

if (!existsSync(`${core}/Braucht-dich.md`)) {
  writeFileSync(`${core}/Braucht-dich.md`, `---
type: "braucht-dich"
title: "Braucht dich"
status: "aktiv"
---

# Braucht dich

> Die einzige Liste, die auf Stefan wartet. Agenten und Routinen haengen nur an (Tool \`brain_ask_human\`).
> Abhaken darf nur Stefan - in Connect › Brain oder hier in Obsidian.

## Offen

- [ ] MAPS-Brain ansehen: Connect › Brain (Ctrl+Shift+R einmal) und sagen, was noch nicht passt — @connect-pulse · ${new Date().toISOString().slice(0, 10)} 16:45
`, "utf8");
  console.log("Braucht-dich.md angelegt");
}

mkdirSync(`${core}/Maps/Bereiche`, { recursive: true });
mkdirSync(`${core}/Pulse`, { recursive: true });
mkdirSync(`${core}/Drafts`, { recursive: true });

bak("CONVENTIONS.md");
const conv = readFileSync(`${core}/CONVENTIONS.md`, "utf8");
if (!conv.includes("## MAPS")) {
  const nl = conv.includes("\r\n") ? "\r\n" : "\n";
  const add = `
## MAPS - Karte, Agenten, Pulse, Screen

**Ein Fakt = ein Zuhause.** Jeder Fakt steht an genau einer Stelle: Projekt-Fakten in \`Projects/Projekt <Name>.md\`,
geteilte Fakten in \`Shared/\`. Alle anderen Dateien verlinken nur dorthin, sie kopieren nichts.

- \`MAP.md\` - Wurzelkarte (~40 Zeilen), nur Wegweiser: eine Zeile pro Bereich. Jede Info in max. 2 Spruengen
  (MAP -> \`Maps/Bereiche/<Name>.md\` -> Dokument). Wird von der Routine \`brain-neuaufbau\` erzeugt, nicht von Hand aendern.
- \`Maps/<agent>.md\` - Karte pro Agent, nur mit den Bereichen, die er lesen darf. Agents starten dort.
- \`agents.json\` -> \`files\`: Rechte pro Datei/Ordner (\`{ "path": "Shared/Stefan.md", "read": false }\`,
  Ordner enden auf \`/\`, Vault-Pfade als \`Vault/<..>\`). Datei-Regeln gehen vor Bereichen. Vault bleibt immer nur lesbar.
  Durchgesetzt im Server bei jedem Lesen/Schreiben, gesetzt in Connect › Brain (Knoten anklicken).
- \`routines.yaml\` - Routinen (Name, Zweck, Agent, Aktion, Zeit, Maschine). Jede Routine laeuft mit den Rechten ihres Agenten.
  Lauf-Log: \`Pulse/Laeufe.md\`. Lint: \`Pulse/Lint.md\`. Entwuerfe: \`Drafts/\` (nie verschickt).
- \`Braucht-dich.md\` - die einzige Liste, die auf Stefan wartet. Agents haengen mit \`brain_ask_human\` an
  (\`- [ ] Text — @agent · Datum Zeit\`), abhaken darf nur Stefan.
`;
  writeFileSync(`${core}/CONVENTIONS.md`, conv.replace(/\s*$/, "") + (nl === "\n" ? add : add.replace(/\n/g, "\r\n")), "utf8");
  console.log("CONVENTIONS.md ergaenzt");
}
