/**
 * Ausgangs-Warteschlange / Freigabe-Liste v06 (A19).
 *
 * Vorschau je E-Mail: An, Betreff, Text, anfragender Agent, Status.
 * "Freigeben" ruft /approve auf (EINZIGER Ort der einen Versand ausloest),
 * "Ablehnen" ruft /reject auf. Solange keine Gmail-Anbindung existiert schreibt
 * der Server bei Freigabe eine DryRun-.eml-Datei statt zu senden.
 */

import { useMemo, useState } from "react";
import { IconCheck, IconInbox, IconRefresh, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getFlag } from "@/contracts/v06/flags";
import type { OutboundEmail, OutboundEmailStatus } from "@/contracts/v06/email-agents";
import { EmptyState, Skeleton } from "@/v06/design";
import { useEmailAgents, useOutbox } from "./useEmailAgents";

export interface OutboxApprovalsProps {
  /** Overrides the flag check (fuer Tests/Preview). */
  featureEnabled?: boolean;
}

export function OutboxApprovals(props: OutboxApprovalsProps = {}) {
  const featureEnabled = props.featureEnabled ?? getFlag("emailAgents");
  const isDesignV2 = Boolean(getFlag("designV2"));

  if (!featureEnabled) {
    return (
      <div
        className={cn(
          "w-full max-w-2xl mx-auto p-5 text-sm",
          isDesignV2
            ? "rounded-[var(--p-radius-xl)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] shadow-xs"
            : "rounded-xl border border-border bg-card/60 text-muted-foreground",
        )}
        data-testid="outbox-approvals-disabled"
      >
        Freigabe-Warteschlange erscheint, sobald das Feature{" "}
        <code className="text-xs">emailAgents</code> aktiviert wird.
      </div>
    );
  }

  return <OutboxApprovalsList />;
}

const statusLabels: Record<OutboundEmailStatus, string> = {
  pending_approval: "Wartet auf Freigabe",
  approved: "Freigegeben",
  sent: "Gesendet",
  rejected: "Abgelehnt",
};

