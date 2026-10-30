/**
 * Live-Auth-Experimente gegen den T3-Sidecar (Diagnose, kein Produktivcode).
 *
 * Lane: A03 (Welle W1).
 *
 * Testet die Auth-Kette des T3-Servers:
 *   1. `/api/auth/session` (Deskriptor)
 *   2. `/api/auth/browser-session` mit Pairing-Token
 *   3. `/oauth/token` (Token-Exchange)
 *
 * Alle Tokens kommen aus der Umgebung (`T3_BOOTSTRAP_TOKEN`), nie aus dem Code.
 */

const origin = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";
const bootstrap = process.env.T3_BOOTSTRAP_TOKEN ?? "";

async function show(label: string, response: Response): Promise<void> {
  const text = await response.text();
  const redacted = text
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"[REDACTED]"')
    .replace(/"ticket"\s*:\s*"[^"]+"/g, '"ticket":"[REDACTED]"')
    .replace(/t3_session_[A-Za-z0-9_]+/g, "t3_session_[REDACTED]");
  console.log(`--- ${label}: HTTP ${response.status}`);
  console.log(redacted.slice(0, 600));
}

console.log(`Origin: ${origin}`);

await show("session", await fetch(`${origin}/api/auth/session`));

if (bootstrap) {
  await show(
    "browser-session",
    await fetch(`${origin}/api/auth/browser-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: bootstrap }),
    }),
  );

  await show(
    "oauth/token",
    await fetch(`${origin}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: bootstrap,
        subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      }).toString(),
    }),
  );
} else {
  console.log("Kein T3_BOOTSTRAP_TOKEN gesetzt.");
}

export {};
