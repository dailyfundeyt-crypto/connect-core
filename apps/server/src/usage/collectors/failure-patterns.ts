import type {
  CliKind,
  FailureClass,
} from "../../contracts/conductor/types";

/**
 * Result of stdout/stderr error classification.
 */
export interface FailureClassificationResult {
  failureClass: FailureClass;
  matchedPattern?: string;
  matchedText?: string;
  cliKind: CliKind | string;
  resetsAt?: string | null;
  resetsAtEpochSec?: number | null;
  suggestedCooldownMin?: number;
  details?: Record<string, unknown>;
}

export interface FailurePatternRule {
  class: FailureClass;
  pattern: RegExp;
  description: string;
  extractReset?: boolean;
  suggestedCooldownMin?: number;
}

/* ========================================================================== */
/* CLI-Specific Regex Patterns                                                */
/* ========================================================================== */

/**
 * Codex error patterns:
 * - quota: 'usage limit', rate_limit_reached_type, 429, etc.
 * - auth: 401, 'login', unauthorized, token expired
 * - network: ECONNREFUSED, ETIMEDOUT, fetch failed, etc.
 * - task: syntax errors, compilation errors, process exits
 */
export const CODEX_FAILURE_PATTERNS: FailurePatternRule[] = [
  // Quota & Rate Limit
  {
    class: "quota",
    pattern: /rate_limit_reached_type/i,
    description: "Codex rate_limit_reached_type event",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /usage[ _]limit/i,
    description: "Codex usage limit reached",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /rate[ _]limit[ _]exceeded/i,
    description: "Codex rate limit exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /you have reached your (?:current )?usage limit/i,
    description: "Codex usage limit notification",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /429\s+Too Many Requests/i,
    description: "Codex HTTP 429 Too Many Requests",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /status[:\s]+429\b/i,
    description: "Codex HTTP 429 status code",
    suggestedCooldownMin: 30,
  },

  // Auth & Permissions
  {
    class: "auth",
    pattern: /401\s+Unauthorized/i,
    description: "Codex 401 Unauthorized",
  },
  {
    class: "auth",
    pattern: /status[:\s]+401\b/i,
    description: "Codex HTTP 401 status code",
  },
  {
    class: "auth",
    pattern: /(?:please\s+)?(?:log\s*in|login|sign\s*in)\s+(?:to\s+continue|required|again)/i,
    description: "Codex login required",
  },
  {
    class: "auth",
    pattern: /invalid[ _]api[ _]key|invalid[ _]token|token[ _]expired/i,
    description: "Codex invalid or expired API token",
  },
  {
    class: "auth",
    pattern: /authentication\s+(?:failed|error|required)/i,
    description: "Codex authentication failure",
  },

  // Network & Infrastructure
  {
    class: "network",
    pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/i,
    description: "Codex socket connection failure",
  },
  {
    class: "network",
    pattern: /fetch\s+failed|socket\s+hang\s+up|network\s+timeout/i,
    description: "Codex network request failure",
  },
  {
    class: "network",
    pattern: /failed\s+to\s+connect\s+to\s+api\.openai\.com/i,
    description: "Codex upstream connection failure",
  },

  // Task & User Code Errors
  {
    class: "task",
    pattern: /SyntaxError:|TypeError:|ReferenceError:|AssertionError:/i,
    description: "Codex runtime code execution error",
  },
  {
    class: "task",
    pattern: /command\s+failed\s+with\s+exit\s+code/i,
    description: "Codex task sub-command failure",
  },
  {
    class: "task",
    pattern: /tests?\s+failed|build\s+failed|compilation\s+failed/i,
    description: "Codex test or build task error",
  },
];

/**
 * Claude error patterns:
 * - quota: 'usage limit reached… resets', rate_limit_error, 429
 * - auth: authentication_error, 401, 'claude login', not logged in
 * - network: connection error, api.anthropic.com timeout
 * - task: user command or tool failure
 */
