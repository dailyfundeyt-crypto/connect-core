import type { Context, MiddlewareHandler, Next } from "hono";

/**
 * Defensive Rate Limiting Middleware für Hono.
 * Schützt vor Denial-of-Service, Brute-Force auf Auth-Endpunkten und Quota-Erschöpfung.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Regelmäßige Bereinigung abgelaufener Einträge
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60_000);

if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

export interface RateLimitOptions {
  /**
   * Zeitfenster in Millisekunden (Standard: 60.000 ms = 1 Minute).
   */
  windowMs?: number;
  /**
   * Maximale Anzahl an Anfragen innerhalb des Zeitfensters (Standard: 120).
   */
  max?: number;
  /**
   * Fehlermeldung bei Überschreitung des Limits.
   */
  message?: string;
  /**
   * Eigene Funktion zur Bestimmung des Ratelimit-Schlüssels (Standard: IP oder x-forwarded-for).
   */
  keyGenerator?: (c: Context) => string;
  /**
   * Bestimmt, ob ein Request vom Rate-Limiting ausgenommen werden soll.
   */
  skip?: (c: Context) => boolean;
}

/**
 * Standard Key-Generator: Liest Client-IP aus Standard-Headern oder Fallback auf 127.0.0.1.
 */
export function defaultKeyGenerator(c: Context): string {
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}

/**
 * Erstellt eine Hono-Middleware für Rate Limiting.
 */
export function createRateLimiter(options: RateLimitOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 120;
  const message = options.message ?? "Too many requests. Please slow down.";
  const keyGen = options.keyGenerator ?? defaultKeyGenerator;
  const skip = options.skip ?? (() => false);

  return async function rateLimiterMiddleware(c: Context, next: Next) {
    if (skip(c)) {
      return next();
    }

    const clientKey = keyGen(c);
    const routePrefix = c.req.path.split("/")[2] || "root";
    const bucketKey = `${clientKey}:${routePrefix}`;

    const now = Date.now();
    let entry = memoryStore.get(bucketKey);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      memoryStore.set(bucketKey, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", resetSeconds.toString());

    if (entry.count > max) {
      c.header("Retry-After", resetSeconds.toString());
      return c.json(
        {
          error: message,
          status: 429,
          retryAfter: resetSeconds,
        },
        429,
      );
    }

    return next();
  };
}

/**
 * Bereinigt den In-Memory-Speicher (für Unit-Tests).
 */
export function resetRateLimits(): void {
  memoryStore.clear();
}
