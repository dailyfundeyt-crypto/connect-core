/**
 * T3-Bridge — Anhänge & Dateien (Lane A18)
 * Suffix-Berechnung und kollisionsfreies Schreiben (keine Überschreibung).
 */

import { existsSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * Zerlegt einen Dateinamen in Basis-Stamm, bestehenden Suffix-Zähler (falls vorhanden) und Erweiterung.
 * Beispiel:
 *  - "bericht.pdf" -> stem: "bericht", counter: 0, ext: ".pdf"
 *  - "bericht-1.pdf" -> stem: "bericht", counter: 1, ext: ".pdf"
 *  - "bild (2).png" -> stem: "bild", counter: 2, ext: ".png"
 */
export function splitFileNameSuffix(fileName: string): {
  baseStem: string;
  counter: number;
  ext: string;
} {
  const ext = extname(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;

  // Prüfen auf "-<Zahl>" am Ende
  const dashMatch = stem.match(/^(.*?)-(\d+)$/);
  if (dashMatch) {
    const num = parseInt(dashMatch[2], 10);
    if (!Number.isNaN(num) && num > 0) {
      return { baseStem: dashMatch[1], counter: num, ext };
    }
  }

  // Prüfen auf " (<Zahl>)" am Ende
  const parenMatch = stem.match(/^(.*?)\s*\((\d+)\)$/);
  if (parenMatch) {
    const num = parseInt(parenMatch[2], 10);
    if (!Number.isNaN(num) && num > 0) {
      return { baseStem: parenMatch[1], counter: num, ext };
    }
  }

  return { baseStem: stem, counter: 0, ext };
}

/**
 * Berechnet den nächsten Dateinamen mit Suffix.
 * Beispiel:
 *  - "test.txt", counter: 1 -> "test-1.txt"
 *  - "test-1.txt", counter: 2 -> "test-2.txt"
 */
export function formatFileNameWithSuffix(baseStem: string, counter: number, ext: string): string {
  if (counter <= 0) {
    return `${baseStem}${ext}`;
  }
  return `${baseStem}-${counter}${ext}`;
}

/**
 * Ermittelt einen nicht belegten Dateinamen in einem Zielverzeichnis.
 * Falls die Datei bereits existiert, wird ein Suffix (-1, -2, ...) angehängt.
 */
export function resolveUniqueFileName(targetDir: string, requestedFileName: string): string {
  const initialPath = join(targetDir, requestedFileName);
  if (!existsSync(initialPath)) {
    return requestedFileName;
  }

  const { baseStem, counter, ext } = splitFileNameSuffix(requestedFileName);
  let nextCounter = Math.max(1, counter + 1);

  // Suche nach nächstem freien Namen
  while (nextCounter < 10_000) {
    const candidateName = formatFileNameWithSuffix(baseStem, nextCounter, ext);
    const candidatePath = join(targetDir, candidateName);
    if (!existsSync(candidatePath)) {
      return candidateName;
    }
    nextCounter++;
  }

  // Fallback bei extrem vielen Kollisionen: Zeitstempel-Suffix
  return `${baseStem}-${Date.now()}${ext}`;
}

/**
 * Schreibt eine Datei kollisionsfrei und atomar mit dem Node-Flag 'wx' (exclusive write).
 * Wenn die Datei bereits existiert (EEXIST), wird das nächste Suffix probiert.
 * Überschreibt niemals eine bestehende Datei.
 */
export function writeUniqueFileAtomic(
  targetDir: string,
  requestedFileName: string,
  content: Buffer | Uint8Array,
): { fileName: string; filePath: string } {
  const { baseStem, counter, ext } = splitFileNameSuffix(requestedFileName);

  // Zuerst ohne Suffix probieren, falls requestedFileName noch keine Zahl hatte
  let currentCounter = counter;
  let attempts = 0;
  const maxAttempts = 10_000;

  while (attempts < maxAttempts) {
    const candidateName = formatFileNameWithSuffix(baseStem, currentCounter, ext);
    const candidatePath = join(targetDir, candidateName);

    try {
      // Flag 'wx': Fällt mit EEXIST fehl, wenn Datei bereits existiert
      writeFileSync(candidatePath, content, { flag: "wx" });
      return {
        fileName: candidateName,
        filePath: candidatePath,
      };
    } catch (err: any) {
      if (err?.code === "EEXIST") {
        // Kollision: Nächstes Suffix probieren
        currentCounter = currentCounter <= 0 ? 1 : currentCounter + 1;
        attempts++;
        continue;
      }
      throw err;
    }
  }

  // Fallback: Zeitstempel
  const fallbackName = `${baseStem}-${Date.now()}${ext}`;
  const fallbackPath = join(targetDir, fallbackName);
  writeFileSync(fallbackPath, content, { flag: "wx" });

  return {
    fileName: fallbackName,
    filePath: fallbackPath,
  };
}
