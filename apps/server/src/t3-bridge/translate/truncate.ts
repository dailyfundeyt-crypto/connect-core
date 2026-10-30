/**
 * T3-Bridge / Translate — Befehlsausgaben-Kürzung (A06).
 *
 * Eigentümer: A06. Nur innerhalb von `t3-bridge/translate/` ändern.
 *
 * Lange Befehlsausgaben (`command_execution.output`) werden auf Kopf + Ende
 * gekürzt. Der ausgeblendete Mittelteil erscheint als Platzhalter-Zeile.
 *
 * REINE FUNKTION — kein Side-Effect.
 */

import type { CommandOutputTruncationOptions } from "./types";
import { DEFAULT_TRUNCATION_OPTIONS } from "./types";

/**
 * Kürzt eine lange Befehlsausgabe auf Kopf + Ende.
 *
 * @param output    - Rohe Befehlsausgabe (beliebig lang).
 * @param options   - Kürzungs-Optionen (Standard: `DEFAULT_TRUNCATION_OPTIONS`).
 * @returns Die (ggf. gekürzte) Ausgabe als String.
 *
 * @example
 * truncateCommandOutput("a\nb\nc\nd\ne\nf", { headLines: 2, tailLines: 2, truncationThreshold: 4 })
 * // "a\nb\n… 2 Zeilen ausgeblendet …\ne\nf"
 */
export function truncateCommandOutput(
  output: string,
  options: CommandOutputTruncationOptions = DEFAULT_TRUNCATION_OPTIONS,
): string {
  const { headLines, tailLines, truncationThreshold } = options;
  const lines = output.split("\n");
  const total = lines.length;

  // Kurze Ausgaben: unverändert zurückgeben.
  if (total <= truncationThreshold) return output;

  const hiddenCount = total - headLines - tailLines;
  // Negativer oder null: das wäre nur möglich, wenn headLines + tailLines ≥ total,
  // aber da total > truncationThreshold und threshold ≥ headLines + tailLines (implizit),
  // kann dieser Fall nur bei sehr kleinem threshold auftreten. Sicherheitshalber:
  if (hiddenCount <= 0) return output;

  const head = lines.slice(0, headLines).join("\n");
  const tail = lines.slice(total - tailLines).join("\n");
  return `${head}\n… ${hiddenCount} Zeilen ausgeblendet …\n${tail}`;
}