const statusStyles: Record<OutboundEmailStatus, string> = {
  pending_approval: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  sent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

function OutboxApprovalsList() {
  const isDesignV2 = Boolean(getFlag("designV2"));
  const [filter, setFilter] = useState<"pending_approval" | "all">("pending_approval");
  const { emails, isLoading, error, reload, approve, reject } = useOutbox();
  const { agents } = useEmailAgents();

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.id, a.name);
    return map;
  }, [agents]);

  const shown = useMemo(
    () =>
      filter === "pending_approval"
        ? emails.filter((e) => e.status === "pending_approval")
        : emails,
    [emails, filter],
  );

  return (
    <div className="w-full space-y-5" data-testid="outbox-approvals">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <IconInbox className={cn("size-5", isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground")} />
          <div>
            <h2 className={cn("text-base font-semibold", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>
              Ausgangs-Warteschlange
            </h2>
            <p className={cn("text-sm", isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground")}>
              Agenten-Aufträge an externe E-Mail-Bots. Erst{" "}
              <span className={cn("font-medium", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>„Freigeben"</span> löst den
              Versand aus (DryRun, solange keine Gmail-Anbindung existiert).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter(filter === "pending_approval" ? "all" : "pending_approval")}
            className={cn(
              "text-sm transition-colors",
              isDesignV2
                ? "min-h-[44px] px-4 py-2 rounded-full border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] font-semibold"
                : "rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground hover:text-foreground",
            )}
          >
            {filter === "pending_approval" ? "Alle anzeigen" : "Nur offene"}
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            aria-label="Aktualisieren"
            className={cn(
              "inline-flex items-center justify-center transition-colors",
              isDesignV2
                ? "min-h-[44px] min-w-[44px] rounded-full border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
            )}
          >
            <IconRefresh className="size-4" />
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        isDesignV2 ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 rounded-[var(--p-radius-xl)] bg-[var(--p-surface-2)] border border-[var(--p-border)] space-y-3">
                <Skeleton variant="text" width="20%" height={12} />
                <Skeleton variant="text" width="60%" height={14} />
                <Skeleton variant="text" width="85%" height={12} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Lade Warteschlange…
          </div>
        )
      ) : shown.length === 0 ? (
        isDesignV2 ? (
          <EmptyState
            icon={<IconInbox className="size-6 text-[var(--p-accent)]" />}
            title="Keine offenen Freigaben"
            description={
              filter === "pending_approval"
                ? "Keine E-Mails warten derzeit auf Ihre Freigabe."
                : "Keine Einträge in der E-Mail-Warteschlange vorhanden."
            }
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            {filter === "pending_approval"
              ? "Keine E-Mails warten auf Freigabe."
              : "Keine Einträge in der Warteschlange."}
          </div>
        )
      ) : (
        shown.map((email) => (
          <OutboundEmailRow
            key={email.id}
            email={email}
            requesterName={agentNameById.get(email.requestedByAgentId)}
            onApprove={() => void approve(email.id)}
            onReject={() => void reject(email.id)}
            isDesignV2={isDesignV2}
          />
        ))
      )}
    </div>
  );
}

interface OutboundEmailRowProps {
  email: OutboundEmail;
  requesterName?: string;
  onApprove: () => void;
  onReject: () => void;
  isDesignV2?: boolean;
}

/** Zeile mit Vorschau (An, Betreff, Text, anfragender Agent) und Aktionen. */
function OutboundEmailRow({ email, requesterName, onApprove, onReject, isDesignV2 }: OutboundEmailRowProps) {
  const [busy, setBusy] = useState(false);
  const pending = email.status === "pending_approval";

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action().catch((err) => {
      // ErrorCode bleibt in der Liste sichtbar (Errors nur loggen, kein Schweigen)
      console.error("[outbox-approvals] Aktion fehlgeschlagen:", err);
    }).finally(() => setBusy(false));
  };

  return (
    <article
      className={cn(
        "space-y-2.5 p-4 transition-colors",
        isDesignV2
          ? "rounded-[var(--p-radius-xl)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-xs"
          : "rounded-xl border border-border bg-card/60",
      )}
      data-testid="outbound-email-row"
      data-outbound-id={email.id}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            statusStyles[email.status],
          )}
        >
          {statusLabels[email.status]}
        </span>
      </div>
      <dl className={cn("space-y-1.5 text-sm", isDesignV2 ? "text-[var(--p-text-2)]" : "")}>
        <div className="flex gap-2">
          <dt className={cn("w-20 shrink-0", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>An</dt>
          <dd className={cn("font-medium break-all", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>{email.to}</dd>
        </div>
        <div className="flex gap-2">
          <dt className={cn("w-20 shrink-0", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>Betreff</dt>
          <dd className={cn("break-all", isDesignV2 ? "text-[var(--p-text-1)] font-medium" : "text-foreground")}>{email.subject}</dd>
        </div>
        <div className="flex gap-2">
          <dt className={cn("w-20 shrink-0", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>Von Agent</dt>
          <dd className={isDesignV2 ? "text-[var(--p-text-2)]" : "text-foreground/80"}>
            {requesterName ?? email.requestedByAgentId}
            {requesterName ? (
              <span className={isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"}> ({email.requestedByAgentId})</span>
            ) : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className={cn("w-20 shrink-0", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>Text</dt>
          <dd className={cn("whitespace-pre-wrap break-words", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground/80")}>{email.body}</dd>
        </div>
      </dl>
      {pending ? (
        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => onReject())}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm transition-colors",
              isDesignV2
                ? "min-h-[44px] px-5 py-2 rounded-full border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-2)] hover:text-destructive hover:border-destructive/40 font-semibold disabled:opacity-50"
                : "rounded-lg border border-border bg-card px-3 py-1.5 text-muted-foreground hover:text-destructive disabled:opacity-60",
            )}
          >
            <IconX className="size-4" />
            Ablehnen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => onApprove())}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium transition-all",
              isDesignV2
                ? "min-h-[44px] px-6 py-2 rounded-full bg-[var(--p-accent)] text-zinc-950 font-bold hover:bg-[var(--p-accent)]/90 shadow-sm active:scale-95 disabled:opacity-50"
                : "rounded-lg bg-primary px-3.5 py-1.5 text-primary-foreground disabled:opacity-60",
            )}
          >
            <IconCheck className="size-4" />
            Freigeben
          </button>
        </div>
      ) : null}
    </article>
  );
}
