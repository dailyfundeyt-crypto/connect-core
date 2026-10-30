import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCamera,
  IconCircleCheck,
  IconCircleX,
  IconExternalLink,
  IconFolder,
  IconKeyboard,
  IconLoader2,
  IconPointer,
  IconRobot,
  IconShieldCheck,
  IconSparkles,
  IconWorld,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  agentHubAgentQuery,
  agentHubCatalogQuery,
  browserUseStatusQuery,
  clickBrowserUseElement,
  invalidateAgentHub,
  openAgentBrowserProfile,
  openBrowserUseUrl,
  runBrowserUseTask,
  saveAgentBrowser,
  testAgentBrowser,
  typeBrowserUseText,
} from "@/lib/agent-hub/api";
import { AgentChromeLive } from "@/components/agents/agent-chrome-live";
import { ConnectorIcon } from "./connector-gallery";
import { AgentSwarmPanel } from "./agent-swarm-panel";

/** Eigener Helium-Browser pro Agent (eigenes Profil, nie Stefans Profil, Status + Profil öffnen). */
export function AgentBrowserPanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const agent = useQuery(agentHubAgentQuery(agentId));
  const catalog = useQuery(agentHubCatalogQuery());
  const browserUseStatus = useQuery(browserUseStatusQuery(agentId));

  const serverId = agent.data?.browser.serverId;
  const server = catalog.data?.servers.find((candidate) => candidate.id === serverId);
  const enabled = !!agent.data?.links.some((link) => link.serverId === serverId && link.enabled);
  const headless = server ? server.options.headless !== false : true;

  // Browser-Use Interaktions-States
  const [urlInput, setUrlInput] = useState("https://example.com");
  const [selectorInput, setSelectorInput] = useState("h1");
  const [textInput, setTextInput] = useState("Helium Swarm Test");
  const [taskInput, setTaskInput] = useState("Öffne example.com und prüfe den Titel");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const save = useMutation({
    mutationFn: (input: { enabled: boolean; headless: boolean }) => saveAgentBrowser(agentId, input),
    onSettled: () => invalidateAgentHub(queryClient),
  });
  const test = useMutation({ mutationFn: () => testAgentBrowser(agentId) });
  const openProfile = useMutation({ mutationFn: () => openAgentBrowserProfile(agentId) });

  // Browser-Use Aktionen
  const openUrlMutation = useMutation({
    mutationFn: (url: string) => openBrowserUseUrl(agentId, url),
    onSuccess: (data) => {
      if (data.ok) {
        setActionFeedback(`Geöffnet: ${data.url || urlInput} (${data.title || "OK"})`);
        setActionError(null);
        setPreviewKey((k) => k + 1);
      } else {
        setActionError(data.error || "Öffnen fehlgeschlagen");
      }
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const clickMutation = useMutation({
    mutationFn: (selector: string) => clickBrowserUseElement(agentId, { selector }),
    onSuccess: (data) => {
      if (data.ok) {
        setActionFeedback(`Klick ausgeführt auf: ${selectorInput}`);
        setActionError(null);
        setPreviewKey((k) => k + 1);
      } else {
        setActionError(data.error || "Klick fehlgeschlagen");
      }
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const typeMutation = useMutation({
    mutationFn: (text: string) => typeBrowserUseText(agentId, { text, submit: true }),
    onSuccess: (data) => {
      if (data.ok) {
        setActionFeedback(`Getippt: "${textInput}" (Enter gesendet)`);
        setActionError(null);
        setPreviewKey((k) => k + 1);
      } else {
        setActionError(data.error || "Tippen fehlgeschlagen");
      }
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const taskMutation = useMutation({
    mutationFn: (task: string) => runBrowserUseTask(agentId, task),
    onSuccess: (data) => {
      if (data.ok) {
        setActionFeedback(`Browser-Use Task erfolgreich: ${data.output?.slice(0, 120)}...`);
        setActionError(null);
        setPreviewKey((k) => k + 1);
      } else {
        setActionError(data.error || "Task fehlgeschlagen");
      }
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const state = server ? (save.isPending ? "connecting" : server.status.state) : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4" data-testid="agent-browser-panel">
      <div className="flex items-center gap-3">
        <ConnectorIcon icon="helium" state={enabled ? state : null} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14.5px]">Eigener Browser (Helium) &amp; Browser-Use</div>
          <div className="text-[12.5px] text-muted-foreground leading-snug">
            Der Agent steuert sein eigenes Helium-Profil via Browser-Use – isoliert von deinem Profil und anderen Agents.
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-xs font-semibold text-foreground">Browser aktivieren</span>
          <Switch
            checked={enabled}
            disabled={save.isPending}
            onCheckedChange={(checked) => save.mutate({ enabled: checked, headless })}
            aria-label="Browser aktivieren"
          />
        </div>
      </div>

      {enabled ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 border border-emerald-500/20">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Status: Eigenes Helium-Profil aktiv &amp; bereit
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
              <IconShieldCheck className="size-3.5" /> Stefans Profil geschützt (nie berührt)
            </span>
          </div>

          {/* Phase E Schritt 18: Browser-Use Dienst Anbindung */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconRobot className="size-4 text-indigo-500" />
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                  Browser-Use Dienst (C:\Users\Kunc GmbH\Browser use)
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Aktiv &amp; Angebunden
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
              Jeder Agent steuert SEIN Helium-Profil: Öffnen beliebiger URLs, Klicken per CSS/Text-Selektor, Tippen und Screenshots.
            </p>

            {/* Steuerungselemente: Öffnen, Klicken, Tippen, Screenshot, Task */}
            <div className="grid gap-2 pt-1 text-xs">
              {/* 1. Öffnen */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <IconWorld className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs font-mono"
                    placeholder="https://example.com"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="default"
                  disabled={openUrlMutation.isPending || !urlInput.trim()}
                  onClick={() => openUrlMutation.mutate(urlInput)}
                  className="h-8 gap-1.5 font-medium shrink-0"
                >
                  {openUrlMutation.isPending ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconWorld className="size-3.5" />}
                  Öffnen
                </Button>
              </div>

              {/* 2. Klicken & Tippen (Kompakte Zeile) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <IconPointer className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs font-mono"
                      placeholder="Selektor (z.B. a, button, h1)"
                      value={selectorInput}
                      onChange={(e) => setSelectorInput(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clickMutation.isPending || !selectorInput.trim()}
                    onClick={() => clickMutation.mutate(selectorInput)}
                    className="h-8 gap-1 font-medium shrink-0"
                  >
                    {clickMutation.isPending ? <IconLoader2 className="size-3 animate-spin" /> : <IconPointer className="size-3" />}
                    Klicken
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <IconKeyboard className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      placeholder="Text tippen..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={typeMutation.isPending || !textInput.trim()}
                    onClick={() => typeMutation.mutate(textInput)}
                    className="h-8 gap-1 font-medium shrink-0"
                  >
                    {typeMutation.isPending ? <IconLoader2 className="size-3 animate-spin" /> : <IconKeyboard className="size-3" />}
                    Tippen
                  </Button>
                </div>
              </div>

              {/* 3. Browser-Use Task */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <IconSparkles className="absolute left-2.5 top-2.5 size-3.5 text-amber-500" />
                  <Input
                    className="h-8 pl-8 text-xs"
                    placeholder="Browser-Use KI-Aufgabe (z.B. 'Suche nach Trends auf Google')..."
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={taskMutation.isPending || !taskInput.trim()}
                  onClick={() => taskMutation.mutate(taskInput)}
                  className="h-8 gap-1.5 font-medium shrink-0"
                >
                  {taskMutation.isPending ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconRobot className="size-3.5" />}
                  Task starten
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Screenshot aktualisieren"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="h-8 px-2 shrink-0"
                >
                  <IconCamera className="size-3.5" />
                </Button>
              </div>

              {/* Feedback und Fehler */}
              {actionFeedback && (
                <p className="flex items-center gap-1.5 text-[11.5px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                  <IconCircleCheck className="size-3.5 shrink-0" />
                  <span className="truncate">{actionFeedback}</span>
                </p>
              )}
              {actionError && (
                <p className="flex items-center gap-1.5 text-[11.5px] text-destructive bg-destructive/10 px-2.5 py-1.5 rounded-lg border border-destructive/20">
                  <IconCircleX className="size-3.5 shrink-0" />
                  <span className="truncate">{actionError}</span>
                </p>
              )}
            </div>
          </div>

          {/* Phase E Schritt 18: Live-Ansicht in der vorhandenen Chrome-Vorschau */}
          <div className="rounded-xl border border-border/70 bg-black/90 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="size-2 rounded-full bg-emerald-500" />
                Live-Ansicht: Helium Browser ({browserUseStatus.data?.status.cdpPort ? `CDP Port ${browserUseStatus.data.status.cdpPort}` : "Aktiv"})
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/80">
                Live alle 1.5s
              </span>
            </div>
            <div className="relative aspect-[16/10] w-full bg-[#0a0c10] flex items-center justify-center overflow-hidden">
              <AgentChromeLive
                key={previewKey}
                agentId={agentId}
                intervalMs={1500}
                className="w-full h-full object-contain"
                fallback={(err) => (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground gap-2">
                    <IconCamera className="size-6 opacity-40" />
                    <span>{err || "Helium Browser-Vorschau lädt..."}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      Klicke auf „Öffnen“ oben, um eine Webseite in diesem Agenten-Profil aufzurufen.
                    </span>
                  </div>
                )}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-[13px]">
              Unsichtbar im Hintergrund
              <span className="block text-[11.5px] text-muted-foreground">Aus = Fenster wird sichtbar geöffnet (z. B. zum Einloggen).</span>
            </span>
            <Switch checked={headless} disabled={save.isPending} onCheckedChange={(checked) => save.mutate({ enabled: true, headless: checked })} />
          </label>

          <div className="rounded-xl bg-muted/30 border border-border/50 p-3 text-xs space-y-1.5">
            <div className="text-muted-foreground font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <IconFolder className="size-3.5" />
                Helium-Profilverzeichnis des Agenten:
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
                Isoliert
              </span>
            </div>
            <div className="font-mono text-[11.5px] text-foreground break-all bg-background/70 p-2 rounded-lg border border-border/40 select-all">
              {agent.data?.browser.profile}
            </div>
          </div>

          {server?.status.state === "error" ? (
            <p className="whitespace-pre-wrap rounded-lg bg-destructive/5 px-2.5 py-2 font-mono text-[11.5px] text-destructive">
              {server.status.error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              disabled={openProfile.isPending}
              onClick={() => openProfile.mutate()}
              className="gap-1.5 font-medium shadow-xs"
            >
              {openProfile.isPending ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconExternalLink className="size-3.5" />
              )}
              Profil öffnen
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={test.isPending}
              onClick={() => test.mutate()}
              className="gap-1.5"
            >
              {test.isPending ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
              Browser testen
            </Button>
            {server?.tools.length ? (
              <span className="text-[12px] text-muted-foreground ml-auto">
                {server.tools.length} Browser-Werkzeuge aktiv
              </span>
            ) : null}
          </div>

          {openProfile.data ? (
            <p className="flex items-start gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
              <span>{openProfile.data.message || "Helium-Profil für diesen Agenten im Desktop-Fenster geöffnet."}</span>
            </p>
          ) : null}
          {openProfile.isError ? (
            <p className="flex items-start gap-1.5 text-[12px] text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
              <IconCircleX className="mt-0.5 size-4 shrink-0" />
              <span>{(openProfile.error as Error).message}</span>
            </p>
          ) : null}

          {test.data ? (
            <p className={`flex items-start gap-1.5 text-[12px] ${test.data.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
              {test.data.ok ? <IconCircleCheck className="mt-0.5 size-4 shrink-0" /> : <IconCircleX className="mt-0.5 size-4 shrink-0" />}
              <span className="line-clamp-3">{test.data.ok ? "example.com wurde im Agent-Browser geöffnet." : (test.data.error ?? test.data.text)}</span>
            </p>
          ) : null}
          {test.isError ? <p className="text-destructive text-xs">{(test.error as Error).message}</p> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2.5 border border-border/40">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
              <span>Status: Browser deaktiviert</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Schalter „Browser aktivieren“ umlegen
            </span>
          </div>
          <div className="rounded-xl bg-muted/20 border border-border/40 p-3 text-[11.5px] text-muted-foreground leading-relaxed">
            Durch Aktivieren wird automatisch ein eigenes, isoliertes Helium-Browser-Profil im Verzeichnis{" "}
            <span className="font-mono text-foreground text-[10.5px] bg-background/50 px-1 py-0.5 rounded border border-border/30">
              {agent.data?.browser.profile}
            </span>{" "}
            angelegt. Stefans persönliches Helium-Profil bleibt vollständig unberührt und geschützt.
          </div>
        </>
      )}
      {save.isError ? <p className="text-destructive text-xs">{(save.error as Error).message}</p> : null}

      {/* Swarm-Controller & Scheduler (Phase E Schritt 20) */}
      <AgentSwarmPanel />
    </div>
  );
}
