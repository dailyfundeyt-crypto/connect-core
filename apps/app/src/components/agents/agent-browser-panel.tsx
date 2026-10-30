/**
 * Agent-Browser-Panel (Stufe 1.2).
 *
 * Zeigt für einen Agent:
 *   - den Status seines Browser-Tabs (offen? welche URL?)
 *   - Knöpfe zum Öffnen / Schließen
 *   - ein Eingabefeld + "Los"-Knopf für `navigate`
 *   - einen Hinweis, wenn der Tab offen ist, dass die echte Browser-Engine
 *     in Stufe 2 (Codex-CLI + browser-use) kommt
 *
 * Stufe 1.2 = Stub: open/close funktionieren (legen das Profil-Verzeichnis
 * an und tracken den Tab in der DB), navigate speichert die URL. Der
 * Screenshot bleibt leer, bis Stufe 2 die echte Playwright-Engine bringt.
 */

import {
  IconBrowser,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AgentBrowserActionResult,
  type AgentBrowserTab,
  closeAgentBrowserTab,
  listAgentBrowserTabs,
  openAgentBrowserTab,
  runAgentBrowserAction,
} from "@/lib/agents/agent-mcp-client";

const BROWSER_TABS_KEY = "agent-browser-tabs" as const;
const SCREENSHOT_REFRESH_MS = 1500;

/**
 * Live-Frame über den MCP-Endpoint `/api/agent-mcp/:id/browser/screenshot`.
 * Der Server liefert ein JPEG-Buffer zurück — wir revoken die alte
 * Object-URL, bevor wir eine neue setzen, damit der Browser nicht
 * endlos RAM frisst.
 */
