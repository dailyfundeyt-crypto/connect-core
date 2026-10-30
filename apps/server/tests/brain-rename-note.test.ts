/**
 * Tests für die Umbenenn-Route (Agent 1 „Spark Brain – Titel umbenennen“).
 * Alles in einem Temp-Vault unter os.tmpdir() – der echte Vault wird nie berührt.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  cleanNoteFileStem,
  createRenameNotesRouter,
  detectNoteTitle,
  getAffectedVaultLinks,
  updateVaultLinks,
  writeNoteTitle,
} from "../src/brain/rename-note";

let root = "";

/**
 * Direkt auf dem Router, mit `rootOverride`: so greift die connect.env-Auflösung (brainRootFor)
 * NICHT ein – der Test kann auf dieser Maschine garantiert nie in den echten Vault schreiben.
 * Der Sub-Router antwortet relativ zu sich selbst: Pfad ist `/rename`, nicht `/notes/rename`.
 */
const post = (body: unknown) =>
  createRenameNotesRouter(null, { rootOverride: root }).request("/rename", {
    method: "POST",
    headers: { "content-type": "application/json", host: "127.0.0.1:3101" },
    body: JSON.stringify(body),
  });

const getPreview = (targetPath: string) =>
  createRenameNotesRouter(null, { rootOverride: root }).request(
    `/preview?path=${encodeURIComponent(targetPath)}`,
    {
      method: "GET",
      headers: { host: "127.0.0.1:3101" },
    },
  );

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "brain-rename-test-"));
  await mkdir(path.join(root, "Inbox"), { recursive: true });
  await mkdir(path.join(root, "Shared"), { recursive: true });
  await mkdir(path.join(root, "OrdnerA"), { recursive: true });
  await mkdir(path.join(root, "OrdnerB"), { recursive: true });

  await writeFile(path.join(root, "Inbox", "Alte Notiz.md"), "# Alte Notiz\n\nInhalt mit [[Alte Notiz]] Selbstverweis\n");
  await writeFile(path.join(root, "Shared", "Andere.md"), "Siehe [[Alte Notiz]] und [[Alte Notiz|Alias]] sowie [[Andere]].\n![[Alte Notiz.png]]\n");
  await writeFile(path.join(root, "Shared", "Pfadlinks.md"), "Auch [[Inbox/Alte Notiz.md]] und [[Fremde Notiz]] zählen.\n");
  await writeFile(path.join(root, "Inbox", "Belegt.md"), "# Belegt\n");
  await writeFile(path.join(root, "Frontmatter.md"), "---\ntype: notiz\ntitle: Alter Titel\n---\n\nBody\n");
  await writeFile(path.join(root, "Ohne Titel.md"), "Nur Text, keine Überschrift.\n");
  await writeFile(path.join(root, "Mixed.md"), "---\narea: Inbox\n---\n\n## Unterpunkt\n\nText\n");

  // Dateien für Tests mit doppelten Dateinamen in getrennten Ordnern
  await writeFile(path.join(root, "OrdnerA", "Doppelt.md"), "# Notiz A\nInhalt A\n");
  await writeFile(path.join(root, "OrdnerB", "Doppelt.md"), "# Notiz B\nInhalt B\n");
  await writeFile(
    path.join(root, "Shared", "Verlinkung.md"),
    "Links zu OrdnerA:\n- [[OrdnerA/Doppelt]]\n- [[OrdnerA/Doppelt|Alias 1]]\n- [[OrdnerA/Doppelt#Sektion 1]]\n- [[OrdnerA/Doppelt.md]]\n- ![[OrdnerA/Doppelt]]\n\nLinks zu OrdnerB:\n- [[OrdnerB/Doppelt]]\n- [[OrdnerB/Doppelt|Alias 2]]\n- [[OrdnerB/Doppelt#Sektion 2]]\n- ![[OrdnerB/Doppelt]]\n",
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("Titel-Erkennung", () => {
  test("Frontmatter-Titel schlägt erste Überschrift und Dateinamen", () => {
    const content = "---\ntitle: Titel aus Frontmatter\n---\n# H1 Ueberschrift\n\nText";
    expect(detectNoteTitle(content, "Anders.md")).toEqual({
      title: "Titel aus Frontmatter",
      source: "frontmatter-title",
    });
  });

  test("erste Überschrift schlägt Dateinamen, wenn kein Frontmatter-Titel da ist", () => {
    expect(detectNoteTitle("# Meine Notiz\n\nText", "Anders.md")).toEqual({
      title: "Meine Notiz",
      source: "heading",
    });
  });

  test("unterstützt mehrere Leerzeichen und Tabs in H1 konsistent", () => {
    expect(detectNoteTitle("#   Titel mit drei Leerzeichen\n\nText", "Anders.md")).toEqual({
      title: "Titel mit drei Leerzeichen",
      source: "heading",
    });
    expect(detectNoteTitle("#\tTitel mit Tab\n\nText", "Anders.md")).toEqual({
      title: "Titel mit Tab",
      source: "heading",
    });
  });

  test("ohne Frontmatter-Titel und ohne H1: Dateiname", () => {
    expect(detectNoteTitle("Nur Text\n", "Ohne Titel.md")).toEqual({
      title: "Ohne Titel",
      source: "filename",
    });
    expect(detectNoteTitle("---\narea: Inbox\n---\n\n## Nur H2\n", "Ohne Titel.md")).toEqual({
      title: "Ohne Titel",
      source: "filename",
    });
  });
});

describe("Titel zurück in die Datei schreiben", () => {
  test("ersetzt Frontmatter-Titel und lässt nachfolgende H1 unangetastet", () => {
    const input = "---\ntitle: Alt FM\nauthor: Stefan\n---\n# Alt H1\n\nInhalt\n";
    const out = writeNoteTitle(input, "Neu FM");
    expect(out).toContain("title: Neu FM");
    expect(out).toContain("author: Stefan");
    expect(out).not.toContain("title: Alt FM");
    expect(out).toContain("# Alt H1"); // H1 im Body darf nicht überschrieben werden!
  });

  test("ersetzt die erste Überschrift bei H1-Quelle", () => {
    expect(writeNoteTitle("# Alt\n\nText mit Alt\n", "Neu")).toBe("# Neu\n\nText mit Alt\n");
  });

  test("unterstützt und normalisiert mehrere Leerzeichen in H1", () => {
    expect(writeNoteTitle("#   Alt mit Leerzeichen\n\nText", "Neu")).toBe("# Neu\n\nText");
  });

  test("fügt Frontmatter-Paar hinzu, wenn der Titel aus dem Dateinamen kam", () => {
    const out = writeNoteTitle("Nur Text\n", "Neu");
    expect(out).toStartWith("---\ntitle: Neu\n---\n\nNur Text");
  });

  test("Titel mit Doppelpunkt wird im Frontmatter gequotet", () => {
    const out = writeNoteTitle("Nur Text\n", "Plan: 2027");
    expect(out).toContain('title: "Plan: 2027"');
  });

  test("bestehendes Frontmatter ohne Titel: Titel wird in den Block eingefügt (kein zweites ---)", () => {
    const out = writeNoteTitle("---\narea: Inbox\n---\n\n## Unterpunkt\n\nText\n", "Neu benannt");
    expect(out).toStartWith("---\narea: Inbox\ntitle: Neu benannt\n---\n");
    expect(out.match(/^---/gm)).toHaveLength(2);
    expect(out).toContain("## Unterpunkt");
  });
});

describe("Dateinamen-Bereinigung", () => {
  test("entfernt ungültige Windows-Zeichen", () => {
    expect(cleanNoteFileStem('Plan <1>: "a"/b\\c|d?e*f')).toBe("Plan 1 abcdef");
  });
  test("leer oder nur ungültig → Notiz", () => {
    expect(cleanNoteFileStem("   ")).toBe("Notiz");
    expect(cleanNoteFileStem("???")).toBe("Notiz");
  });
  test("Windows-Reservierte Namen bekommen ein Suffix", () => {
    expect(cleanNoteFileStem("con")).toBe("con (Notiz)");
  });
  test("keine trailing dots, Länge auf 80 begrenzt", () => {
    expect(cleanNoteFileStem("Test.")).toBe("Test");
    expect(cleanNoteFileStem("x".repeat(200)).length).toBe(80);
  });
});

describe("Obsidian-Links anpassen", () => {
  test("plain, embedded, Alias-Links, Fragmente und .md-Endung bleiben erhalten", () => {
    const { text, count } = updateVaultLinks(
      "Siehe [[Alter Name]] und [[Alter Name|Alias]] und [[Ordner/Alter Name.md]] plus [[Alter Name#Sektion]] und ![[Alter Name]]. [[Bang]] bleibt.",
      "Alter Name",
      "Neuer Name",
    );
    expect(count).toBe(5);
    expect(text).toContain("[[Neuer Name]]");
    expect(text).toContain("[[Neuer Name|Alias]]");
    expect(text).toContain("[[Ordner/Neuer Name.md]]");
    expect(text).toContain("[[Neuer Name#Sektion]]");
    expect(text).toContain("![[Neuer Name]]");
    expect(text).toContain("[[Bang]]");
  });

  test("Kein Treffer → count 0, Text unverändert", () => {
    const { text, count } = updateVaultLinks("Kein Link hier [[Anderes]].", "Alter Name", "Neuer Name");
    expect(count).toBe(0);
    expect(text).toBe("Kein Link hier [[Anderes]].");
  });
});

describe("Vorschau und Link-Auflösung bei getrennten Ordnern", () => {
  test("Vorschau zeigt tatsächliche Zahl der betroffenen Link-Vorkommen", async () => {
    // Shared/Verlinkung.md hat 5 Links auf OrdnerA/Doppelt
    const res = await getPreview("OrdnerA/Doppelt.md");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { linkCount: number; filesCount: number; files: string[] };
    expect(body.linkCount).toBe(5); // 5 Vorkommen in 1 Datei
    expect(body.filesCount).toBe(1);
    expect(body.files).toContain("Shared/Verlinkung.md");
  });

  test("Umbenennen ändert nur pfadqualifizierte Links auf den Zielordner und schont gleichnamige Notizen", async () => {
    const res = await post({ path: "OrdnerA/Doppelt.md", newTitle: "Neu A", renameFile: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { oldPath: string; newPath: string; updatedLinks: number; renamed: boolean };
    expect(body.newPath).toBe("OrdnerA/Neu A.md");
    expect(body.renamed).toBe(true);
    expect(body.updatedLinks).toBe(5); // Exakt die 5 Links zu OrdnerA/Doppelt

    const linksContent = await readFile(path.join(root, "Shared", "Verlinkung.md"), "utf8");
    // OrdnerA-Links müssen angepasst sein, mit Erhalt von Alias, Fragment, Embed und .md
    expect(linksContent).toContain("[[OrdnerA/Neu A]]");
    expect(linksContent).toContain("[[OrdnerA/Neu A|Alias 1]]");
    expect(linksContent).toContain("[[OrdnerA/Neu A#Sektion 1]]");
    expect(linksContent).toContain("[[OrdnerA/Neu A.md]]");
    expect(linksContent).toContain("![[OrdnerA/Neu A]]");

    // OrdnerB-Links dürfen NICHT verändert worden sein!
    expect(linksContent).toContain("[[OrdnerB/Doppelt]]");
    expect(linksContent).toContain("[[OrdnerB/Doppelt|Alias 2]]");
    expect(linksContent).toContain("[[OrdnerB/Doppelt#Sektion 2]]");
    expect(linksContent).toContain("![[OrdnerB/Doppelt]]");

    // OrdnerB/Doppelt.md existiert weiterhin unverändert
    expect(existsSync(path.join(root, "OrdnerB", "Doppelt.md"))).toBe(true);
  });
});

describe("Route POST /api/brain/notes/rename", () => {
  test("Titel + Dateinamen + Links + Backup", async () => {
    const res = await post({ path: "Inbox/Alte Notiz.md", newTitle: "Neue Notiz", renameFile: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      oldPath: string;
      newPath: string;
      updatedLinks: number;
      renamed: boolean;
      backups: string[];
    };
    expect(body.newPath).toBe("Inbox/Neue Notiz.md");
    expect(body.renamed).toBe(true);
    expect(body.updatedLinks).toBe(3); // 2 in Shared/Andere.md + 1 in Shared/Pfadlinks.md
    expect(body.backups.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(path.join(root, "Inbox", "Alte Notiz.md"))).toBe(false);
    const renamed = await readFile(path.join(root, "Inbox", "Neue Notiz.md"), "utf8");
    expect(renamed).toContain("# Neue Notiz");

    // Backup liegt neben der Datei, ohne .md-Endung
    expect(body.backups[0]).toMatch(/\.bak-helium-brain-titel-\d{8}-\d{6}/);
    expect(body.backups[0].endsWith(".md")).toBe(false);

    const linksFile = await readFile(path.join(root, "Shared", "Andere.md"), "utf8");
    expect(linksFile).toContain("[[Neue Notiz]] und [[Neue Notiz|Alias]]");
    const pfadFile = await readFile(path.join(root, "Shared", "Pfadlinks.md"), "utf8");
    expect(pfadFile).toContain("[[Inbox/Neue Notiz.md]]");

    // Audit-Log-Eintrag
    const log = await readFile(path.join(root, "log.md"), "utf8");
    expect(log).toContain("| rename |");
  });

  test("Neu angelegte Notiz in 00 Inbox wird unter dem neuen Namen gespeichert", async () => {
    // Genau der Weg aus der Seitenleiste: „+“ legt `00 Inbox/<Titel>.md` an, danach wird
    // umbenannt. Der Ordner trägt ein Leerzeichen und Ziffern – dieselbe Pfadform wie in der App.
    await mkdir(path.join(root, "00 Inbox"), { recursive: true });
    await writeFile(path.join(root, "00 Inbox", "Neue Notiz.md"), "# Neue Notiz\n\n");

    const res = await post({ path: "00 Inbox/Neue Notiz.md", newTitle: "Umbenannte Notiz", renameFile: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { oldPath: string; newPath: string; renamed: boolean };
    expect(body.oldPath).toBe("00 Inbox/Neue Notiz.md");
    expect(body.newPath).toBe("00 Inbox/Umbenannte Notiz.md");
    expect(body.renamed).toBe(true);
    expect(existsSync(path.join(root, "00 Inbox", "Neue Notiz.md"))).toBe(false);
    const content = await readFile(path.join(root, "00 Inbox", "Umbenannte Notiz.md"), "utf8");
    expect(content).toBe("# Umbenannte Notiz\n\n");
  });

  test("Frontmatter plus H1: Nur Frontmatter-Titel wird geändert, H1 bleibt", async () => {
    await writeFile(
      path.join(root, "Inbox", "FmH1.md"),
      "---\ntitle: FM Original\nstatus: active\n---\n# H1 Original\n\nInhalt\n",
    );
    const res = await post({ path: "Inbox/FmH1.md", newTitle: "FM NeuerTitel", renameFile: false });
    expect(res.status).toBe(200);
    const content = await readFile(path.join(root, "Inbox", "FmH1.md"), "utf8");
    expect(content).toContain("title: FM NeuerTitel");
    expect(content).toContain("status: active");
    expect(content).toContain("# H1 Original"); // H1 unberührt!
  });

  test("H1 mit mehreren Leerzeichen wird erkannt und aktualisiert", async () => {
    await writeFile(path.join(root, "Inbox", "SpacedH1.md"), "#   Drei Leerzeichen\n\nText\n");
    const res = await post({ path: "Inbox/SpacedH1.md", newTitle: "Kompakt Neu", renameFile: false });
    expect(res.status).toBe(200);
    const content = await readFile(path.join(root, "Inbox", "SpacedH1.md"), "utf8");
    expect(content).toContain("# Kompakt Neu");
  });

  test("Kollision → Suffix „ (2)“, bestehende Datei bleibt unangetastet", async () => {
    // „Neue Notiz.md“ existiert jetzt schon; frische Notiz umbenennen.
    await writeFile(path.join(root, "Inbox", "Kollision.md"), "# Kollision\n");
    const res = await post({ path: "Inbox/Kollision.md", newTitle: "Neue Notiz", renameFile: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { newPath: string };
    expect(body.newPath).toBe("Inbox/Neue Notiz (2).md");
    const belegt = await readFile(path.join(root, "Inbox", "Belegt.md"), "utf8");
    expect(belegt).toBe("# Belegt\n");

    // Weiterer Konflikt erzeugt Suffix „ (3)“
    await writeFile(path.join(root, "Inbox", "Kollision2.md"), "# Kollision 2\n");
    const res2 = await post({ path: "Inbox/Kollision2.md", newTitle: "Neue Notiz", renameFile: true });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { newPath: string };
    expect(body2.newPath).toBe("Inbox/Neue Notiz (3).md");
  });

  test("Titel-only: Dateiname bleibt, kein Link-Update", async () => {
    const res = await post({ path: "Inbox/Belegt.md", newTitle: "Anderer Titel", renameFile: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { newPath: string; renamed: boolean; updatedLinks: number };
    expect(body.newPath).toBe("Inbox/Belegt.md");
    expect(body.renamed).toBe(false);
    expect(body.updatedLinks).toBe(0);
    const content = await readFile(path.join(root, "Inbox", "Belegt.md"), "utf8");
    expect(content).toContain("# Anderer Titel");
  });

  test("Frontmatter-Titel wird ersetzt", async () => {
    const res = await post({ path: "Frontmatter.md", newTitle: "Frischer Titel", renameFile: false });
    expect(res.status).toBe(200);
    const content = await readFile(path.join(root, "Frontmatter.md"), "utf8");
    expect(content).toContain("title: Frischer Titel");
    expect(content).toContain("type: notiz");
  });

  test("Kein Titel (H1) in bestehender Datei ohne Frontmatter → Frontmatter anlegen", async () => {
    const res = await post({ path: "Ohne Titel.md", newTitle: "Neuer Satz", renameFile: false });
    expect(res.status).toBe(200);
    const content = await readFile(path.join(root, "Ohne Titel.md"), "utf8");
    expect(content).toStartWith("---\ntitle: Neuer Satz\n---");
  });

  test("Fehlgeschlagene Schreibvorgänge und Schutzmechanismen", async () => {
    // Pfad-Escape ablehnen
    const escape = await post({ path: "../../win.ini.md", newTitle: "X" });
    expect(escape.status).toBe(400);
    const escapeBody = (await escape.json()) as { error: string };
    expect(escapeBody.error).toBe("Ungültiger Pfad.");

    // Vault schreibgeschützt ablehnen
    const vault = await post({ path: "Vault/Geheim.md", newTitle: "X" });
    expect(vault.status).toBe(400);
    const vaultBody = (await vault.json()) as { error: string };
    expect(vaultBody.error).toBe("Notizen im Vault sind schreibgeschützt.");

    // Leerer Titel ablehnen
    const empty = await post({ path: "Inbox/Belegt.md", newTitle: "   " });
    expect(empty.status).toBe(400);
    const emptyBody = (await empty.json()) as { error: string };
    expect(emptyBody.error).toBe("Der Titel darf nicht leer sein.");

    // Fehlende Parameter ablehnen
    const missing = await post({ path: null, newTitle: 123 });
    expect(missing.status).toBe(400);
    const missingBody = (await missing.json()) as { error: string };
    expect(missingBody.error).toBe("Pfad und Titel fehlen.");

    // Nicht-existente Datei
    const notFound = await post({ path: "Inbox/NichtDa.md", newTitle: "X" });
    expect(notFound.status).toBe(400);

    // Preview: Leerer oder ungültiger Pfad
    const previewEmpty = await getPreview("");
    expect(previewEmpty.status).toBe(400);
    const previewEscape = await getPreview("../../win.ini.md");
    expect(previewEscape.status).toBe(400);
  });
});
