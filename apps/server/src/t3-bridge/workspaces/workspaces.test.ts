/**
 * Unit-Tests für den Workspace-Manager (A07).
 *
 * Lane: A07 (Welle W1).
 *
 * Die Tests arbeiten ausschließlich in einem eigenen Ordner unter `%TEMP%`
 * (auf diesem Rechner: `C:\Users\Kunc GmbH\AppData\Local\Temp\…`, enthält also
 * bereits ein Leerzeichen). Testordner werden bewusst **nicht** gelöscht
 * (Regel 7: nichts löschen); Windows räumt `%TEMP%` selbst auf.
 *
 * Flag-Verhalten wird über `isEnabled` injiziert, damit die Tests unabhängig
 * von `CONNECT_FLAGS_T3` der Umgebung sind.
 */

import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { measureDirectorySize } from "./disk-usage";
import { AgentWorkspaceManager, WORKSPACE_MARKER_FILE } from "./manager";
import {
  getDefaultWorkspacePath,
  getWorkspaceRegistryPath,
  isPathInside,
  isSameWorkspacePath,
  validateWorkspacePath,
} from "./paths";
import { WorkspaceRegistry } from "./registry";
import {
  allocateWorkspaceSlug,
  isValidWorkspaceSlug,
  slugifyAgentName,
} from "./slug";
import type { AgentWorkspaceManagerOptions, WorkspaceDbStore } from "./types";

const RUN_ROOT = mkdtempSync(join(tmpdir(), "connect-a07-"));

function managerFor(
  name: string,
  extra: Partial<AgentWorkspaceManagerOptions> = {},
): AgentWorkspaceManager {
  return new AgentWorkspaceManager({
    rootDir: join(RUN_ROOT, name),
    isEnabled: () => true,
    ...extra,
  });
}

function readRegistry(rootDir: string): {
  workspaces: { agentId: string; slug: string; path: string; status: string }[];
} {
  return JSON.parse(
    readFileSync(getWorkspaceRegistryPath(rootDir), "utf8"),
  ) as {
    workspaces: {
      agentId: string;
      slug: string;
      path: string;
      status: string;
    }[];
  };
}

/* ---------------------------------------------------------------------------------------- *
 * Slugs
 * ---------------------------------------------------------------------------------------- */

