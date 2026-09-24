/**
 * Dispatch a chat turn to an external bot shell (Manus / ZGPT / …)
 * instead of the Hermes / CopilotKit API.
 */

import { enqueueAgentCli } from "@/lib/agents/agent-cli";
import {
  agentUsesExternalShell,
  getAgentShell,
  type AgentShell,
} from "@/lib/agents/agent-shell";
import { getAgentModelFamily } from "@/lib/agents/agent-models";
import { runManusApiTurn } from "@/lib/agents/manus-api";
import {
  ensureZgptProfileForAgent,
  getZgptProfile,
} from "@/lib/agents/zgpt-profiles";
import { listManusAliases } from "@/lib/agents/manus-mail";

const PENDING_KEY = "connect.shell-pending-inject";
const WATCH_EVENT = "connect-open-agent-watch";

export type ShellDispatchResult = {
  ok: boolean;
  summary: string;
  needsDesktop?: boolean;
  openedUrl?: string;
};

type PendingInject = {
  agentId: string;
  text: string;
  at: string;
  delivery: string;
};

function writePending(entry: PendingInject) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, PendingInject>) : {};
    map[entry.agentId] = entry;
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function takePendingShellInject(
  agentId: string,
): PendingInject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, PendingInject>;
    const entry = map[agentId] ?? null;
    if (entry) {
      delete map[agentId];
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(map));
    }
    return entry;
  } catch {
    return null;
  }
}

function requestWatch(agentId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WATCH_EVENT, { detail: { agentId } }),
  );
}

export function subscribeOpenAgentWatch(
  cb: (agentId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ agentId?: string }>).detail;
    if (detail?.agentId) cb(detail.agentId);
  };
  window.addEventListener(WATCH_EVENT, handler);
  return () => window.removeEventListener(WATCH_EVENT, handler);
}

async function openChromeProfile(input: {
  url: string;
  agentId: string;
  zgptFolder?: string;
}): Promise<{ ok: boolean; needsDesktop?: boolean; error?: string }> {
  const { isDesktopApp, navigateDesktopBrowser, notifyDesktopLevel } =
    await import("@/lib/desktop-bridge");
  if (isDesktopApp()) {
    navigateDesktopBrowser(input.url);
    notifyDesktopLevel(3);
    return { ok: true };
  }
  try {
    const res = await fetch("/api/connect/open-chrome", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        agentId: input.zgptFolder
          ? `zgpt-${input.zgptFolder}`
          : input.agentId,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      needsDesktop?: boolean;
      error?: string;
    } | null;
    if (!res.ok || !body?.ok) {
      return {
        ok: false,
        needsDesktop: body?.needsDesktop === true || res.status === 503,
        error: body?.error?.trim() || "Chrome-Profil konnte nicht starten.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      needsDesktop: true,
      error: "Connect Desktop nicht erreichbar.",
    };
  }
}

function manusMailTarget(agentId: string): string {
  const alias = listManusAliases().find((a) => a.agentId === agentId);
  return alias?.email || "manus@manus.im";
}

/**
 * Run one user turn against the external shell. Caller still adds the user
 * message to the transcript; this returns a short assistant summary to append.
 */
export async function dispatchShellTurn(input: {
  agentId: string;
  text: string;
  agentName?: string;
}): Promise<ShellDispatchResult> {
  const { agentId, text } = input;
  if (!agentUsesExternalShell(agentId)) {
    return { ok: false, summary: "Kein Shell-Bot." };
  }

  const family = getAgentModelFamily(agentId);
  const shell = getAgentShell(agentId);
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, summary: "Leere Nachricht — nichts zu senden." };
  }

  writePending({
    agentId,
    text: trimmed,
    at: new Date().toISOString(),
    delivery: shell.delivery,
  });

  // Production Manus: Connect chat → Manus Open API (multi-turn task).
  if (shell.delivery === "manus-api" || family === "manus") {
    const result = await runManusApiTurn({ agentId, text: trimmed });
    return {
      ok: result.ok,
      summary: result.summary,
      openedUrl: result.taskUrl,
    };
  }

  // Legacy mail path (kept for old stored shells; not offered in UI).
  if (shell.delivery === "manus-mail") {
    const to = manusMailTarget(agentId);
    enqueueAgentCli(agentId, {
      target: "manus",
      command: `mail:send --to=${to} --subject=${JSON.stringify(trimmed.slice(0, 80))} --body=${JSON.stringify(trimmed)}`,
    });
    return {
      ok: true,
      summary: `Legacy · Mail an Manus (${to}) queued.`,
    };
  }

  if (shell.delivery === "chatgpt-app") {
    // Model One Terminal — invisible CLI (not Electron ChatGPT window).
    const { runZgptCliTurn } = await import("@/lib/agents/zgpt-cli");
    const result = await runZgptCliTurn({
      agentId,
      text,
      agentName: input.agentName,
    });
    return { ok: result.ok, summary: result.summary };
  }

  if (shell.delivery === "chatgpt-web") {
    const url = shell.embedUrl || "https://chatgpt.com";
    const launched = await openChromeProfile({ url, agentId });
    requestWatch(agentId);
    if (!launched.ok) {
      return {
        ok: false,
        needsDesktop: launched.needsDesktop,
        openedUrl: url,
        summary:
          launched.error ||
          "ChatGPT-Web konnte nicht öffnen — Connect Desktop prüfen.",
      };
    }
    return {
      ok: true,
      openedUrl: url,
      summary: `Beta · ChatGPT-Web geöffnet. Text liegt bereit:\n\n„${trimmed.slice(0, 280)}${trimmed.length > 280 ? "…" : ""}“`,
    };
  }

  const url =
    shell.embedUrl ||
    (family === "claude"
      ? "https://claude.ai"
      : family === "grok"
        ? "https://grok.x.ai"
        : "about:blank");
  const launched = await openChromeProfile({ url, agentId });
  requestWatch(agentId);
  if (!launched.ok) {
    return {
      ok: false,
      needsDesktop: launched.needsDesktop,
      openedUrl: url,
      summary:
        launched.error ||
        `${family} Browser-Shell nicht gestartet — Connect Desktop nötig.`,
    };
  }
  return {
    ok: true,
    openedUrl: url,
    summary: `Beta · ${family} geöffnet (${url}). Nachricht bereit zur Injection:\n\n„${trimmed.slice(0, 280)}${trimmed.length > 280 ? "…" : ""}“`,
  };
}

async function dispatchZgpt(
  agentId: string,
  text: string,
  shell: AgentShell,
  agentName?: string,
): Promise<ShellDispatchResult> {
  const profile =
    getZgptProfile(shell.zgptProfileId) ??
    ensureZgptProfileForAgent(agentId, agentName);
  const url = shell.embedUrl || "https://chatgpt.com";
  const launched = await openChromeProfile({
    url,
    agentId,
    zgptFolder: profile.folder,
  });
  requestWatch(agentId);
  if (!launched.ok) {
    return {
      ok: false,
      needsDesktop: launched.needsDesktop,
      openedUrl: url,
      summary:
        launched.error ||
        `ZGPT-Profil „${profile.label}“ nicht gestartet — Connect Desktop nötig.`,
    };
  }
  return {
    ok: true,
    openedUrl: url,
    summary: `Beta · ZGPT-Instanz „${profile.label}“ geöffnet. Text wird injiziert:\n\n„${text.slice(0, 280)}${text.length > 280 ? "…" : ""}“`,
  };
}
