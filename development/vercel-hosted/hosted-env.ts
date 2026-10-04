// Builds the hosted (Vercel) env from the repo's .env + .env.supabase. Values are never printed.
// Usage: bun hosted-env.ts <repoRoot> <alias-host> <out.json>   (out.json contains secrets: keep it outside the repo, delete after use)
const [root, alias, out] = process.argv.slice(2);
const read = async (p: string) => Object.fromEntries((await Bun.file(p).text()).split(/\r?\n/).filter(l => /^[A-Z_][A-Z0-9_]*=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const local = await read(`${root}/.env`), sb = await read(`${root}/.env.supabase`);
const origin = `https://${alias}`;
const env: Record<string, string | undefined> = {
  NODE_ENV: "production", CONNECT_SERVERLESS: "1", DATABASE_POOL_MAX: "2", TENANT_PACKAGE_DIR: "tenant",
  DATABASE_URL: sb.DATABASE_URL,
  KEY_ENCRYPTION_KEY: sb.KEY_ENCRYPTION_KEY, BETTER_AUTH_SECRET: sb.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: origin, TRUSTED_ORIGINS: origin, CONNECT_APP_URL: origin, CONNECT_PUBLIC_URL: origin,
  INITIAL_ADMIN_EMAILS: local.INITIAL_ADMIN_EMAILS,
  GOOGLE_OAUTH_CLIENT_ID: local.GOOGLE_OAUTH_WEB_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: local.GOOGLE_OAUTH_WEB_CLIENT_SECRET,
  INTELLIGENCE_API_URL: local.INTELLIGENCE_API_URL, INTELLIGENCE_GATEWAY_WS_URL: local.INTELLIGENCE_GATEWAY_WS_URL, INTELLIGENCE_API_KEY: local.INTELLIGENCE_API_KEY,
  OPENAI_API_KEY: local.OPENAI_API_KEY, AGENT_STALL_TIMEOUT_MS: local.AGENT_STALL_TIMEOUT_MS, AGENT_TOOL_TOKEN: sb.AGENT_TOOL_TOKEN,
};
const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
await Bun.write(out, JSON.stringify(env));
console.log("keys=" + Object.keys(env).length, "missing=" + (missing.join(",") || "none"));
