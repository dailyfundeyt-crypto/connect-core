import type { Context, Next } from "hono";

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string;
  frameOptions?: "DENY" | "SAMEORIGIN";
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

export function createSecurityHeaders(options: SecurityHeadersOptions = {}) {
  const frameOptions = options.frameOptions ?? "SAMEORIGIN";
  const referrerPolicy =
    options.referrerPolicy ?? "strict-origin-when-cross-origin";
  const permissionsPolicy =
    options.permissionsPolicy ?? "camera=(), microphone=(), geolocation=()";

  return async function securityHeadersMiddleware(c: Context, next: Next) {
    await next();

    // Standard defense-in-depth headers
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", frameOptions);
    c.header("X-XSS-Protection", "1; mode=block");
    c.header("Referrer-Policy", referrerPolicy);
    c.header("Permissions-Policy", permissionsPolicy);

    if (options.contentSecurityPolicy) {
      c.header("Content-Security-Policy", options.contentSecurityPolicy);
    }
  };
}
