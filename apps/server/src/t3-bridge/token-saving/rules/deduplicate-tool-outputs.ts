/**
 * rules/deduplicate-tool-outputs.ts — Regel 2: Doppelte Tool-Ausgaben entfernen (A14)
 *
 * Entfernt redundante, exakt identische Tool-Ausgaben innerhalb eines Turns oder Verlaufs.
 * Wenn ein Agent z.B. mehrfach 'git status', 'ls' oder dieselbe Fehlermeldung erhält,
 * wird die wiederholte Ausgabe durch eine prägnante Referenz ersetzt:
 *  "[Token-Sparen: Ausgabe identisch zu vorherigem Aufruf von '<tool>' (Hash: <hash>)]"
 */

import { createHash } from "node:crypto";
import type { TurnToolOutput } from "../types";
import { estimateTokenCount } from "../token-estimator";

export interface DeduplicateResult {
  optimizedOutputs: TurnToolOutput[];
  savedTokens: number;
  deduplicatedCount: number;
}

/**
 * Erzeugt einen stabilen SHA-256 Hash-Fingerabdruck für Tool-Ausgaben.
 * Normalisiert Whitespaces am Anfang/Ende.
 */
export function hashToolOutput(toolName: string, output: string): string {
  const normalized = `${toolName}:${output.trim()}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 10);
}

/**
 * Filtert oder referenziert redundante Tool-Ausgaben.
 *
 * @param toolOutputs Liste der aktuellen Tool-Ausgaben
 * @param previousHashes Optional: Set bereits bekannter Hashes aus früheren Aufrufen
 */
export function deduplicateToolOutputs(
  toolOutputs: TurnToolOutput[],
  previousHashes?: Set<string>,
): DeduplicateResult {
  const seenHashes = new Set<string>(previousHashes ?? []);
  let savedTokens = 0;
  let deduplicatedCount = 0;

  const optimizedOutputs: TurnToolOutput[] = [];

  for (const item of toolOutputs) {
    // Kurze Ausgaben (< 50 Zeichen) deduplizieren wir nicht, da der Referenztext kaum kleiner wäre
    if (item.output.trim().length < 50) {
      optimizedOutputs.push(item);
      continue;
    }

    const hash = hashToolOutput(item.toolName, item.output);

    if (seenHashes.has(hash)) {
      // Duplikat gefunden!
      const originalTokens = estimateTokenCount(item.output);
      const replacementText = `[Token-Sparen: Ausgabe identisch zu vorherigem Aufruf von '${item.toolName}' (Hash: ${hash})]`;
      const replacementTokens = estimateTokenCount(replacementText);
      const tokensSavedOnItem = Math.max(0, originalTokens - replacementTokens);

      savedTokens += tokensSavedOnItem;
      deduplicatedCount += 1;

      optimizedOutputs.push({
        ...item,
        output: replacementText,
        deduplicated: true,
      });
    } else {
      seenHashes.add(hash);
      optimizedOutputs.push(item);
    }
  }

  return {
    optimizedOutputs,
    savedTokens,
    deduplicatedCount,
  };
}
