/**
 * Vollbild-Offline-Screen für Connect Sozial.
 *
 * Wird angezeigt, wenn `useOnline()` meldet, dass keine Verbindung besteht.
 * Zeigt die Kein-Internet-Animation als Video und einen „Erneut verbinden"-
 * Button, der einen erzwungenen Health-Check anstößt.
 *
 * Die Animation liegt unter `/kein-internet.mp4` (public/).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { IconRefresh, IconWifiOff } from "@tabler/icons-react";
import { useOnline } from "../hooks/use-online";
import { cn } from "@/lib/utils";

export function OfflineScreen({ onRetry }: { onRetry?: () => void }) {
  const { reported, verified, lastChecked } = useOnline();
  const [retrying, setRetrying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const retry = useCallback(async () => {
    setRetrying(true);
    onRetry?.();
    // Lade das Video neu — viele Caches halten das MP4 sonst weiter im
    // Offline-Modus, obwohl die Verbindung zurück ist.
    try {
      const v = videoRef.current;
      if (v) {
        v.load();
        await v.play().catch(() => {
          /* autoplay-block, ok */
        });
      }
    } catch {
      // ignorieren
    }
    // Einen Moment warten, damit der Health-Check von `useOnline` läuft,
    // dann den Retrying-Spinner ausblenden.
    window.setTimeout(() => setRetrying(false), 1_500);
  }, [onRetry]);

  useEffect(() => {
    // Wenn das Element gemountet wird, sicherstellen, dass das Video abspielt.
    videoRef.current?.play().catch(() => {
      /* Browser-Autoplay-Policy — egal. */
    });
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0c] text-white"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <IconWifiOff className="size-8 text-rose-300" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] shadow-2xl">
          {/* Animation: lokales MP4, fällt offline nicht aus */}
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            poster="/kein-internet.svg"
            className="block max-h-72 w-full object-cover"
            src="/kein-internet.mp4"
            aria-label="Kein Internet Animation"
          />
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Kein Internet
          </h1>
          <p className="text-sm text-white/60">
            Connect Sozial braucht eine Verbindung, damit Beiträge,
            Nachrichten und Live-Feeds funktionieren. Wir versuchen es
            automatisch erneut.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition",
              retrying ? "opacity-60" : "hover:bg-white/90",
            )}
          >
            <IconRefresh
              className={cn("size-4", retrying && "animate-spin")}
            />
            {retrying ? "Verbinde …" : "Erneut verbinden"}
          </button>
          <p className="text-[11px] text-white/40">
            Status:&nbsp;
            <span className="font-mono">
              {reported ? "Browser: online" : "Browser: offline"}
              {verified === false ? " · Server: nicht erreichbar" : ""}
              {lastChecked ? ` · ${new Date(lastChecked).toLocaleTimeString()}` : ""}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
