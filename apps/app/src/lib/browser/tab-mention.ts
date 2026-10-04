/**
 * Tab mention resolution — resolves @tab:<tabId> tokens into URL + title.
 *
 * On desktop (Chrome extension active): forwards to the extension bridge via
 * chrome.runtime.sendMessage so the agent can open the tab in the real browser.
 *
 * On mobile: queues the link and shows a "Open on desktop?" toast via Supabase realtime.
 */

import { getAgentTabs } from "@/lib/agents/agent-browser-tabs";
import { hasConnectShell } from "@/lib/ui/open-window";
import { isDesktopApp, sendDesktopMessage } from "@/lib/desktop-bridge";
import type { SavedTabOption } from "@/components/channels/composer/triggers";

export type TabMention = {
  id: string;
  title: string;
  url: string;
  agentId: string;
  agentName: string;
};

/** All saved tabs across all agents, formatted for the mention picker. */
export function getAllSavedTabs(): SavedTabOption[] {
  try {
    const TABS_KEY = "connect.agent-browser-tabs";
    const raw = window.localStorage.getItem(TABS_KEY);
    if (!raw) return [];

    const store = JSON.parse(raw) as Record<
      string,
      { agentId: string; tabs: { id: string; url: string; title: string }[] }
    >;
    const result: SavedTabOption[] = [];
    for (const [agentId, data] of Object.entries(store)) {
      for (const tab of data.tabs ?? []) {
        result.push({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          agentName: agentId,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

/** Resolve a tab mention token to its URL and title. Returns null if not found. */
export function resolveTabMention(
  token: string,
): TabMention | null {
  // Token format: "Tab:<id>" or just "<id>"
  const id = token.startsWith("Tab:") ? token.slice(4) : token;
  const allTabs = getAllSavedTabs();
  const tab = allTabs.find((t) => t.id === id);
  if (!tab) return null;

  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    agentId: tab.agentName ?? "",
    agentName: tab.agentName ?? "Unknown Agent",
  };
}

/**
 * Open a URL in desktop Chrome.
 * - Desktop app (WPF/WebView2): uses desktop-bridge.ts
 * - Extension (connect-shell): uses open-window.ts postMessage
 * - Mobile: falls back to Supabase realtime toast
 */
export function openUrlInDesktop(url: string): void {
  // Desktop app bridge
  if (isDesktopApp()) {
    sendDesktopMessage({ type: "navigate", url });
    return;
  }

  // Connect Shell extension bridge
  if (hasConnectShell()) {
    window.postMessage(
      {
        source: "connect-app",
        type: "connect-shell-open-window",
        url,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        forceNew: false,
      },
      window.location.origin,
    );
    return;
  }

  // Mobile fallback: queue via Supabase realtime channel
  queueMobileUrl(url);
}

/** Queue a URL for opening on desktop (mobile fallback). */
export function queueMobileUrl(url: string): void {
  // Try Supabase realtime if available
  try {
    const channel = (window as any).__SUPABASE_REALTIME_CHANNEL__;
    if (channel) {
      channel.send({
        type: "broadcast",
        event: "open-url",
        payload: { url, at: Date.now() },
      });
      return;
    }
  } catch {
    // Supabase not available
  }

  // Last resort: copy to clipboard with a toast
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(() => {});
  }
}
