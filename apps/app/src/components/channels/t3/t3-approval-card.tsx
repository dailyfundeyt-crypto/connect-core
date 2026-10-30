/**
 * T3-Bridge — Freigabe-Karte (Lane A22).
 *
 * Zeigt interaktive Freigaben für sicherheitsrelevante CLI- und Tool-Aktionen:
 * „Darf <CLI> … ? [Erlauben] [Ablehnen]“
 */

import { useState } from "react";
import type { ConnectChatApprovalItem, T3ApprovalDecision } from "@/lib/t3";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, ShieldX, Check, X, Shield, Lock } from "lucide-react";

export type T3ApprovalCardProps = {
  item: ConnectChatApprovalItem;
  cliName?: string;
  onRespond?: (
    requestId: string,
    decision: T3ApprovalDecision,
    options?: { feedback?: string }
  ) => Promise<unknown> | void;
  className?: string;
  disabled?: boolean;
};

/**
 * Erzeugt die Frage „Darf <CLI> … ?“, falls im Titel noch nicht so formuliert.
 */
export function formatApprovalQuestion(title: string, cliName?: string): string {
  const cli = cliName || "CLI";
  const trimmed = title.trim();

  // Falls der Titel bereits als Frage "Darf ..." formuliert ist
  if (/^darf\b/i.test(trimmed)) {
    return trimmed;
  }

  // Falls der Titel mit "CLI ..." oder ähnlich beginnt
  if (trimmed.toLowerCase().includes("erlauben") || trimmed.toLowerCase().includes("freigabe")) {
    return `Darf ${cli} diese Aktion ausführen?`;
  }

  return `Darf ${cli} ${trimmed}${trimmed.endsWith("?") ? "" : " ?"}`;
}

export function T3ApprovalCard({
  item,
  cliName,
  onRespond,
  className,
  disabled = false,
}: T3ApprovalCardProps) {
  const [submitting, setSubmitting] = useState<T3ApprovalDecision | null>(null);
  const [localDecision, setLocalDecision] = useState<T3ApprovalDecision | null>(null);

  const isResolved =
    item.status === "done" ||
    item.status === "cancelled" ||
    localDecision !== null;

  const resolvedDecision: T3ApprovalDecision | null =
    localDecision ?? (item.status === "done" ? "allow" : item.status === "cancelled" ? "deny" : null);

  const question = formatApprovalQuestion(item.title, cliName);

  const handleDecision = async (decision: T3ApprovalDecision) => {
    if (disabled || submitting || isResolved) return;
    setSubmitting(decision);
    try {
      if (onRespond) {
        await onRespond(item.requestId, decision);
      }
      setLocalDecision(decision);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      className={cn(
        "my-3 w-full max-w-xl rounded-xl border p-4 shadow-sm transition-all",
        !isResolved && "border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.05]",
        isResolved && resolvedDecision === "allow" && "border-emerald-500/30 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04]",
        isResolved && resolvedDecision === "deny" && "border-destructive/30 bg-destructive/[0.02] dark:bg-destructive/[0.04]",
        className
      )}
      role="region"
      aria-label="Sicherheits-Freigabe"
    >
      {/* Header mit Icon und Titel */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {!isResolved ? (
            <div className="rounded-full bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-4" />
            </div>
          ) : resolvedDecision === "allow" ? (
            <div className="rounded-full bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
          ) : (
            <div className="rounded-full bg-destructive/10 p-1.5 text-destructive">
              <ShieldX className="size-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-foreground leading-snug">
              {question}
            </h4>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {item.requestKind || "Sicherheit"}
            </span>
          </div>

          {item.prompt && item.prompt !== item.title ? (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {item.prompt}
            </p>
          ) : null}

          {/* Detailangaben / Befehle / Pfade */}
          {item.detail ? (
            <div className="mt-2.5 rounded-lg border border-border/60 bg-muted/50 p-2.5 font-mono text-xs text-foreground/90 whitespace-pre-wrap break-all">
              {item.detail}
            </div>
          ) : null}

          {/* Aktionsleiste */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {!isResolved ? (
              <>
                <Button
                  size="sm"
                  variant="default"
                  disabled={disabled || submitting !== null}
                  onClick={() => handleDecision("allow")}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  <Check className="size-3.5" />
                  {submitting === "allow" ? "Wird freigegeben…" : "Erlauben"}
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  disabled={disabled || submitting !== null}
                  onClick={() => handleDecision("deny")}
                  className="gap-1.5"
                >
                  <X className="size-3.5" />
                  {submitting === "deny" ? "Wird abgelehnt…" : "Ablehnen"}
                </Button>

                {item.options?.some((o) => o.decision === "allow_always") || true ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled || submitting !== null}
                    onClick={() => handleDecision("allow_always")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="Für diesen Agenten dauerhaft erlauben"
                  >
                    Immer erlauben
                  </Button>
                ) : null}
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs font-medium">
                {resolvedDecision === "allow" || resolvedDecision === "allow_always" ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" /> Aktion erlaubt
                    {resolvedDecision === "allow_always" ? " (immer)" : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <X className="size-3.5" /> Aktion abgelehnt
                  </span>
                )}
                <span className="text-muted-foreground/60 text-[11px]">
                  · Entscheidung gespeichert
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
