import {
  IconArrowUpRight,
  IconBrandChrome,
  IconChevronDown,
  IconEye,
  IconHandClick,
  IconRefresh,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  controlAgentChrome,
  listAgentChromeTabs,
  useAgentChromeFrame,
  type AgentChromeControlAction,
  type AgentChromeTab,
} from "@/components/agents/agent-chrome-live";
import { ChannelAvatar } from "@/components/channels/avatar";
import { ensureAgentBrowserStarted } from "@/lib/agents/agent-browser";
import { cn } from "@/lib/utils";

/** Splits a URL into host (shown bright) and the rest (shown muted) for the address pill. */
function splitUrl(raw: string): { host: string; rest: string } {
  const value = raw.trim();
  if (!value) return { host: "", rest: "" };
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const host = url.host.replace(/^www\./, "");
      const rest = `${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
      return { host, rest };
    }
    return { host: value, rest: "" };
  } catch {
    return { host: value, rest: "" };
  }
}

function faviconFor(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
  } catch {
    return null;
  }
}

function Favicon({ url, className }: { url: string; className?: string }) {
  const src = faviconFor(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <IconWorld className={cn("shrink-0 text-white/40", className)} />;
  return <img alt="" className={cn("shrink-0 rounded-[4px]", className)} draggable={false} onError={() => setFailed(true)} src={src} />;
}

/** Fullscreen watch/control surface for the agent's isolated Chrome profile. */
export function AgentChromeFullscreen({
  agentId,
  name,
  onClose,
}: {
  agentId: string;
  name: string;
  onClose: () => void;
}) {
  const [tabs, setTabs] = useState<AgentChromeTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [control, setControl] = useState(false);
  const [address, setAddress] = useState("");
  const [addressFocused, setAddressFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef(false);
  const selectedTabRef = useRef<string | null>(null);
  const actionQueue = useRef<Promise<void>>(Promise.resolve());

  const { src, error: frameError, pageUrl } = useAgentChromeFrame(agentId, {
    intervalMs: 850,
    targetId: selectedTabId,
    onUnavailable: () => void ensureAgentBrowserStarted(agentId),
  });

  useEffect(() => {
    void ensureAgentBrowserStarted(agentId);
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const result = await listAgentChromeTabs(agentId);
      if (cancelled) return;
      if (result.ok) {
        setTabs(result.tabs);
        setSelectedTabId((previous) =>
          previous && result.tabs.some((tab) => tab.id === previous)
            ? previous
            : result.tabs[0]?.id ?? null,
        );
      }
      timer = setTimeout(refresh, 1800);
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [agentId]);

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId);
  useEffect(() => {
    selectedTabRef.current = selectedTabId;
  }, [selectedTabId]);
  useEffect(() => {
    if (addressFocused) return;
    setAddress(selectedTab?.url || pageUrl || "");
  }, [addressFocused, pageUrl, selectedTab?.url]);

  const send = (action: AgentChromeControlAction) => {
    if (!controlRef.current || !selectedTabId) return;
    const targetId = selectedTabId;
    actionQueue.current = actionQueue.current.catch(() => undefined).then(async () => {
      if (!controlRef.current || selectedTabRef.current !== targetId) return;
      const result = await controlAgentChrome(agentId, targetId, action);
      if (!result.ok) setError(result.error ?? "Browser-Eingabe fehlgeschlagen.");
      else setError(null);
    });
    return actionQueue.current;
  };

  const imagePoint = (clientX: number, clientY: number) => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return null;
    const rect = image.getBoundingClientRect();
    const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    const x = (clientX - left) / width;
    const y = (clientY - top) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  const forwardKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!control || !selectedTabId) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, button, textarea, select")) return;
    if (event.key === "Dead" || event.key === "Process") return;
    event.preventDefault();
    event.stopPropagation();
    const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
    if (/^.$/su.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) {
      void send({ action: "text", text: event.key });
      return;
    }
    void send({ action: "key", key: event.key, code: event.code, modifiers });
  };

  const navigate = () => {
    if (!address.trim()) return;
    if (!control) {
      setError("Übernimm zuerst die Steuerung, um eine Adresse zu öffnen.");
      return;
    }
    void send({ action: "navigate", url: address.trim() });
    viewportRef.current?.focus();
  };

  const toggleControl = () => {
    setControl((value) => {
      controlRef.current = !value;
      return !value;
    });
    setError(null);
    viewportRef.current?.focus();
  };
  const setControlMode = (next: boolean) => {
    if (next === control) return;
    toggleControl();
  };

  const currentUrl = selectedTab?.url || pageUrl || "";
  const shownUrl = splitUrl(address);
  const live = Boolean(src && !frameError);
  const status = control
    ? { dot: "bg-emerald-400", ping: true, text: "Steuerung aktiv" }
    : tabs.length === 0
      ? { dot: "bg-amber-300", ping: true, text: "Browser-Tab wird gesucht…" }
      : frameError
        ? { dot: "bg-red-400", ping: false, text: "Vorschau nicht verfügbar" }
        : live
          ? { dot: "bg-rose-400", ping: true, text: "Live" }
          : { dot: "bg-amber-300", ping: true, text: "Browser wird verbunden…" };
  const roundGhost =
    "flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/75 transition hover:bg-white/[0.1] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.05] disabled:active:scale-100";

  const element = (
    <div
      aria-label={`${name} Browser`}
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/60 p-2 text-white backdrop-blur-sm animate-in fade-in-0 duration-200 sm:p-5 md:p-7"
      data-testid="agent-chrome-fullscreen"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex h-full w-full max-w-[1480px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b0c] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85)] animate-in zoom-in-[0.98] slide-in-from-bottom-2 duration-200 sm:rounded-[28px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(251,146,60,0.08),transparent_70%)]" />
        <div className="relative flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        <header className="relative flex shrink-0 items-center gap-3 px-3 pb-2 pt-1.5 sm:px-5">
          <div className="relative shrink-0">
            <ChannelAvatar participantIds={[agentId]} size={38} />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-[#0b0b0c] bg-[#1c1c1e]">
              <IconBrandChrome className="size-2.5 text-white/80" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-tight">{name}</div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-white/45">
              <span className="relative flex size-1.5 shrink-0">
                {status.ping ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", status.dot)} /> : null}
                <span className={cn("relative inline-flex size-1.5 rounded-full", status.dot)} />
              </span>
              <span className="truncate">
                {status.text}
                {tabs.length > 0 ? ` · ${tabs.length} ${tabs.length === 1 ? "Tab" : "Tabs"}` : ""}
                <span className="hidden sm:inline"> · Eigenes Agent-Chrome-Profil</span>
              </span>
            </div>
          </div>

          <div aria-label="Modus" className="hidden h-9 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs sm:flex" role="group">
            <button
              aria-pressed={!control}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition",
                !control ? "bg-white/[0.12] text-white shadow-sm" : "text-white/50 hover:text-white/80",
              )}
              onClick={() => setControlMode(false)}
              type="button"
            >
              <IconEye className="size-3.5" />
              Zuschauen
            </button>
            <button
              aria-pressed={control}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition",
                control ? "bg-emerald-400/15 text-emerald-200 shadow-sm" : "text-white/50 hover:text-white/80",
              )}
              onClick={() => setControlMode(true)}
              type="button"
            >
              <IconHandClick className="size-3.5" />
              Steuern
            </button>
          </div>

          <button aria-label="Browser-Vollbild schließen" className={roundGhost} onClick={onClose} title="Schließen" type="button">
            <IconChevronDown className="size-5 sm:hidden" />
            <IconX className="hidden size-4 sm:block" />
          </button>
        </header>

        {tabs.length > 1 ? (
          <div className="relative flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:px-5">
            {tabs.map((tab) => (
              <button
                aria-selected={tab.id === selectedTabId}
                className={cn(
                  "flex h-8 min-w-0 max-w-60 shrink-0 items-center gap-2 rounded-full border px-3 text-left text-xs transition",
                  tab.id === selectedTabId
                    ? "border-white/15 bg-white/[0.1] text-white"
                    : "border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/80",
                )}
                key={tab.id}
                onClick={() => {
                  selectedTabRef.current = tab.id;
                  setSelectedTabId(tab.id);
                  setError(null);
                  viewportRef.current?.focus();
                }}
                title={`${tab.title} · ${tab.url}`}
                type="button"
              >
                <Favicon className="size-3.5" url={tab.url} />
                <span className="truncate">{tab.title || "Neuer Tab"}</span>
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="relative flex shrink-0 items-center gap-2 px-3 pb-3 sm:px-5"
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <button aria-label="Seite neu laden" className={roundGhost} disabled={!control || !selectedTabId} onClick={() => void send({ action: "reload" })} title={control ? "Seite neu laden" : "Steuerung übernehmen, um den Browser zu bedienen"} type="button">
            <IconRefresh className="size-4" />
          </button>
          <div
            className={cn(
              "relative flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border bg-white/[0.04] pl-3 pr-1 transition",
              addressFocused ? "border-orange-300/40 bg-white/[0.06] ring-2 ring-orange-400/10" : "border-white/10",
            )}
            title={selectedTab?.title ? `${selectedTab.title} · ${currentUrl}` : currentUrl || undefined}
          >
            <Favicon className="size-4" url={address || currentUrl} />
            <div className="relative min-w-0 flex-1">
              <input
                aria-label="Webadresse"
                className={cn(
                  "h-9 w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-white/35 disabled:cursor-default",
                  addressFocused || !address ? "text-white" : "text-transparent",
                )}
                disabled={!control || !selectedTabId}
                onBlur={() => setAddressFocused(false)}
                onChange={(event) => setAddress(event.target.value)}
                onFocus={() => setAddressFocused(true)}
                placeholder="Webadresse eingeben"
                value={address}
              />
              {!addressFocused && address ? (
                <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center truncate whitespace-nowrap text-[13px]">
                  <span className="font-medium text-white/90">{shownUrl.host}</span>
                  <span className="truncate text-white/35">{shownUrl.rest}</span>
                </span>
              ) : null}
            </div>
            <button
              aria-label="Öffnen"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
              disabled={!control || !selectedTabId}
              title="Adresse öffnen"
              type="submit"
            >
              <IconArrowUpRight className="size-4" />
            </button>
          </div>
          <button
            aria-label={control ? "Steuerung stoppen" : "Steuerung übernehmen"}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition active:scale-[0.97] sm:px-4",
              control
                ? "border border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.12]"
                : "bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-[0_10px_30px_-10px_rgba(244,114,182,0.7)] hover:brightness-110",
            )}
            onClick={toggleControl}
            type="button"
          >
            {control ? <span className="size-1.5 rounded-full bg-emerald-400" /> : <IconHandClick className="size-4" />}
            <span className="hidden sm:inline">{control ? "Steuerung stoppen" : "Steuerung übernehmen"}</span>
            <span className="sm:hidden">{control ? "Stoppen" : "Steuern"}</span>
          </button>
        </form>

        <div
          className={cn(
            "relative mx-2 mb-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[18px] border bg-[#060607] outline-none transition-colors sm:mx-3 sm:mb-3 sm:rounded-[20px]",
            control ? "cursor-crosshair border-emerald-400/25" : "cursor-default border-white/[0.06]",
          )}
          onClick={(event) => {
            if (!control) return;
            const point = imagePoint(event.clientX, event.clientY);
            if (point) void send({ action: "click", ...point });
          }}
          onContextMenu={(event) => {
            if (!control) return;
            event.preventDefault();
            const point = imagePoint(event.clientX, event.clientY);
            if (point) void send({ action: "click", ...point, button: "right" });
          }}
          onKeyDown={forwardKey}
          onPointerDown={() => {
            if (control) viewportRef.current?.focus();
          }}
          onWheel={(event) => {
            if (!control) return;
            event.preventDefault();
            const point = imagePoint(event.clientX, event.clientY);
            if (point) void send({ action: "scroll", ...point, deltaX: event.deltaX, deltaY: event.deltaY });
          }}
          ref={viewportRef}
          style={{ touchAction: control ? "none" : "auto" }}
          tabIndex={0}
        >
          {src && !frameError ? (
            <img alt={`Live-Ansicht des Browsers von ${name}`} className="h-full w-full select-none object-contain" draggable={false} ref={imageRef} src={src} />
          ) : (
            <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <IconBrandChrome className={cn("size-7 text-white/45", !frameError && "animate-pulse")} />
              </span>
              <p className="text-sm font-medium text-white/85">{frameError ? "Browser-Vorschau nicht verfügbar" : "Browser wird verbunden…"}</p>
              <p className="text-xs text-white/45">{frameError ?? "Sobald ein Tab geöffnet ist, erscheint er hier."}</p>
            </div>
          )}
          {error ? <div className="absolute left-1/2 top-3 max-w-[min(90%,640px)] -translate-x-1/2 rounded-full border border-red-300/20 bg-red-950/70 px-4 py-1.5 text-xs text-red-100 shadow-lg backdrop-blur-md">{error}</div> : null}
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] text-white/60 shadow-lg backdrop-blur-md">
            {control ? <IconHandClick className="size-3.5 shrink-0 text-emerald-300/80" /> : <IconEye className="size-3.5 shrink-0 text-white/45" />}
            <span className="truncate">
              {control ? "Klicken, scrollen und tippen wird an den ausgewählten Tab gesendet." : "Live-Ansicht · Über „Steuerung übernehmen“ den Tab bedienen."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(element, document.body);
}
