/**
 * Lovable bridge for Level 3 — personal / Phase-1 builder.
 *
 * Prefer official Lovable MCP (https://mcp.lovable.dev): create_project →
 * preview_url → send_message → deploy_project. OAuth only; works in Cursor.
 *
 * Zapier → Slack is a weaker fallback: Lovable’s Slack connector is outbound
 * (app → Slack), not a reliable “DM Lovable to build” inbound API.
 *
 * Shared GitHub: bind a repo URL once Lovable syncs there; later we can
 * self-host the export. Until then the preview iframe loads Lovable’s URL.
 */

const KEY = "connect.lovable.bindings";
const EVENT = "connect-lovable-changed";

export type LovableBinding = {
  companyId: string;
  /** Lovable project id from MCP / dashboard */
  projectId?: string;
  /** Live preview (sandbox) from get_project / create_project */
  previewUrl?: string;
  /** Editor deep-link */
  editorUrl?: string;
  /** Optional published lovable.app URL */
  liveUrl?: string;
  /** Optional GitHub repo Lovable pushes to */
  githubUrl?: string;
  /**
   * Optional Zapier Catch Hook — POSTs { companyId, text } when you chat.
   * Use only if you cannot call Lovable MCP from Connect yet.
   */
  zapierWebhookUrl?: string;
  updatedAt: string;
};

function readAll(): Record<string, LovableBinding> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, LovableBinding>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, LovableBinding>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

export function getLovableBinding(companyId: string): LovableBinding | null {
  return readAll()[companyId] ?? null;
}

export function setLovableBinding(
  companyId: string,
  patch: Partial<Omit<LovableBinding, "companyId" | "updatedAt">>,
): LovableBinding {
  const all = readAll();
  const prev = all[companyId] ?? { companyId, updatedAt: "" };
  const next: LovableBinding = {
    ...prev,
    ...patch,
    companyId,
    updatedAt: new Date().toISOString(),
  };
  all[companyId] = next;
  writeAll(all);
  return next;
}

export function subscribeLovable(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Fire Zapier Catch Hook (optional Phase-1 automation). */
export async function forwardPromptToZapier(
  companyId: string,
  text: string,
): Promise<{ ok: boolean; detail: string }> {
  const binding = getLovableBinding(companyId);
  const url = binding?.zapierWebhookUrl?.trim();
  if (!url) {
    return {
      ok: false,
      detail:
        "Kein Zapier-Webhook. Besser: Lovable MCP in Cursor (mcp.lovable.dev) — oder Webhook in Level 3 eintragen.",
    };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "connect-level3",
        companyId,
        projectId: binding?.projectId,
        text,
        at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      return { ok: false, detail: `Zapier HTTP ${res.status}` };
    }
    return {
      ok: true,
      detail: "An Zapier gesendet — Zap kann Slack → Lovable weiterreichen.",
    };
  } catch (caught) {
    return {
      ok: false,
      detail:
        caught instanceof Error ? caught.message : "Zapier-Aufruf fehlgeschlagen.",
    };
  }
}

export const LOVABLE_MCP_URL = "https://mcp.lovable.dev";

export const LOVABLE_SETUP_NOTES = {
  preferred:
    "Connect Level 3 chat → Lovable MCP tools (create_project / send_message / get_project.preview_url). Embed preview_url in the iframe.",
  fallbackZapier:
    "Connect chat → Zapier Catch Hook → Slack channel message. Only works if you manually have a human/Lovable workflow reading that channel — Lovable Slack connector does not natively consume Slack as a build trigger.",
  github:
    "Bind the same GitHub repo Lovable syncs to; later clone into Connect’s private site workspace or a self-hosted runner.",
  later:
    "When ready, export from GitHub into OpenHands/Aider against connect.site.{companyId} — drop Lovable dependency.",
} as const;
