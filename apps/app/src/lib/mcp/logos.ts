/**
 * Brand logos for MCP servers — Simple Icons on GitHub
 * (https://github.com/simple-icons/simple-icons) via cdn.simpleicons.org.
 */

const SLUGS: Record<string, string> = {
  filesystem: "files",
  github: "github",
  postgres: "postgresql",
  "brave-search": "brave",
  memory: "databricks",
  puppeteer: "googlechrome",
  slack: "slack",
  gmail: "gmail",
  "google-calendar": "googlecalendar",
  "google-drive": "googledrive",
  notion: "notion",
  linear: "linear",
  clickup: "clickup",
  granola: "notion",
  readwise: "readthedocs",
  agentmail: "maildotru",
  vercel: "vercel",
  render: "render",
  supabase: "supabase",
  "cloudflare-docs": "cloudflare",
  "cloudflare-bindings": "cloudflare",
  "cloudflare-builds": "cloudflare",
  "cloudflare-observability": "cloudflare",
  clerk: "clerk",
  sentry: "sentry",
  figma: "figma",
  miro: "miro",
  runway: "runway",
  typeform: "typeform",
  stripe: "stripe",
  "phantom-mcp": "phantom",
  "phantom-connect-sdk": "phantom",
  aave: "aave",
  circle: "circle",
  whop: "shopify",
  kraken: "kraken",
  zapier: "zapier",
  apify: "apify",
  x: "x",
  upwork: "upwork",
  usertesting: "usertesting",
  cursor: "cursor",
};

/** Colored SVG from Simple Icons CDN; falls back to a letter tile URL-less null. */
export function mcpLogoUrl(serverId: string): string | null {
  const slug = SLUGS[serverId];
  if (!slug) return null;
  return `https://cdn.simpleicons.org/${slug}`;
}

export function mcpLogoInitial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
