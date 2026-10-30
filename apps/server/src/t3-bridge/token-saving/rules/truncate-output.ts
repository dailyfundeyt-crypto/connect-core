/**
 * rules/truncate-output.ts — Regel 1: Befehlsausgaben vor dem Weiterreichen kürzen (A14)
 *
 * Wenn Tools (Terminal/Bash, Logs, Dateisuchen, Compiler) große Ausgaben erzeugen,
 * werden diese vor dem Weiterreichen an das LLM gekürzt:
 *  - Erste N Zeilen (Kopf) bleiben erhalten
 *  - Letzte M Zeilen (Fuß) bleiben erhalten
 *  - Der Mittelteil wird durch einen kompakten Hinweis ersetzt
 *
 * Verhindert das Volllaufen des Kontextfensters durch kilometerlange Log- oder Build-Ausgaben.
 */

import type { TurnToolOutput } from "../types";
import { estimateTokenCount } from "../token-estimator";

export interface TruncateOptions {
  maxLines?: number;
  headLines?: number;
  tailLines?: number;
  maxChars?: number;
}

export interface TruncateResult {
  output: string;
  originalLines: number;
  savedLines: number;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  wasTruncated: boolean;
}

export const DEFAULT_TRUNCATE_OPTIONS: Required<TruncateOptions> = {
  maxLines: 25,
  headLines: 10,
  tailLines: 10,
  maxChars: 4000,
};

/**
 * Kürzt eine lange Zeichenkette anhand von Zeilen- und Zeichenlimits.
 */
export function truncateOutputText(
  text: string,
  options?: TruncateOptions,
): TruncateResult {
  const maxLines = options?.maxLines ?? DEFAULT_TRUNCATE_OPTIONS.maxLines;
  const headLines = options?.headLines ?? DEFAULT_TRUNCATE_OPTIONS.headLines;
  const tailLines = options?.tailLines ?? DEFAULT_TRUNCATE_OPTIONS.tailLines;
  const maxChars = options?.maxChars ?? DEFAULT_TRUNCATE_OPTIONS.maxChars;

  const originalTokens = estimateTokenCount(text);
  const lines = text.split(/\r?\n/);
  const originalLines = lines.length;

  // Prüfen, ob Kürzung erforderlich ist
  const needsLineTruncation = lines.length > maxLines && lines.length > headLines + tailLines;
  const needsCharTruncation = text.length > maxChars;

  if (!needsLineTruncation && !needsCharTruncation) {
    return {
      output: text,
      originalLines,
      savedLines: 0,
      originalTokens,
      optimizedTokens: originalTokens,
      savedTokens: 0,
      wasTruncated: false,
    };
  }

  // Zeilenbasierte Kürzung
  const head = lines.slice(0, headLines);
  const tail = lines.slice(lines.length - tailLines);
  const skippedLines = originalLines - headLines - tailLines;

  const omittedMarker = `\n... [Token-Sparen: ${skippedLines} Zeilen (${text.length - (head.join("\n").length + tail.join("\n").length)} Zeichen) ausgeblendet. Vollständige Ausgabe im Log einsehbar] ...\n`;

  let truncated = [...head, omittedMarker, ...tail].join("\n");

  // Falls auch die verbliebenen Zeichen das Maximal-Limit noch überschreiten (z.B. extrem lange Einzelzeilen)
  if (truncated.length > maxChars) {
    const half = Math.floor((maxChars - 200) / 2);
    const startStr = truncated.slice(0, half);
    const endStr = truncated.slice(truncated.length - half);
    truncated = `${startStr}\n... [Token-Sparen: weitere Zeichen ausgeblendet] ...\n${endStr}`;
  }

  const optimizedTokens = estimateTokenCount(truncated);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);

  return {
    output: truncated,
    originalLines,
    savedLines: Math.max(0, skippedLines),
    originalTokens,
    optimizedTokens,
    savedTokens,
    wasTruncated: true,
  };
}

/**
 * Optimiert eine Liste von Tool-Ausgaben durch Kürzen langer Befehlsausgaben.
 */
export function truncateToolOutputs(
  toolOutputs: TurnToolOutput[],
  options?: TruncateOptions,
): {
  optimizedOutputs: TurnToolOutput[];
  savedTokens: number;
  truncatedCount: number;
} {
  let totalSavedTokens = 0;
  let truncatedCount = 0;

  const optimizedOutputs = toolOutputs.map((tool) => {
    const res = truncateOutputText(tool.output, options);
    if (res.wasTruncated) {
      totalSavedTokens += res.savedTokens;
      truncatedCount += 1;
      return {
        ...tool,
        output: res.output,
        truncated: true,
      };
    }
    return tool;
  });

  return {
    optimizedOutputs,
    savedTokens: totalSavedTokens,
    truncatedCount,
  };
}