export const CLAUDE_FAILURE_PATTERNS: FailurePatternRule[] = [
  // Quota & Rate Limit
  {
    class: "quota",
    pattern: /usage\s+limit\s+reached[^\n\r]*resets\s+(?:at\s+)?([^\n\r.]+)/i,
    description: "Claude usage limit reached with reset time",
    extractReset: true,
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /usage\s+limit\s+reached/i,
    description: "Claude usage limit reached",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /rate_limit_error|rate_limit_exceeded/i,
    description: "Claude API rate limit error",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /exceeded\s+your\s+current\s+quota/i,
    description: "Claude quota exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /overloaded_error/i,
    description: "Claude Anthropic server overloaded",
    suggestedCooldownMin: 15,
  },
  {
    class: "quota",
    pattern: /429\s+Too Many Requests|status[:\s]+429\b/i,
    description: "Claude HTTP 429 Too Many Requests",
    suggestedCooldownMin: 30,
  },

  // Auth & Permissions
  {
    class: "auth",
    pattern: /authentication_error|invalid_api_key/i,
    description: "Claude authentication error",
  },
  {
    class: "auth",
    pattern: /401\s+Unauthorized|status[:\s]+401\b/i,
    description: "Claude 401 Unauthorized",
  },
  {
    class: "auth",
    pattern: /please\s+run\s+`?claude\s+login`?|not\s+logged\s+in/i,
    description: "Claude CLI login required",
  },
  {
    class: "auth",
    pattern: /oauth\s+token\s+expired|session\s+expired/i,
    description: "Claude session expired",
  },

  // Network
  {
    class: "network",
    pattern: /failed\s+to\s+reach\s+api\.anthropic\.com|connection\s+error/i,
    description: "Claude Anthropic connection failure",
  },
  {
    class: "network",
    pattern: /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i,
    description: "Claude network socket error",
  },

  // Task
  {
    class: "task",
    pattern: /tool\s+use\s+failed|command\s+timed\s+out/i,
    description: "Claude tool execution failure",
  },
  {
    class: "task",
    pattern: /SyntaxError:|TypeError:|ReferenceError:/i,
    description: "Claude script syntax or type error",
  },
];

/**
 * Gemini & Gemini-CLI error patterns:
 * - quota: 429, RESOURCE_EXHAUSTED, Quota exceeded for quota metric
 * - auth: 401, UNAUTHENTICATED, API key not valid, login
 * - network: UNAVAILABLE, 503, deadline exceeded
 * - task: task execution errors
 */
export const GEMINI_FAILURE_PATTERNS: FailurePatternRule[] = [
  // Quota & Rate Limit
  {
    class: "quota",
    pattern: /429\s+RESOURCE_EXHAUSTED|RESOURCE_EXHAUSTED/i,
    description: "Gemini 429 RESOURCE_EXHAUSTED",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /Quota\s+exceeded\s+for\s+quota\s+metric/i,
    description: "Gemini quota metric exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /rate\s+limit\s+exceeded|per-minute\s+quota|per-day\s+quota/i,
    description: "Gemini rate limit exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /resource\s+has\s+been\s+exhausted/i,
    description: "Gemini resource exhaustion",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /status[:\s]+429\b/i,
    description: "Gemini HTTP 429 status code",
    suggestedCooldownMin: 30,
  },

  // Auth & Permissions
  {
    class: "auth",
    pattern: /401\s+UNAUTHENTICATED|UNAUTHENTICATED/i,
    description: "Gemini 401 UNAUTHENTICATED",
  },
  {
    class: "auth",
    pattern: /API\s+key\s+not\s+valid|API_KEY_INVALID/i,
    description: "Gemini invalid API key",
  },
  {
    class: "auth",
    pattern: /401\s+Unauthorized|status[:\s]+401\b/i,
    description: "Gemini HTTP 401 status",
  },
  {
    class: "auth",
    pattern: /please\s+(?:log\s*in|login|sign\s*in)\s+(?:with\s+google|to\s+gemini)/i,
    description: "Gemini Google login required",
  },
  {
    class: "auth",
    pattern: /oauth2:\s+cannot\s+fetch\s+token|token\s+expired/i,
    description: "Gemini OAuth token refresh failed",
  },

  // Network & Service Availability
  {
    class: "network",
    pattern: /503\s+UNAVAILABLE|UNAVAILABLE|deadline\s+exceeded/i,
    description: "Gemini 503 UNAVAILABLE service error",
  },
  {
    class: "network",
    pattern: /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|socket\s+hang\s+up/i,
    description: "Gemini network socket failure",
  },

  // Task
  {
    class: "task",
    pattern: /invalid\s+argument|INVALID_ARGUMENT/i,
    description: "Gemini invalid argument in request payload",
  },
  {
    class: "task",
    pattern: /prompt\s+blocked\s+by\s+safety\s+filters|SAFETY_BLOCK/i,
    description: "Gemini content filter task rejection",
  },
];

