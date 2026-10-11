# Spark / Erweiterungen

> **Wichtig:** „Erweiterungen" heißen hier **Extensions** (nicht „Plugins") — die
> bestehende `/admin/plugins/*`-Route (Vendor-Connectors: Notion, Google Drive,
> MCP) ist ein **anderes** Konzept. Namenskollision bewusst vermieden.

## 0. Stand

- Branch: `cursor/landing-onboarding-storage-fx`
- Backup-Branch: `backup/pre-spark-plugin-fx`
- **Phase 0 (Fundament): fertig.**
- **Phase 1 (Notiz-Editor): fertig** — Text, Bilder, Tabellen, Aufgabenlisten,
  Notiz-Liste in der Sidebar mit Plus-Knopf, Editor als Hauptbereich.
- Phase 2 (Google Drive) steht aus.

## 1. Was „Erweiterungen" sind

Connect hat mehrere **Modul-Marken** (Flux, Hyper, Spark, Analysis). Jede ist
eine Erweiterung:

- **Default AN.** Wer sie nicht braucht, schaltet sie aus.
- Global, nicht pro Company. Eine eigene Company-Tabelle wäre Phase 2, wenn
  wir wissen, worfür sie gebraucht wird.
- **AUS = komplett unsichtbar**: kein Sidebar-Eintrag, kein Plus-Knopf, keine
  Route. Das ist das Sicherheitsnetz, um das es ursprünglich ging — siehe
  `components/extensions-sidebar-slot.tsx` und den Gate-Block in
  `routes/_authed/_app/company/$companyId.tsx`.
- Storage = `localStorage` mit Pub/Sub (Pattern wie `lab-prefs`).

| Key       | Label    | Icon             | Zweck                                  |
| --------- | -------- | ---------------- | -------------------------------------- |
| `flux`    | Flux     | `IconBolt`       | Platzhalter                            |
| `hyper`   | Hyper    | `IconRocket`     | Platzhalter                            |
| `spark`   | Spark    | `IconBrain`      | Notizen — Editor, Bilder, Tabellen     |
| `analysis`| Analysis | `IconChartBar`   | Platzhalter                            |

`connect` (Basis) ist **keine** Erweiterung — Connect läuft immer.

## 2. Architektur

```
app/src/extensions/
├── README.md                     ← diese Datei
├── types.ts                      ← ExtensionManifest, ExtensionKey
├── registry.ts                   ← die vier Erweiterungen
├── storage.ts                    ← localStorage pub/sub, Schema-Migration
├── context.tsx                   ← Provider, useExtensionEnabled, ExtensionGate
├── components/
│   ├── extensions-settings-panel.tsx ← Settings-Zeile „Erweiterungen"
│   └── extensions-sidebar-slot.tsx   ← Slot zwischen Gruppen und Agents
└── spark/
    ├── notes/
    │   ├── types.ts              ← SparkNote, Vorschau-Text
    │   ├── store.ts              ← Persistenz, Company-Isolation
    │   ├── format.ts             ← Beschriftungen (Titel, Gruppe)
    │   ├── markdown.ts           ← JSON → Markdown + Frontmatter
    │   └── images.ts             ← Bild → Data-URL, Downscaling, Grenze
    ├── editor/
    │   ├── note-editor.tsx       ← Tiptap-Setup, Autosave, Paste/Drop
    │   ├── note-editor-toolbar.tsx
    │   └── note-editor-controls.tsx  ← Tabellen-Menü, Undo/Redo, Status
    └── components/
        ├── spark-notes-nav.tsx   ← Sidebar-Liste + Plus-Knopf
        └── note-workspace.tsx    ← Editor-Seite, Titel, Export, Löschen
```

Das Notiz-Styling liegt in `app/src/styles.css` unter `.spark-prose`, weil
ProseMirror semantisches HTML ohne eigene Klassen schreibt.

## 3. Notizen

**Datentyp:** `{ id, companyId, title, content, folderId, createdAt, updatedAt }`.
Eigener Datentyp — bewusst **kein** `ConnectProject` und kein Kanal. Projekte
sind Agenten-Gruppen, Notizen sind Inhalte.

**Speicherung:** `content` ist Tiptap-JSON, nicht Markdown. JSON ist
verlustfrei (Tabellen mit Inline-Formatierung, Aufgabenlisten mit Zustand,
verschachtelte Listen); Markdown ist es nicht. Markdown entsteht daraus beim
Export (`markdown.ts`).

**Autosave:** 600 ms nach der letzten Eingabe. Nicht je Tastendruck
(`localStorage` ist synchron), nicht erst bei `onBlur` (man soll den Fokus
behalten). Der Status steht rechts in der Kopfzeile.

**Bilder:** Data-URL, herunterskaliert auf max. 1920 px, 1,5 MB Grenze.
*Warum nicht die File System Access API:* `showDirectoryPicker` liefert einen
Handle auf einen Chromium-Sandbox-Pfad; die resultierende `file://`-URL ist
außerhalb nicht auflösbar und das Bild bleibt leer. Um das richtig zu machen,
bräuchte es Handle in IndexedDB, erneute Berechtigungsabfrage beim Laden und
Blob-URLs — eine eigene Phase. Details in `images.ts`.

**Ordner:** `folderId` verweist auf eine `ConnectProject`-ID oder `null`
(„Allgemein"). Wird eine Gruppe gelöscht, wandern ihre Notizen nach
„Allgemein" (`releaseNotesFromFolder`, aufgerufen aus `projects.ts`) — Texte
hängen nicht an einer Aufräum-Aktion für Agenten-Gruppen.

**Route:** `?level=2&note=<id>` an der Company-Workspace. Kein eigener Pfad,
weil der Editor die Gruppenansicht ersetzt statt ihr unterzuordnen.

## 4. Geprüft

Typecheck und `biome check` grün für alles in `extensions/`. Build grün, der
Editor landet in einem eigenen Chunk (wird lazy geladen). Im Browser verifiziert:
Extensions-Default und Persistenz, Company-Isolation der Notizen,
Markdown-Export inkl. Tabellen, Bild-Einfügen inkl. Fehlerfällen,
Tiptap-Setup ohne Duplikat-Warnungen, alle Tabellen-Befehle, Aufgabenlisten
und Verhalten bei gelöschten Gruppen.

**Nicht verifiziert:** echte Google-Anmeldung (die App braucht eine Session),
Screenshot per Zwischenablage im echten Betrieb, Tastatur-Durchtabben des
Editors.

## 5. Offen

- Slash-Kommandos („/Tabelle", „/Bild") — der Kern von Notions Bedienung.
- Google-Drive-Backend (Phase 2).
- Notiz-Suche über Titel und Inhalt ist drin, Volltext fehlt.
- `spark/README.md` ist noch nicht angelegt.