describe("A07 Slugs", () => {
  test("Umlaute und Sonderzeichen werden transliteriert", () => {
    expect(slugifyAgentName("Max Müller")).toBe("max-mueller");
    expect(slugifyAgentName("Grüße & Co.")).toBe("gruesse-co");
    expect(slugifyAgentName("Büro / Köln")).toBe("buero-koeln");
    expect(slugifyAgentName("  ???  ")).toBe("agent");
  });

  test("Slug enthält nie Pfadtrenner oder Punkte", () => {
    const slug = slugifyAgentName("../../Windows/System32 und mehr");
    expect(slug).not.toContain("..");
    expect(slug).not.toContain("/");
    expect(slug).not.toContain("\\");
    expect(isValidWorkspaceSlug(slug)).toBe(true);
  });

  test("reservierte Windows-Namen werden entschärft", () => {
    expect(slugifyAgentName("con")).toBe("agent-con");
    expect(isValidWorkspaceSlug("con")).toBe(false);
    expect(isValidWorkspaceSlug("agent-con")).toBe(true);
  });

  test("Slug-Kollision vergibt -2, -3, … und bleibt eindeutig", () => {
    const first = allocateWorkspaceSlug("max", []);
    const second = allocateWorkspaceSlug("max", [first]);
    const third = allocateWorkspaceSlug("max", [first, second]);
    expect([first, second, third]).toEqual(["max", "max-2", "max-3"]);

    const taken = new Set<string>();
    for (let index = 0; index < 40; index += 1) {
      const slug = allocateWorkspaceSlug("max", taken);
      expect(taken.has(slug)).toBe(false);
      taken.add(slug);
    }
    expect(taken.size).toBe(40);
  });

  test("Kollision ignoriert Groß-/Kleinschreibung (Windows-Ordner)", () => {
    expect(allocateWorkspaceSlug("Max", ["max"])).toBe("max-2");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Pfad-Validierung
 * ---------------------------------------------------------------------------------------- */

describe("A07 Pfad-Validierung", () => {
  const rootDir = join(RUN_ROOT, "validierung");

  test("Windows-Pfad mit Leerzeichen ist erlaubt", () => {
    const result = validateWorkspacePath(
      join(RUN_ROOT, "Kunden Seite Kunc GmbH"),
      { rootDir },
    );
    expect(result.ok).toBe(true);
  });

  test("Standardordner unter der Workspace-Wurzel ist erlaubt", () => {
    const result = validateWorkspacePath(
      getDefaultWorkspacePath(rootDir, "max-mueller"),
      {
        rootDir,
      },
    );
    expect(result.ok).toBe(true);
  });

  test("`..` wird abgelehnt (auch wenn resolve() es wegnehmen würde)", () => {
    const result = validateWorkspacePath(`${RUN_ROOT}\\..\\ausbruch`, {
      rootDir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("traversal");
  });

  test("relative Pfade werden abgelehnt", () => {
    const result = validateWorkspacePath("Projekte\\Agent Eins", { rootDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_absolute");
  });

  test("Netzwerkpfade werden abgelehnt", () => {
    const result = validateWorkspacePath("\\\\server\\share\\agent", {
      rootDir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unc");
  });

  test("Laufwerkswurzel wird abgelehnt", () => {
    const result = validateWorkspacePath("C:\\", { rootDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("drive_root");
  });

  test("Systemordner werden abgelehnt", () => {
    const windows = process.env.SystemRoot ?? "C:\\Windows";
    const result = validateWorkspacePath(join(windows, "System32"), {
      rootDir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("system_dir");

    const programFiles = validateWorkspacePath(
      join(process.env.ProgramFiles ?? "C:\\Program Files", "Connect", "Agent"),
      { rootDir },
    );
    expect(programFiles.ok).toBe(false);
  });

  test("Nutzerprofil-Wurzel wird abgelehnt, Unterordner nicht", () => {
    expect(validateWorkspacePath(homedir(), { rootDir }).ok).toBe(false);
    const downloads = validateWorkspacePath(
      join(homedir(), "Downloads", "Projekt"),
      { rootDir },
    );
    expect(downloads.ok).toBe(false);
    if (!downloads.ok) expect(downloads.code).toBe("home_root");

    // Eigener Projektordner außerhalb der geschützten Bereiche bleibt erlaubt.
    const ownProject = validateWorkspacePath(
      join(RUN_ROOT, "Eigenes Projekt"),
      { rootDir },
    );
    expect(ownProject.ok).toBe(true);
  });

  test("Connect-Repo wird abgelehnt", () => {
    const result = validateWorkspacePath(process.cwd(), { rootDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("protected_project");
  });

  test("T3-Fork wird abgelehnt", () => {
    const t3 = join(homedir(), ".gemini", "antigravity", "scratch", "t3code");
    const result = validateWorkspacePath(t3, { rootDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("protected_project");
  });

  test("Stefans Helium-Profil wird abgelehnt", () => {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return;
    const result = validateWorkspacePath(
      join(localAppData, "imput", "Helium", "User Data", "Default"),
      { rootDir },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("helium_profile");
  });

  test("ConnectAgents außerhalb von workspaces wird abgelehnt", () => {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return;
    const result = validateWorkspacePath(
      join(localAppData, "ConnectAgents", "agent_1", "helium"),
      {
        rootDir,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("connect_data");
  });

  test("die Workspace-Wurzel selbst ist kein Agentenordner", () => {
    const result = validateWorkspacePath(rootDir, { rootDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("workspaces_root");
  });

  test("ein Ordner eines anderen Agenten wird abgelehnt (in_use)", () => {
    const taken = [
      { agentId: "agent-1", path: join(RUN_ROOT, "Fremder Ordner") },
    ];
    const result = validateWorkspacePath(taken[0].path, {
      rootDir,
      taken,
      agentId: "agent-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("in_use");
  });

  test("Verschachtelung in einen anderen Agentenordner wird abgelehnt", () => {
    const taken = [
      { agentId: "agent-1", path: join(RUN_ROOT, "Fremder Ordner") },
    ];
    const result = validateWorkspacePath(join(taken[0].path, "unterordner"), {
      rootDir,
      taken,
      agentId: "agent-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("nested");
  });

  test("eigener Ordner ist bei erneuter Zuordnung kein Konflikt", () => {
    const path = join(RUN_ROOT, "Mein Projekt");
    const result = validateWorkspacePath(path, {
      rootDir,
      taken: [{ agentId: "agent-1", path }],
      agentId: "agent-1",
    });
    expect(result.ok).toBe(true);
  });

  test("Pfadvergleich: Groß-/Kleinschreibung und Leerzeichen", () => {
    if (process.platform !== "win32") return;
    expect(
      isSameWorkspacePath(
        "C:\\Users\\Kunc GmbH\\Projekt",
        "c:/users/kunc gmbh/projekt/",
      ),
    ).toBe(true);
    expect(
      isPathInside(
        "C:\\Users\\Kunc GmbH\\Projekt\\sub",
        "C:\\Users\\Kunc GmbH\\Projekt",
      ),
    ).toBe(true);
    expect(
      isPathInside(
        "C:\\Users\\Kunc GmbH\\Projekt2",
        "C:\\Users\\Kunc GmbH\\Projekt",
      ),
    ).toBe(false);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Anlegen, Eindeutigkeit, 40 Agenten
 * ---------------------------------------------------------------------------------------- */

describe("A07 Workspace anlegen", () => {
  test("legt Standardordner, Registry und Marker an", async () => {
    const manager = managerFor("anlegen");
    const result = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max Müller",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.created).toBe(true);
    expect(result.workspace.slug).toBe("max-mueller");
    expect(result.workspace.path).toBe(
      join(manager.getRootDir(), "max-mueller"),
    );
    expect(existsSync(result.workspace.path)).toBe(true);
    expect(existsSync(manager.getRegistryPath())).toBe(true);

    const marker = JSON.parse(
      readFileSync(join(result.workspace.path, WORKSPACE_MARKER_FILE), "utf8"),
    ) as { agentId: string };
    expect(marker.agentId).toBe("agent-1");
  });

  test("zweiter Aufruf liefert denselben Ordner", async () => {
    const manager = managerFor("idempotent");
    const first = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });
    const second = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.workspace.path).toBe(first.workspace.path);
    expect(second.created).toBe(false);
  });

  test("gleicher Name bei zwei Agenten → zwei Ordner (Slug-Kollision)", async () => {
    const manager = managerFor("kollision");
    const first = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });
    const second = await manager.ensure({
      agentId: "agent-2",
      agentName: "Max",
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.workspace.path).not.toBe(second.workspace.path);
    expect(first.workspace.slug).toBe("max");
    expect(second.workspace.slug).toBe("max-2");
    expect(existsSync(first.workspace.path)).toBe(true);
    expect(existsSync(second.workspace.path)).toBe(true);
  });

  test("40 Agenten mit gleichem Namen bekommen 40 verschiedene Ordner", async () => {
    const manager = managerFor("flotte-40");
    const paths = new Set<string>();

    for (let index = 0; index < 40; index += 1) {
      const result = await manager.ensure({
        agentId: `agent-${index}`,
        agentName: "Max Müller",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(existsSync(result.workspace.path)).toBe(true);
      paths.add(result.workspace.path.toLowerCase());
    }

    expect(paths.size).toBe(40);
    const list = await manager.list();
    expect(list.workspaces).toHaveLength(40);
  });

  test("parallele Aufrufe vergeben keine doppelten Slugs", async () => {
    const manager = managerFor("parallel");
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        manager.ensure({
          agentId: `parallel-${index}`,
          agentName: "Gleicher Name",
        }),
      ),
    );

    const paths = results
      .filter(
        (result): result is Extract<typeof result, { ok: true }> => result.ok,
      )
      .map((result) => result.workspace.path.toLowerCase());
    expect(paths).toHaveLength(10);
    expect(new Set(paths).size).toBe(10);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Projektordner zuweisen
 * ---------------------------------------------------------------------------------------- */

describe("A07 Projektordner zuweisen", () => {
  test("weist vorhandenen Ordner mit Leerzeichen zu", async () => {
    const manager = managerFor("projekt");
    const projectPath = join(RUN_ROOT, "projekt", "Kunden Seite Kunc GmbH");
    mkdirSync(projectPath, { recursive: true });

    const result = await manager.assignProjectFolder({
      agentId: "agent-1",
      agentName: "Kunde A",
      path: projectPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.kind).toBe("project");
    expect(result.workspace.path).toBe(projectPath);
    expect(existsSync(projectPath)).toBe(true);

    const registry = readRegistry(manager.getRootDir());
    expect(registry.workspaces[0]?.path).toBe(projectPath);
  });

  test("fehlender Ordner wird ohne createIfMissing abgelehnt", async () => {
    const manager = managerFor("projekt-fehlt");
    const result = await manager.assignProjectFolder({
      agentId: "agent-1",
      path: join(RUN_ROOT, "projekt-fehlt", "gibt-es-nicht"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });

  test("createIfMissing legt den Ordner an", async () => {
    const manager = managerFor("projekt-neu");
    const projectPath = join(RUN_ROOT, "projekt-neu", "Neues Projekt");
    const result = await manager.assignProjectFolder({
      agentId: "agent-1",
      path: projectPath,
      createIfMissing: true,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(projectPath)).toBe(true);
  });

  test("verbotene Projektordner werden abgelehnt", async () => {
    const manager = managerFor("projekt-verboten");
    const windows = process.env.SystemRoot ?? "C:\\Windows";
    const result = await manager.assignProjectFolder({
      agentId: "agent-1",
      path: join(windows, "System32"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("system_dir");
  });

  test("derselbe Projektordner kann nicht an zwei Agenten gehen", async () => {
    const manager = managerFor("projekt-doppelt");
    const projectPath = join(RUN_ROOT, "projekt-doppelt", "Geteiltes Projekt");
    mkdirSync(projectPath, { recursive: true });

    const first = await manager.assignProjectFolder({
      agentId: "agent-1",
      path: projectPath,
    });
    const second = await manager.assignProjectFolder({
      agentId: "agent-2",
      path: projectPath,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("in_use");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Nie löschen — nur archivieren
 * ---------------------------------------------------------------------------------------- */

describe("A07 Archivieren statt löschen", () => {
  test("Archivieren lässt Ordner und Inhalt unangetastet", async () => {
    const manager = managerFor("archiv");
    const created = await manager.ensure({
      agentId: "agent-1",
      agentName: "Langläufer",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const markerPath = join(created.workspace.path, WORKSPACE_MARKER_FILE);
    const markerBefore = readFileSync(markerPath, "utf8");
    const workFile = join(created.workspace.path, "ergebnis.md");
    writeFileSync(workFile, "# Arbeit, die bleiben muss\n", "utf8");

    const archived = await manager.archive("agent-1");
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;

    expect(archived.workspace.status).toBe("archived");
    expect(archived.workspace.archivedAt).not.toBeNull();
    expect(archived.workspace.path).toBe(created.workspace.path);
    expect(existsSync(created.workspace.path)).toBe(true);
    expect(existsSync(workFile)).toBe(true);
    expect(readFileSync(markerPath, "utf8")).toBe(markerBefore);

    const registry = readRegistry(manager.getRootDir());
    expect(registry.workspaces[0]?.status).toBe("archived");
  });

  test("ein neuer Agent erbt keinen archivierten Ordner", async () => {
    const manager = managerFor("archiv-slug");
    await manager.ensure({ agentId: "agent-1", agentName: "Max" });
    await manager.archive("agent-1");

    const second = await manager.ensure({
      agentId: "agent-2",
      agentName: "Max",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.workspace.slug).toBe("max-2");
  });

  test("derselbe Agent findet seinen archivierten Ordner wieder", async () => {
    const manager = managerFor("archiv-reaktiv");
    const created = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await manager.archive("agent-1");

    const again = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.reactivated).toBe(true);
    expect(again.workspace.path).toBe(created.workspace.path);
    expect(again.workspace.status).toBe("active");
  });

  test("Archivieren eines unbekannten Agenten meldet not_found", async () => {
    const manager = managerFor("archiv-unbekannt");
    const result = await manager.archive("gibt-es-nicht");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Feature-Flag
 * ---------------------------------------------------------------------------------------- */

describe("A07 Feature-Flag", () => {
  test("Flag aus: kein Ordner, keine Registry, keine Datei", async () => {
    const rootDir = join(RUN_ROOT, "flag-aus");
    const manager = new AgentWorkspaceManager({
      rootDir,
      isEnabled: () => false,
    });

    const result = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("disabled");
    expect(existsSync(rootDir)).toBe(false);

    const list = await manager.list();
    expect(list.enabled).toBe(false);
    expect(list.workspaces).toHaveLength(0);

    const measured = await manager.measureAll();
    expect(measured.enabled).toBe(false);
    expect(existsSync(rootDir)).toBe(false);
  });

  test("Flag an schaltet den Manager ein", async () => {
    const manager = managerFor("flag-an");
    expect(manager.isOn()).toBe(true);
    const result = await manager.ensure({ agentId: "agent-1" });
    expect(result.ok).toBe(true);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Speicherplatz (A09)
 * ---------------------------------------------------------------------------------------- */

describe("A07 Speicherplatz", () => {
  test("misst Dateien und Unterordner eines Agentenordners", async () => {
    const manager = managerFor("speicher");
    const created = await manager.ensure({
      agentId: "agent-1",
      agentName: "Speicher",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    writeFileSync(
      join(created.workspace.path, "gross.txt"),
      "x".repeat(1000),
      "utf8",
    );
    mkdirSync(join(created.workspace.path, "unterordner"), { recursive: true });
    writeFileSync(
      join(created.workspace.path, "unterordner", "klein.txt"),
      "y".repeat(500),
      "utf8",
    );

    const usage = await manager.measure("agent-1");
    expect(usage).not.toBeNull();
    if (!usage) return;

    expect(usage.bytes).toBeGreaterThanOrEqual(1500);
    expect(usage.files).toBeGreaterThanOrEqual(2);
    expect(usage.directories).toBeGreaterThanOrEqual(1);
    expect(usage.truncated).toBe(false);
  });

  test("Gesamtbericht summiert alle Agentenordner", async () => {
    const manager = managerFor("speicher-gesamt");
    await manager.ensure({ agentId: "agent-1", agentName: "Eins" });
    await manager.ensure({ agentId: "agent-2", agentName: "Zwei" });

    const report = await manager.measureAll();
    expect(report.enabled).toBe(true);
    expect(report.workspaces).toHaveLength(2);
    expect(report.totalBytes).toBe(
      report.workspaces.reduce((sum, entry) => sum + entry.bytes, 0),
    );
  });

  test("Grenzen brechen die Messung sauber ab (truncated)", async () => {
    const dir = join(RUN_ROOT, "messgrenze");
    mkdirSync(dir, { recursive: true });
    for (let index = 0; index < 20; index += 1) {
      writeFileSync(join(dir, `datei-${index}.txt`), "z", "utf8");
    }

    const usage = await measureDirectorySize(dir, { maxEntries: 5 });
    expect(usage.truncated).toBe(true);
    expect(usage.files).toBeLessThanOrEqual(5);
    expect(usage.errors).toHaveLength(0);
  });

  test("fehlender Ordner liefert eine Nullmessung statt eines Fehlers", async () => {
    const usage = await measureDirectorySize(join(RUN_ROOT, "gibt-es-nicht"));
    expect(usage.bytes).toBe(0);
    expect(usage.files).toBe(0);
    expect(usage.errors.length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Registry und Datenbank
 * ---------------------------------------------------------------------------------------- */

describe("A07 Registry", () => {
  test("legt vor dem Ersetzen eine Sicherung an", async () => {
    const manager = managerFor("registry-sicherung");
    await manager.ensure({ agentId: "agent-1", agentName: "Eins" });
    await manager.ensure({ agentId: "agent-2", agentName: "Zwei" });

    expect(existsSync(`${manager.getRegistryPath()}.bak`)).toBe(true);
  });

  test("defekte Registry fällt auf die Sicherung zurück", async () => {
    const manager = managerFor("registry-defekt");
    await manager.ensure({ agentId: "agent-1", agentName: "Eins" });
    await manager.ensure({ agentId: "agent-2", agentName: "Zwei" });

    writeFileSync(manager.getRegistryPath(), "{ kaputt", "utf8");

    const registry = new WorkspaceRegistry(manager.getRegistryPath());
    const snapshot = await registry.load();
    expect(snapshot.workspaces.map((entry) => entry.agentId)).toContain(
      "agent-1",
    );
    expect(registry.getLoadError()).not.toBeNull();
  });

  test("Datenbankfehler (Migration fehlt) blockiert das Anlegen nicht", async () => {
    const failingStore: WorkspaceDbStore = {
      async loadAll() {
        throw new Error("relation agent_workspace does not exist");
      },
      async upsert() {
        throw new Error("relation agent_workspace does not exist");
      },
    };

    const manager = managerFor("db-fehlt", { dbStore: failingStore });
    const result = await manager.ensure({
      agentId: "agent-1",
      agentName: "Max",
    });
    expect(result.ok).toBe(true);
  });
});
