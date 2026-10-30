import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  launchPcAppPath,
  listInstalledPcApps,
  resolvePcAppPath,
} from "./pc-apps";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "connect-pc-apps-"));
  tempDirs.push(dir);
  return dir;
}

function touch(filePath: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("listInstalledPcApps", () => {
  test("liest .lnk aus dem Startmenü, ignoriert anderes und sortiert", () => {
    const root = tempDir();
    touch(path.join(root, "Obsidian.lnk"));
    touch(path.join(root, "Tools", "Notepad++.lnk"));
    touch(path.join(root, "Uninstall.exe"));

    const apps = listInstalledPcApps({ startMenuDirs: [root], knownApps: [] });
    expect(apps.map((app) => app.name)).toEqual(["Notepad++", "Obsidian"]);
    expect(apps[1].path).toBe(path.join(root, "Obsidian.lnk"));
  });

  test("nimmt bekannte Apps nur, wenn die .exe existiert", () => {
    const root = tempDir();
    const exe = touch(path.join(root, "Obsidian", "Obsidian.exe"));

    const present = listInstalledPcApps({
      startMenuDirs: [root],
      knownApps: [{ name: "Obsidian", paths: [exe] }],
    });
    expect(present.map((app) => app.path)).toContain(exe);

    const missing = listInstalledPcApps({
      startMenuDirs: [root],
      knownApps: [
        { name: "Gibt es nicht", paths: [path.join(root, "nope.exe")] },
      ],
    });
    expect(missing.map((app) => app.name)).not.toContain("Gibt es nicht");
  });

  test("dedupliziert gleiche Namen", () => {
    const root = tempDir();
    touch(path.join(root, "A", "Obsidian.lnk"));
    touch(path.join(root, "B", "obsidian.lnk"));

    const apps = listInstalledPcApps({ startMenuDirs: [root], knownApps: [] });
    expect(apps).toHaveLength(1);
  });
});

describe("resolvePcAppPath", () => {
  test("nimmt einen existierenden Pfad", () => {
    const root = tempDir();
    const shortcut = touch(path.join(root, "Obsidian.lnk"));
    expect(resolvePcAppPath({ path: shortcut })).toBe(shortcut);
  });

  test("findet eine App über den Namen", () => {
    const root = tempDir();
    const shortcut = touch(path.join(root, "Obsidian.lnk"));
    expect(
      resolvePcAppPath(
        { name: "Obsidian" },
        { startMenuDirs: [root], knownApps: [] },
      ),
    ).toBe(shortcut);
  });

  test("liefert null für unbekannte Apps", () => {
    const root = tempDir();
    expect(
      resolvePcAppPath(
        { name: "Unbekannt" },
        { startMenuDirs: [root], knownApps: [] },
      ),
    ).toBeNull();
  });
});

describe("launchPcAppPath", () => {
  test("startet nichts, wenn die Datei fehlt", () => {
    const result = launchPcAppPath(
      path.join(os.tmpdir(), "connect-gibt-es-nicht-12345.exe"),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("nicht gefunden");
  });

  test("startet nichts ohne Pfad", () => {
    expect(launchPcAppPath("").ok).toBe(false);
  });
});
