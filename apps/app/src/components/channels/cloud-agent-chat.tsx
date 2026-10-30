import type { Message } from "@ag-ui/core";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { getAgentModelFamily } from "@/lib/agents/agent-models";
import {
  type CloudMessage,
  type CloudMessageStatus,
  cloudAgentConfigQueryOptions,
  cloudAgentKeys,
  CLOUD_IDLE_REFETCH_MS,
  cloudRefetchInterval,
  decideAgentRuntime,
  listCloudMessages,
  mergeCloudRecords,
  sendCloudMessage,
  statusLabel,
  useAgentRuntime,
} from "@/lib/agents/cloud-agent";
import { queryClient } from "@/query-client";

/**
 * Cloud-Agents im Chat.
 *
 * Eine Cloud-Antwort kommt nicht als Stream, sondern Minuten später. Der Connect-Server fragt den
 * Anbieter alle 30 s ab; dieser Hook fragt den eigenen Server alle 5 s, solange etwas offen ist, und
 * schreibt neue Antworten in den Chat-Verlauf. Jede Nutzer-Nachricht bekommt eine kleine
 * Statuszeile: gesendet · wartet · Antwort da (oder Fehler).
 */

type AgentLike = {
  messages: Message[];
  setMessages: (messages: Message[]) => void;
};

export type CloudStatus = {
  status: CloudMessageStatus;
  error?: string;
  draft?: boolean;
};

const CloudStatusContext = createContext<ReadonlyMap<string, CloudStatus>>(
  new Map(),
);

export const CloudStatusProvider = CloudStatusContext.Provider;

/** Unter einer Nutzer-Nachricht; rendert nichts, wenn die Nachricht nicht an einen Cloud-Agent ging. */
export function CloudMessageStatusLine({ messageId }: { messageId: string }) {
  const status = useContext(CloudStatusContext).get(messageId);
  if (!status) return null;
  const label =
    status.status === "answered" && status.draft
      ? "Entwurf da · wartet auf endgültige Antwort"
      : statusLabel(status.status);
  return (
    <p
      className={
        status.status === "failed"
          ? "mt-1 text-right text-[11px] text-destructive"
          : "mt-1 text-right text-[11px] text-muted-foreground"
      }
      role="status"
    >
      {label}
      {status.status === "failed" && status.error ? ` – ${status.error}` : ""}
    </p>
  );
}

export function useCloudAgentChat({
  runtimeAgentId,
  channelId,
  agentRef,
  messageCount,
  onReply,
}: {
  runtimeAgentId: string;
  channelId: string;
  agentRef: { current: AgentLike };
  /** Neu einarbeiten, wenn der Verlauf ersetzt wurde (z. B. nach dem Thread-Join). */
  messageCount: number;
  onReply: (text: string) => void;
}) {
  /* Der Laufweg kommt vom Server; die alte lokale Markierung hält nur dann cloud, wenn er schweigt. */
  const runtime = useAgentRuntime(runtimeAgentId);
  const isCloud = runtime.runtime === "cloud";
  const configured = runtime.configured;

  const records = useQuery({
    queryKey: cloudAgentKeys.messages(runtimeAgentId, channelId),
    queryFn: () => listCloudMessages(runtimeAgentId, channelId),
    enabled: isCloud,
    refetchInterval: (query) =>
      cloudRefetchInterval(query.state.data) || CLOUD_IDLE_REFETCH_MS,
    refetchIntervalInBackground: true,
  });

  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  // biome-ignore lint/correctness/useExhaustiveDependencies: messageCount re-runs the idempotent merge
  useEffect(() => {
    if (!records.data?.length) return;
    const agent = agentRef.current;
    const merged = mergeCloudRecords(
      agent.messages,
      records.data,
      (m) =>
        ({
          id: m.id,
          role: m.role,
          content: String(m.content ?? ""),
        }) as Message,
    );
    if (!merged) return;
    agent.setMessages(merged.messages);
    for (const record of merged.newReplies) {
      if (record.reply) onReplyRef.current(record.reply);
    }
  }, [records.data, messageCount, agentRef]);

  const statuses = useMemo(() => {
    const map = new Map<string, CloudStatus>();
    for (const r of records.data ?? []) {
      map.set(r.clientMessageId, {
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
        ...(r.replyDraft ? { draft: true } : {}),
      });
    }
    return map;
  }, [records.data]);

  const resolveIsCloud = async (): Promise<boolean> => {
    if (!runtime.loading) return isCloud;
    const data = await queryClient
      .fetchQuery(cloudAgentConfigQueryOptions(runtimeAgentId))
      .catch(() => null);
    return (
      decideAgentRuntime({
        serverRuntime: data?.runtime ?? null,
        serverExplicit: data?.runtimeExplicit === true,
        serverFailed: !data,
        legacyCloudFamily: getAgentModelFamily(runtimeAgentId) === "cloud",
      }) === "cloud"
    );
  };

  const send = async (input: {
    clientMessageId: string;
    threadId?: string;
    text: string;
    attachments: { attachmentId: string; filename: string }[];
  }): Promise<CloudMessage> => {
    const record = await sendCloudMessage(runtimeAgentId, {
      channelId,
      ...input,
    });
    queryClient.setQueryData<CloudMessage[]>(
      cloudAgentKeys.messages(runtimeAgentId, channelId),
      (current) => [...(current ?? []).filter((r) => r.id !== record.id), record],
    );
    void queryClient.invalidateQueries({
      queryKey: cloudAgentKeys.messages(runtimeAgentId, channelId),
    });
    return record;
  };

  return { isCloud, configured, resolveIsCloud, send, statuses };
}
