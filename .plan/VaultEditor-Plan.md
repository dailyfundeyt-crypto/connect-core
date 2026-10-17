# Planungs-Editor (Connect / Vault) — Erweiterungsplan

Stand: 17.10.2026 · Connect App · Apps: `apps/app/src` · Server: `apps/server/src/brain`

## 1. Ausgangslage

Der Vault-Editor (`VaultNoteEditor` + `NoteBlockEditor` + `notes-markdown.ts`)
hat bereits:

- Block-Editor mit Headings 1‑3, Bullet, Number, Todo, Toggle (mit
  `children`-Subtree), Quote, Callout (nur 1 Ebene), Code, Divider, Image
  (Bild & Video), Table.
- Inline-Marks: bold, italic, underline, strike, code, link, wikilink.
- Markdown-Roundtrip via `blocksToMarkdown` / `markdownToBlocks`.
- Frontmatter (`splitFrontmatter`) wird byte-genau erhalten.
- Wikilinks werden im Vault-Baum gegen `BrainFileInfo[]` aufgelöst.
- Backlinks über `GET /api/brain/backlinks`.
- Suche via `GET /api/brain/search` (Pfad + Body).
- Mobile-Ansicht (`mobile-brain-notes`) liest den selben Tree.
- `createBrainNote` / `createBrainFolder` / `deleteBrainFolder` /
  `saveBrainLocation` als einzige API-Verträge zum Speichern.

## 2. Capability Map (Notion-Tipps → Connect-Status)

| Notion-Funktion | Status | Umsetzung in Connect |
| --- | --- | --- |
| **A1** Markdown-Blocks visuell | vorhanden | bleibt |
| **A2** Spaltenlayout | neu | Container-Block `columns` (2-3 Spalten) |
| **A3** Eigene Trennlinien | neu | `divider` bekommt `style` + `width` |
| **A4** Textfarben & Tabellenfarben | neu | neue Inline-Marks `color`, `bg`; Tabellen-Cell-Hintergrund |
| **A5** Blöcke in Callouts | neu | `callout.children` |
| **A6** Audio in Notizen | neu | Block-Typ `audio` (Upload / Aufnahme via MediaRecorder) |
| **A7** YouTube / Loom Embed | neu | Block-Typ `iframe` mit Whitelist + „extern öffnen" |
| **A8** Externe Doku (PDF / Office / FigJam / Excalidraw) | neu | Generischer `iframe`-Block, gleicher Fallback |
| **A9** Link-Vorschauen | neu | Bei externen `http(s):`-Links im Body Inline-Preview-Card |
| **A10** Wikilinks / Backlinks / Erwähnungen | vorhanden | bleibt; verbesserte Mention-Picker |
| **A11** Synchronisierte Blöcke | **decline** | braucht einen zweiten Index, gegen Leitplanke „keine zweite Datenhaltung" |
| **A12** Tastaturkürzel + alle Toggles togglen | neu | `useHotkey`-Einträge + Editor-Cmd |
| **A13** Seitenbreite / Favoriten / Lock / History | neu | lokale `vault-prefs.ts` (localStorage) |
| **B1** Quick-Switch via Hotkey | neu | `Ctrl/Cmd+K` → Modal, springt zu Vault-Datei |
| **B2** Erweiterte Suche | vorhanden | Filter-Chips (Name / Inhalt / Frontmatter) + Sort |
| **B3** Suchfilter + Snippets | neu | Highlighting der Snippet-Zeile |
| **B4** Inhaltsverzeichnis | neu | `headingsFromBlocks`, links im Editor |
| **B5** Einklappbare Ordner | vorhanden | bleibt |
| **C1** Seitenvorlagen | neu | Datei mit `template: true` im Frontmatter, „Aus Vorlage" |
| **C2** Vorlagen-Buttons | neu | Liste in einem „Vorlagen"-Dialog |
| **C3‑C9** Datenbanken / Kanban / Formeln / Progress / Rollen / Erinnerungen | **decline** | gegen Leitplanke „Brain = Markdown-Dateien, keine zweite Datenhaltung" |
| **D1** Markdown / CSV / Word / HTML Import | neu | pro Format ein schmaler Adapter, füttert `markdownToBlocks` |
| **D2** Notizen exportieren | neu | Markdown bleibt verlustfrei; HTML / JSON optional |
| **D3** Web-Inhalte in Notiz übernehmen | neu | Slash-Menü „Aus URL" — speichert nur URL + Titel (Browser Fetch ist CORS-begrenzt) |
| **D4** Mobile Schnellerfassung | neu | „+ Notiz" FAB im `mobile-brain-notes` |
| **D5** Widgets / Automationen | **decline** | kein bestehender Einstiegspunkt |

