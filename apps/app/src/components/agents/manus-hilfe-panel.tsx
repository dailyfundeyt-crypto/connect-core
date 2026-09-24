import {
  IconHandStop,
  IconLoader2,
  IconExternalLink,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  confirmManusAction,
  deriveManusWaitingState,
  fetchManusMessages,
  getManusTaskRecord,
  openManusTaskInLab,
  sendManusHelpMessage,
  subscribeManusApi,
  type ManusWaitingState,
} from "@/lib/agents/manus-api";
import { cn } from "@/lib/utils";

/**
 * Manus „Hilfe“ co-pilot (Plan 050).
 * - Pulses when agent_status is waiting
 * - Opens interactive task_url in dedicated Manus Chrome profile
 * - Optional API bridge: sendMessage / confirmAction
 * No fake cloud-browser CDP / screencast.
 */
export function ManusHilfePanel({ agentId }: { agentId: string }) {
  const [waiting, setWaiting] = useState<ManusWaitingState>({
    waiting: false,
    agentStatus: null,
    question: null,
    waitingForEventId: null,
    brief: null,
  });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const record = getManusTaskRecord(agentId);
    setWatchUrl(record?.watchUrl || record?.taskUrl || null);
    if (!record?.taskId) {
      setWaiting({
        waiting: false,
        agentStatus: null,
        question: null,
        waitingForEventId: null,
        brief: null,
      });
      return;
    }
    try {
      const messages = await fetchManusMessages(agentId);
      setWaiting(deriveManusWaitingState(messages));
    } catch {
      /* keep last state */
    }
  }, [agentId]);

  useEffect(() => {
    void refresh();
    const off = subscribeManusApi(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const onHilfe = async () => {
    if (!watchUrl) {
      setStatus("Kein Manus-Task — zuerst eine Nachricht an Manus senden.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const opened = await openManusTaskInLab(agentId, watchUrl);
      setStatus(
        opened.ok
          ? "task_url im Manus-Profil (Voll-Chrome) geöffnet — Co-Pilot in manus.im."
          : opened.error || "Chrome-Start fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onSendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    setStatus(null);
    try {
      if (waiting.waitingForEventId) {
        const result = await confirmManusAction({
          agentId,
          waitingForEventId: waiting.waitingForEventId,
          text,
        });
        setStatus(result.summary);
        if (result.ok) setReply("");
      } else {
        const result = await sendManusHelpMessage({ agentId, text });
        setStatus(result.summary);
        if (result.ok) setReply("");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-border bg-background/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Manus Hilfe</p>
          <p className="text-[11px] text-muted-foreground">
            Co-Pilot in manus.im (eigenes Profil) · API-Bridge für Ask/Confirm
          </p>
        </div>
        <Button
          aria-label="Hilfe — Manus task_url öffnen"
          className={cn(
            "gap-1.5 rounded-xl",
            waiting.waiting &&
              "animate-pulse bg-amber-500 text-white hover:bg-amber-500/90",
          )}
          disabled={busy || !watchUrl}
          onClick={() => void onHilfe()}
          size="sm"
          type="button"
          variant={waiting.waiting ? "default" : "outline"}
        >
          {busy ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconHandStop className="size-3.5" />
          )}
          Hilfe
          {waiting.waiting ? (
            <span className="text-[10px] font-normal opacity-90">wartet</span>
          ) : null}
        </Button>
      </div>

      {waiting.waiting ? (
        <p className="mt-2 rounded-xl bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          {waiting.question ||
            waiting.brief ||
            "Manus wartet auf deine Hilfe (agent_status: waiting)."}
        </p>
      ) : null}

      {watchUrl ? (
        <button
          className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-sky-700 hover:underline dark:text-sky-400"
          onClick={() => void onHilfe()}
          type="button"
        >
          <IconExternalLink className="size-3 shrink-0" />
          <span className="truncate">{watchUrl}</span>
        </button>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Noch kein Task — Manus-Nachricht starten, dann erscheint die task_url
          hier.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <input
          aria-label="Antwort an Manus"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={busy || !watchUrl}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSendReply();
            }
          }}
          placeholder={
            waiting.waitingForEventId
              ? "Antwort + confirmAction…"
              : "Antwort via sendMessage…"
          }
          value={reply}
        />
        <Button
          disabled={busy || !reply.trim() || !watchUrl}
          onClick={() => void onSendReply()}
          size="sm"
          type="button"
          variant="secondary"
        >
          Senden
        </Button>
      </div>

      {status ? (
        <p className="mt-2 text-[11px] text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
