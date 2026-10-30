import type { Context, Next } from "hono";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 300_000);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

export interface RateLimitOptions {
  windowMs?: number; // default: 60,000 (1 minute)
  max?: number;      // default: 120 requests per window
  message?: string;
  keyGenerator?: (c: Context) => string;
  skip?: (c: Context) => boolean;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 120;
  const message = options.message ?? "Too many requests. Please slow down.";

  const keyGen = options.keyGenerator ?? ((c: Context) => {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    return c.req.header("x-real-ip") || "127.0.0.1";
  });

  const skipCheck = options.skip ?? ((c: Context) => {
    const path = c.req.path;
    // Always skip health checks and static files
    return (
      path === "/health" ||
      path === "/api/health" ||
      path.startsWith("/assets/") ||
      path.startsWith("/brand/")
    );
  });

  return async function rateLimitMiddleware(c: Context, next: Next) {
    if (skipCheck(c)) {
      return next();
    }

    const key = `${keyGen(c)}:${c.req.path.startsWith("/api/onboarding") ? "onboarding" : "general"}`;
    const now = Date.now();
    let record = memoryStore.get(key);

    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      memoryStore.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", resetSeconds.toString());

    if (record.count > max) {
      c.header("Retry-After", resetSeconds.toString());
      return c.json(
        {
          error: message,
          retryAfter: resetSeconds,
          status: 429,
        },
        429,
      );
    }

    return next();
  };
}

export function resetRateLimits(): void {
  memoryStore.clear();
}
