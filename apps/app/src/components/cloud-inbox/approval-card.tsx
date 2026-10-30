/**
 * Eine Freigabekarte — die Ja/Nein-Karte aus der Muse-Web-UI, im Connect-Look.
 *
 * DIE REGEL, DIE HIER TRAGT: ohne Owner-Key sind die Knöpfe tot. Der Owner-Key liegt auf dem
 * Server; ohne ihn kann Connect keine Freigabe entscheiden, und ein Knopf, der dann einen
 * Fehler produziert, wäre schlechter als ein deaktivierter Knopf mit Begründung.
 */
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InboxApproval } from "@/lib/agents/cloud-inbox";
import { cn } from "@/lib/utils";

export function ApprovalCard({
  approval,
  canDecide,
  busy,
  onDecide,
}: {
  approval: InboxApproval;
  /** Ob der Owner-Key hinterlegt ist — ohne ihn sind die Knöpfe gesperrt. */
  canDecide: boolean;
  busy?: boolean;
  onDecide: (decision: "approved" | "denied", note?: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const decided = approval.status && approval.status !== "pending";
  const title = approval.title ?? approval.summary ?? "Freigabe";

  return (
    <li
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid="inbox-approval"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          {approval.summary && approval.summary !== title ? (
            <p className="text-xs text-muted-foreground">{approval.summary}</p>
          ) : null}
        </div>
        {decided ? (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              approval.status === "approved"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border/70 bg-muted/40 text-muted-foreground",
            )}
          >
            {approval.status === "approved" ? "freigegeben" : "abgelehnt"}
          </span>
        ) : null}
      </div>

      {approval.details ? (
        <div>
          <button
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            <IconChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
            {open ? "Details schließen" : "Details"}
          </button>
          {open ? (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {approval.details}
            </p>
          ) : null}
        </div>
      ) : null}

      {approval.note ? (
        <p className="text-xs text-muted-foreground">Notiz: {approval.note}</p>
      ) : null}

      {decided ? null : (
        <>
          {showNote ? (
            <Textarea
              className="text-xs"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optionale Notiz"
              rows={2}
              value={note}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy || !canDecide}
              onClick={() => void onDecide("approved", note.trim() || undefined)}
              size="xs"
            >
              <IconCheck />
              Ja
            </Button>
            <Button
              disabled={busy || !canDecide}
              onClick={() => void onDecide("denied", note.trim() || undefined)}
              size="xs"
              variant="outline"
            >
              <IconX />
              Nein
            </Button>
            {showNote ? null : (
              <Button
                disabled={busy}
                onClick={() => setShowNote(true)}
                size="xs"
                variant="ghost"
              >
                Notiz
              </Button>
            )}
          </div>
          {canDecide ? null : (
            <p className="text-xs text-muted-foreground" role="note">
              Owner-Key fehlt – unter Details › Token setzen.
            </p>
          )}
        </>
      )}
    </li>
  );
}