## 3. Leitplanken (umgesetzt)

- Formeln werden **gar nicht** angeboten → kein Parser nötig.
- Neue Block-Typen haben eine Markdown-Darstellung; sonst gekennzeichnete
  Erweiterungs-Fences (`<!-- cb:columns … -->`).
- Embed-Provider, die `X-Frame-Options: deny` schicken, fallen auf
  „extern öffnen" zurück.
- Speicherung läuft **nur** über `PUT /api/brain/note`.
- Keine Notion-Konten, keine Sync, keine Erweiterung.

## 4. Schritte

1. Datenmodell (`notes.ts`) erweitern — additive, optionale Felder.
2. Markdown-Roundtrip (`notes-markdown.ts`) erweitern — neue Felder
   bleiben verlustfrei oder werden mit klarer Fence geschrieben.
3. Slash-Menü (`slash-items.tsx`) erweitern.
4. Block-Editor (`note-block-editor.tsx`) um Render-Cases erweitern.
5. Format-Bubble (`format-bubble.tsx`) um Color-Picker erweitern.
6. Hotkey-Registry (`hotkeys.ts`) + `useHotkey`-Aufrufe.
7. Neue Hilfs-Komponenten:
   - `vault-toc.tsx` (Inhaltsverzeichnis)
   - `vault-quick-search.tsx` (Cmd-K)
   - `vault-templates-dialog.tsx`
   - `vault-import-dialog.tsx` (Datei-Upload)
   - `vault-export-menu.tsx` (Notiz herunterladen)
   - `vault-prefs.ts` (Breite, Favorit, Lock, History-Snapshot)
   - `embed-preview.tsx` (iframe + extern-Fallback)
   - `audio-block.tsx` (Aufnahme + Upload)
8. Vault-Editor (`vault-note-editor.tsx`) um Toolbar-Erweiterungen +
   TOC + History-Footer + Export-Menü.
9. Vault-Tree (`vault-notes-section.tsx`) um Filter-Chips + Vorlagen-
   Button + Cmd-K-Verbindung.
10. Mobile (`mobile-brain-notes.tsx`) um Quick-Create.
11. Tests: neuer Roundtrip-Test für Spalten, Divider-Style, Color,
    Audio, iframe, Callout-Children.

## 5. Reihenfolge der Umsetzung

Reihenfolge folgt der kleinsten Blöcke-zuerst-Logik, damit jeder Commit
die App lauffähig lässt:

1. Datenmodell + Markdown-Adapter (verlustfrei)
2. Slash-Items + Editor-Render-Cases
3. Format-Bubble (Farben)
4. Hotkeys (Block-Aktionen, alle Toggles, Quick-Search)
5. TOC, Quick-Search, Templates, Import/Export
6. Audio, Iframe, Color-Marks-UI
7. Vault-Prefs (Breite, Favorit, Lock, History-Snapshot)
8. Mobile Quick-Create
9. Tests + Typecheck

## 6. Status (abgeschlossen)

- Schritt 1–9 vollständig implementiert.
- Tests:
  - `apps/app/tests/vault-table-roundtrip.test.ts` (11 Checks) grün.
  - `apps/app/tests/vault-extended-roundtrip.test.ts` (alle Block-Typen) grün.
  - `apps/app/tests/markdown-chips.test.ts` (Doku-Chips) grün.
- Typecheck `bunx tsc --noEmit` in `apps/app` und `apps/server` ohne Fehler.
- Verbleibende Typecheck-Fehler in `connect-landing` sind vorbestehend
  (Framer-Motion / React-Node-Konflikt im Marketing-Landing) und nicht
  Teil dieses Auftrags.

## 7. Letzte Korrektur

`markdownToBlocks` hat die GFM-Delimiter-Zeile (`| --- | --- | ---: |`)
unter der Kopfzeile fälschlich als Datenreihe behandelt. Beim Übergang
von `lines[]` auf `segments[]` ging das `i += 2` (Kopf + Delimiter
überspringen) verloren. Fix: `let k = s + 2` in der Tabellen-Schleife.