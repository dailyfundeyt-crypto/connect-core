import { IconAlertCircle, IconCheck, IconX } from "@tabler/icons-react";
import { useEffect } from "react";
import type { LifecycleToastState } from "./useBotLifecycle";

export interface BotLifecycleToastProps {
  toast: LifecycleToastState | null;
  onDismiss: () => void;
  durationMs?: number;
}

export function BotLifecycleToast({
  toast,
  onDismiss,
  durationMs = 4000,
}: BotLifecycleToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, durationMs]);

  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 ${
        isError
          ? "border-destructive/40 bg-destructive/15 text-destructive-foreground dark:text-red-200"
          : "border-emerald-500/30 bg-emerald-950/80 text-emerald-200"
      }`}
    >
      {isError ? (
        <IconAlertCircle className="size-4 shrink-0 text-red-400" />
      ) : (
        <IconCheck className="size-4 shrink-0 text-emerald-400" />
      )}
      <span className="flex-1 font-medium leading-tight">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Schließen"
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  );
}

export default BotLifecycleToast;
