import {
  IconBrandChrome,
  IconBrandGithub,
  IconChevronLeft,
  IconChevronRight,
  IconLoader2,
  IconPencil,
  IconStarFilled,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIframeBrowserNav } from "@/lib/companies/iframe-browser-nav";
import {
  getConnection,
  getLevel3Browser,
  resolveLabApp,
  resolveTabUrl,
  setLabEngine,
  subscribeLevel3Browser,
  unstarToBrowser,
} from "@/lib/companies/level3-tools";
import {
  CHROME_START_PATH_HINT,
  openLabUrlInChrome,
} from "@/lib/ui/lab-prefs";
import { isDesktopApp, navigateDesktopBrowser } from "@/lib/desktop-bridge";

/**
 * Lab Browser — embedded iframe that fills the right pane.
 * On the desktop app it stays empty and Host-Chrome opens externally.
 */
export function Level3SiteStudio({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
  computerId?: string;
}) {
  const [state, setState] = useState(() => getLevel3Browser(companyId));
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    setState(getLevel3Browser(companyId));
    return subscribeLevel3Browser(() =>
      setState(getLevel3Browser(companyId)),
    );
  }, [companyId]);

  const url = resolveTabUrl(state);

  useEffect(() => {
    setFrameKey((n) => n + 1);
    if (url) {
      navigateDesktopBrowser(url);
    }
  }, [url, companyId]);

  if (isDesktopApp() && url) {
    return null;
  }

  if (state.starred) {
    const starredConn = state.starredConnectionToolId
      ? getConnection(state, state.starredConnectionToolId)
      : undefined;
    const productUrl =
      starredConn?.projectUrl?.trim() ||
      resolveLabApp(state, state.starredConnectionToolId)?.url ||
      url;

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-neutral-900">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 px-3">
          <IconStarFilled className="size-4 text-amber-500" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {companyName}
            <span className="ml-2 text-[11px] font-normal text-neutral-400">
              Software läuft
            </span>
          </p>
          {starredConn?.githubUrl ? (
            <a
              className="hidden items-center gap-1 truncate text-[11px] text-neutral-500 hover:text-neutral-800 sm:inline-flex"
              href={starredConn.githubUrl}
              rel="noreferrer"
              target="_blank"
            >
              <IconBrandGithub className="size-3.5" />
              Repo
            </a>
          ) : null}
          <Button
            className="h-8 gap-1"
            onClick={() => setState(unstarToBrowser(companyId))}
            size="sm"
            type="button"
            variant="outline"
          >
            <IconPencil className="size-3.5" />
            Bearbeiten
          </Button>
        </header>
        {isDesktopApp() ? (
          <ConnectChromePane
            companyId={companyId}
            companyName={companyName}
            url={productUrl}
          />
        ) : (
          <EmbedPane
            companyId={companyId}
            companyName={companyName}
            frameKey={frameKey}
            url={productUrl}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-neutral-900">
      {isDesktopApp() ? (
        <ConnectChromePane
          companyId={companyId}
          companyName={companyName}
          url={url}
        />
      ) : (
        <EmbedPane
          companyId={companyId}
          companyName={companyName}
          frameKey={frameKey}
          url={url}
        />
      )}
    </div>
  );
}

function ConnectChromePane({
  companyId,
  companyName,
  url,
}: {
  companyId: string;
  companyName: string;
  url: string;
}) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const lastOpened = useRef("");

  const launch = async (target: string, force = false) => {
    const trimmed = target.trim();
    if (!trimmed) {
      setOk(null);
      setMsg(null);
      return;
    }
    if (!force && lastOpened.current === trimmed && ok === true) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await openLabUrlInChrome(trimmed);
      if (result.ok) {
        lastOpened.current = trimmed;
        setOk(true);
        setMsg(
          "Connect-Chrome ist der Browser — Fenster mit Connect-Profil auf dem Desktop.",
        );
        return;
      }
      setOk(false);
      setMsg(
        result.error?.trim() ||
          `Chrome-Start fehlgeschlagen. ${CHROME_START_PATH_HINT}`,
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!url) {
      lastOpened.current = "";
      setOk(null);
      setMsg(null);
      return;
    }
    void launch(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relaunch when Lab URL changes
  }, [url, companyId]);

  if (!url) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-white px-6 text-center">
        <IconBrandChrome className="size-8 text-neutral-400" stroke={1.25} />
        <p className="text-sm font-medium text-neutral-700">
          Connect-Browser · {companyName}
        </p>
        <p className="max-w-sm text-[12px] text-neutral-400">
          Links eine App öffnen oder Websearch nutzen. Connect startet Host-Chrome
          mit Connect-Profil — kein Website-Tab, kein iframe.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[#f5f5f7] px-6 text-center">
      <figure className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-black/10 bg-[#ececef] px-3 py-2">
          <span className="flex gap-1">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <div className="min-w-0 flex-1 truncate rounded-md bg-white px-2.5 py-1 text-left text-[11px] text-neutral-600 shadow-sm">
            {url}
          </div>
          <IconBrandChrome className="size-3.5 shrink-0 text-neutral-500" />
        </div>
        <div className="flex flex-col items-center gap-3 px-6 py-10">
          {busy ? (
            <IconLoader2 className="size-8 animate-spin text-neutral-400" />
          ) : (
            <IconBrandChrome
              className={
                ok === false ? "size-8 text-red-500" : "size-8 text-sky-600"
              }
              stroke={1.25}
            />
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-900">
              {busy
                ? "Connect-Chrome startet…"
                : ok === false
                  ? "Connect-Chrome nicht gestartet"
                  : "Connect ist der Browser"}
            </p>
            <p
              className={
                ok === false
                  ? "max-w-md text-[12px] leading-relaxed text-red-600"
                  : "max-w-md text-[12px] leading-relaxed text-neutral-500"
              }
              role={ok === false ? "alert" : "status"}
            >
              {msg ||
                "Seiten und Extensions laufen im Host-Chrome mit Connect-Profil — nicht in diesem Web-Tab."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              className="h-9 gap-1.5"
              disabled={busy}
              onClick={() => void launch(url, true)}
              type="button"
            >
              <IconBrandChrome className="size-3.5" />
              {busy ? "Startet…" : "Connect-Chrome öffnen"}
            </Button>
            <Button
              className="h-9"
              onClick={() => setLabEngine(companyId, "embed")}
              type="button"
              variant="ghost"
            >
              Nur Vorschau (iframe)
            </Button>
          </div>
        </div>
      </figure>
      <p className="max-w-md text-[11px] text-neutral-400">
        Steuerung bleibt hier · Surfen = Connect-Chrome auf dem PC (
        <code className="rounded bg-neutral-200/80 px-1">./START-APP.sh</code>
        ).
      </p>
    </div>
  );
}

function EmbedPane({
  companyId,
  url: initialUrl,
  companyName,
  frameKey,
}: {
  companyId: string;
  url: string;
  companyName: string;
  frameKey: number;
}) {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [key, setKey] = useState(frameKey);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { goBack, goForward } = useIframeBrowserNav(iframeRef, Boolean(currentUrl));

  useEffect(() => {
    setCurrentUrl(initialUrl);
    setInputUrl(initialUrl);
    setKey((k) => k + 1);
  }, [initialUrl]);

  const iframeSrc = currentUrl || "about:blank";

  const handleNavigate = (e?: React.FormEvent) => {
    e?.preventDefault();
    let target = inputUrl.trim();
    if (!target) return;
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "https://" + target;
    }
    setCurrentUrl(target);
    setInputUrl(target);
    setKey((k) => k + 1);
  };

  const reload = () => {
    setKey((k) => k + 1);
  };

  const openExternally = () => {
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      {/* Modern In-App Browser Navigation Bar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50/90 px-3 py-1.5 backdrop-blur">
        <div className="flex items-center gap-1">
          <Button
            aria-label="Zurück"
            className="size-7 rounded-md text-neutral-600 hover:text-neutral-900"
            onClick={goBack}
            size="icon"
            title="Zurück"
            type="button"
            variant="ghost"
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            aria-label="Vorwärts"
            className="size-7 rounded-md text-neutral-600 hover:text-neutral-900"
            onClick={goForward}
            size="icon"
            title="Vorwärts"
            type="button"
            variant="ghost"
          >
            <IconChevronRight className="size-4" />
          </Button>
          <Button
            aria-label="Neu laden"
            className="size-7 rounded-md text-neutral-600 hover:text-neutral-900"
            onClick={reload}
            size="icon"
            title="Seite neu laden"
            type="button"
            variant="ghost"
          >
            <span className="text-xs">↻</span>
          </Button>
        </div>

        {/* Address Input */}
        <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={handleNavigate}>
          <input
            className="h-7 w-full rounded-md border border-neutral-200 bg-white px-2.5 font-mono text-[12px] text-neutral-800 shadow-inner focus:border-sky-500 focus:outline-none"
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="URL eingeben..."
            type="text"
            value={inputUrl}
          />
        </form>

        <div className="flex items-center gap-1">
          <Button
            className="h-7 gap-1 px-2.5 text-[11px] font-medium"
            onClick={openExternally}
            size="sm"
            title="Öffnet die Seite für uneingeschränkte Logins (Google, GitHub, Lovable) im separaten Fenster"
            type="button"
            variant="outline"
          >
            <span>↗</span>
            <span className="hidden sm:inline">Neues Fenster</span>
          </Button>
          <Button
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setLabEngine(companyId, "full")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconBrandChrome className="size-3" />
            <span className="hidden sm:inline">Chrome</span>
          </Button>
        </div>
      </div>

      {/* Embedded In-App Browser View without restrictive sandbox */}
      <div className="relative min-h-0 w-full flex-1 bg-white">
        <iframe
          allow="clipboard-read; clipboard-write; fullscreen; accelerometer; autoplay; camera; microphone; geolocation"
          className="absolute inset-0 size-full border-0 bg-white"
          key={`${key}:${currentUrl}`}
          ref={iframeRef}
          referrerPolicy="no-referrer-when-downgrade"
          src={iframeSrc}
          title={`${companyName} · Browser`}
        />
      </div>
    </div>
  );
}
