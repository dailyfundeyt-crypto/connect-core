/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Secret-Filter
 *
 * Akzeptanzkriterium: Keine Secrets in der Zusammenfassung (Filter).
 *
 * Entfernt zuverlässig API-Keys, Bearer-Tokens, Passwörter, Datenbank-Credentials,
 * Private Keys und sensible Umgebungsvariablen sowohl aus den Eingabe-Transkripten
 * als auch aus der generierten Zusammenfassung.
 */

export interface FilterResult {
  readonly text: string;
  readonly redactedCount: number;
}

/**
 * Regex-Ersetzungsregeln für sensible Daten.
 */
const SECRET_REPLACEMENTS: Array<{
  readonly pattern: RegExp;
  readonly replacement: string | ((substring: string, ...args: any[]) => string);
  readonly name: string;
}> = [
  // 1. Private Keys (RSA, EC, OpenSSH, DSA)
  {
    name: "private-key",
    pattern: /-----BEGIN (?:[A-Z0-9_\- ]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_\- ]+)?PRIVATE KEY-----/gi,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },

  // 2. Datenbank-Verbindungszeichenfolgen mit Passwort (postgres, mysql, mongodb etc.)
  {
    name: "db-uri",
    pattern: /((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s:@/]+:)[^@\s/]+(@[^\s"']+)/gi,
    replacement: "$1[REDACTED_PASSWORD]$2",
  },

  // 3. Anthropic API-Keys (vor allgemeinem sk- prüfen)
  {
    name: "anthropic-key",
    pattern: /sk-ant-[a-zA-Z0-9_\-]{16,}/g,
    replacement: "sk-ant-[REDACTED_API_KEY]",
  },

  // 4. OpenAI API-Keys
  {
    name: "openai-key",
    pattern: /sk-(?:proj-|svcacct-)?[a-zA-Z0-9_\-]{16,}/g,
    replacement: "sk-[REDACTED_API_KEY]",
  },

  // 5. Google / Gemini API-Keys
  {
    name: "gemini-key",
    pattern: /AIza[0-9A-Za-z_\-]{20,}/g,
    replacement: "AIza[REDACTED_API_KEY]",
  },

  // 6. GitHub Personal Access Tokens
  {
    name: "github-token",
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,}/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },

  // 7. AWS Access Key IDs
  {
    name: "aws-key",
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    replacement: "[REDACTED_AWS_KEY]",
  },

  // 8. Slack Tokens
  {
    name: "slack-token",
    pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g,
    replacement: "[REDACTED_SLACK_TOKEN]",
  },

  // 9. Bearer-Tokens (HTTP Authorization Header)
  {
    name: "bearer-token",
    pattern: /(Bearer\s+)[A-Za-z0-9\-._~+/]{16,}=*/gi,
    replacement: "$1[REDACTED_BEARER_TOKEN]",
  },

  // 10. JWT-Tokens
  {
    name: "jwt-token",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-.+/=]{10,}/g,
    replacement: "[REDACTED_JWT_TOKEN]",
  },

  // 11. KEY_ENCRYPTION_KEY & Connect-Geheimnisse
  {
    name: "key-encryption-key",
    pattern: /(KEY_ENCRYPTION_KEY\s*=\s*)[^\s]+/gi,
    replacement: "$1[REDACTED_KEY_ENCRYPTION_KEY]",
  },
  {
    name: "better-auth-secret",
    pattern: /(BETTER_AUTH_SECRET\s*=\s*)[^\s]+/gi,
    replacement: "$1[REDACTED_AUTH_SECRET]",
  },

  // 12. URL-Fragmente (T3-Pairing: /pair#token=XYZ oder #token=XYZ)
  {
    name: "url-token-fragment",
    pattern: /(#token=)[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: "$1[REDACTED_TOKEN]",
  },

  // 13. Query-Parameter (?token=XYZ, &credential=XYZ, ?ticket=XYZ, &access_token=XYZ)
  {
    name: "url-token-query",
    pattern: /([?&](?:token|credential|ticket|access_token|subject_token|secret)=)[^&\s]+/gi,
    replacement: "$1[REDACTED_TOKEN]",
  },

  // 14. JSON-Schlüssel mit sensitiven Feldern
  {
    name: "json-sensitive-field",
    pattern: /(["']?(?:access_token|refresh_token|id_token|pairing_token|token|ticket|client_secret|secret|password|apiKey|api_key|keyEncryptionKey|encryptionKey)["']?\s*[:=]\s*["'])([^"'\\\s]{6,})(["'])/gi,
    replacement: "$1[REDACTED_SECRET]$3",
  },
];

/**
 * Filtert sämtliche Geheimnisse und Tokens aus einem Text heraus.
 */
export function filterSecrets(text: string): FilterResult {
  if (!text || typeof text !== "string") {
    return { text: "", redactedCount: 0 };
  }

  let cleaned = text;
  let totalRedacted = 0;

  for (const { pattern, replacement } of SECRET_REPLACEMENTS) {
    const matches = cleaned.match(pattern);
    if (matches && matches.length > 0) {
      totalRedacted += matches.length;
      cleaned = cleaned.replace(pattern, replacement as any);
    }
  }

  return {
    text: cleaned,
    redactedCount: totalRedacted,
  };
}

/**
 * Prüft, ob ein Text ein erkanntes Geheimnis enthält.
 */
export function containsSecrets(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return SECRET_REPLACEMENTS.some(({ pattern }) => pattern.test(text));
}

/**
 * Rekursiver Sanitizer für strukturierte Objekte vor dem Logging oder Senden.
 */
export function sanitizeData<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return filterSecrets(value).text as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeData(item)) as unknown as T;
  }

  if (typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      copy[k] = sanitizeData(v);
    }
    return copy as T;
  }

  return value;
}
