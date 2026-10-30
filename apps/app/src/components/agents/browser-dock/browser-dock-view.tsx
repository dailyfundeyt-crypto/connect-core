/**
 * A32 — Inhalt der Browser-Andockleiste.
 *
 * EIGENTÜMER: A32.
 *
 * Kombiniert zwei Quellen, ohne bestehende Komponenten zu ändern:
 *  1. Connects Agent-Chrome-Steuerung (`AgentChromeLive`, `controlAgentChrome`,
 *     `listAgentChromeTabs`, `focusAgentChrome`) — Standard.
 *  2. Eine optionale T3-Vorschau-Brücke (Prop `t3Preview`). Liefert sie einen
 *     Tab mit Bild-URL, zeigt die Leiste diesen Frame und leitet Adresse/Reload
 *     an die Brücke weiter. Sonst bleibt Connect allein zuständig.
 *
 * Bewusst KEIN Klick-/Tastatur-Forwarding: die Leiste ist Zuschauen + Adresse,
 * die volle Steuerung bleibt im bestehenden Vollbild (`agent-chrome-fullscreen`).
 */

import {
  IconAlertTriangle,
  IconBrandChrome,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
  IconWorld,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { AgentBrowserModeSelect } from "@/components/agents/agent-browser-mode";
import {
  AgentChromeLive,
  controlAgentChrome,
  focusAgentChrome,
  listAgentChromeTabs,
  type AgentChromeControlAction,
  type AgentChromeTab,
  useAgentChromeFrame,
} from "@/components/agents/agent-chrome-live";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureAgentBrowserStarted } from "@/lib/agents/agent-browser";
import { getAgentComputerPrefs } from "@/lib/agents/agent-computer";
import { cn } from "@/lib/utils";
import type { T3PreviewBridge, T3PreviewTab } from "./types";

const TAB_POLL_MS = 4_000;
const T3_POLL_MS = 5_000;
const FRAME_INTERVAL_MS = 1_500;

type Busy = "navigate" | "reload" | "focus" | null;

function normalizeAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function BrowserDockView({
  agentId,
  t3Preview,
}: {
  agentId: string;
  t3Preview?: T3PreviewBridge;
}) {
  const [tabs, setTabs] = useState<AgentChromeTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [t3Tabs, setT3Tabs] = useState<T3PreviewTab[]>([]);
  const [address, setAddress] = useState("");
  const [addressFocused, setAddressFocused] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const t3Tab = t3Tabs[0] ?? null;

  const { src, error: frameError, pageUrl, refresh } = useAgentChromeFrame(
    agentId,
    {
      active: !t3Tab,
      intervalMs: FRAME_INTERVAL_MS,
      targetId: selectedTabId,
    },
  );

  // Das eigene Agent-Profil leise vorwärmen — wie die bisherige Chat-Vorschau.
  useEffect(() => {
    if (getAgentComputerPrefs(agentId).runtime !== "chrome") return;
    void ensureAgentBrowserStarted(agentId).catch(() => undefined);
  }, [agentId]);

  // Connect-Tabs (Agent-Chrome) alle 4 s.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await listAgentChromeTabs(agentId);
      if (cancelled) return;
      if (result.ok) {
        setTabs(result.tabs);
        setSelectedTabId((previous) =>
          previous && result.tabs.some((tab) => tab.id === previous)
            ? previous
            : (result.tabs[0]?.id ?? null),
        );
      }
      timer = setTimeout(tick, TAB_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [agentId]);

  // Optionale T3-Vorschau: nur wenn eine Brücke übergeben wurde.
  useEffect(() => {
    if (!t3Preview) {
      setT3Tabs([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await t3Preview.listTabs(agentId);
        if (!cancelled) setT3Tabs(next);
      } catch {
        if (!cancelled) setT3Tabs([]);
      }
      if (!cancelled) timer = setTimeout(tick, T3_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [agentId, t3Preview]);

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? null;
  const displayUrl = t3Tab?.url || selectedTab?.url || pageUrl || "";
  const displayTitle = t3Tab?.title || selectedTab?.title || "Neuer Tab";
  const tabRows = t3Tab
    ? [
        {
          key: t3Tab.tabId,
          title: t3Tab.title,
          url: t3Tab.url,
          active: true,
          selectable: false,
          tabId: null as string | null,
        },
      ]
    : tabs.map((tab) => ({
        key: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.id === selectedTabId,
        selectable: true,
        tabId: tab.id,
      }));

  useEffect(() => {
    if (addressFocused) return;
    setAddress(displayUrl);
  }, [addressFocused, displayUrl]);

  const runControl = async (action: AgentChromeControlAction) => {
    if (!selectedTabId) {
      setError("Kein Agent-Browser-Tab offen.");
      return;
    }
    setBusy(action.action === "reload" ? "reload" : "navigate");
    setError(null);
    try {
      const result = await controlAgentChrome(agentId, selectedTabId, action);
      if (!result.ok) setError(result.error ?? "Browser-Aktion fehlgeschlagen.");
      else if (action.action !== "move") refresh();
    } finally {
      setBusy(null);
    }
  };

  const submitAddress = async () => {
    const next = normalizeAddress(address);
    if (!next) {
      setError("Bitte eine gültige http(s)-Adresse eingeben.");
      return;
    }
    if (t3Tab && t3Preview?.navigate) {
      setBusy("navigate");
      setError(null);
      try {
        await t3Preview.navigate(agentId, t3Tab.tabId, next);
      } catch {
        setError("T3-Vorschau konnte die Adresse nicht öffnen.");
      } finally {
        setBusy(null);
      }
      return;
    }
    await runControl({ action: "navigate", url: next });
  };

  const reload = async () => {
    if (t3Tab) {
      setBusy("reload");
      setError(null);
      try {
        await t3Preview?.refresh?.(agentId, t3Tab.tabId);
      } catch {
        setError("T3-Vorschau konnte nicht neu laden.");
      } finally {
        setBusy(null);
      }
      return;
    }
    await runControl({ action: "reload" });
  };

  const focus = async () => {
    setBusy("focus");
    setError(null);
    try {
      const result = await focusAgentChrome(agentId, "default", selectedTabId);
      if (!result.ok) setError(result.error ?? "Fokus fehlgeschlagen.");
    } finally {
      setBusy(null);
    }
  };

  const sourceLabel = t3Tab
    ? "T3-Vorschau"
    : frameError
      ? "Nicht erreichbar"
      : src
        ? "Live"
        : "Verbinde…";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        <AgentBrowserModeSelect agentId={agentId} compact />
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
            t3Tab
              ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
              : frameError
                ? "bg-destructive/10 text-destructive"
                : src
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
          )}
          data-testid="browser-dock-source"
          title={
            t3Tab
              ? "Vorschau aus dem T3-Sidecar; Steuerung über Connect"
              : "Eigenes Browser-Profil dieses Agenten"
          }
        >
          <IconBrandChrome className="size-2.5" />
          {sourceLabel}
        </span>
        <Button
          aria-label="Browser-Fenster in den Vordergrund holen"
          disabled={busy === "focus"}
          onClick={() => void focus()}
          size="icon"
          title="Browser-Fenster in den Vordergrund holen"
          type="button"
          variant="ghost"
        >
          {busy === "focus" ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconExternalLink className="size-3.5" />
          )}
        </Button>
      </div>

      {tabRows.length > 1 ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 px-2 py-1 [scrollbar-width:none]">
          {tabRows.map((tab) => (
            <button
              aria-selected={tab.active}
              className={cn(
                "flex h-6 max-w-52 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] transition",
                tab.active
                  ? "border-border bg-muted/70 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              key={tab.key}
              onClick={() => {
                if (!tab.selectable || !tab.tabId) return;
                setSelectedTabId(tab.tabId);
                setError(null);
              }}
              title={`${tab.title} · ${tab.url}`}
              type="button"
            >
              <IconWorld className="size-3 shrink-0" />
              <span className="truncate">{tab.title || "Neuer Tab"}</span>
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void submitAddress();
        }}
      >
        <Input
          aria-label="Webadresse im Browser-Dock"
          className="h-8 min-w-0 flex-1 text-[11px]"
          onBlur={() => setAddressFocused(false)}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={() => setAddressFocused(true)}
          placeholder="https://example.com"
          value={address}
        />
        <Button
          aria-label="Seite neu laden"
          disabled={busy === "reload" || !displayUrl}
          onClick={() => void reload()}
          size="icon"
          title="Seite neu laden"
          type="button"
          variant="outline"
        >
          {busy === "reload" ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconRefresh className="size-3.5" />
          )}
        </Button>
        <Button
          disabled={busy === "navigate"}
          size="sm"
          title="Adresse öffnen"
          type="submit"
          variant="outline"
        >
          {busy === "navigate" ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconWorld className="size-3.5" />
          )}
          Los
        </Button>
      </form>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0e1017]">
        {t3Tab?.frameUrl ? (
          <img
            alt={`T3-Vorschau ${displayTitle}`}
            className="h-full w-full object-cover object-top"
            data-testid="browser-dock-t3-frame"
            draggable={false}
            src={t3Tab.frameUrl}
          />
        ) : (
          <AgentChromeLive
            active={!t3Tab}
            agentId={agentId}
            fallback={(frameMessage) => (
              <FramePlaceholder
                message={
                  frameMessage ??
                  (t3Tab
                    ? "T3-Vorschau liefert noch keine Bild-URL."
                    : "Live-Vorschau lädt…")
                }
                subtle={!frameError}
              />
            )}
            intervalMs={FRAME_INTERVAL_MS}
            targetId={selectedTabId}
          />
        )}
        {displayUrl ? (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[10px] text-white/80">
            {displayUrl}
          </span>
        ) : null}
      </div>

      {error ? (
        <p
          className="shrink-0 border-t border-border/60 px-2 py-1.5 text-[11px] text-destructive"
          role="status"
        >
          {error}
        </p>
      ) : null}
      <p className="shrink-0 border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
        Eigenes Profil des Agenten · volle Steuerung im Monitor
      </p>
    </div>
  );
}

function FramePlaceholder({
  message,
  subtle,
}: {
  message: string;
  subtle: boolean;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
      {subtle ? (
        <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <IconAlertTriangle className="size-5 text-amber-400" />
      )}
      <p className="text-[11px] leading-snug text-white/70">{message}</p>
      <p className="text-[10px] leading-snug text-white/40">
        Der Browser läuft in seinem eigenen Profil — nicht in Stefans Helium.
      </p>
    </div>
  );
}