/**
 * Antigravity error patterns:
 * - quota: 429, RESOURCE_EXHAUSTED, quota exceeded, daily limit
 * - auth: 401, unauthenticated, login required, session expired
 * - network: offline, connection lost, timeout
 * - task: task execution errors
 */
export const ANTIGRAVITY_FAILURE_PATTERNS: FailurePatternRule[] = [
  // Quota
  {
    class: "quota",
    pattern: /429\s+RESOURCE_EXHAUSTED|RESOURCE_EXHAUSTED/i,
    description: "Antigravity 429 RESOURCE_EXHAUSTED",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /quota\s+(?:limit\s+)?exceeded|rate\s+limit\s+reached/i,
    description: "Antigravity quota limit exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "quota",
    pattern: /daily\s+(?:quota|request)\s+limit\s+reached/i,
    description: "Antigravity daily limit reached",
    suggestedCooldownMin: 60,
  },
  {
    class: "quota",
    pattern: /status[:\s]+429\b/i,
    description: "Antigravity HTTP 429 status code",
    suggestedCooldownMin: 30,
  },

  // Auth
  {
    class: "auth",
    pattern: /401\s+unauthorized|unauthenticated/i,
    description: "Antigravity 401 unauthenticated",
  },
  {
    class: "auth",
    pattern: /status[:\s]+401\b/i,
    description: "Antigravity HTTP 401 status",
  },
  {
    class: "auth",
    pattern: /login\s+required|please\s+(?:log\s*in|sign\s*in)|session\s+expired/i,
    description: "Antigravity login required",
  },
  {
    class: "auth",
    pattern: /agy_account\s+authentication\s+failed/i,
    description: "Antigravity AGY_ACCOUNT auth error",
  },

  // Network
  {
    class: "network",
    pattern: /network\s+(?:unreachable|disconnected|timeout)/i,
    description: "Antigravity network unreachable",
  },
  {
    class: "network",
    pattern: /daemon\s+connection\s+refused|offline/i,
    description: "Antigravity daemon or service connection failure",
  },

  // Task
  {
    class: "task",
    pattern: /syntax\s+error|unhandled\s+exception/i,
    description: "Antigravity script execution error",
  },
];

/**
 * Hermes error patterns
 */
export const HERMES_FAILURE_PATTERNS: FailurePatternRule[] = [
  {
    class: "quota",
    pattern: /429\s+Too Many Requests|rate_limit_exceeded|insufficient_quota/i,
    description: "Hermes provider quota exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "auth",
    pattern: /401\s+Unauthorized|invalid\s+api\s+key|authentication\s+failed/i,
    description: "Hermes provider authentication error",
  },
  {
    class: "network",
    pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection\s+error/i,
    description: "Hermes network socket failure",
  },
  {
    class: "task",
    pattern: /skill\s+execution\s+failed|command\s+not\s+found/i,
    description: "Hermes task execution failure",
  },
];

/**
 * Freebuff error patterns
 */
