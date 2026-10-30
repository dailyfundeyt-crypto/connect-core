/**
 * T3-Sidecar-Supervisor — Secret-freies Logging.
 *
 * Lane: A02 (Welle W1).
 * Schreibt Logs nach `%LOCALAPPDATA%\ConnectAgents\logs\t3-sidecar.log`.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getT3LogFilePath } from "./config";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Bearer Tokens
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]"],
  // Bekannte API Key Formate (OpenAI, Anthropic, xAI, Groq, etc.)
  [/sk-[a-zA-Z0-9_-]{16,}/g, "sk-[REDACTED]"],
  [/xai-[a-zA-Z0-9_-]{16,}/g, "xai-[REDACTED]"],
  [/ant-[a-zA-Z0-9_-]{16,}/g, "ant-[REDACTED]"],
  [/gsk_[a-zA-Z0-9_-]{16,}/g, "gsk_[REDACTED]"],
  // JSON / URL / Env secrets
  [
    /(['"]?(?:api[_-]?key|secret|token|password|encryption[_-]?key|credential)['"]?\s*[:=]\s*['"]?)([^'"\s,;&]+)(['"]?)/gi,
    "$1[REDACTED]$3",
  ],
  // KEY_ENCRYPTION_KEY
  [/KEY_ENCRYPTION_KEY=[^\s]+/gi, "KEY_ENCRYPTION_KEY=[REDACTED]"],
];

/**
 * Filtert sensible Daten aus Log-Nachrichten.
 */
export function sanitizeLogMessage(input: string): string {
  let result = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export class SidecarLogger {
  private logPath: string;

  constructor(customLogPath?: string) {
    this.logPath = customLogPath || getT3LogFilePath();
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    try {
      const dir = dirname(this.logPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Ignorieren falls nicht anlegbar
    }
  }

  public write(level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string): void {
    const timestamp = new Date().toISOString();
    const cleanMessage = sanitizeLogMessage(message);
    const line = `[${timestamp}] [${level}] ${cleanMessage}\n`;

    try {
      appendFileSync(this.logPath, line, "utf8");
    } catch (err) {
      // Bei Fehlern auf stderr ausgeben, damit die Information nicht verloren geht
      process.stderr.write(`[SidecarLogger Failed] ${line}`);
    }
  }

  public info(message: string): void {
    this.write("INFO", message);
  }

  public warn(message: string): void {
    this.write("WARN", message);
  }

  public error(message: string, error?: unknown): void {
    let msg = message;
    if (error) {
      if (error instanceof Error) {
        msg += ` | ${error.name}: ${error.message}\n${error.stack ?? ""}`;
      } else {
        msg += ` | ${String(error)}`;
      }
    }
    this.write("ERROR", msg);
  }

  public debug(message: string): void {
    this.write("DEBUG", message);
  }

  public getLogPath(): string {
    return this.logPath;
  }
}
