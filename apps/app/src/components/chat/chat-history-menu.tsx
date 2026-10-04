import { IconHistory } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tryClient } from "@/lib/client";
import { useLocale } from "@/lib/i18n/use-locale";
import { relativeTime } from "@/lib/relative-time";

/**
 * The person's earlier conversations with a Bot ("Verlauf"), newest first.
 *
 * Read from `GET /api/copilotkit/threads?agentId=`, which in local mode is Connect's own Postgres
 * chat store (server `chat-store/`) and is scoped to the signed-in person. A conversation that
 * belongs to a channel opens that channel; a direct chat is handed back through `onPick`.
 */
export type ChatHistoryThread = {
  id: string;
  name: string | null;
  agentId: string | null;
  updatedAt: string;
  lastMessage?: string | null;
  messageCount?: number;
  channelId?: string | null;
};

export const chatHistoryKey = (agentId: string | undefined) => ["chat-history", agentId ?? "*"] as const;

async function loadThreads(agentId: string | undefined): Promise<ChatHistoryThread[]> {
  const query = new URLSearchParams({ limit: "50" });
  if (agentId) query.set("agentId", agentId);
  const response = await tryClient(`/api/copilotkit/threads?${query}`);
  if (!response.ok) throw new Error(`history ${response.status}`);
  const body = (await response.json()) as { threads?: ChatHistoryThread[] };
  return Array.isArray(body.threads) ? body.threads : [];
}

export function ChatHistoryMenu({
  agentId,
  currentThreadId,
  onPick,
}: {
  agentId?: string;
  currentThreadId?: string;
  onPick: (threadId: string) => void;
}) {
  const { locale } = useLocale();
  const de = (locale ?? "de").startsWith("de");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, isPending, isError } = useQuery({
    queryKey: chatHistoryKey(agentId),
    queryFn: () => loadThreads(agentId),
    enabled: open,
    staleTime: 0,
  });

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        render={
          <Button data-testid="chat-history-button" size="sm" variant="ghost">
            <IconHistory />
            {de ? "Verlauf" : "History"}
          </Button>
        }
      />
      <DropdownMenuContent className="max-h-96 w-80 overflow-y-auto" data-testid="chat-history-list">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{de ? "Frühere Chats" : "Earlier chats"}</DropdownMenuLabel>
          {isPending ? (
            <p className="px-2 py-1.5 text-muted-foreground text-sm">{de ? "Lädt …" : "Loading…"}</p>
          ) : isError ? (
            <p className="px-2 py-1.5 text-destructive text-sm">
              {de ? "Verlauf konnte nicht geladen werden." : "History couldn't be loaded."}
            </p>
          ) : !data || data.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground text-sm">{de ? "Noch keine Chats." : "No chats yet."}</p>
          ) : (
            data.map((thread) => (
              <DropdownMenuItem
                className="flex flex-col items-start gap-0.5"
                data-testid="chat-history-item"
                key={thread.id}
                onClick={() => {
                  if (thread.channelId) {
                    void navigate({ to: "/channel/$channelId", params: { channelId: thread.channelId } });
                  } else {
                    onPick(thread.id);
                  }
                }}
              >
                <span className="w-full truncate font-medium text-sm">
                  {thread.id === currentThreadId ? "● " : ""}
                  {thread.name || (de ? "Unbenannter Chat" : "Untitled chat")}
                </span>
                <span className="w-full truncate text-muted-foreground text-xs">
                  {relativeTime(thread.updatedAt)}
                  {typeof thread.messageCount === "number"
                    ? ` · ${thread.messageCount} ${de ? "Nachrichten" : "messages"}`
                    : ""}
                  {thread.channelId ? (de ? " · Kanal" : " · channel") : ""}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
