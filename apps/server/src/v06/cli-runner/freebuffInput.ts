/**
 * Freebuff-Eingabeverarbeitung für Connect v06.
 *
 * Freebuff nutzt als interaktive TUI (OpenTUI / ConPTY) Raw-Mode-Eingaben:
 * - Enter/Absenden erfordert '\r' (Carriage Return, 0x0D) statt '\n'.
 * - Bracketed-Paste-Modus (\x1b[200~ ... \x1b[201~) für mehrzeilige Einfügungen,
 *   damit Zeilenumbrüche nicht versehentlich als vorzeitiges Absenden interpretiert werden.
 * - Raw-Modus für Cursortasten, Esc-Sequenzen und Ctrl-C / Ctrl-D Durchreichung.
 */

export const BRACKETED_PASTE_START = "\x1b[200~";
export const BRACKETED_PASTE_END = "\x1b[201~";

export interface FreebuffInputOptions {
  /** Unveränderte Durchreichung (z. B. Pfeiltasten, Ctrl-C, Terminal-Signale). */
  raw?: boolean;
  /** Markiert die Eingabe als Zwischenablage-Einfügung (Bracketed Paste). */
  isPaste?: boolean;
}

/**
 * Prüft, ob ein Text bereits mit Bracketed-Paste-Markern umschlossen ist.
 */
export function isBracketedPaste(input: string): boolean {
  return input.startsWith(BRACKETED_PASTE_START) && input.endsWith(BRACKETED_PASTE_END);
}

/**
 * Umschließt Text mit Bracketed-Paste-Sequenzen.
 */
export function wrapBracketedPaste(text: string): string {
  if (isBracketedPaste(text)) {
    return text;
  }
  // Innerhalb von Bracketed Paste neue Zeilen zu \r normalisieren
  const normalized = text.replace(/\r?\n/g, "\r");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}`;
}

/**
 * Entfernt Bracketed-Paste-Sequenzen aus einem Text.
 */
export function stripBracketedPaste(input: string): string {
  let result = input;
  if (result.startsWith(BRACKETED_PASTE_START)) {
    result = result.slice(BRACKETED_PASTE_START.length);
  }
  if (result.endsWith(BRACKETED_PASTE_END)) {
    result = result.slice(0, -BRACKETED_PASTE_END.length);
  }
  return result;
}

/**
 * Bereitet eine Benutzereingabe aus dem Eingabefeld optimal für die Freebuff-TUI vor.
 *
 * Regeln:
 * 1. Im Raw-Modus (Pfeiltasten, Steuerzeichen): Unverändert durchreichen.
 * 2. Wenn bereits Bracketed Paste: Unverändert durchreichen.
 * 3. Bei `isPaste: true` oder mehrzeiligem Inhalt mit Einfügeabsicht:
 *    Mit Bracketed Paste umschließen und Zeilenumbrüche als \r senden.
 * 4. Normale Zeileneingabe aus dem Eingabefeld:
 *    Abschließendes \r\n oder \n entfernen und exakt mit \r terminieren.
 */
export function formatFreebuffInput(input: string, options: FreebuffInputOptions = {}): string {
  if (options.raw) {
    return input;
  }

  if (isBracketedPaste(input)) {
    return input;
  }

  // Mehrzeilige Einfügung mit explizitem isPaste-Flag
  if (options.isPaste) {
    return wrapBracketedPaste(input);
  }

  // Zuerst abschließende Zeilenumbrüche entfernen (z. B. durch Enter im Input-Feld)
  const stripped = input.replace(/[\r\n]+$/, "");

  // Wenn nach dem Entfernen der Endung immer noch Umbrüche vorhanden sind:
  // Echter mehrzeiliger Text -> mit Bracketed Paste umschließen und mit \r abschließen.
  if (stripped.includes("\n") || stripped.includes("\r")) {
    return `${wrapBracketedPaste(stripped)}\r`;
  }

  // Normale einzeilige Eingabe aus dem Eingabefeld:
  // Exakt mit '\r' terminieren für TUI / ConPTY Enter.
  return `${stripped}\r`;
}
