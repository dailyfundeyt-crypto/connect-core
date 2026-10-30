import {
  IconAlertCircle,
  IconCheck,
  IconDeviceDesktop,
  IconEye,
  IconKeyboard,
  IconLoader2,
  IconMaximize,
  IconMinimize,
  IconPlayerPlay,
  IconPointer,
  IconRefresh,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PcAppEntry } from "@/contracts/v06/pc-apps";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Button as DesignButton } from "@/v06/design/Button";

export interface PcAppPreviewProps {
  app: PcAppEntry;
  onClose?: () => void;
  className?: string;
  isEmbedded?: boolean;
}

interface AppStatus {
  appId: string;
  running: boolean;
  windowFound: boolean;
  window?: {
    hwnd: number;
    title: string;
    pid: number;
    bounds: { x: number; y: number; width: number; height: number };
  } | null;
}

export function PcAppPreview({
  app,
  onClose,
  className = "",
  isEmbedded = false,
}: PcAppPreviewProps) {
  const isDesignV2 = getFlag("designV2");
  // Steuern-Modus: Aus Sicherheitsgründen standardmäßig AUS (nur Beobachten)
  const [driving, setDriving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [qualityMode, setQualityMode] = useState<"1080p" | "720p">("1080p");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });
  const [promptText, setPromptText] = useState("");
  const [sentFeedback, setSentFeedback] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(Date.now());
  const drivingRef = useRef(driving);
  drivingRef.current = driving;
  const qualityRef = useRef(qualityMode);
  qualityRef.current = qualityMode;

  // 1. Status der App abrufen
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/v06/pc-apps/${encodeURIComponent(app.id)}/status`);
      if (res.ok) {
        const data = (await res.json()) as AppStatus;
        setStatus(data);
        if (data.window?.bounds) {
          setResolution({
            width: data.window.bounds.width,
            height: data.window.bounds.height,
          });
        }
        if (!data.running) {
          setProblem("Anwendung läuft derzeit nicht auf dem Host-PC.");
        } else if (!data.windowFound) {
          setProblem("Anwendungsfenster konnte noch nicht gefunden werden.");
        } else {
          setProblem(null);
        }
      }
    } catch {
      setProblem("Verbindung zum Connect-Server fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [app.id]);

  // 2. Anwendung auf Host-PC starten
  const handleLaunch = async () => {
    setLaunching(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/v06/pc-apps/${encodeURIComponent(app.id)}/launch`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Start fehlgeschlagen");
      }
      setTimeout(() => {
        void refreshStatus();
        setLaunching(false);
      }, 1500);
    } catch (err: any) {
      setProblem(err.message || "Start fehlgeschlagen.");
      setLaunching(false);
    }
  };

  // 3. Frame-Polling & Rendering Loop (Adaptiver Loop: 15-20 FPS aktiv, 1 FPS Leerlauf)
  useEffect(() => {
    let active = true;

    const fetchNextFrame = async () => {
      if (!active) return;

      const t0 = performance.now();
      try {
        const maxW = qualityRef.current === "720p" ? 1280 : 1920;
        const maxH = qualityRef.current === "720p" ? 720 : 1080;
        const res = await fetch(
          `/api/v06/pc-apps/${encodeURIComponent(app.id)}/capture?maxWidth=${maxW}&maxHeight=${maxH}`,
        );
        if (res.ok && active) {
          const json = await res.json();
          if (json.ok && json.data) {
            const dur = Math.round(performance.now() - t0);
            setLatencyMs(dur);

            // Frame decodieren und auf Canvas zeichnen
            const img = new Image();
            img.onload = () => {
              if (!active || !canvasRef.current) return;
              const canvas = canvasRef.current;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                if (canvas.width !== img.width || canvas.height !== img.height) {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  setResolution({ width: img.width, height: img.height });
                }
                ctx.drawImage(img, 0, 0);
              }

              // FPS Zähler
              frameCountRef.current++;
              const now = Date.now();
              if (now - fpsTimerRef.current >= 1000) {
                setFps(frameCountRef.current);
                frameCountRef.current = 0;
                fpsTimerRef.current = now;
              }
            };
            img.src = `data:image/jpeg;base64,${json.data}`;
          }
        }
      } catch {
        // Bei Netzwerkunterbrechung retry
      }

      // Adaptives Intervall: 50ms bei aktiver Steuerung (~20 FPS), 1000ms bei passivem Schauen
      const interval = drivingRef.current ? 50 : 1000;
      if (active) {
        pollingRef.current = setTimeout(fetchNextFrame, interval);
      }
    };

    void refreshStatus();
    void fetchNextFrame();

    return () => {
      active = false;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, [app.id, refreshStatus]);

  // 4. Eingabe-Injektion (nur bei driving=true)
  const sendInput = useCallback(
    async (eventPayload: Record<string, unknown>) => {
      if (!driving) return;
      try {
        await fetch(`/api/v06/pc-apps/${encodeURIComponent(app.id)}/input`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            driving: true,
            event: eventPayload,
          }),
        });
      } catch {}
    },
    [app.id, driving],
  );

  // Klick auf Canvas mit akkurater Skalierung auf native Fensterauflösung
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!driving || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const nativeW = status?.window?.bounds?.width || canvas.width;
    const nativeH = status?.window?.bounds?.height || canvas.height;

    const scaleX = nativeW / rect.width;
    const scaleY = nativeH / rect.height;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";

    void sendInput({
      type: "mouse",
      event: "pressed",
      x,
      y,
      button,
    });
  };

  // Mausrad
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!driving) return;
    e.preventDefault();
    void sendInput({
      type: "wheel",
      deltaY: e.deltaY,
    });
  };

  // Tastatureingaben
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!driving) return;
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
      return;
    }
    void sendInput({
      type: "key",
      event: "down",
      key: e.key,
      code: e.code,
      windowsVirtualKeyCode: e.keyCode,
    });
  };

  // Prompt / Text an die App senden
  const handleSendPrompt = (submit: boolean) => {
    if (!promptText.trim()) return;
    void sendInput({
      type: "prompt",
      text: promptText,
      submit,
    });
    setPromptText("");
    setSentFeedback(true);
    setTimeout(() => setSentFeedback(false), 2000);
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={cn(
        "flex flex-col outline-none transition-colors",
        isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "bg-background text-foreground",
        fullscreen ? "fixed inset-0 z-50" : isEmbedded ? "h-full w-full" : isDesignV2 ? "h-[620px] rounded-[var(--p-radius-lg)] border border-[var(--p-border)] shadow-[var(--p-shadow-lg)]" : "h-[620px] rounded-xl border border-border shadow-lg",
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 transition-colors",
          isDesignV2
            ? "border-b border-[var(--p-border)] bg-[var(--p-surface-1)]"
            : "border-b border-border bg-card/60",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-lg",
              isDesignV2
                ? "border border-[var(--p-accent)]/20 bg-[var(--p-accent-subtle)] text-[var(--p-accent)] rounded-[var(--p-radius-sm)]"
                : "bg-primary/10 text-primary",
            )}
          >
            <IconDeviceDesktop className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-xs">{app.name}</span>
              {status?.running && status?.windowFound ? (
                <span
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.2 text-[10px]",
                    isDesignV2
                      ? "rounded-[var(--p-radius-xs)] border border-[var(--p-success)]/20 bg-[var(--p-success-subtle)] text-[var(--p-success)]"
                      : "rounded-full bg-emerald-500/10 text-emerald-500",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isDesignV2 ? "bg-[var(--p-success)]" : "bg-emerald-500",
                    )}
                  />
                  Live
                </span>
              ) : (
                <span
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.2 text-[10px]",
                    isDesignV2
                      ? "rounded-[var(--p-radius-xs)] border border-[var(--p-warning)]/20 bg-[var(--p-warning-subtle)] text-[var(--p-warning)]"
                      : "rounded-full bg-amber-500/10 text-amber-500",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isDesignV2 ? "bg-[var(--p-warning)]" : "bg-amber-500",
                    )}
                  />
                  Offline
                </span>
              )}
            </div>
            <p
              className={cn(
                "truncate text-[10px]",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
              )}
            >
              {status?.window?.title || app.exePath}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Auflösungs-Umschaltung */}
          <div
            className={cn(
              "flex items-center p-0.5 text-[10px] transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)]"
                : "rounded-lg border border-border bg-muted/20",
            )}
          >
            <button
              type="button"
              onClick={() => setQualityMode("1080p")}
              className={cn(
                "px-1.5 py-0.5 transition-colors",
                qualityMode === "1080p"
                  ? isDesignV2
                    ? "rounded-[var(--p-radius-xs)] border border-[var(--p-border-strong)] bg-[var(--p-surface-1)] font-medium text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)]"
                    : "rounded bg-background font-medium text-foreground shadow-xs"
                  : isDesignV2
                    ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                    : "text-muted-foreground hover:text-foreground",
              )}
              title="1080p FullHD: Optimale Schärfe für Schnittfenster & Timelines"
            >
              1080p
            </button>
            <button
              type="button"
              onClick={() => setQualityMode("720p")}
              className={cn(
                "px-1.5 py-0.5 transition-colors",
                qualityMode === "720p"
                  ? isDesignV2
                    ? "rounded-[var(--p-radius-xs)] border border-[var(--p-border-strong)] bg-[var(--p-surface-1)] font-medium text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)]"
                    : "rounded bg-background font-medium text-foreground shadow-xs"
                  : isDesignV2
                    ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                    : "text-muted-foreground hover:text-foreground",
              )}
              title="720p Eco: Minimale CPU-Last"
            >
              720p
            </button>
          </div>

          {/* Steuern-Umschalter (Driving Mode) */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)]"
                : "rounded-lg border border-border bg-muted/30",
            )}
          >
            <Switch
              id={`driving-mode-${app.id}`}
              checked={driving}
              onCheckedChange={setDriving}
              className="data-[state=checked]:bg-emerald-500"
            />
            <label
              htmlFor={`driving-mode-${app.id}`}
              className="flex cursor-pointer items-center gap-1 text-[11px] font-medium"
            >
              {driving ? (
                <>
                  <IconPointer className="size-3 text-emerald-500" />
                  <span className="text-emerald-500">Steuern aktiv</span>
                </>
              ) : (
                <>
                  <IconEye
                    className={cn(
                      "size-3",
                      isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                    )}
                  >
                    Nur Beobachten
                  </span>
                </>
              )}
            </label>
          </div>

          {!status?.running ? (
            isDesignV2 ? (
              <DesignButton
                size="sm"
                variant="secondary"
                onClick={handleLaunch}
                loading={launching}
                leftIcon={!launching ? <IconPlayerPlay className="size-3 text-[var(--p-accent)]" /> : null}
                className="h-7 text-xs"
              >
                App starten
              </DesignButton>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLaunch}
                disabled={launching}
                className="h-7 gap-1 text-xs"
              >
                {launching ? (
                  <IconLoader2 className="size-3 animate-spin" />
                ) : (
                  <IconPlayerPlay className="size-3" />
                )}
                App starten
              </Button>
            )
          ) : null}

          <Button
            size="icon"
            variant="ghost"
            onClick={() => void refreshStatus()}
            className={cn(
              "size-7",
              isDesignV2 && "text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]",
            )}
            title="Aktualisieren"
          >
            <IconRefresh className="size-3.5" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFullscreen((v) => !v)}
            className={cn(
              "size-7",
              isDesignV2 && "text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]",
            )}
            title={fullscreen ? "Vollbild beenden" : "Vollbild"}
          >
            {fullscreen ? (
              <IconMinimize className="size-3.5" />
            ) : (
              <IconMaximize className="size-3.5" />
            )}
          </Button>

          {onClose ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className={cn(
                "size-7",
                isDesignV2
                  ? "text-[var(--p-text-3)] hover:text-[var(--p-danger)] hover:bg-[var(--p-danger-subtle)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Vorschau schließen"
            >
              <IconX className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main Screen Viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black/95">
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
            <IconLoader2
              className={cn(
                "size-6 animate-spin",
                isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
              )}
            />
            <span className={cn(isDesignV2 ? "text-[var(--p-text-3)]" : "")}>Verbinde mit PC-App …</span>
          </div>
        ) : null}

        {problem ? (
          <div
            className={cn(
              "absolute top-3 z-10 flex items-center gap-2 px-3 py-1.5 text-xs shadow-sm",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-warning)]/30 bg-[var(--p-warning-subtle)] text-[var(--p-warning)] font-medium"
                : "rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500",
            )}
          >
            <IconAlertCircle className="size-4 shrink-0" />
            <span>{problem}</span>
            {!status?.running ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLaunch}
                disabled={launching}
                className={cn(
                  "ml-2 h-6 text-[10px]",
                  isDesignV2 && "border-[var(--p-warning)]/30 text-[var(--p-warning)] hover:bg-[var(--p-warning)]/10",
                )}
              >
                Jetzt starten
              </Button>
            ) : null}
          </div>
        ) : null}

        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onContextMenu={(e) => {
            e.preventDefault();
            handleCanvasClick(e);
          }}
          onWheel={handleWheel}
          className={`max-h-full max-w-full object-contain ${
            driving ? "cursor-crosshair" : "cursor-default"
          }`}
        />

        {/* Telemetrie Overlay */}
        <div className="absolute right-2 bottom-2 flex items-center gap-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/70 backdrop-blur">
          <span>{resolution.width}x{resolution.height}</span>
          <span>·</span>
          <span>{fps} FPS</span>
          <span>·</span>
          <span>{latencyMs}ms Latenz</span>
        </div>
      </div>

      {/* Prompt / Input Bar */}
      <div
        className={cn(
          "p-2 transition-colors",
          isDesignV2 ? "border-t border-[var(--p-border)] bg-[var(--p-surface-1)]" : "border-t border-border bg-card/40",
        )}
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendPrompt(true);
              }
            }}
            placeholder={`Text oder Befehl an ${app.name} senden …`}
            disabled={!driving}
            className={cn(
              "h-8 flex-1 px-2.5 text-xs outline-none transition-colors disabled:opacity-50",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-border-focus)] shadow-[var(--p-shadow-sm)]"
                : "rounded-lg border border-border bg-background focus:border-primary",
            )}
          />
          {isDesignV2 ? (
            <>
              <DesignButton
                size="sm"
                variant="primary"
                onClick={() => handleSendPrompt(true)}
                disabled={!driving || !promptText.trim()}
                leftIcon={<IconSend className="size-3" />}
                className="h-8 text-xs"
              >
                Senden
              </DesignButton>
              <DesignButton
                size="sm"
                variant="secondary"
                onClick={() => handleSendPrompt(false)}
                disabled={!driving || !promptText.trim()}
                className="h-8 text-[11px]"
                title="Nur Text tippen ohne Enter"
              >
                Tippen
              </DesignButton>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => handleSendPrompt(true)}
                disabled={!driving || !promptText.trim()}
                className="h-8 gap-1 text-xs"
              >
                <IconSend className="size-3" />
                Senden
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSendPrompt(false)}
                disabled={!driving || !promptText.trim()}
                className="h-8 text-[11px]"
                title="Nur Text tippen ohne Enter"
              >
                Tippen
              </Button>
            </>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[10px]">
          <span className={cn(isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>
            {driving
              ? "Klicks & Tastatur gehen direkt an das Windows-Fenster."
              : "Steuern-Schalter oben aktivieren, um Maus und Tastatur weiterzuleiten."}
          </span>
          {sentFeedback ? (
            <span
              className={cn(
                "flex items-center gap-1 font-medium",
                isDesignV2 ? "text-[var(--p-success)]" : "text-emerald-400",
              )}
            >
              <IconCheck className="size-3" /> Gesendet
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default PcAppPreview;
