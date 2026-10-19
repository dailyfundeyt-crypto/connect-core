import {
  IconArrowLeft,
  IconBuildingStore,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconPencil,
  IconDeviceDesktop,
  IconExternalLink,
  IconLock,
  IconPlus,
  IconQrcode,
  IconRefresh,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { domainFaviconUrl, labAppIconCandidates, siteKey } from "@/lib/companies/lab-favicons";
import {
  addCustomLabApp,
  getLevel3Browser,
  normalizeGroups,
  removeCustomLabApp,
  updateCustomLabApp,
  subscribeLevel3Browser,
  toolIconUrl,
} from "@/lib/companies/level3-tools";
import { subscribeCompanySite } from "@/lib/companies/company-site";
import { getCompany } from "@/lib/companies/store";
import {
  type AppLink,
  cachedEmbed,
  cachedLocalAppsInfo,
  localAppsInfo,
  checkEmbeddable,
  companyAppLinks,
  companyAppSections,
  connectOnPc,
  type FrameTarget,
  localPort,
  normalizeTypedUrl,
  openExternal,
  prefetchEmbedChecks,
  resolveFrameTarget,
} from "@/lib/mobile/app-links";
import { cn } from "@/lib/utils";
import "./mobile-app-browser.css";

/** Was der In-App-Browser zeigen soll. */
export type AppBrowserTarget = { url: string; url2?: string; title?: string; icons?: string[] };

function hostOf(url: string): string {
  return siteKey(url) ?? url.replace(/^https?:\/\//, "");
}

function linkIcons(link: Pick<AppLink, "url" | "app">): string[] {
  const port = localPort(link.url);
  if (port !== null) {
    // Lokale App: Favicon direkt (PC) bzw. über den Proxy (Tunnel).
    const fav = connectOnPc() ? `http://localhost:${port}/favicon.ico` : `/apps/${port}/favicon.ico`;
    return [...(link.app?.favicon ? [link.app.favicon] : []), fav];
  }
  if (link.app) return labAppIconCandidates(link.app, toolIconUrl);
  const d = domainFaviconUrl(link.url);
  return d ? [d] : [];
}

function Glyph({ sources, size = 48 }: { sources: string[]; size?: number }) {
  const key = sources.join("|");
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [key]);
  const src = sources[i];
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-gradient-to-br from-white/[0.10] to-white/[0.03] ring-1 ring-white/10"
      style={{ height: size, width: size }}
    >
      {src ? (
        <img
          alt=""
          className="size-[58%] object-contain"
          draggable={false}
          onError={() => setI((n) => n + 1)}
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : (
        <IconWorld className="size-[45%] text-white/55" stroke={1.6} />
      )}
    </span>
  );
}

/** „In Chrome öffnen“: Standardbrowser; lokale Apps über den Proxy (Tunnel) bzw. direkt (PC). */
export function openLinkInBrowser(url: string, onPcOnly?: () => void) {
  const port = localPort(url);
  if (port === null || connectOnPc()) {
    openExternal(url);
    return;
  }
  const info = cachedLocalAppsInfo();
  if (info?.proxy) {
    const u = new URL(url);
    openExternal(new URL(`/apps/${port}${u.pathname}${u.search}${u.hash}`, window.location.origin).href);
    return;
  }
  onPcOnly?.();
}

/**
 * Antippen eines App-Links. Ist schon bekannt, dass die Seite kein Einbetten erlaubt,
 * öffnet der Link sofort extern (noch in der Tipp-Geste, sonst blockt der Browser das Fenster).
 */
export function openAppLink(target: AppBrowserTarget, show: (t: AppBrowserTarget) => void) {
  if (localPort(target.url) === null && cachedEmbed(target.url)?.embeddable === false) {
    openExternal(target.url);
    return;
  }
  show(target);
}

type ViewState =
  | { phase: "loading" }
  | { phase: "frame"; src: string; local: boolean }
  | { phase: "blocked"; reason?: string }
  | { phase: "pc-only"; port: number };

/** Vollbild-App innerhalb von Connect: schmale Leiste, iframe in ganzer Höhe. */
export function MobileAppBrowser({
  target,
  onClose,
  onShowCompany,
}: {
  target: AppBrowserTarget | null;
  onClose: () => void;
  /** Standard-App einer Firma: kleiner Knopf zurück zu Profil + Link-Liste. */
  onShowCompany?: () => void;
}) {
  const [side, setSide] = useState<0 | 1>(0);
  const [typed, setTyped] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>({ phase: "loading" });
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSide(0);
    setTyped(null);
    setCurrent(target?.url ?? null);
  }, [target]);

  const url = target ? (side === 1 && target.url2 ? target.url2 : current ?? target.url) : null;

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState({ phase: "loading" });
    setFrameLoaded(false);
    void (async () => {
      const t: FrameTarget = await resolveFrameTarget(url);
      if (!alive) return;
      if (t.kind === "pc-only") {
        setState({ phase: "pc-only", port: t.port });
        return;
      }
      if (!t.local) {
        const check = await checkEmbeddable(url);
        if (!alive) return;
        if (check.embeddable === false) {
          // Automatisch im Standardbrowser (Chrome) öffnen; blockt der Browser das Fenster, bleibt die Karte.
          const win = window.open(url, "_blank", "noopener,noreferrer");
          void win;
          setState({ phase: "blocked", reason: check.reason });
          return;
        }
      }
      setState({ phase: "frame", src: t.src, local: t.local });
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (typed !== null) inputRef.current?.select();
  }, [typed]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [target, onClose]);

  const externalUrl = useMemo(() => {
    if (!url) return "";
    if (state.phase === "frame" && state.local && state.src.startsWith("/")) {
      return new URL(state.src, window.location.origin).href;
    }
    return url;
  }, [url, state]);

  if (!target || !url) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeTypedUrl(typed ?? "");
    setTyped(null);
    if (!next) return;
    if (localPort(next) === null && cachedEmbed(next)?.embeddable === false) {
      openExternal(next);
      return;
    }
    setSide(0);
    setCurrent(next);
  };

  const title = current && current !== target.url ? hostOf(current) : target.title || hostOf(url);

  return createPortal(
    <div
      aria-label={`App ${title}`}
      className="fixed inset-0 z-[80] flex flex-col bg-[#07080c] text-white antialiased"
      data-testid="mobile-app-browser"
      role="dialog"
    >
      <div className="shrink-0 border-b border-white/[0.07] bg-[#07080c]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 items-center gap-1.5 pl-[max(0.375rem,env(safe-area-inset-left))] pr-[max(0.375rem,env(safe-area-inset-right))]">
          <button
            aria-label="Zurück"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/85 active:bg-white/10"
            onClick={onClose}
            type="button"
          >
            <IconArrowLeft className="size-[22px]" stroke={1.8} />
          </button>
          {typed !== null ? (
            <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={submit}>
              <input
                aria-label="Adresse"
                autoCapitalize="off"
                autoCorrect="off"
                className="h-9 min-w-0 flex-1 rounded-full bg-white/[0.08] px-3.5 text-[16px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-sky-400/50"
                enterKeyHint="go"
                inputMode="url"
                onBlur={() => window.setTimeout(() => setTyped(null), 150)}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Adresse oder Suche"
                ref={inputRef}
                spellCheck={false}
                value={typed}
              />
              <button aria-label="Abbrechen" className="flex size-9 items-center justify-center text-white/60" onClick={() => setTyped(null)} type="button">
                <IconX className="size-[18px]" />
              </button>
            </form>
          ) : (
            <button
              aria-label="Adresse bearbeiten"
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/[0.05] px-3 text-left active:bg-white/[0.09]"
              onClick={() => setTyped(url)}
              type="button"
            >
              {localPort(url) !== null ? (
                <IconDeviceDesktop className="size-[15px] shrink-0 text-emerald-300/80" />
              ) : (
                <IconLock className="size-[14px] shrink-0 text-white/40" />
              )}
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white/90">{title}</span>
              {target.url2 ? null : (
                <span className="hidden truncate text-[12px] text-white/35 min-[380px]:block">{hostOf(url)}</span>
              )}
            </button>
          )}
          {target.url2 && typed === null ? (
            <div className="flex shrink-0 rounded-full bg-white/[0.06] p-0.5 text-[12px] font-medium">
              {[0, 1].map((n) => (
                <button
                  aria-label={n === 0 ? "Linke Seite" : "Rechte Seite"}
                  className={cn("h-8 w-8 rounded-full", side === n ? "bg-white/15 text-white" : "text-white/45")}
                  key={n}
                  onClick={() => {
                    setCurrent(null);
                    setSide(n as 0 | 1);
                  }}
                  type="button"
                >
                  {n + 1}
                </button>
              ))}
            </div>
          ) : null}
          {typed === null ? (
            <>
              {onShowCompany ? (
                <button
                  aria-label="Firma und Links"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/75 active:bg-white/10"
                  data-testid="app-browser-company"
                  onClick={onShowCompany}
                  title="Firma und Links"
                  type="button"
                >
                  <IconBuildingStore className="size-[20px]" stroke={1.8} />
                </button>
              ) : null}
              <button
                aria-label="Neu laden"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/75 active:bg-white/10"
                onClick={() => {
                  setFrameLoaded(false);
                  setFrameKey((k) => k + 1);
                }}
                type="button"
              >
                <IconRefresh className="size-[20px]" stroke={1.8} />
              </button>
              <button
                aria-label="In Chrome öffnen"
                title="In Chrome öffnen"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/75 active:bg-white/10"
                onClick={() => openExternal(externalUrl)}
                type="button"
              >
                <IconExternalLink className="size-[20px]" stroke={1.8} />
              </button>
            </>
          ) : null}
        </div>
        {state.phase === "loading" || (state.phase === "frame" && !frameLoaded) ? (
          <div className="h-[2px] overflow-hidden bg-transparent">
            <div className="h-full w-1/3 animate-[connect-appbar_1.1s_ease-in-out_infinite] bg-gradient-to-r from-sky-400 to-violet-400" />
          </div>
        ) : (
          <div className="h-[2px]" />
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-[#0b0c11] pb-[env(safe-area-inset-bottom)]">
        {state.phase === "frame" ? (
          <iframe
            allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; geolocation; autoplay"
            allowFullScreen
            className="absolute inset-0 size-full border-0 bg-white"
            data-testid="mobile-app-frame"
            key={`${state.src}#${frameKey}`}
            onLoad={() => setFrameLoaded(true)}
            src={state.src}
            title={title}
          />
        ) : state.phase === "blocked" ? (
          <Notice
            action={{ label: "In Chrome öffnen", onClick: () => openExternal(url) }}
            icon={<IconExternalLink className="size-7 text-sky-300" stroke={1.6} />}
            text={`${hostOf(url)} erlaubt kein Einbetten in andere Apps. Connect öffnet die Seite deshalb in Chrome – künftig direkt beim Antippen.`}
            title="Öffnet im Browser"
          />
        ) : state.phase === "pc-only" ? (
          <Notice
            icon={<IconQrcode className="size-7 text-emerald-300" stroke={1.6} />}
            text={`${hostOf(url)}:${state.port} ist eine App auf deinem PC. Öffne Connect auf dem Handy über den QR-Code (PC › Profilbild › Handy verbinden), dann läuft sie hier.`}
            title="Läuft auf deinem PC – über den QR-Code verbinden"
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function Notice({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="connect-mobile-glass w-full max-w-sm rounded-3xl px-6 py-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">{icon}</span>
        <p className="mt-4 text-[17px] font-semibold tracking-tight">{title}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-white/55">{text}</p>
        {action ? (
          <button
            className="mt-6 h-11 w-full rounded-full bg-white text-[15px] font-semibold text-black active:opacity-80"
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function useLinksTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const a = subscribeLevel3Browser(bump);
    const b = subscribeCompanySite(bump);
    return () => {
      a();
      b();
    };
  }, []);
  return tick;
}

/** Firma › App-Links (dieselben Lab-Links wie am PC) + freie Adresse + Link anlegen. */
export function MobileCompanyApps({
  companyId,
  onClose,
  onOpen,
  embedded = false,
}: {
  companyId: string | null;
  onClose?: () => void;
  onOpen: (t: AppBrowserTarget) => void;
  /** In eine Seite eingebettet (Firmenprofil) statt eigenes Vollbild-Fenster. */
  embedded?: boolean;
}) {
  const tick = useLinksTick();
  const [address, setAddress] = useState("");
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<AppLink | null>(null);
  const [edit, setEdit] = useState<AppLink | null>(null);
  const [copied, setCopied] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const company = companyId ? getCompany(companyId) : undefined;
  const links = useMemo(() => {
    void tick;
    return companyId ? companyAppLinks(companyId) : [];
  }, [companyId, tick]);
  const sections = useMemo(() => {
    void tick;
    return companyId ? companyAppSections(companyId) : [];
  }, [companyId, tick]);

  useEffect(() => {
    setAdding(false);
    setMenu(null);
    setEdit(null);
    setAddress("");
    void localAppsInfo();
  }, [companyId]);

  useEffect(() => {
    if (links.length) void prefetchEmbedChecks(links.flatMap((l) => [l.url, ...(l.url2 ? [l.url2] : [])]));
  }, [links]);

  const open = useCallback(
    (link: AppLink) => openAppLink({ url: link.url, url2: link.url2, title: link.label, icons: linkIcons(link) }, onOpen),
    [onOpen],
  );

  const startPress = (link: AppLink) => {
    longPressed.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setMenu(link);
    }, 550);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  if (!companyId) return null;

  const submitAddress = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeTypedUrl(address);
    if (!next) return;
    setAddress("");
    openAppLink({ url: next }, onOpen);
  };



  const body = (
    <>
      {embedded ? null : (
      <header className="flex shrink-0 items-center gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          aria-label="Zurück"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/85 active:bg-white/10"
          onClick={() => onClose?.()}
          type="button"
        >
          <IconArrowLeft className="size-[22px]" stroke={1.8} />
        </button>
        {company?.logo ? (
          <img alt="" className="size-9 rounded-[30%] object-cover ring-1 ring-white/10" src={company.logo} />
        ) : (
          <span className="size-9 rounded-[30%] ring-1 ring-white/10" style={{ background: company?.accent || "#334155" }} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold tracking-tight">{company?.name ?? companyId}</p>
          <p className="text-[12px] text-white/45">{links.length === 1 ? "1 App" : `${links.length} Apps`}</p>
        </div>
      </header>
      )}

      <div className={embedded ? "pb-[calc(2rem+env(safe-area-inset-bottom))]" : "min-h-0 flex-1 overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom))]"}>
        <form className="px-4 pt-2" onSubmit={submitAddress}>
          <div className="connect-mobile-glass flex h-11 items-center gap-2 rounded-full px-4">
            <IconWorld className="size-[18px] shrink-0 text-white/45" />
            <input
              aria-label="Adresse öffnen"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40"
              enterKeyHint="go"
              inputMode="url"
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Link eingeben oder suchen"
              spellCheck={false}
              value={address}
            />
            {address ? (
              <button aria-label="Öffnen" className="text-[14px] font-medium text-sky-300" type="submit">
                Öffnen
              </button>
            ) : null}
          </div>
        </form>

        {links.length === 0 && !adding ? (
          <div className="connect-mobile-glass mx-4 mt-5 rounded-3xl px-5 py-8 text-center">
            <p className="text-[15px] text-white/55">Noch keine App-Links. Leg einen an – er erscheint auch am PC im Browser-Menü.</p>
          </div>
        ) : (
          sections.map((section) => (
          <section key={section.id}>
          <p className="px-5 pb-1 pt-5 text-[15px] font-medium tracking-wide text-white/55">
            {section.title} <span className="text-[13px] font-normal text-white/30">{section.links.length}</span>
          </p>
          <ul>
            {section.links.map((link) => {
              const local = localPort(link.url) !== null;
              return (
                <li className="flex items-center" key={link.id}>
                  <button
                    className="flex min-w-0 flex-1 select-none items-center gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
                    data-testid="mobile-app-link"
                    onClick={() => {
                      if (longPressed.current) {
                        longPressed.current = false;
                        return;
                      }
                      open(link);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu(link);
                    }}
                    onPointerCancel={cancelPress}
                    onPointerDown={() => startPress(link)}
                    onPointerLeave={cancelPress}
                    onPointerUp={cancelPress}
                    type="button"
                  >
                    <Glyph sources={linkIcons(link)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-[17px] font-semibold tracking-tight">{link.label}</span>
                        {local ? (
                          <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">PC</span>
                        ) : null}
                        {link.url2 ? (
                          <span className="shrink-0 rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">Split</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[14px] text-white/45">
                        {local ? link.url.replace(/^https?:\/\//, "") : hostOf(link.url)}
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label={`Mehr zu ${link.label}`}
                    className="mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-white/45 active:bg-white/10"
                    onClick={() => setMenu(link)}
                    type="button"
                  >
                    <IconDots className="size-5" stroke={1.8} />
                  </button>
                </li>
              );
            })}
          </ul>
          </section>
          ))
        )}

        {adding ? null : (
          <button
            className="mx-5 mt-3 flex items-center gap-2 rounded-full px-1 py-2 text-[15px] font-medium text-sky-300 active:opacity-70"
            onClick={() => setAdding(true)}
            type="button"
          >
            <IconPlus className="size-[18px]" stroke={2} />
            App-Link hinzufügen
          </button>
        )}
      </div>
      <MobileAddLinkSheet companyId={adding ? companyId : null} onClose={() => setAdding(false)} />
      <MobileAddLinkSheet companyId={edit ? companyId : null} edit={edit} onClose={() => setEdit(null)} />
      {menu ? (
        <div className="fixed inset-0 z-[85] flex items-end" data-testid="mobile-link-menu" role="dialog" aria-label={`${menu.label} – Aktionen`}>
          <button aria-label="Schließen" className="absolute inset-0 bg-black/60" onClick={() => setMenu(null)} type="button" />
          <div className="relative w-full rounded-t-[28px] border-t border-white/10 bg-[#101218] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center gap-3 px-3 pb-3">
              <Glyph size={40} sources={linkIcons(menu)} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold">{menu.label}</p>
                <p className="truncate text-[13px] text-white/45">{menu.url.replace(/^https?:\/\//, "")}</p>
              </div>
            </div>
            {[
              { k: "connect", label: "In Connect öffnen", icon: <IconChevronRight className="size-5" />, run: () => open(menu) },
              { k: "chrome", label: "In Chrome öffnen", icon: <IconExternalLink className="size-5" />, run: () => openLinkInBrowser(menu.url, () => onOpen({ url: menu.url, title: menu.label })) },
              ...(menu.site ? [] : [{ k: "edit", label: "Bearbeiten", icon: <IconPencil className="size-5" />, run: () => setEdit(menu) }]),
              {
                k: "copy",
                label: copied ? "Kopiert" : "Link kopieren",
                icon: <IconCopy className="size-5" />,
                keep: true,
                run: () => {
                  void navigator.clipboard?.writeText(menu.url).then(() => {
                    setCopied(true);
                    window.setTimeout(() => {
                      setCopied(false);
                      setMenu(null);
                    }, 700);
                  });
                },
              },
              ...(menu.site ? [] : [{ k: "del", label: "Entfernen", icon: <IconTrash className="size-5" />, danger: true, run: () => removeCustomLabApp(companyId, menu.id) }]),
            ].map((item) => (
              <button
                className={cn("flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[16px] active:bg-white/[0.07]", "danger" in item && item.danger ? "text-rose-300" : "text-white/90")}
                key={item.k}
                onClick={() => {
                  item.run();
                  if (!("keep" in item && item.keep)) setMenu(null);
                }}
                type="button"
              >
                <span className="text-white/55">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
  if (embedded) return <div data-testid="mobile-company-apps">{body}</div>;
  return createPortal(
    <div
      aria-label={`Apps von ${company?.name ?? "Unternehmen"}`}
      className="connect-mobile-home fixed inset-0 z-[70] flex flex-col overflow-hidden text-white antialiased"
      data-testid="mobile-company-apps"
      role="dialog"
    >
      {body}
    </div>,
    document.body,
  );
}

/**
 * Neuer Link / Browser-Tab für eine Firma (Name optional, URL, Gruppe optional).
 * Gleiche Datenquelle wie am PC (connect.level3.browser → workspace-sync), Favicon kommt automatisch
 * (Domain-Icon, am PC erfasst Helium das echte Seiten-Icon).
 */
export function MobileAddLinkSheet({
  companyId,
  edit,
  onClose,
  onSaved,
}: {
  companyId: string | null;
  /** Bestehenden Link bearbeiten statt neu anlegen. */
  edit?: AppLink | null;
  onClose: () => void;
  onSaved?: (url: string) => void;
}) {
  const [name, setName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [groupId, setGroupId] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(
    () => (companyId ? normalizeGroups(getLevel3Browser(companyId).tabGroups) : []),
    [companyId],
  );
  useEffect(() => {
    if (!companyId) return;
    setName(edit?.label ?? "");
    setLinkUrl(edit?.url ?? "");
    setGroupId(edit ? (groups.find((g) => g.appIds.includes(edit.id))?.id ?? "") : "");
    const t = window.setTimeout(() => urlRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, edit]);
  if (!companyId) return null;
  const parsed = normalizeTypedUrl(linkUrl);
  const valid = Boolean(parsed && !parsed.includes("duckduckgo.com/?q="));
  const preview = valid && parsed ? linkIcons({ url: parsed }) : [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !parsed) return;
    const label = name.trim() || hostOf(parsed);
    if (edit) updateCustomLabApp(companyId, edit.id, { label, url: parsed, ...(groupId ? { groupId } : {}) });
    else addCustomLabApp(companyId, { label, url: parsed, groupId });
    onSaved?.(parsed);
    onClose();
  };
  const field =
    "h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-[16px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-sky-400/50";
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end" data-testid="mobile-add-link" role="dialog" aria-label="Link speichern">
      <button aria-label="Schließen" className="absolute inset-0 bg-black/60" onClick={onClose} type="button" />
      <form
        className="relative w-full rounded-t-[28px] border-t border-white/10 bg-[#101218] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-white shadow-2xl"
        onSubmit={submit}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-4 flex items-center gap-3">
          <Glyph size={44} sources={preview} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold tracking-tight">{edit ? "Link bearbeiten" : "Link speichern"}</p>
            <p className="truncate text-[13px] text-white/45">
              {valid && parsed ? parsed.replace(/^https?:\/\//, "") : "Erscheint auch am PC im Browser-Menü"}
            </p>
          </div>
        </div>
        <div className="space-y-2.5">
          <input
            aria-label="URL"
            autoCapitalize="off"
            autoCorrect="off"
            className={field}
            enterKeyHint="next"
            inputMode="url"
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… oder localhost:5173"
            ref={urlRef}
            spellCheck={false}
            value={linkUrl}
          />
          <input
            aria-label="Name"
            className={field}
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            value={name}
          />
          {groups.length ? (
            <select
              aria-label="Gruppe"
              className={cn(field, "appearance-none")}
              onChange={(e) => setGroupId(e.target.value)}
              value={groupId}
            >
              <option value="">Ohne Gruppe</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="h-12 flex-1 rounded-full text-[15px] text-white/70 active:bg-white/10" onClick={onClose} type="button">
            Abbrechen
          </button>
          <button
            className="h-12 flex-1 rounded-full bg-white text-[15px] font-semibold text-black disabled:opacity-40"
            disabled={!valid}
            type="submit"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
