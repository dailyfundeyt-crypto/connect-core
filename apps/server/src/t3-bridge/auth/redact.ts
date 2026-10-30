/**
 * T3-Bridge-Auth â€” Log-Filter & Secret-SchwÃ¤rzung (Lane A10).
 *
 * Aufgabe 3: Log-Filter: Tokens/Keys schwÃ¤rzen.
 *
 * Strikte Regel:
 * Kein T3-Token, Pairing-Token, Bearer-Token, Cookie oder SchlÃ¼ssel darf
 * je im Klartext in Logs, Fehlermeldungen oder Antworten auftauchen.
 */

/** Liste sensitiver Eigenschaftsnamen (case-insensitive & snake/camel-tolerant). */
const SENSITIVE_KEY_NAMES = new Set([
  "token",
  "tokens",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "subject_token",
  "subjecttoken",
  "pairing_token",
  "pairingtoken",
  "credential",
  "credentials",
  "ticket",
  "websocket_ticket",
  "websocketticket",
  "secret",
  "secrets",
  "client_secret",
  "clientsecret",
  "password",
  "authorization",
  "api_key",
  "apikey",
  "key",
  "key_encryption_key",
  "keyencryptionkey",
  "encryption_key",
  "encryptionkey",
  "encrypted_value",
  "encryptedvalue",
  "dpop",
  "cookie",
]);

/**
 * Regex-Muster fÃ¼r Strings, Logs und Konsolenausgaben.
 */
const TEXT_REDACTION_PATTERNS: Array<[RegExp, string]> = [
  // Bearer-Tokens (HTTP Authorization Header)
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]"],

  // URL-Fragmente (T3-Pairing: /pair#token=XYZ oder #token=XYZ)
  [/(#token=)[A-Za-z0-9\-._~+/]+=*/gi, "$1[REDACTED]"],

  // Query-Parameter (?token=XYZ, &credential=XYZ, ?ticket=XYZ, &access_token=XYZ)
  [
    /([?&](?:token|credential|ticket|access_token|subject_token|secret)=)[^&\s]+/gi,
    "$1[REDACTED]",
  ],

  // T3 CLI Output: "Token: <token>"
  [/(Token:\s*)[A-Za-z0-9\-._~+/]+=*/gi, "$1[REDACTED]"],

  // T3 CLI Output: "Pairing URL: <url>" mit Token
  [
    /(Pairing URL:\s*https?:\/\/[^\s#]+#token=)[^\s]+/gi,
    "$1[REDACTED]",
  ],

  // T3 Session Cookies (t3_session_... oder t3_dev_session_...)
  [/(t3(?:_dev)?_session_[a-zA-Z0-9_-]+=)[^;\s]+/gi, "$1[REDACTED]"],

  // Better-Auth Cookies
  [/(better-auth\.session_token=)[^;\s]+/gi, "$1[REDACTED]"],

  // JSON-SchlÃ¼ssel mit String-Werten in serialisierten Texten
  [
    /(['"]?(?:access_token|refresh_token|id_token|subject_token|pairing_token|token|ticket|credential|client_secret|secret|password|apiKey|api_key|keyEncryptionKey|encryptionKey)['"]?\s*[:=]\s*['"])([^'"\\]+)(['"])/gi,
    "$1[REDACTED]$3",
  ],

  // Bekannte API-Keys (OpenAI, Anthropic, xAI, Groq)
  [/sk-[a-zA-Z0-9_-]{16,}/g, "sk-[REDACTED]"],
  [/xai-[a-zA-Z0-9_-]{16,}/g, "xai-[REDACTED]"],
  [/ant-[a-zA-Z0-9_-]{16,}/g, "ant-[REDACTED]"],
  [/gsk_[a-zA-Z0-9_-]{16,}/g, "gsk_[REDACTED]"],

  // KEY_ENCRYPTION_KEY Umgebungsvariable
  [/KEY_ENCRYPTION_KEY=[^\s]+/gi, "KEY_ENCRYPTION_KEY=[REDACTED]"],
];

/**
 * PrÃ¼ft, ob ein SchlÃ¼sselname als sensitiv eingestuft wird.
 */
export function isSensitiveKeyName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return SENSITIVE_KEY_NAMES.has(key.toLowerCase()) || SENSITIVE_KEY_NAMES.has(normalized);
}

/**
 * Filtert sensible Daten aus einer beliebigen Textzeichenkette.
 */
export function redactSensitiveText(input: string): string {
  if (!input || typeof input !== "string") return input;

  let result = input;
  for (const [pattern, replacement] of TEXT_REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * SchwÃ¤rzt sensible Felder in beliebigen Objekten, Arrays oder Primitiven rekursiv.
 */
export function redactSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    return redactSensitiveText(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (input instanceof Error) {
    const cleanError = new Error(redactSensitiveText(input.message));
    cleanError.name = input.name;
    if (input.stack) {
      cleanError.stack = redactSensitiveText(input.stack);
    }
    return cleanError as unknown as T;
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKeyName(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitiveData(value);
      }
    }
    return result as T;
  }

  return input;
}

/**
 * Sicherer Logger-Wrapper, der jede Ausgabe vorab durch den Redactor filtert.
 */
export class RedactedLogger {
  readonly #name: string;
  readonly #sink: (line: string) => void;

  constructor(name: string, sink?: (line: string) => void) {
    this.#name = name;
    this.#sink = sink ?? ((line) => console.log(line));
  }

  #format(level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    let text = message;
    if (data !== undefined) {
      if (typeof data === "string") {
        text += ` | ${data}`;
      } else {
        try {
          text += ` | ${JSON.stringify(redactSensitiveData(data))}`;
        } catch {
          text += ` | [unserializable data]`;
        }
      }
    }
    const clean = redactSensitiveText(text);
    return `[${timestamp}] [${level}] [${this.#name}] ${clean}`;
  }

  info(message: string, data?: unknown): void {
    this.#sink(this.#format("INFO", message, data));
  }

  warn(message: string, data?: unknown): void {
    this.#sink(this.#format("WARN", message, data));
  }

  error(message: string, error?: unknown): void {
    let extra = "";
    if (error instanceof Error) {
      extra = `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
    } else if (error !== undefined) {
      extra = String(error);
    }
    this.#sink(this.#format("ERROR", message, extra ? redactSensitiveText(extra) : undefined));
  }

  debug(message: string, data?: unknown): void {
    this.#sink(this.#format("DEBUG", message, data));
  }
}
