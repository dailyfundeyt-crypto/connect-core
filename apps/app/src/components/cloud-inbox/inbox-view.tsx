/**
 * Die Inbox-Ansicht — Threads, Tagesgruppen, Antwortfeld, Freigaben.
 *
 * Das ist die native Fassung der Muse-Web-UI in Connect: dieselben Fakten, derselbe Look, aber
 * ohne den Owner-Key im Browser. Die Freigabekarten stehen deshalb in derselben Liste wie die
 * Threads — sie sind beide das, was gerade auf Stefan wartet.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconInbox, IconSend } from "@tabler/icons-react";
import { useState } from "react";
import { ApprovalCard } from "@/components/cloud-inbox/approval-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type InboxApproval,
  type InboxMessage,
  decideInboxApproval,
  groupByDay,
  inboxApprovalsQueryOptions,
  inboxMessagesQueryOptions,
  listInboxToday,
  markInboxMessageRead,
  messageState,
  openCount,
  sendInboxMessage,
  threadText,
  timeLabel,
} from "@/lib/agents/cloud-inbox";
import { cloudAgentKeys } from "@/lib/agents/cloud-agent";
import { cn } from "@/lib/utils";

/** Ein Thread: die Frage und darunter, was Muse geantwortet hat. */
function Thread({
  message,
  onReply,
  onOpen,
}: {
  message: InboxMessage;
  onReply: (text: string, clientMessageId: string) => void | Promise<void>;
  onOpen: (messageId: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const answer = threadText(message);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await onReply(body, `inbox-${message.id}-${Date.now()}`);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid="inbox-thread"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm leading-relaxed">{message.text}</p>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {timeLabel(message.created_at)}
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {messageState(message)}
      </p>

      {answer ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Textarea
          className="text-xs"
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Antwort an Muse …"
          rows={2}
          value={text}
        />
        <div className="flex items-center gap-2">
          <Button disabled={busy || !text.trim()} onClick={() => void send()} size="xs">
            <IconSend />
            Senden
          </Button>
          <Button
            disabled={busy}
            onClick={() => onOpen(message.id)}
            size="xs"
            variant="ghost"
          >
            Als gelesen markieren
          </Button>
        </div>
      </div>
    </li>
  );
}

/** „Heute" — die offenen Aufgaben der Inbox, nach Tag gruppiert. */
function TodayPanel({ agentId }: { agentId: string }) {
  const today = useQuery({
    queryKey: ["cloud-inbox", "today", agentId],
    queryFn: () => listInboxToday(agentId),
    staleTime: 5_000,
    retry: false,
  });
  const days = today.data?.tasks?.days ?? [];
  const notes = today.data?.notes?.notes ?? [];
  if (days.length === 0 && notes.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Offene Aufgaben
      </h3>
      {days.map((day) => (
        <div key={day.day} className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">{day.day}</p>
          <ul className="flex flex-col gap-1.5">
            {day.tasks.map((task) => (
              <li
                className="rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs leading-relaxed"
                key={task.message_id}
              >
                {task.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {notes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">Notizen</p>
          <ul className="flex flex-col gap-1">
            {notes.slice(0, 10).map((note) => (
              <li className="text-xs text-muted-foreground" key={note.id}>
                <span className="font-medium text-foreground">{note.author ?? "Muse"}</span>:{" "}
                {note.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function InboxView({
  agentId,
  hasOwnerKey,
  refetchIntervalMs = 5_000,
}: {
  agentId: string;
  /** Ob ein Owner-Key hinterlegt ist. */
  hasOwnerKey: boolean;
  /** Wie oft nachgef ragt wird. `false` schaltet das Nachfragen ab. */
  refetchIntervalMs?: number | false;}) {
  const queryClient = useQueryClient();
  const [busyApproval, setBusyApproval] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messages = useQuery({
    ...inboxMessagesQueryOptions(agentId),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
  });
  const approvals = useQuery({
    ...inboxApprovalsQueryOptions(agentId),
    refetchInterval: refetchIntervalMs,
    refetchIntervalInBackground: false,
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "denied"; note?: string }) =>
      decideInboxApproval(agentId, input.id, {
        decision: input.decision,
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["cloud-inbox", "approvals", agentId],
      });
    },
  });

  const reply = async (text: string, clientMessageId: string) => {
    setError(null);
    try {
      await sendInboxMessage(agentId, { text, clientMessageId });
      await queryClient.invalidateQueries({
        queryKey: cloudAgentKeys.messages(agentId, "inbox"),
      });
      await queryClient.invalidateQueries({
        queryKey: ["cloud-inbox", "messages", agentId],
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const markRead = async (messageId: string) => {
    try {
      await markInboxMessageRead(agentId, messageId);
      await queryClient.invalidateQueries({
        queryKey: ["cloud-inbox", "messages", agentId],
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const list = messages.data?.messages ?? [];
  const groups = groupByDay(list);
  const openMessages = openCount(list);
  const approvalList = approvals.data?.approvals ?? [];

  if (messages.isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Lädt …</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-3" data-testid="cloud-inbox-view">
      <div className="flex items-center gap-2">
        <IconInbox className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-medium">Heute (offen: {openMessages})</h2>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {messages.error ? (
        <p className="text-sm text-destructive" role="alert">
          {messages.error instanceof Error
            ? messages.error.message
            : "Die Inbox konnte nicht geladen werden"}
        </p>
      ) : null}

      {approvalList.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Freigaben
          </h3>
          <ul className="flex flex-col gap-2">
            {approvalList.map((approval: InboxApproval) => (
              <ApprovalCard
                approval={approval}
                busy={busyApproval === approval.id || decide.isPending}
                canDecide={hasOwnerKey}
                key={approval.id}
                onDecide={async (decision, note) => {
                  setBusyApproval(approval.id);
                  try {
                    await decide.mutateAsync({
                      id: approval.id,
                      decision,
                      ...(note ? { note } : {}),
                    });
                  } finally {
                    setBusyApproval(null);
                  }
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <TodayPanel agentId={agentId} />

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Nachrichten in der Inbox.</p>
      ) : (
        groups.map((group) => (
          <section className="flex flex-col gap-2" key={group.day}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-2">
              {group.messages.map((message) => (
                <Thread
                  key={message.id}
                  message={message}
                  onOpen={(id) => void markRead(id)}
                  onReply={reply}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** Der Zustand der Inbox, wenn der Agent noch keinen Inbox-Key hat. */
export function InboxUnavailable({ reason }: { reason?: string }) {
  return (
    <div className="flex flex-col gap-2 p-6">
      <p className="text-sm font-medium">Die Inbox ist noch nicht eingerichtet.</p>
      <p className={cn("text-sm text-muted-foreground")}>
        {reason ?? "Unter Details › Token den Inbox-Key und den Owner-Key setzen."}
      </p>
    </div>
  );
}
