import {
  IconAlertTriangle,
  IconExternalLink,
  IconLoader2,
  IconPlugConnected,
  IconRefresh,
  IconRobot,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createT3PairingLink,
  fetchT3AgentsStatus,
  hasPairedT3,
  markT3Paired,
  readStoredT3Origin,
  rememberT3Origin,
  T3_REPO_URL,
  type T3AgentsStatus,
} from "@/lib/agents/t3-agents";
import { cn } from "@/lib/utils";

/**
 * Agents — T3 Code.
 *
 * T3 Code is its own agent harness: a local server plus a web app that lists
 * projects, threads and the agents working in them. Connect does not rebuild
 * that surface; this area embeds it and handles the two things an iframe cannot
 * do on its own — finding the running server, and pairing the browser with it.
 *
 * Pairing happens once per browser profile: T3 hands out a one-time token in the
 * URL fragment, keeps the resulting session, and from then on the plain origin
 * is enough. Every failure has a next step on screen (start T3, retry, or open
 * T3 in its own tab), because an empty iframe explains nothing.
 */
export function T3AgentsArea({
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [status, setStatus] = useState<T3AgentsStatus | null>(null);
  const [checking, setChecking] = useState(true);
  /** Plain T3 origin — what "Neu laden" and "Im Tab öffnen" go back to. */
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  /** Actual iframe URL; may be a one-time pairing link. */
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [pairing, setPairing] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);
  const autoPaired = useRef(false);

  const connect = useCallback(
    async (origin: string, { auto = false }: { auto?: boolean } = {}) => {
      setPairing(true);
      setNotice(null);
      const pair = await createT3PairingLink();
      if (pair.ok && pair.url) {
        markT3Paired(true, origin);
        setBaseUrl(origin);
        setFrameUrl(pair.url);
        setFrameKey((key) => key + 1);
        setNotice({
          tone: "info",
          text: "Pairing-Link erzeugt — T3 Code verbindet sich …",
        });
      } else {
        markT3Paired(false, origin);
        setBaseUrl(origin);
        setFrameUrl(origin);
        setFrameKey((key) => key + 1);
        if (!auto || pair.error) {
          setNotice({
            tone: "error",
            text:
              pair.error ??
              "Pairing nicht möglich. T3 Code zeigt seine eigene Pairing-Seite.",
          });
        }
      }
      setPairing(false);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setChecking(true);
    setNotice(null);
    const next = await fetchT3AgentsStatus();
    setStatus(next);
    if (next.running && next.url) {
      rememberT3Origin(next.url);
      setBaseUrl(next.url);
      // First open in this browser: pair silently so the area lands in T3 itself
      // instead of on T3's "paste a token" page.
      if (!hasPairedT3(next.url) && !autoPaired.current) {
        autoPaired.current = true;
        await connect(next.url, { auto: true });
      } else {
        setFrameUrl(next.url);
        setFrameKey((key) => key + 1);
      }
    } else {
      setBaseUrl(null);
      setFrameUrl(null);
    }
    setChecking(false);
  }, [connect]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = Boolean(status?.running && status.url);
  const address = status?.host
    ? `${status.host}${status.port ? `:${status.port}` : ""}`
    : (baseUrl ?? readStoredT3Origin() ?? null);

  const reload = () => {
    if (!baseUrl) return;
    markT3Paired(true, baseUrl);
    setFrameUrl(baseUrl);
    setFrameKey((key) => key + 1);
    setNotice(null);
  };

  /**
   * A normal tab has its own storage partition, so it is not paired just
   * because the iframe is. Mint a fresh link, and open the tab synchronously
   * first so the popup blocker sees a click.
   */
  const openInTab = async () => {
    if (!baseUrl) return;
    const tab = window.open("about:blank", "_blank");
    setPairing(true);
    const pair = await createT3PairingLink();
    setPairing(false);
    const target = pair.ok && pair.url ? pair.url : baseUrl;
    if (tab) {
      tab.opener = null;
      tab.location.replace(target);
    } else {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-neutral-900">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-neutral-200 px-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
          <IconRobot className="size-4" stroke={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 truncate text-[13px] font-semibold tracking-tight">
            Agents
            <span className="text-[11px] font-normal text-neutral-400">
              T3 Code
            </span>
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-neutral-500">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                checking
                  ? "animate-pulse bg-neutral-300"
                  : running
                    ? "bg-emerald-500"
                    : "bg-amber-500",
              )}
            />
            {checking
              ? "T3 Code wird gesucht …"
              : running
                ? `Läuft${status?.version ? ` · v${status.version}` : ""}${
                    address ? ` · ${address}` : ""
                  }`
                : (status?.message ?? "T3 Code läuft nicht.")}
            {companyName ? (
              <span className="hidden text-neutral-300 sm:inline">
                · {companyName}
              </span>
            ) : null}
          </p>
        </div>

        <Button
          className="h-8 gap-1.5 px-2.5 text-[12px]"
          disabled={!running || pairing}
          onClick={() => baseUrl && void connect(baseUrl)}
          title="Pairing-Link erzeugen und T3 Code verbinden"
          type="button"
          variant="ghost"
        >
          {pairing ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconPlugConnected className="size-3.5" />
          )}
          <span className="hidden sm:inline">Verbinden</span>
        </Button>
        <Button
          aria-label="Neu laden"
          className="size-8 p-0"
          disabled={!running}
          onClick={reload}
          title="T3 Code neu laden"
          type="button"
          variant="ghost"
        >
          <IconRefresh className="size-4" />
        </Button>
        <Button
          aria-label="In neuem Tab öffnen"
          className="size-8 p-0"
          disabled={!running || pairing}
          onClick={() => void openInTab()}
          title="T3 Code in einem eigenen Tab öffnen"
          type="button"
          variant="ghost"
        >
          <IconExternalLink className="size-4" />
        </Button>
      </header>

      {notice ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[11px]",
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-neutral-200 bg-neutral-50 text-neutral-600",
          )}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <IconAlertTriangle className="size-3.5 shrink-0" stroke={1.8} />
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.tone === "error" ? (
            <button
              className="shrink-0 underline underline-offset-2"
              onClick={() => void refresh()}
              type="button"
            >
              Erneut prüfen
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-[#0a0a0a]">
        {checking && !frameUrl ? (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
            <IconLoader2 className="size-5 animate-spin" />
          </div>
        ) : null}

        {frameUrl ? (
          <iframe
            allow="clipboard-read; clipboard-write; fullscreen"
            className={cn(
              "absolute inset-0 size-full border-0 bg-[#0a0a0a]",
              checking && "opacity-60",
            )}
            key={`${frameKey}:${frameUrl}`}
            onLoad={() =>
              setNotice((current) =>
                current?.tone === "info" ? null : current,
              )
            }
            referrerPolicy="no-referrer"
            src={frameUrl}
            title="T3 Code — Agents"
          />
        ) : null}

        {!checking && !running ? (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-white">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/[0.06] text-white/80">
                <IconRobot className="size-6" stroke={1.5} />
              </span>
              <p className="mt-3 text-[15px] font-semibold tracking-tight">
                T3 Code ist nicht gestartet
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">
                Agents ist T3 Code — deine Projekte, Threads und Agenten auf
                diesem PC. Starte die T3-Code-App oder{" "}
                <code className="rounded bg-white/10 px-1">t3 start</code>, dann
                hier erneut prüfen.
              </p>
              {status?.cli ? (
                <p className="mt-2 truncate text-[11px] text-white/30">
                  CLI: {status.cli}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  className="h-9 gap-1.5"
                  disabled={checking}
                  onClick={() => void refresh()}
                  type="button"
                >
                  <IconRefresh className="size-4" />
                  Erneut prüfen
                </Button>
                <a
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[12px] text-white/70 transition hover:bg-white/10 hover:text-white"
                  href={T3_REPO_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <IconExternalLink className="size-4" />
                  T3 Code holen
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
