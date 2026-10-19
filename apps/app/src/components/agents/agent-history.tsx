/**
 * "Frühere Nachrichten anzeigen" above an agent's conversation (oneconv, 17.10.2026).
 *
 * Nothing is ever removed: the live part shows its newest rows, older rows of the live part come
 * back first, then each earlier segment of the same Bot (an older channel, or a part before a
 * Kontext-Rotation), newest first, read-only, each under a quiet marker with its date.
 */
import type { Message } from "@ag-ui/core";
import { useState } from "react";
import { HistoryRows } from "@/components/channels/chat-transcript";
import { hideRotationPrimers } from "@/components/channels/transcript-messages";
import { type AgentSegment, isRotatedSegment } from "@/lib/agents/agent-conversation";
import { readThreadMessages } from "@/lib/copilot/thread-messages";

type Loaded = { segment: AgentSegment; messages: Message[]; unavailable: boolean };

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AgentHistory({
  agentId,
  segments,
  hiddenCount,
  onShowHidden,
}: {
  agentId: string;
  /** Earlier segments, any order; empty ones (never used) are skipped. */
  segments: readonly AgentSegment[];
  hiddenCount: number;
  onShowHidden: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [loading, setLoading] = useState(false);

  const pending = segments
    .filter((s) => s.threadId && (s.lastMessageAt || s.lastMessage))
    .filter((s) => !loaded.some((l) => l.segment.id === s.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const loadNext = async () => {
    const next = pending[0];
    if (!next?.threadId || loading) return;
    setLoading(true);
    try {
      const stored = await readThreadMessages(next.threadId, agentId, { deadlineMs: 8000 });
      setLoaded((list) => [
        { segment: next, messages: stored.messages, unavailable: stored.availability !== "ready" },
        ...list,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const canShowMore = hiddenCount > 0 || pending.length > 0;

  return (
    <div className="flex flex-col gap-6" data-testid="agent-history">
      {canShowMore ? (
        <div className="flex justify-center">
          <button
            className="rounded-full border border-border/70 px-3.5 py-1.5 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            data-testid="agent-history-more"
            disabled={loading}
            onClick={() => (hiddenCount > 0 ? onShowHidden() : void loadNext())}
            type="button"
          >
            {loading
              ? "Lädt …"
              : hiddenCount > 0
                ? `Frühere Nachrichten anzeigen (${hiddenCount})`
                : `Frühere Nachrichten anzeigen · Gespräch vom ${dateLabel(pending[0]?.createdAt ?? "")}`}
          </button>
        </div>
      ) : null}
      {loaded.map(({ segment, messages, unavailable }) => (
        <section className="flex flex-col gap-6" data-testid="agent-history-segment" key={segment.id}>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground/70">
            <span className="h-px flex-1 bg-border/70" />
            <span>
              {isRotatedSegment(segment.id) ? "Fortsetzung" : "Früheres Gespräch"} vom {dateLabel(segment.createdAt)}
              {segment.deleted ? " · archiviert" : ""}
            </span>
            <span className="h-px flex-1 bg-border/70" />
          </div>
          {unavailable ? (
            <p className="text-center text-xs text-muted-foreground">Dieser Teil ist gerade nicht erreichbar. Später erneut versuchen.</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground" data-testid="agent-history-preview">
              {segment.lastMessage
                ? `Von diesem Teil ist nur die letzte Zeile erhalten (damals nicht dauerhaft gespeichert): „${segment.lastMessage}“`
                : "Keine Nachrichten in diesem Teil."}
            </p>
          ) : (
            <HistoryRows messages={hideRotationPrimers(messages)} />
          )}
        </section>
      ))}
      {loaded.length > 0 ? (
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.06em] text-muted-foreground/50">
          <span className="h-px flex-1 bg-border/50" />
          <span>Aktuell</span>
          <span className="h-px flex-1 bg-border/50" />
        </div>
      ) : null}
    </div>
  );
}
