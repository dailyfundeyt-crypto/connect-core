import { describe, expect, it, beforeEach } from "bun:test";
import { SparkMcpStore } from "./store";
import {
  folderCreateTool,
  folderRenameTool,
  folderMoveTool,
  folderMarkSettingsTool,
  linkAddTool,
  linkMoveTool,
  noteCreateTool,
  noteReadTool,
  noteUpdateTool,
  noteTrashTool,
  noteAttachToFolderTool,
  folderContextTool,
} from "./tools";
import type { AgentAuthContext } from "./types";

describe("Spark-MCP Tools (v06)", () => {
  let store: SparkMcpStore;
  let testAgent: AgentAuthContext;
  let restrictedAgent: AgentAuthContext;

  beforeEach(() => {
    store = new SparkMcpStore(undefined);
    store.clearForTests();

    testAgent = {
      agentId: "agent-a08-test",
      agentName: "AgentA08",
      companyId: "company-alpha",
      scopes: ["spark:folders:write", "spark:folders:read"],
      isLocal: true,
      isTunnel: false,
    };

    restrictedAgent = {
      agentId: "agent-outsider",
      agentName: "Outsider",
      companyId: "company-beta",
      scopes: ["spark:folders:write"],
      isLocal: true,
      isTunnel: false,
    };
  });

  // =========================================================================
  // 1. folder_create
  // =========================================================================
  it("Tool 1: folder_create legt Ordner korrekt an", async () => {
    const res = await folderCreateTool.handler(
      { name: "Projekte 2026", kind: "normal" },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.success).toBe(true);
    expect(data.folder.name).toBe("Projekte 2026");
    expect(data.folder.kind).toBe("normal");
    expect(data.folder.id).toBeDefined();
  });

  // =========================================================================
  // 2. folder_rename
  // =========================================================================
  it("Tool 2: folder_rename benennt Ordner um", async () => {
    const created = await store.createFolder({ name: "Alte Bezeichnung" });
    const res = await folderRenameTool.handler(
      { folderId: created.id, name: "Neue Bezeichnung" },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.folder.name).toBe("Neue Bezeichnung");
  });

  // =========================================================================
  // 3. folder_move + Zyklenerkennung
  // =========================================================================
  it("Tool 3: folder_move verschiebt Ordner und verhindert Zyklen", async () => {
    const rootFolder = await store.createFolder({ name: "Root" });
    const subFolder = await store.createFolder({ name: "Sub", parentId: rootFolder.id });

    // Verschieben auf Ebene root (null)
    const moveRes = await folderMoveTool.handler(
      { folderId: subFolder.id, targetParentId: null },
      { agent: testAgent, store },
    );
    expect(moveRes.isError).toBeFalsy();

    // Zyklusversuch: Ordner in sich selbst verschieben
    const cycleRes = await folderMoveTool.handler(
      { folderId: rootFolder.id, targetParentId: rootFolder.id },
      { agent: testAgent, store },
    );
    expect(cycleRes.isError).toBe(true);
    expect(cycleRes.content[0].text).toContain("in sich selbst");
  });

  // =========================================================================
  // 4. folder_mark_settings
  // =========================================================================
  it("Tool 4: folder_mark_settings schaltet Einstellungs-Flag um", async () => {
    const folder = await store.createFolder({ name: "Config Ordner", kind: "normal" });

    // Zum Einstellungs-Ordner machen
    const resSettings = await folderMarkSettingsTool.handler(
      { folderId: folder.id, isSettings: true },
      { agent: testAgent, store },
    );
    expect(resSettings.isError).toBeFalsy();
    const dataSettings = JSON.parse(resSettings.content[0].text);
    expect(dataSettings.kind).toBe("settings");
    expect(dataSettings.isSettings).toBe(true);

    // Zurück zu normal
    const resNormal = await folderMarkSettingsTool.handler(
      { folderId: folder.id, isSettings: false },
      { agent: testAgent, store },
    );
    const dataNormal = JSON.parse(resNormal.content[0].text);
    expect(dataNormal.kind).toBe("normal");
    expect(dataNormal.isSettings).toBe(false);
  });

  // =========================================================================
  // 5. link_add
  // =========================================================================
  it("Tool 5: link_add fuegt Links hinzu und validiert URLs", async () => {
    const folder = await store.createFolder({ name: "Bookmarks" });

    const res = await linkAddTool.handler(
      {
        folderId: folder.id,
        url: "https://connect.example.com/docs",
        title: "Connect Doku",
      },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.link.url).toBe("https://connect.example.com/docs");
    expect(data.link.title).toBe("Connect Doku");

    // Ungültige URL prüfen
    const invalidRes = await linkAddTool.handler(
      { folderId: folder.id, url: "keine-url", title: "Fehler" },
      { agent: testAgent, store },
    );
    expect(invalidRes.isError).toBe(true);
  });

  // =========================================================================
  // 6. link_move
  // =========================================================================
  it("Tool 6: link_move verschiebt Link in anderen Ordner", async () => {
    const folderA = await store.createFolder({ name: "Ordner A" });
    const folderB = await store.createFolder({ name: "Ordner B" });
    const link = await store.addLink({
      folderId: folderA.id,
      url: "https://github.com",
      title: "GitHub",
    });

    const res = await linkMoveTool.handler(
      { linkId: link.id, targetFolderId: folderB.id },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.link.folderId).toBe(folderB.id);
  });

  // =========================================================================
  // 7. note_create
  // =========================================================================
  it("Tool 7: note_create erstellt Notiz korrekt (isTrashed = false)", async () => {
    const folder = await store.createFolder({ name: "Notiz-Ordner" });
    const res = await noteCreateTool.handler(
      {
        title: "Briefing Sprint 1",
        content: "Hier sind die Anweisungen fuer Sprint 1.",
        folderId: folder.id,
      },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.note.title).toBe("Briefing Sprint 1");
    expect(data.note.isTrashed).toBe(false);
    expect(data.note.trashedAt).toBeNull();
  });

  // =========================================================================
  // 8. note_read
  // =========================================================================
  it("Tool 8: note_read liest aktive Notizen", async () => {
    const note = await store.createNote({
      title: "Geheime Notiz",
      content: "Nur lesbar mit Berechtigung.",
    });

    const res = await noteReadTool.handler(
      { noteId: note.id },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.note.title).toBe("Geheime Notiz");
    expect(data.note.content).toBe("Nur lesbar mit Berechtigung.");
  });

  // =========================================================================
  // 9. note_update
  // =========================================================================
  it("Tool 9: note_update aktualisiert Inhalt und Titel", async () => {
    const note = await store.createNote({
      title: "Entwurf",
      content: "Stand Version 1",
    });

    const res = await noteUpdateTool.handler(
      { noteId: note.id, title: "Final", content: "Stand Version 2" },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.note.title).toBe("Final");
    expect(data.note.content).toBe("Stand Version 2");
  });

  // =========================================================================
  // 10. note_trash (CRITICAL REQUIREMENT: "note_trash löscht nicht hart")
  // =========================================================================
  it("Tool 10: note_trash löscht nicht hart (Soft-Delete in Papierkorb)", async () => {
    const folder = await store.createFolder({ name: "Papierkorb-Test" });
    const note = await store.createNote({
      title: "Wichtige Notiz",
      content: "Darf niemals unwiderruflich von der Platte verschwinden!",
      folderId: folder.id,
    });

    // 1. note_trash aufrufen
    const res = await noteTrashTool.handler(
      { noteId: note.id },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.trashed).toBe(true);
    expect(data.hardDeleted).toBe(false);
    expect(data.trashedAt).toBeDefined();

    // 2. Verifikation: Die Notiz existiert weiterhin im Store (KEIN harter Datenverlust)
    const rawNote = await store.readNote(note.id, true); // mit includeTrashed=true
    expect(rawNote).not.toBeNull();
    expect(rawNote!.id).toBe(note.id);
    expect(rawNote!.title).toBe("Wichtige Notiz");
    expect(rawNote!.content).toBe("Darf niemals unwiderruflich von der Platte verschwinden!");
    expect(rawNote!.isTrashed).toBe(true);
    expect(rawNote!.trashedAt).not.toBeNull();

    // 3. Normales Lesen ohne includeTrashed findet sie nicht (ausgeblendet)
    const normalRead = await store.readNote(note.id, false);
    expect(normalRead).toBeNull();
  });

  // =========================================================================
  // 11. note_attach_to_folder
  // =========================================================================
  it("Tool 11: note_attach_to_folder ordnet Notiz einem Ordner zu", async () => {
    const folder = await store.createFolder({ name: "Zielordner" });
    const note = await store.createNote({
      title: "Anweisung",
      content: "Bearbeite alle Links in diesem Ordner mit Vorsicht.",
    });

    const res = await noteAttachToFolderTool.handler(
      { folderId: folder.id, noteId: note.id, setAsInstruction: true },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.attached).toBe(true);
    expect(data.folderId).toBe(folder.id);
    expect(data.noteId).toBe(note.id);

    const updatedFolder = await store.getFolder(folder.id);
    expect(updatedFolder?.instructionNoteId).toBe(note.id);
  });

  // =========================================================================
  // 12. folder_context (instructions Zusammenfassung)
  // =========================================================================
  it("Tool 12: folder_context liefert Pfad, Links, Notizen und instructions", async () => {
    // Ordner-Hierarchie: Root > Sub
    const rootFolder = await store.createFolder({ name: "Hauptabteilung" });
    const subFolder = await store.createFolder({
      name: "Recherche",
      parentId: rootFolder.id,
    });

    // Links hinzufügen
    await store.addLink({
      folderId: subFolder.id,
      url: "https://connect.com/doc1",
      title: "Dokumentation 1",
    });
    await store.addLink({
      folderId: subFolder.id,
      url: "https://connect.com/doc2",
      title: "Dokumentation 2",
    });

    // Notiz hinzufügen (Arbeitsanweisung)
    const note = await store.createNote({
      folderId: subFolder.id,
      title: "Arbeitsanweisung Recherche",
      content: "Fasse alle Links zu einem 3-Punkte-Executive-Summary zusammen.",
    });

    const res = await folderContextTool.handler(
      { folderId: subFolder.id },
      { agent: testAgent, store },
    );
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    const ctx = data.context;

    expect(ctx.folderId).toBe(subFolder.id);
    expect(ctx.path).toEqual(["Hauptabteilung", "Recherche"]);
    expect(ctx.links.length).toBe(2);
    expect(ctx.links[0].title).toBe("Dokumentation 1");
    expect(ctx.notes.length).toBe(1);
    expect(ctx.notes[0].title).toBe("Arbeitsanweisung Recherche");
    // Regel: Notiz(en) im Ordner als instructions zusammenfassen
    expect(ctx.instructions).toContain("Fasse alle Links zu einem 3-Punkte-Executive-Summary zusammen.");
  });

  // =========================================================================
  // Firmen-Zugriffskontrolle
  // =========================================================================
  it("Firmen-Zugriffskontrolle: Verweigert Zugriff auf fremde Firmen", async () => {
    const res = await folderCreateTool.handler(
      { name: "Fremder Ordner", companyId: "company-alpha" },
      { agent: restrictedAgent, store }, // Agent hat company-beta
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("403 Forbidden");
  });
});
