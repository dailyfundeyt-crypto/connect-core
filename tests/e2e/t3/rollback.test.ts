/**
 * A40 — Rollback-Prüfung (Lane `tests/e2e/t3/**`).
 *
 * Der Masterplan verlangt: „Rollback-Anleitung (Sicherungen zurückkopieren) getestet."
 *
 * Der Test **übt** den Rollback an einer Wegwerf-Datei in einem temporären
 * Verzeichnis. Er fasst keine Projektdatei an und löscht nichts aus dem Repo.
 *
 * Geprüft wird:
 *   1. Eine mit `.bak-helium-<datum>` gesicherte Datei lässt sich exakt auf den
 *      Sicherungsstand zurückkopieren (Byte-Gleichheit).
 *   2. Die Originaldatei ist nach dem Rollback wiederhergestellt, die
 *      Sicherung bleibt erhalten (Regel 7: nichts löschen).
 *   3. Die Rollback-Anleitung findet zu einer geänderten Bestandsdatei
 *      automatisch die passende Sicherung.
 *   4. Für jede geänderte Bestandsdatei im T3-Bereich existiert **mindestens
 *      eine** Sicherung — ohne sie gäbe es keinen Rollback.
 */

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBackup, isT3File, REPO_ROOT } from "./lane-check";

describe("A40: Rollback — Sicherungen zurückkopieren", () => {
  test("eine gesicherte Datei lässt sich byte-genau zurückkopieren", () => {
    const dir = mkdtempSync(join(tmpdir(), "a40-rollback-"));
    try {
      const target = join(dir, "app.ts");
      const backup = join(dir, "app.ts.bak-helium-2026-10-29");
      writeFileSync(target, "NEUER INHALT mit Aenderungen\n", "utf8");
      writeFileSync(backup, "ALTER INHALT vor der Aenderung\n", "utf8");

      // Das ist der Rollback: die Sicherung ueber die Datei kopieren.
      cpSync(backup, target);

      expect(readFileSync(target, "utf8")).toBe("ALTER INHALT vor der Aenderung\n");
      // Die Sicherung selbst bleibt erhalten (Regel 7: nichts loeschen).
      expect(existsSync(backup)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("die Rollback-Anleitung findet die Sicherung zu einer geaenderten Datei", () => {
    const dir = mkdtempSync(join(tmpdir(), "a40-rollback-find-"));
    try {
      const target = join(dir, "contracts.ts");
      writeFileSync(target, "x\n", "utf8");
      writeFileSync(join(dir, "contracts.ts.bak-helium-2026-10-29"), "y\n", "utf8");

      const found = findBackup(dir, "contracts.ts");
      expect(found).toBe("contracts.ts.bak-helium-2026-10-29");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("jede geaenderte Bestandsdatei im T3-Bereich hat eine Sicherung", () => {
    const output = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "HEAD",
        "--",
        "apps/server/src",
        "apps/app/src",
        "packages",
        "docs/t3",
        "tools",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    const changed = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const untracked = new Set(
      execFileSync(
        "git",
        [
          "ls-files",
          "--others",
          "--exclude-standard",
          "--",
          "apps/server/src",
          "apps/app/src",
          "packages",
          "docs/t3",
          "tools",
        ],
        { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      )
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );

    const missing: string[] = [];
    for (const file of changed) {
      if (file.includes(".bak-helium-")) continue;
      // Neue Dateien brauchen keine Sicherung (Regel 2).
      if (untracked.has(file)) continue;
      // Nur T3-Arbeit; der alte v06-/swarm-Baum war schon vorher da.
      if (!isT3File(file)) continue;
      if (!findBackup(REPO_ROOT, file)) missing.push(file);
    }

    expect(missing).toEqual([]);
  });
});