export const FREEBUFF_FAILURE_PATTERNS: FailurePatternRule[] = [
  {
    class: "quota",
    pattern: /429\b|quota\s+exceeded|rate\s+limit/i,
    description: "Freebuff rate limit or quota exceeded",
    suggestedCooldownMin: 30,
  },
  {
    class: "auth",
    pattern: /401\b|unauthorized|invalid\s+credentials/i,
    description: "Freebuff unauthorized access",
  },
  {
    class: "network",
    pattern: /connection\s+refused|server\s+unavailable|ECONNREFUSED/i,
    description: "Freebuff backend unavailable",
  },
  {
    class: "task",
    pattern: /server\s+not\s+found\s+in\s+config|invalid\s+parameters/i,
    description: "Freebuff configuration or parameter error",
  },
];

/**
 * Generic fallback patterns for any CLI
 */
export const GENERIC_FAILURE_PATTERNS: FailurePatternRule[] = [
  // Quota
  {
    class: "quota",
    pattern: /\b(?:429\b|too\s+many\s+requests|rate\s+limit|quota\s+exceeded|resource\s+exhausted)/i,
    description: "Generic HTTP 429 or rate limit keyword",
    suggestedCooldownMin: 30,
  },
  // Auth
  {
    class: "auth",
    pattern: /\b(?:401\b|unauthorized|unauthenticated|forbidden|login\s+required|invalid\s+credentials)/i,
    description: "Generic HTTP 401/403 or authentication failure",
  },
  // Network
  {
    class: "network",
    pattern: /\b(?:ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|network\s+error|socket\s+hang\s+up|dns\s+lookup\s+failed)/i,
    description: "Generic network connection failure",
  },
  // Task
  {
    class: "task",
    pattern: /\b(?:SyntaxError|ReferenceError|TypeError|AssertionError|test\s+suite\s+failed|build\s+failed|exit\s+code\s+[1-9]\d*)\b/i,
    description: "Generic syntax, test or exit failure",
  },
];

/* ========================================================================== */
/* Helper Functions                                                           */
/* ========================================================================== */

/**
 * Resolves the pattern rules list for a given CLI kind.
 */
export function getPatternsForCli(cliKind: CliKind | string): FailurePatternRule[] {
  const norm = cliKind.toLowerCase().trim();
  switch (norm) {
    case "codex":
      return [...CODEX_FAILURE_PATTERNS, ...GENERIC_FAILURE_PATTERNS];
    case "claude":
      return [...CLAUDE_FAILURE_PATTERNS, ...GENERIC_FAILURE_PATTERNS];
    case "gemini":
    case "gemini-cli":
      return [...GEMINI_FAILURE_PATTERNS, ...GENERIC_FAILURE_PATTERNS];
    case "antigravity":
      return [...ANTIGRAVITY_FAILURE_PATTERNS, ...GENERIC_FAILURE_PATTERNS];
    case "hermes":
      return [...HERMES_FAILURE_PATTERNS, ...GENERIC_FAILURE_PATTERNS];
    case "freebuff":
      return [...FREEBUFF_FAILURE_PATTERNS, ...GENERIC_FAILURE_PATTERNS];
    default:
      return GENERIC_FAILURE_PATTERNS;
  }
}

/**
 * Attempts to parse reset timestamps or delays from error text.
 * Handles ISO strings ("resets at 2026-10-22T23:30:00Z"),
 * relative durations ("resets in 45m", "resets in 2 hours"),
 * and epoch timestamps ("resets_at: 1793200000").
 */
