/**
 * T3-Bridge — Redaktion von Provider-Texten (A04).
 *
 * Lane: A04 (Welle W1).
 *
 * Regel aus dem Auftrag: **Die Ausgabe enthält keine Pfade zu
 * Credential-Dateien.** T3 meldet in `message`, `unavailableReason` und in
 * Pfadfeldern (`runtimePaths.homePath`, `workspaceSnapshots[].cwd`,
 * `skills[].path`) echte Pfade — darunter `C:\Users\<Name>\.codex\auth.json`,
 * `~/.claude/credentials.json`, `%APPDATA%\…`. Diese Funktion ersetzt jeden
 * solchen Pfad durch `<Pfad>` bzw. `<Datei>`, bevor irgendetwas die Registry
 * verlässt (Browser, Logs, Tests).
 *
 * Absichtlich konservativ: lieber ein Pfad zu viel ersetzt als einer zu wenig.
 * Normale Sätze („nicht installiert", „Login abgelaufen") bleiben unverändert.
 */

/** Ein Token, das eine Datei mit Credentials benennt (auch als Teilstück). */
const CREDENTIAL_FILE_PATTERN =
  /(?:^|[\\/])(?:auth|credentials?|oauth|tokens?|session|secrets?|cookies?|keychain|key)\.(?:json|jsonc|ya?ml|toml|txt|db|sqlite|plist|ini)$|(?:^|[\\/])\.env(?:\.[\w-]+)?$|(?:^|[\\/])\.netrc$|(?:^|[\\/])id_(?:rsa|ed25519|ecdsa)$|\.(?:pem|key|p12|pfx)$/i;

/** Beginn eines Dateisystem-Pfads. */
const PATH_START_PATTERN =
  /^(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?:home|Users|root|etc|opt|var|usr|mnt|tmp|private|Volumes)\/)/;

/** Fortsetzung eines Pfads, wenn er ein Leerzeichen enthält (`Kunc GmbH`). */
const PATH_CONTINUATION_PATTERN = /[\\/]|^\.{1,2}$/;

/** Kennzeichnet ein Pfadstück, das auf einen Credential-Ort zeigt. */
const CREDENTIAL_DIR_PATTERN =
  /(?:^|[\\/])\.(?:codex|claude|cursor|config|ssh|aws|gnupg)(?:[\\/]|$)/i;

/**
 * Ersetzt Pfade durch `<Pfad>` und Dateinamen mit Credentials durch `<Datei>`.
 *
 * Gibt `undefined` für leere/fehlende Eingaben zurück, damit optionale Felder
 * optional bleiben.
 */
export function scrubProviderText(
  input: string | null | undefined,
): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const pieces = trimmed.split(/(\s+)/);
  const out: string[] = [];
  let inPath = false;

  for (const piece of pieces) {
    if (/^\s+$/.test(piece)) {
      out.push(piece);
      continue;
    }

    const isCredentialFile = CREDENTIAL_FILE_PATTERN.test(piece);
    const startsPath =
      PATH_START_PATTERN.test(piece) || CREDENTIAL_DIR_PATTERN.test(piece);
    const continuesPath =
      inPath && (PATH_CONTINUATION_PATTERN.test(piece) || isCredentialFile);

    if (startsPath || continuesPath) {
      if (!inPath) out.push("<Pfad>");
      // Innerhalb eines Pfads: weitere Stücke verschwinden (nur das erste wird
      // zu `<Pfad>`, damit der Satz lesbar bleibt).
      inPath = true;
      continue;
    }

    inPath = false;

    if (isCredentialFile) {
      out.push("<Datei>");
      continue;
    }

    out.push(piece);
  }

  return out
    .join("")
    .replace(/<Pfad>(?:\s*<Datei>)+/g, "<Pfad>")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Redigiert eine Liste von Modell-Kennungen.
 *
 * Modelle sind normalerweise harmlos (`gpt-5-codex`); sollte ein Treiber dort
 * einen Pfad melden, wird er trotzdem geschwärzt.
 */
export function scrubModelIds(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of models) {
    const cleaned = scrubProviderText(model);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

/** Kurzer Nachweis für Tests/Doku: enthält der Text noch einen Pfad? */
export function containsPathLikeText(value: string): boolean {
  return (
    PATH_START_PATTERN.test(value) ||
    /[A-Za-z]:\\/.test(value) ||
    CREDENTIAL_FILE_PATTERN.test(value) ||
    CREDENTIAL_DIR_PATTERN.test(value)
  );
}
