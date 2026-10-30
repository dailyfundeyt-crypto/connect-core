/**
 * T3-Bridge — Rate-Limiter für öffentliche Company-Usage & Leaderboard Routen (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Schützt öffentliche Endpunkte (`/public-usage`, `/leaderboard/tokens`)
 * vor DoS und Scraping-Missbrauch.
 */

import type { Context, MiddlewareHandler } from "hono";

export type RateLimiterOptions = {
  /** Maximale Anzahl an Anfragen im Zeitfenster. Standard: 120. */
  maxRequests?: number;
  /** Zeitfenster in Millisekunden. Standard: 60_000 (1 Minute). */
  windowMs?: number;
  /** Ob das Rate-Limiting aktiv ist. Standard: true. */
  enabled?: boolean;
};

type ClientRecord = {
  count: number;
  resetAt: number;
};

/**
 * In-Memory-Rate-Limiter mit IP-Tracking.
 */
export class MemoryRateLimiter {
  readonly #clients = new Map<string, ClientRecord>();
  readonly #maxRequests: number;
  readonly #windowMs: number;
  readonly #enabled: boolean;

  constructor(options: RateLimiterOptions = {}) {
    this.#maxRequests = options.maxRequests ?? 120;
    this.#windowMs = options.windowMs ?? 60_000;
    this.#enabled = options.enabled ?? true;
  }

  /**
   * Ermittelt die IP-Adresse des Aufrufers aus Request-Headern.
   */
  getClientIp(c: Context): string {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",");
      const first = parts[0]?.trim();
      if (first) return first;
    }

    const cfIp = c.req.header("cf-connecting-ip");
    if (cfIp) return cfIp.trim();

    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp.trim();

    return "127.0.0.1";
  }

  /**
   * Prüft, ob die IP das Limit überschritten hat.
   */
  check(ip: string, now: number = Date.now()): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfterSeconds: number;
  } {
    if (!this.#enabled) {
      return {
        allowed: true,
        remaining: this.#maxRequests,
        resetAt: now + this.#windowMs,
        retryAfterSeconds: 0,
      };
    }

    // Veraltete Einträge aufräumen
    const record = this.#clients.get(ip);
    if (!record || now >= record.resetAt) {
      const newRecord: ClientRecord = {
        count: 1,
        resetAt: now + this.#windowMs,
      };
      this.#clients.set(ip, newRecord);
      return {
        allowed: true,
        remaining: this.#maxRequests - 1,
        resetAt: newRecord.resetAt,
        retryAfterSeconds: 0,
      };
    }

    record.count += 1;
    const remaining = Math.max(0, this.#maxRequests - record.count);
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);

    if (record.count > this.#maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
        retryAfterSeconds: Math.max(1, retryAfterSeconds),
      };
    }

    return {
      allowed: true,
      remaining,
      resetAt: record.resetAt,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Setzt den Speicher zurück (für Tests).
   */
  reset(): void {
    this.#clients.clear();
  }

  /**
   * Erstellt eine Hono-Middleware.
   */
  middleware(): MiddlewareHandler {
    return async (c, next) => {
      if (!this.#enabled) {
        return next();
      }

      const ip = this.getClientIp(c);
      const result = this.check(ip);

      c.header("X-RateLimit-Limit", String(this.#maxRequests));
      c.header("X-RateLimit-Remaining", String(result.remaining));
      c.header("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));

      if (!result.allowed) {
        c.header("Retry-After", String(result.retryAfterSeconds));
        return c.json(
          {
            error: "Rate limit exceeded. Please try again later.",
            retryAfterSeconds: result.retryAfterSeconds,
          },
          429,
        );
      }

      return next();
    };
  }
}