export function extractResetTime(
  text: string
): { resetsAtIso: string | null; resetsAtEpochSec: number | null; delayMinutes: number | null } | null {
  if (!text) return null;

  // 1. Check for epoch seconds: resets_at[:= ]+(\d{10})
  const epochMatch = text.match(/resets?[ _]at[:= ]+(\d{10})/i);
  if (epochMatch && epochMatch[1]) {
    const sec = parseInt(epochMatch[1], 10);
    const date = new Date(sec * 1000);
    return {
      resetsAtIso: date.toISOString(),
      resetsAtEpochSec: sec,
      delayMinutes: Math.max(1, Math.round((date.getTime() - Date.now()) / 60000)),
    };
  }

  // 2. Check for ISO date/time: resets (?:at )?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)
  const isoMatch = text.match(
    /resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/i
  );
  if (isoMatch && isoMatch[1]) {
    const parsed = Date.parse(isoMatch[1]);
    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);
      return {
        resetsAtIso: date.toISOString(),
        resetsAtEpochSec: Math.floor(parsed / 1000),
        delayMinutes: Math.max(1, Math.round((parsed - Date.now()) / 60000)),
      };
    }
  }

  // 3. Check for relative delay: resets in (\d+)\s*(m|min|minutes?|h|hours?|s|seconds?)
  const relMatch = text.match(/resets?\s+in\s+(\d+)\s*(m|min|minutes?|h|hours?|s|seconds?)/i);
  if (relMatch && relMatch[1] && relMatch[2]) {
    const val = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    let delayMinutes = val;
    if (unit.startsWith("h")) {
      delayMinutes = val * 60;
    } else if (unit.startsWith("s")) {
      delayMinutes = Math.max(1, Math.round(val / 60));
    }
    const futureMs = Date.now() + delayMinutes * 60 * 1000;
    return {
      resetsAtIso: new Date(futureMs).toISOString(),
      resetsAtEpochSec: Math.floor(futureMs / 1000),
      delayMinutes,
    };
  }

  return null;
}

/**
 * Classifies an error output string and exit code into a standardized FailureClass.
 *
 * @param cliKind - The target CLI kind (codex, claude, gemini, antigravity, hermes, freebuff)
 * @param text - The combined stdout/stderr log text or error message
 * @param exitCode - Process exit code, if known
 * @returns Standardized classification result with matched metadata
 */
export function classifyFailure(
  cliKind: CliKind | string,
  text: string,
  exitCode?: number | null
): FailureClassificationResult {
  const normText = text ?? "";
  const patterns = getPatternsForCli(cliKind);

  for (const rule of patterns) {
    const match = rule.pattern.exec(normText);
    if (match) {
      let resetsAt: string | null = null;
      let resetsAtEpochSec: number | null = null;
      let suggestedCooldownMin = rule.suggestedCooldownMin;

      if (rule.extractReset || rule.class === "quota") {
        const resetInfo = extractResetTime(normText);
        if (resetInfo) {
          resetsAt = resetInfo.resetsAtIso;
          resetsAtEpochSec = resetInfo.resetsAtEpochSec;
          if (resetInfo.delayMinutes && resetInfo.delayMinutes > 0) {
            suggestedCooldownMin = resetInfo.delayMinutes;
          }
        }
      }

      return {
        failureClass: rule.class,
        matchedPattern: rule.pattern.toString(),
        matchedText: match[0],
        cliKind: cliKind as CliKind,
        resetsAt,
        resetsAtEpochSec,
        suggestedCooldownMin,
        details: {
          description: rule.description,
          exitCode: exitCode ?? null,
        },
      };
    }
  }

  // If exit code is non-zero but no specific pattern matched:
  if (typeof exitCode === "number" && exitCode !== 0) {
    return {
      failureClass: "unknown",
      cliKind: cliKind as CliKind,
      details: {
        exitCode,
        note: "Non-zero exit code without matching specific failure regex",
      },
    };
  }

  // Default fallback
  return {
    failureClass: "unknown",
    cliKind: cliKind as CliKind,
    details: {
      exitCode: exitCode ?? null,
      note: "No error pattern detected",
    },
  };
}

/**
 * Quick boolean checks for specific classes
 */
export function isQuotaError(cliKind: CliKind | string, text: string): boolean {
  return classifyFailure(cliKind, text).failureClass === "quota";
}

export function isAuthError(cliKind: CliKind | string, text: string): boolean {
  return classifyFailure(cliKind, text).failureClass === "auth";
}

export function isNetworkError(cliKind: CliKind | string, text: string): boolean {
  return classifyFailure(cliKind, text).failureClass === "network";
}
