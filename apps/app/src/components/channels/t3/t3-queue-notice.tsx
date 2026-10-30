/**
 * T3-Bridge — Warteschlangen-Hinweis (Lane A22).
 *
 * Zeigt den Wartezustand bei ausgelastetem Sidecar oder Concurrency-Limits an:
 * „wartet (Platz 3)“
 */

import { Clock, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type T3QueueNoticeProps = {
  /** Platz in der Warteschlange, z. B. 3 */
  position?: number;
  /** Optionaler detaillierterer Grund */
  reason?: string;
  /** Optionaler Abbruch-Callback für die Queue */
  onCancel?: () => void;
  /** Kompakte Darstellung (z. B. als kleine Fußzeile) */
  compact?: boolean;
  className?: string;
};

export function T3QueueNotice({
  position = 3,
  reason,
  onCancel,
  compact = false,
  className,
}: T3QueueNoticeProps) {
  const queueLabel = position > 0 ? `wartet (Platz ${position})` : "wartet auf Ausführung";

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-mono",
          className
        )}
        role="status"
      >
        <Loader2 className="size-3 animate-spin shrink-0" />
        <span>{queueLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-2 flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-700 dark:text-amber-300",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Clock className="size-3.5 shrink-0 animate-pulse text-amber-600 dark:text-amber-400" />
        <span className="font-medium">{queueLabel}</span>
        {reason ? (
          <span className="text-muted-foreground hidden sm:inline">· {reason}</span>
        ) : (
          <span className="text-muted-foreground/75 hidden sm:inline">
            · T3 Sidecar verarbeitet vorherige Aufgaben
          </span>
        )}
      </div>

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-amber-500/10 hover:text-foreground transition-colors"
          title="Aus Warteschlange abbrechen"
        >
          <XCircle className="size-3" />
          Abbrechen
        </button>
      ) : null}
    </div>
  );
}

/**
 * Statuszeile unter einer Nachricht im Chat-Verlauf (analog CloudMessageStatusLine).
 */
export function T3MessageStatusLine({
  status,
  queuePosition,
  error,
  tokens,
  className,
}: {
  status?: string;
  queuePosition?: number;
  error?: string;
  tokens?: number;
  className?: string;
}) {
  if (!status && !tokens && !error) return null;

  const isQueued = status === "queued" || (queuePosition !== undefined && queuePosition > 0);
  const isFailed = status === "error" || Boolean(error);
  const isRunning = status === "running";

  return (
    <p
      className={cn(
        "mt-1 text-right text-[11px] select-none",
        isFailed
          ? "text-destructive"
          : isQueued
            ? "text-amber-600 dark:text-amber-400 font-medium"
            : isRunning
              ? "text-primary animate-pulse"
              : "text-muted-foreground",
        className
      )}
      role="status"
    >
      {isQueued ? (
        <span>wartet (Platz {queuePosition ?? 1})</span>
      ) : isRunning ? (
        <span>generiert…</span>
      ) : isFailed ? (
        <span>Fehlgeschlagen{error ? `: ${error}` : ""}</span>
      ) : (
        <span>
          Erledigt{tokens ? ` · ${tokens.toLocaleString("de-DE")} Tokens` : ""}
        </span>
      )}
    </p>
  );
}