function useMcpBrowserFrame(
  agentId: string,
  active: boolean,
  refreshKey: number,
): { src: string | null; pageUrl: string; pageTitle: string; error: string | null } {
  const [src, setSrc] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);
  const failures = useRef(0);

  useEffect(() => {
    if (!active) return;
    failures.current = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/agent-mcp/${agentId}/browser/screenshot?t=${Date.now()}`,
          { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(8000) },
        );
        if (cancelled) return;
        if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) {
          const blob = await res.blob();
          if (cancelled) return;
          const next = URL.createObjectURL(blob);
          if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
          lastUrl.current = next;
          setSrc(next);
          setError(null);
          failures.current = 0;
          const url = res.headers.get("x-connect-page-url");
          const title = res.headers.get("x-connect-page-title");
          setPageUrl(url ? safeDecode(url) : "");
          setPageTitle(title ? safeDecode(title) : "");
        } else {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? `Vorschau nicht verfügbar (${res.status})`);
          failures.current += 1;
        }
      } catch {
        if (!cancelled) setError("Vorschau nicht erreichbar.");
        failures.current += 1;
      }
      if (!cancelled) {
        // Nach 3 Fehlversuchen Intervall auf 30s drosseln statt Meldungsflut
        const delay = failures.current >= 3 ? 30_000 : SCREENSHOT_REFRESH_MS;
        timer = setTimeout(tick, delay);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, agentId, refreshKey]);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  return { src, pageUrl, pageTitle, error };
}

function safeDecode(value: string) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

export function AgentBrowserPanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const [urlInput, setUrlInput] = useState("");
  /**
   * `frameKey` wird bei jeder Aktion erhöht — der `useMcpBrowserFrame`-Hook
   * hängt daran und holt sofort einen neuen Screenshot, statt auf den
   * 1,5s-Intervall zu warten. So fühlt sich jeder Klick „sofort" an.
   */
  const [frameKey, setFrameKey] = useState(0);

  const tabsQuery = useQuery({
    queryKey: [BROWSER_TABS_KEY, agentId],
    queryFn: () => listAgentBrowserTabs(agentId),
    refetchInterval: 5_000,
  });
  const openTab = tabsQuery.data?.tabs?.[0] ?? null;

  const openMutation = useMutation({
    mutationFn: () => openAgentBrowserTab(agentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [BROWSER_TABS_KEY, agentId],
      });
      setFrameKey((k) => k + 1);
    },
  });
  const closeMutation = useMutation({
    mutationFn: () => closeAgentBrowserTab(agentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [BROWSER_TABS_KEY, agentId],
      });
    },
  });
  const navigateMutation = useMutation({
    mutationFn: (url: string) =>
      runAgentBrowserAction(agentId, { kind: "navigate", url }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [BROWSER_TABS_KEY, agentId],
      });
      setFrameKey((k) => k + 1);
    },
  });

  const onNavigate = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    navigateMutation.mutate(url);
    setUrlInput(url);
  };

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card/40 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconBrowser className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Browser-Tab (Stufe 1.2)</h3>
          {openTab ? (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              offen
            </span>
          ) : (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              kein Tab
            </span>
          )}
        </div>
        {openTab ? (
          <Button
            disabled={closeMutation.isPending}
            onClick={() => closeMutation.mutate()}
            size="sm"
            type="button"
            variant="outline"
          >
            {closeMutation.isPending ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconX className="size-3.5" />
            )}
            Schließen
          </Button>
        ) : (
          <Button
            disabled={openMutation.isPending}
            onClick={() => openMutation.mutate()}
            size="sm"
            type="button"
            variant="outline"
          >
            {openMutation.isPending ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconWorld className="size-3.5" />
            )}
            Tab öffnen
          </Button>
        )}
      </header>

      {openTab ? (
        <OpenTabBody
          agentId={agentId}
          openTab={openTab}
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          onNavigate={onNavigate}
          navigatePending={navigateMutation.isPending}
          navigateResult={navigateMutation.data}
          frameKey={frameKey}
          onAction={() => setFrameKey((k) => k + 1)}
          onClose={() => closeMutation.mutate()}
          closePending={closeMutation.isPending}
        />
      ) : (
        <ClosedHint isLoading={tabsQuery.isLoading} error={tabsQuery.error} />
      )}
    </section>
  );
}

function OpenTabBody({
  agentId,
  openTab,
  urlInput,
  setUrlInput,
  onNavigate,
  navigatePending,
  navigateResult,
  frameKey,
  onAction,
  onClose,
  closePending,
}: {
  agentId: string;
  openTab: AgentBrowserTab;
  urlInput: string;
  setUrlInput: (v: string) => void;
  onNavigate: () => void;
  navigatePending: boolean;
  navigateResult: AgentBrowserActionResult | undefined;
  frameKey: number;
  onAction: () => void;
  onClose: () => void;
  closePending: boolean;
}) {
  const { src, pageUrl, pageTitle, error } = useMcpBrowserFrame(agentId, true, frameKey);
  const [actionPending, setActionPending] = useState<null | "reload" | "back" | "forward">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (kind: "reload" | "back" | "forward") => {
    setActionPending(kind);
    setActionError(null);
    try {
      const res = await runAgentBrowserAction(agentId, { kind });
      if (!res.ok) setActionError(res.error ?? "Aktion fehlgeschlagen.");
      onAction();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(null);
    }
  };
  const displayUrl = pageUrl || openTab.url || "";
  const displayTitle = pageTitle || openTab.title || "Neuer Tab";
  return (
    <div className="grid gap-2">
      <p className="break-all text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">{displayTitle}</span>
        {displayUrl ? <> · {displayUrl}</> : null}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        Profil: {openTab.profileDir}
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onNavigate();
        }}
      >
        <Input
          className="flex-1"
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder="https://example.com"
          value={urlInput}
        />
        <Button disabled={navigatePending} type="submit" variant="default">
          {navigatePending ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconWorld className="size-3.5" />
          )}
          Los
        </Button>
        <Button
          aria-label="Neu laden"
          disabled={actionPending === "reload"}
          onClick={() => runAction("reload")}
          size="icon"
          title="Seite neu laden"
          type="button"
          variant="outline"
        >
          {actionPending === "reload" ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconRefresh className="size-3.5" />
          )}
        </Button>
        <Button
          aria-label="Zurück"
          disabled={actionPending === "back"}
          onClick={() => runAction("back")}
          size="icon"
          title="Zurück"
          type="button"
          variant="outline"
        >
          ←
        </Button>
        <Button
          aria-label="Vorwärts"
          disabled={actionPending === "forward"}
          onClick={() => runAction("forward")}
          size="icon"
          title="Vorwärts"
          type="button"
          variant="outline"
        >
          →
        </Button>
        {displayUrl ? (
          <a
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] text-muted-foreground hover:text-foreground"
            href={displayUrl}
            rel="noreferrer noopener"
            target="_blank"
            title="Extern öffnen"
          >
            <IconExternalLink className="size-3" />
            extern
          </a>
        ) : null}
        <Button
          aria-label="Tab schließen"
          disabled={closePending}
          onClick={onClose}
          size="icon"
          title="Tab schließen"
          type="button"
          variant="ghost"
        >
          {closePending ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconX className="size-3.5" />
          )}
        </Button>
      </form>
      {/* Live-Screenshot — Stufe 1.2: echter Browser-Frame über CDP. */}
      <figure className="relative overflow-hidden rounded-lg border bg-[#0e1017]">
        {src && !error ? (
          <img
            alt="Live-Vorschau Agent-Browser"
            className="block w-full"
            draggable={false}
            src={src}
          />
        ) : (
          <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 p-6 text-center">
            <IconLoader2
              className={`size-6 text-muted-foreground ${error ? "" : "animate-spin"}`}
            />
            <p className="text-sm font-medium">
              {error ? "Browser nicht erreichbar" : "Live-Vorschau lädt…"}
            </p>
            <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
              {error ??
                "Eigenes Browser-Profil des Agenten — eigener Tab, eigener Login."}
            </p>
          </div>
        )}
        {pageUrl ? (
          <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[10px] text-white/80">
            {pageUrl}
          </figcaption>
        ) : null}
      </figure>
      {navigateResult?.error ? (
        <p className="text-[12px] text-destructive">{navigateResult.error}</p>
      ) : null}
      {actionError ? (
        <p className="text-[12px] text-destructive">{actionError}</p>
      ) : null}
      <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        Stufe 1.2: echte Helium/Chrome-Session per CDP. Klicks, Tippfehler
        und Formulare werden in Stufe 1.3 dazukommen — bis dahin ist das
        Panel das, was du im Agent-Browser gerade siehst.
      </p>
    </div>
  );
}

function ClosedHint({
  isLoading,
  error,
}: {
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <IconLoader2 className="size-3.5 animate-spin" /> Status wird geladen…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-[12px] text-destructive">
        Status nicht abrufbar:{" "}
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }
  return (
    <p className="text-[12px] text-muted-foreground">
      Noch kein Browser-Tab für diesen Agent. Klick auf „Tab öffnen" legt das
      Profil-Verzeichnis an und registriert den Tab in der DB.
    </p>
  );
}
