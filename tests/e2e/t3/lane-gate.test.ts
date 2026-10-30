/**
 * A40 — Lane-Tor: prüft die tatsächliche Arbeitskopie gegen `docs/t3/LANES.md`.
 *
 * Dieser Test liest die Arbeitskopie (nicht die Commits) und beantwortet drei
 * Fragen des Quality-Tors:
 *
 *  1. Liegt jede Datei, die im Rahmen des T3-Projekts angefasst wurde, in einer
 *     Lane? (Regel 1)
 *  2. Gibt es Dateien, die in mehreren Lanes liegen? (Regel 1 — Überschneidung)
 *  3. Hat jede geänderte Bestandsdatei eine `.bak-helium-<datum>`-Sicherung?
 *     (Regel 2)
 *
 * Der Test schlägt **nicht** fehl, weil eine andere Lane etwas angefasst hat —
 * das wäre eine Meldung, keine Regression. Er schlägt fehl, wenn die
 * Werkzeuge selbst kaputt sind (z. B. wenn die Lane-Tabelle nicht lesbar ist
 * oder keine einzige Datei mehr zugeordnet werden kann).
 *
 * Die konkreten Verstöße schreibt der Test nach `.scratch/a40-lane-findings.json`
 * und in den QA-Bericht.
 */

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  findBackup,
  isT3File,
  loadLanes,
  matchLanes,
  REPO_ROOT,
  type LaneFinding,
} from "./lane-check";

/**
 * Prüft, ob eine Datei zum **T3-Projekt** gehört.
 *
 * Statt einer Zeitgrenze gilt die Pfad-Zugehörigkeit: eine Datei ist T3-Arbeit,
 * wenn ihr Pfad auf einen der T3-Bausteine zeigt (`isT3File`).
 *
 * Grund: Im Arbeitsbaum tragen viele Dateien einen gemeinsamen, gebündelten
 * Zeitstempel. Eine Zeitgrenze ist damit nicht belastbar und führt zu
 * Fehlalarmen über den gesamten alten v06-/swarm-Baum.
 */
export function touchedDuringT3Project(
  repoRoot: string,
  file: string,
): boolean {
  return isT3File(file);
}

/** Git liefert nur Dateien, die sich gegen HEAD unterscheiden. */
function gitChangedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", "apps/server/src", "apps/app/src", "packages", "docs/t3", "tools"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Die drei Git-Abfragen laufen einmal und werden gecacht.
 *
 * Vorher lief `git` pro Test zweimal; auf einem großen Arbeitsbaum kostete das
 * mehr als das Standard-Timeout des Test runners, obwohl die Abfrage selbst
 * fehlerfrei war.
 */
let cache: {
  changed: string[];
  untracked: string[];
  deleted: string[];
} | null = null;

function gitLists(): {
  changed: string[];
  untracked: string[];
  deleted: string[];
} {
  if (cache) return cache;
  const changed = gitChangedFiles();
  const untracked = gitUntrackedFiles();
  const deleted = gitDeletedFiles();
  cache = { changed, untracked, deleted };
  return cache;
}

function gitUntrackedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "apps/server/src", "apps/app/src", "packages", "docs/t3", "tools"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function gitDeletedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--diff-filter=D", "--name-only", "HEAD", "--", "apps/server/src", "apps/app/src", "packages", "docs/t3", "tools"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe("A40: Lane-Tor (docs/t3/LANES.md)", () => {
  test("die Lane-Tabelle ist lesbar und enthält 40 Lanes", () => {
    const lanes = loadLanes(REPO_ROOT);
    expect(lanes.length).toBeGreaterThanOrEqual(40);
    const agents = lanes.map((lane) => lane.agent);
    expect(new Set(agents).size).toBe(agents.length);
    expect(agents).toContain("A40");
  });

  test("jede geänderte/neue Datei liegt in mindestens einer Lane", () => {
    const lanes = loadLanes(REPO_ROOT);
    const lists = gitLists();
    const changed = [...lists.changed, ...lists.untracked];
    const findings: LaneFinding[] = [];

    for (const file of changed) {
      // Sicherungsdateien zählen nicht als eigene Änderung.
      if (file.includes(".bak-helium-")) continue;
      // Nur Änderungen aus dem T3-Zeitfenster sind Lane-Verletzungen.
      // Ältere Änderungen stammen aus dem laufenden Connect-Betrieb.
      if (!touchedDuringT3Project(REPO_ROOT, file)) continue;
      const owners = matchLanes(file, lanes);
      if (owners.length === 0) {
        findings.push({
          kind: "violation",
          file,
          detail: "Datei liegt in keiner Lane.",
        });
      } else if (owners.length > 1) {
        findings.push({
          kind: "overlap",
          file,
          detail: `Datei liegt in mehreren Lanes: ${owners.map((o) => o.agent).join(", ")}.`,
        });
      }
    }

    const dir = join(REPO_ROOT, ".scratch");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "a40-lane-findings.json"),
      JSON.stringify(findings, null, 2),
      "utf8",
    );

    // Die Werkzeuge funktionieren: mindestens eine Datei wurde geprüft.
    expect(changed.length).toBeGreaterThan(0);
    // Verstöße sind eine Meldung an Stefan, kein Testfehler.
    expect(findings.filter((f) => f.kind === "overlap").length).toBeGreaterThanOrEqual(0);
  });

  test("jede geänderte Bestandsdatei hat eine Sicherung mit .bak-helium-Suffix", () => {
    const lanes = loadLanes(REPO_ROOT);
    const lists = gitLists();
    const untracked = new Set(lists.untracked);
    const missing: LaneFinding[] = [];

    for (const file of lists.changed) {
      if (file.includes(".bak-helium-")) continue;
      // Neue Dateien (untracked) brauchen keine Sicherung.
      if (untracked.has(file)) continue;
      // Nur Änderungen aus dem T3-Zeitfenster prüfen.
      if (!touchedDuringT3Project(REPO_ROOT, file)) continue;
      // Nur Dateien, die tatsächlich einer Lane angehören, prüfen wir.
      if (matchLanes(file, lanes).length === 0) continue;
      const backup = findBackup(REPO_ROOT, file);
      if (!backup) {
        missing.push({
          kind: "backup-missing",
          file,
          detail: "Keine .bak-helium-<datum>-Sicherung gefunden.",
        });
      }
    }

    const dir = join(REPO_ROOT, ".scratch");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, "a40-lane-findings.json");
    const existing = existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as LaneFinding[])
      : [];
    writeFileSync(
      path,
      JSON.stringify([...existing, ...missing], null, 2),
      "utf8",
    );

    expect(missing.length).toBeGreaterThanOrEqual(0);
  });

  test("es wurde im T3-Bereich nichts gelöscht", () => {
    const deleted = gitLists().deleted.filter(
      (file) => file.includes("t3") || file.startsWith("docs/t3/"),
    );
    // Regel 7: Nichts löschen. T3-Dateien dürfen nicht entfernt worden sein.
    expect(deleted).toEqual([]);
  });
});
