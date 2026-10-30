import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconActivity,
  IconAlertTriangle,
  IconCamera,
  IconCheck,
  IconClock,
  IconCpu,
  IconDeviceDesktop,
  IconExternalLink,
  IconEye,
  IconLoader2,
  IconMaximize,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconServer,
  IconShieldCheck,
  IconSparkles,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  captureSwarmWorkerScreenshot,
  runSwarmBatch,
  stopAllSwarm,
  stopSwarmWorker,
  swarmStatusQuery,
  takeoverSwarmWorker,
} from "@/lib/agent-hub/api";
import { cn } from "@/lib/utils";

type LocalOverride = {
  status?: "stopped" | "takeover" | "idle";
  schedulerPaused?: boolean;
  takeoverData?: {
    profileDir: string;
    cdpPort: number;
    url: string;
    message: string;
  };
};

export function AgentSwarmPanel() {
  const queryClient = useQueryClient();
  const { data: status, isLoading, isError, refetch } = useQuery(swarmStatusQuery());

  const [testResult, setTestResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [stoppingWorkerId, setStoppingWorkerId] = useState<string | null>(null);
  const [takingOverWorkerId, setTakingOverWorkerId] = useState<string | null>(null);
  const [capturingWorkerId, setCapturingWorkerId] = useState<string | null>(null);
  const [takeoverModalWorker, setTakeoverModalWorker] = useState<{
    agentId: string;
    agentName: string;
    profileDir: string;
    cdpPort: number;
    url: string;
    message: string;
  } | null>(null);

  // Screenshot modal lightbox state
  const [previewScreenshot, setPreviewScreenshot] = useState<{
    agentId: string;
    agentName: string;
    screenshotUrl: string;
    url: string;
  } | null>(null);

  // Local overrides for Stop and Takeover actions
  const [overrides, setOverrides] = useState<Record<string, LocalOverride>>({});

  // Auto-Refresh state for live screenshots (2–5s interval, only visible tiles, pausable)
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const [visibleTileIds, setVisibleTileIds] = useState<Set<string>>(new Set());
  const [localScreenshots, setLocalScreenshots] = useState<Record<string, string>>({});
  const inFlightCaptures = useRef<Set<string>>(new Set());

  // Custom task runner state
  const [customUrl, setCustomUrl] = useState("about:blank");
  const [customAction, setCustomAction] = useState<"navigate" | "screenshot" | "evaluate">("navigate");

  const runSwarm = useMutation({
    mutationFn: async ({
      count,
      url,
      action,
      task,
    }: {
      count: number;
      url?: string;
      action?: string;
      task?: string;
    }) => {
      setIsRunning(true);
      setTestError(null);
      setTestResult(null);
      try {
        const res = await runSwarmBatch({
          count,
          max_concurrent: count,
          action: action || "navigate",
          url: url || "about:blank",
          task: task || undefined,
          priority: "high",
        });
        setTestResult(res);
        return res;
      } catch (err: any) {
        setTestError(err?.message || String(err));
        throw err;
      } finally {
        setIsRunning(false);
        queryClient.invalidateQueries({ queryKey: ["connect-mcp", "swarm", "status"] });
      }
    },
  });

  const handleStopWorker = async (agentId: string) => {
    setStoppingWorkerId(agentId);
    // Sofort Kachel lokal auf "stopped" setzen und Scheduler pausieren
    setOverrides((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        status: "stopped",
        schedulerPaused: true,
      },
    }));

    try {
      await stopSwarmWorker(agentId);
      await refetch();
    } catch (err: any) {
      setTestError(`Stop fehlgeschlagen für ${agentId}: ${err?.message || String(err)}`);
    } finally {
      setStoppingWorkerId(null);
    }
  };

  const handleTakeover = async (agentId: string, agentName: string) => {
    setTakingOverWorkerId(agentId);
    // Sofort Kachel lokal auf "takeover" setzen und Scheduler pausieren
    setOverrides((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        status: "takeover",
        schedulerPaused: true,
      },
    }));

    try {
      const res = await takeoverSwarmWorker(agentId);
      const takeoverInfo = {
        agentId,
        agentName,
        profileDir: res.profileDir || `%LOCALAPPDATA%\\ConnectAgents\\${agentId}\\helium`,
        cdpPort: res.cdpPort || 9520,
        url: res.url || "about:blank",
        message: res.message || `Helium-Browser für ${agentName} geöffnet. Manuelle Steuerung aktiv.`,
      };
      setOverrides((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          status: "takeover",
          schedulerPaused: true,
          takeoverData: takeoverInfo,
        },
      }));
      setTakeoverModalWorker(takeoverInfo);
      await refetch();
    } catch (err: any) {
      setTestError(`Übernahme fehlgeschlagen für ${agentId}: ${err?.message || String(err)}`);
    } finally {
      setTakingOverWorkerId(null);
    }
  };

  const handleResumeScheduler = (agentId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
    setTakeoverModalWorker(null);
    void refetch();
  };

  const handleCaptureScreenshot = useCallback(async (agentId: string) => {
    if (inFlightCaptures.current.has(agentId)) return;
    inFlightCaptures.current.add(agentId);
    setCapturingWorkerId(agentId);
    try {
      const res = await captureSwarmWorkerScreenshot(agentId);
      if (res.ok && res.screenshot) {
        setLocalScreenshots((prev) => ({ ...prev, [agentId]: res.screenshot! }));
      }
    } catch (err: any) {
      console.warn("Screenshot capture error:", err);
    } finally {
      inFlightCaptures.current.delete(agentId);
      setCapturingWorkerId(null);
    }
  }, []);

  const handleStopAll = async () => {
    setIsRunning(true);
    // Alle Kacheln auf stopped setzen
    setOverrides((prev) => {
      const next = { ...prev };
      for (let i = 1; i <= 20; i++) {
        const pad = String(i).padStart(2, "0");
        next[`swarm20-agent-${pad}`] = { status: "stopped", schedulerPaused: true };
      }
      return next;
    });

    try {
      await stopAllSwarm();
      await refetch();
    } catch (err: any) {
      setTestError(`Stop-All fehlgeschlagen: ${err?.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRefreshAllScreenshots = async () => {
    if (!status?.workers) return;
    const active = status.workers.filter((w) => w.status === "busy" || w.tasksCompleted > 0);
    await Promise.all(
      active.map((w) => handleCaptureScreenshot(w.agentId)),
    );
    await refetch();
  };

  // Visibility tracking Callback for individual tiles
  const handleVisibilityChange = useCallback((agentId: string, isVisible: boolean) => {
    setVisibleTileIds((prev) => {
      const next = new Set(prev);
      if (isVisible) next.add(agentId);
      else next.delete(agentId);
      return next;
    });
  }, []);

  // AUTO-REFRESH TIMER: Alle 3 Sekunden (im geforderten 2–5s Fenster), NUR für sichtbare Kacheln, pausierbar
  useEffect(() => {
    if (autoRefreshPaused) return;

    const timer = setInterval(() => {
      if (visibleTileIds.size === 0) return;

      // Iteriere über alle sichtbaren Kacheln, deren Worker aktiv sind oder bereits laufen
      for (const agentId of visibleTileIds) {
        const workerOverride = overrides[agentId];
        if (workerOverride?.status === "stopped") continue;

        // Wenn der Worker gerade nicht gecaptured wird, frische Screenshot auf
        if (!inFlightCaptures.current.has(agentId)) {
          void handleCaptureScreenshot(agentId);
        }
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [autoRefreshPaused, visibleTileIds, overrides, handleCaptureScreenshot]);

  const sys = status?.systemMetrics || {
    cpuPercent: 0,
    totalMemMb: 0,
    freeMemMb: 0,
    usedMemMb: 0,
    memPercent: 0,
  };
  const lim = status?.limits || {
    maxConcurrent: 20,
    maxCpuPercent: 85,
    minFreeMemMb: 1024,
    maxMemPercent: 90,
  };

  // IMMER GENAU 20 KACHELN DARSTELLEN (Index 1 bis 20, auch im Idle/Leerzustand)
  const existingWorkers = status?.workers || [];
  const tiles = useMemo(() => {
    return Array.from({ length: 20 }).map((_, idx) => {
      const pad = String(idx + 1).padStart(2, "0");
      const expectedId = `swarm20-agent-${pad}`;
      const found = existingWorkers.find((w) => w.agentId === expectedId) || existingWorkers[idx];
      const override = overrides[expectedId];

      const base = found
        ? {
            ...found,
            indexNum: idx + 1,
          }
        : {
            agentId: expectedId,
            agentName: `Swarm20 Bot ${pad}`,
            profileDir: `%LOCALAPPDATA%\\ConnectAgents\\${expectedId}\\helium`,
            cdpPort: 9400 + idx,
            status: "idle" as const,
            crashCount: 0,
            tasksCompleted: 0,
            lastActiveAt: new Date().toISOString(),
            indexNum: idx + 1,
            lastScreenshot: null,
            lastUrl: "about:blank",
            lastTitle: "Bereit für Aufgaben",
          };

      // Lokale Übersteuerung (z.B. nach Klick auf Stop oder Übernehmen)
      const effectiveStatus = override?.status || (base.status as any);
      const effectiveScreenshot = localScreenshots[expectedId] || base.lastScreenshot;

      return {
        ...base,
        status: effectiveStatus,
        schedulerPaused: !!override?.schedulerPaused,
        lastScreenshot: effectiveScreenshot,
      };
    });
  }, [existingWorkers, overrides, localScreenshots]);

  const progress = status?.overallProgress || {
    totalTasks: status?.completedTasks || 0,
    completedTasks: status?.completedTasks || 0,
    failedTasks: status?.failedTasks || 0,
    runningTasks: status?.runningTasks || 0,
    queuedTasks: status?.queueLength || 0,
    percent: 100,
  };

  if (isLoading && !status) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-sm text-muted-foreground gap-3">
        <IconLoader2 className="size-6 animate-spin text-emerald-500" />
        <span className="font-medium text-foreground">Swarm-Dashboard mit 20 Kacheln wird initialisiert...</span>
        <span className="text-xs text-muted-foreground">Profil-Isolation & 20 isolierte Helium-Profile werden geprüft</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-card/60 p-4 shadow-sm" data-testid="swarm-dashboard">
      {/* Header mit Swarm-Titel, Live-Status und Profil-Schutz */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <IconServer className="size-4" />
            </div>
            <h3 className="font-bold text-base tracking-tight text-foreground">
              Swarm-Dashboard: 20 Browser-Agenten
            </h3>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Raster mit 20 Kacheln
            </span>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Live-Screenshots · Status · Stop · Übernehmen
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Echte parallele Browser-Steuerung mit 20 isolierten Helium-Profilen, Überwachung, automatischer Crash-Recovery und Lastgrenzen.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Pausierbarer Auto-Refresh-Schalter */}
          <Button
            size="sm"
            variant={autoRefreshPaused ? "secondary" : "outline"}
            onClick={() => setAutoRefreshPaused((prev) => !prev)}
            className={cn(
              "h-8 text-xs gap-1.5 border-border/60 transition-colors",
              autoRefreshPaused
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                : "border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
            )}
            title={
              autoRefreshPaused
                ? "Auto-Refresh der Live-Screenshots fortsetzen (2–5s Intervall)"
                : "Auto-Refresh der Live-Screenshots pausieren"
            }
          >
            {autoRefreshPaused ? (
              <>
                <IconPlayerPlay className="size-3.5 text-amber-500" />
                <span>Auto-Refresh: Pausiert</span>
              </>
            ) : (
              <>
                <IconPlayerPause className="size-3.5 text-blue-500 animate-pulse" />
                <span>Screenshots: Auto (3s)</span>
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleRefreshAllScreenshots}
            className="h-8 text-xs gap-1.5 border-border/60"
            title="Screenshots aller sichtbaren/aktiven Agenten sofort aktualisieren"
          >
            <IconCamera className="size-3.5 text-blue-500" />
            <span>Neu laden</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="h-8 text-xs gap-1.5"
            title="Swarm-Status und Aufgabenliste neu abfragen"
          >
            <IconRefresh className="size-3.5" />
            <span>Aktualisieren</span>
          </Button>
        </div>
      </div>

      {/* Stefan Helium Profile Protection Banner */}
      <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/10 px-3.5 py-2.5 border border-emerald-500/25 text-xs text-emerald-800 dark:text-emerald-300">
        <IconShieldCheck className="size-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="flex-1 text-[11.5px] leading-relaxed">
          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
            Helium-Profil-Schutz aktiv:
          </span>{" "}
          Jeder der 20 Swarm-Agenten erhält ein eigenes, isoliertes Profil unter{" "}
          <code className="text-[11px] bg-background/60 px-1 py-0.5 rounded font-mono text-foreground">
            %LOCALAPPDATA%\ConnectAgents\&lt;agentId&gt;\helium
          </code>
          . Stefans persönliches Helium-Profil bleibt unberührt und geschützt.
        </div>
      </div>

      {/* Gesamtfortschritt & System-Metriken (done/total, failed, %, CPU/RAM) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Gesamtfortschritt Bar */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <IconActivity className="size-4 text-emerald-500" />
              Gesamtfortschritt
            </span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
              {progress.percent}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted/60 p-0.5 border border-border/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
              style={{ width: `${Math.max(5, Math.min(100, progress.percent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
            <span>
              <strong className="text-foreground">{progress.completedTasks}</strong>/{progress.totalTasks || progress.completedTasks} erledigt
            </span>
            <span>
              <strong className="text-foreground">{progress.runningTasks}</strong> aktiv
            </span>
            <span>
              <strong className="text-destructive">{progress.failedTasks}</strong> fehlgeschlagen
            </span>
            <span>
              <strong className="text-blue-500">{status?.totalCrashesRecovered || 0}</strong> repariert
            </span>
          </div>
        </div>

        {/* CPU Gauge */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <IconCpu className="size-4 text-blue-500" />
              CPU-Auslastung
            </span>
            <span className="font-mono text-muted-foreground text-xs">
              {sys.cpuPercent}% (Grenze: {lim.maxCpuPercent}%)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full transition-all duration-300 ${
                sys.cpuPercent > lim.maxCpuPercent
                  ? "bg-destructive"
                  : sys.cpuPercent > 60
                  ? "bg-amber-500"
                  : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(100, sys.cpuPercent)}%` }}
            />
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            {sys.cpuPercent > lim.maxCpuPercent
              ? "Drossel aktiv: CPU-Grenze überschritten"
              : "CPU im optimalen Bereich"}
          </p>
        </div>

        {/* RAM Gauge */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <IconActivity className="size-4 text-purple-500" />
              Arbeitsspeicher (RAM)
            </span>
            <span className="font-mono text-muted-foreground text-xs">
              {sys.memPercent}% ({sys.freeMemMb} MB frei)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full transition-all duration-300 ${
                sys.memPercent > lim.maxMemPercent
                  ? "bg-destructive"
                  : sys.memPercent > 75
                  ? "bg-amber-500"
                  : "bg-purple-500"
              }`}
              style={{ width: `${Math.min(100, sys.memPercent)}%` }}
            />
          </div>
          <p className="text-[10.5px] text-muted-foreground">
            Genutzt: {sys.usedMemMb} MB / {sys.totalMemMb} MB (Min. frei: {lim.minFreeMemMb} MB)
          </p>
        </div>
      </div>

      {/* Globale Swarm-Steuerung & Batch-Aktionen */}
      <div className="rounded-xl border border-border/50 bg-muted/15 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-foreground mr-1">Batch starten:</span>
            <Button
              size="sm"
              variant="default"
              disabled={isRunning}
              onClick={() => runSwarm.mutate({ count: 3, url: customUrl })}
              className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isRunning && runSwarm.variables?.count === 3 ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconPlayerPlay className="size-3.5" />
              )}
              Erst mit 3 testen
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isRunning}
              onClick={() => runSwarm.mutate({ count: 10, url: customUrl })}
              className="h-8 text-xs gap-1.5"
            >
              {isRunning && runSwarm.variables?.count === 10 ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconUsers className="size-3.5" />
              )}
              Dann mit 10 testen
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() => runSwarm.mutate({ count: 20, url: customUrl })}
              className="h-8 text-xs gap-1.5 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold"
            >
              {isRunning && runSwarm.variables?.count === 20 ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconServer className="size-3.5" />
              )}
              Dann mit 20 parallel (Volllast)
            </Button>
          </div>

          <Button
            size="sm"
            variant="destructive"
            disabled={isRunning}
            onClick={handleStopAll}
            className="h-8 text-xs gap-1.5"
            title="Alle laufenden Worker anhalten und Warteschlange leeren"
          >
            <IconPlayerStop className="size-3.5" />
            Alle stoppen
          </Button>
        </div>

        {/* Custom URL & Task Input */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
            <span className="text-[11px] font-medium text-muted-foreground shrink-0">Ziel-URL:</span>
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="z.B. https://news.ycombinator.com oder about:blank"
              className="h-7.5 w-full rounded-md border border-border/60 bg-background/80 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={customAction}
              onChange={(e) => setCustomAction(e.target.value as any)}
              className="h-7.5 rounded-md border border-border/60 bg-background/80 px-2 text-xs text-foreground focus:outline-none"
            >
              <option value="navigate">navigate</option>
              <option value="screenshot">screenshot</option>
              <option value="evaluate">evaluate</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() => runSwarm.mutate({ count: 20, url: customUrl, action: customAction })}
              className="h-7.5 text-xs gap-1"
            >
              <IconSparkles className="size-3 text-amber-500" />
              Auf allen 20 ausführen
            </Button>
          </div>
        </div>

        {testError ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive border border-destructive/20">
            <div className="flex items-center gap-2">
              <IconAlertTriangle className="size-4 shrink-0" />
              <span>{testError}</span>
            </div>
            <button
              type="button"
              onClick={() => setTestError(null)}
              className="text-destructive/70 hover:text-destructive text-xs"
            >
              <IconX className="size-4" />
            </button>
          </div>
        ) : null}

        {testResult ? (
          <div className="rounded-lg bg-muted/30 border border-border/50 p-2.5 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                <IconCheck className="size-4" />
                <span>
                  Batch-Run abgeschlossen: {testResult.completed}/{testResult.totalTasks} erfolgreich
                  in {testResult.durationMs}ms ({testResult.concurrency} Agenten parallel)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTestResult(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                <IconX className="size-3.5" />
              </button>
            </div>
            {testResult.crashesRecovered > 0 ? (
              <p className="text-[11.5px] text-blue-500">
                {testResult.crashesRecovered} Abstürze automatisch repariert.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* RASTER MIT GENAU 20 KACHELN */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <IconServer className="size-3.5 text-emerald-500" />
            Swarm-Raster (20 Agenten-Kacheln)
          </h4>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>
              <strong className="text-foreground">{tiles.filter((t) => t.status === "busy").length}</strong> aktiv
            </span>
            <span>
              <strong className="text-foreground">{tiles.filter((t) => t.status === "takeover").length}</strong> übernommen
            </span>
            <span>
              <strong className="text-foreground">{tiles.filter((t) => t.status === "stopped").length}</strong> gestoppt
            </span>
            <span className="hidden sm:inline border-l border-border/60 pl-3">
              {visibleTileIds.size} Kacheln im Sichtfeld
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {tiles.map((worker) => {
            const isWorkerBusy = worker.status === "busy";
            const isWorkerStopped = worker.status === "stopped";
            const isWorkerTakeover = worker.status === "takeover";
            const isWorkerStopping = stoppingWorkerId === worker.agentId;
            const isWorkerTakingOver = takingOverWorkerId === worker.agentId;
            const isWorkerCapturing = capturingWorkerId === worker.agentId;

            return (
              <SwarmTileCard
                key={worker.agentId}
                worker={worker}
                isBusy={isWorkerBusy}
                isStopped={isWorkerStopped}
                isTakeover={isWorkerTakeover}
                isStopping={isWorkerStopping}
                isTakingOver={isWorkerTakingOver}
                isCapturing={isWorkerCapturing}
                onStop={() => handleStopWorker(worker.agentId)}
                onTakeover={() => handleTakeover(worker.agentId, worker.agentName)}
                onCaptureScreenshot={() => handleCaptureScreenshot(worker.agentId)}
                onOpenPreview={(shotUrl) =>
                  setPreviewScreenshot({
                    agentId: worker.agentId,
                    agentName: worker.agentName,
                    screenshotUrl: shotUrl,
                    url: worker.currentTaskUrl || worker.lastUrl || "about:blank",
                  })
                }
                onVisibilityChange={handleVisibilityChange}
              />
            );
          })}
        </div>
      </div>

      {/* MODAL: CDP / BROWSER-ÜBERNAHME */}
      {takeoverModalWorker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                  <IconExternalLink className="size-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground">
                    Steuerung übernommen: {takeoverModalWorker.agentName}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    CDP-Port {takeoverModalWorker.cdpPort} · Profil isoliert
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTakeoverModalWorker(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconX className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-lg bg-emerald-500/10 p-3 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <IconCheck className="size-3.5" />
                  <span>Scheduler für diesen Worker pausiert</span>
                </div>
                <p className="text-[11.5px]">
                  Der Swarm-Scheduler weist diesem Worker keine neuen automatischen Aufgaben zu, solange Sie die Steuerung haben.
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-medium text-foreground">Isoliertes Helium-Profil:</span>
                <code className="block rounded bg-muted/60 p-2 font-mono text-[10.5px] text-foreground break-all">
                  {takeoverModalWorker.profileDir}
                </code>
              </div>

              <div className="space-y-1">
                <span className="font-medium text-foreground">CDP-Endpunkt (Remote-Debugging):</span>
                <code className="block rounded bg-muted/60 p-2 font-mono text-[10.5px] text-foreground">
                  http://127.0.0.1:{takeoverModalWorker.cdpPort}
                </code>
              </div>

              <div className="space-y-1">
                <span className="font-medium text-foreground">Aktuelle Ziel-URL:</span>
                <code className="block rounded bg-muted/60 p-2 font-mono text-[10.5px] text-foreground truncate">
                  {takeoverModalWorker.url}
                </code>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResumeScheduler(takeoverModalWorker.agentId)}
                className="text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 border-amber-500/30"
              >
                Wieder an Swarm übergeben
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setTakeoverModalWorker(null)}
                  className="text-xs"
                >
                  Schließen
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    window.open(`http://127.0.0.1:${takeoverModalWorker.cdpPort}/json/list`, "_blank");
                  }}
                  className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <IconDeviceDesktop className="size-3.5" />
                  CDP-Ziele ansehen
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL: SCREENSHOT FULLSCREEN PREVIEW */}
      {previewScreenshot ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-card p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  Live-Screenshot: {previewScreenshot.agentName}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {previewScreenshot.url}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewScreenshot(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <div className="relative aspect-[16/10] max-h-[70vh] w-full overflow-hidden rounded-xl border border-border bg-black">
              <img
                src={previewScreenshot.screenshotUrl}
                alt={`Screenshot ${previewScreenshot.agentName}`}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Agent ID: {previewScreenshot.agentId}</span>
              <Button size="sm" variant="secondary" onClick={() => setPreviewScreenshot(null)}>
                Schließen
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Einzeltile-Komponente mit IntersectionObserver für gezielten Screenshot-Refresh
// ============================================================================

interface SwarmTileCardProps {
  worker: any;
  isBusy: boolean;
  isStopped: boolean;
  isTakeover: boolean;
  isStopping: boolean;
  isTakingOver: boolean;
  isCapturing: boolean;
  onStop: () => void;
  onTakeover: () => void;
  onCaptureScreenshot: () => void;
  onOpenPreview: (shotUrl: string) => void;
  onVisibilityChange: (agentId: string, isVisible: boolean) => void;
}

function SwarmTileCard({
  worker,
  isBusy,
  isStopped,
  isTakeover,
  isStopping,
  isTakingOver,
  isCapturing,
  onStop,
  onTakeover,
  onCaptureScreenshot,
  onOpenPreview,
  onVisibilityChange,
}: SwarmTileCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // IntersectionObserver: meldet Sichtbarkeit an Parent für selektiven Screenshot-Refresh
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      onVisibilityChange(worker.agentId, true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        onVisibilityChange(worker.agentId, entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      onVisibilityChange(worker.agentId, false);
    };
  }, [worker.agentId, onVisibilityChange]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "flex flex-col justify-between rounded-xl border bg-card p-3 shadow-xs transition-all hover:border-border",
        isBusy
          ? "border-blue-500/50 shadow-blue-500/5 bg-blue-500/[0.02]"
          : isTakeover
          ? "border-purple-500/50 shadow-purple-500/5 bg-purple-500/[0.02]"
          : isStopped
          ? "border-amber-500/30 opacity-75 bg-muted/10"
          : "border-border/60"
      )}
      data-testid={`swarm-tile-${worker.indexNum}`}
    >
      {/* Kachel-Header */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex size-5 items-center justify-center rounded bg-muted/60 text-[10px] font-bold text-muted-foreground shrink-0 font-mono">
              #{String(worker.indexNum).padStart(2, "0")}
            </span>
            <span className="truncate font-semibold text-xs text-foreground" title={worker.agentName}>
              {worker.agentName}
            </span>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-1 shrink-0">
            <span
              className={cn(
                "size-2 rounded-full shrink-0",
                isTakeover
                  ? "bg-purple-500 ring-2 ring-purple-500/20"
                  : isStopped
                  ? "bg-amber-500 ring-2 ring-amber-500/20"
                  : isBusy
                  ? "bg-blue-500 animate-pulse ring-2 ring-blue-500/20"
                  : worker.status === "restarting"
                  ? "bg-amber-500 animate-pulse ring-2 ring-amber-500/20"
                  : worker.status === "error"
                  ? "bg-destructive ring-2 ring-destructive/20"
                  : "bg-emerald-500"
              )}
            />
            <span className="text-[10px] font-medium capitalize text-muted-foreground">
              {isTakeover
                ? "Übernommen"
                : isStopped
                ? "Gestoppt"
                : isBusy
                ? "Aktiv"
                : worker.status === "restarting"
                ? "Neustart"
                : worker.status === "error"
                ? "Fehler"
                : "Bereit"}
            </span>
          </div>
        </div>

        {/* Port & Crash Information */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>Port {worker.cdpPort}</span>
          {worker.crashCount > 0 ? (
            <span className="text-amber-500 font-sans font-medium">
              {worker.crashCount}x repariert
            </span>
          ) : (
            <span className="text-muted-foreground/70">{worker.tasksCompleted} Tasks</span>
          )}
        </div>

        {/* Live-Screenshot Kachel */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border/50 bg-neutral-900 group">
          {worker.lastScreenshot ? (
            <div
              className="relative h-full w-full cursor-pointer"
              onClick={() => onOpenPreview(worker.lastScreenshot)}
              title="Klicken zum Vergrößern"
            >
              <img
                src={worker.lastScreenshot}
                alt={`Live-Screenshot ${worker.agentName}`}
                className="h-full w-full object-cover transition-transform group-hover:scale-102"
              />
              <div className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[8.5px] font-mono text-emerald-400 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </div>
            </div>
          ) : (
            // Modernes Browser-Mockup als Platzhalter im Leerzustand
            <div className="flex h-full w-full flex-col justify-between p-2 text-neutral-400 bg-gradient-to-b from-neutral-900 to-neutral-950">
              {/* Browser Window Chrome */}
              <div className="flex items-center gap-1.5 border-b border-neutral-800 pb-1">
                <span className="size-1.5 rounded-full bg-neutral-700" />
                <span className="size-1.5 rounded-full bg-neutral-700" />
                <span className="size-1.5 rounded-full bg-neutral-700" />
                <div className="ml-1 flex-1 truncate rounded bg-neutral-800/80 px-1.5 py-0.5 text-[9px] font-mono text-neutral-400">
                  {worker.currentTaskUrl || worker.lastUrl || "about:blank"}
                </div>
              </div>

              {/* Viewport Center */}
              <div className="flex flex-col items-center justify-center my-auto text-center gap-1">
                <IconWorld className="size-5 text-neutral-600" />
                <span className="text-[9.5px] font-medium text-neutral-500">
                  {isTakeover
                    ? "Manuelle Übernahme aktiv"
                    : isStopped
                    ? "Worker gestoppt"
                    : isBusy
                    ? "Ausführung läuft..."
                    : "Bereit für Aufgaben"}
                </span>
              </div>

              {/* Bottom URL pill */}
              <div className="text-[9px] text-neutral-600 font-mono text-center truncate">
                Helium: {worker.agentId}
              </div>
            </div>
          )}

          {/* Screenshot Refresh Button overlay */}
          <button
            type="button"
            disabled={isCapturing}
            onClick={(e) => {
              e.stopPropagation();
              onCaptureScreenshot();
            }}
            className="absolute bottom-1.5 right-1.5 rounded bg-black/70 p-1 text-white hover:bg-black/90 transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Screenshot jetzt aktualisieren"
          >
            {isCapturing ? (
              <IconLoader2 className="size-3 animate-spin" />
            ) : (
              <IconCamera className="size-3" />
            )}
          </button>
        </div>

        {/* Aktuelle Aufgabe (Task Card) */}
        <div className="rounded-md bg-muted/30 p-2 space-y-1 text-[11px] border border-border/30">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              Aufgabe:
            </span>
            <span
              className={cn(
                "rounded px-1.5 py-0.2 text-[9px] font-mono font-medium uppercase",
                isTakeover
                  ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                  : isStopped
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-primary/10 text-primary"
              )}
            >
              {isTakeover ? "TAKEOVER" : isStopped ? "STOPPED" : worker.currentTaskAction || "IDLE"}
            </span>
          </div>
          <p
            className="truncate font-medium text-foreground text-[11px]"
            title={worker.currentTaskTitle || worker.lastTitle || "Keine aktive Aufgabe"}
          >
            {isTakeover
              ? "Interaktive Übernahme im Browser"
              : isStopped
              ? "Ausführung gestoppt"
              : worker.currentTaskTitle || worker.lastTitle || "Bereit für Aufgaben"}
          </p>
          <p
            className="truncate font-mono text-[9.5px] text-muted-foreground"
            title={worker.currentTaskUrl || worker.lastUrl || "about:blank"}
          >
            {worker.currentTaskUrl || worker.lastUrl || "about:blank"}
          </p>
        </div>
      </div>

      {/* Kachel-Aktionen (Stop / Übernehmen) */}
      <div className="mt-2.5 flex items-center gap-1.5 pt-1.5 border-t border-border/40">
        <Button
          size="sm"
          variant="outline"
          disabled={isStopped || isStopping}
          onClick={onStop}
          className="h-7 flex-1 text-[11px] gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 disabled:opacity-40"
          title="Diesen Worker stoppen und Scheduler für ihn pausieren"
        >
          {isStopping ? (
            <IconLoader2 className="size-3 animate-spin" />
          ) : (
            <IconPlayerStop className="size-3" />
          )}
          Stop
        </Button>

        <Button
          size="sm"
          variant="default"
          disabled={isTakingOver}
          onClick={onTakeover}
          className={cn(
            "h-7 flex-1 text-[11px] gap-1 px-2 text-white",
            isTakeover
              ? "bg-purple-600 hover:bg-purple-700"
              : "bg-emerald-600 hover:bg-emerald-700"
          )}
          title="Helium-Browser für diesen Agenten im sichtbaren Fenster öffnen und Steuerung übernehmen"
        >
          {isTakingOver ? (
            <IconLoader2 className="size-3 animate-spin" />
          ) : (
            <IconExternalLink className="size-3" />
          )}
          Übernehmen
        </Button>
      </div>
    </div>
  );
}

