/**
 * T3-Bridge — Chat-Komponente & Hook für T3-Agenten (Lane A22).
 *
 * Analog zu cloud-agent-chat.tsx:
 * - Verlauf + Live-Text Wort für Wort (SSE Stream)
 * - Tool-Aufrufe über ToolLine-Stil
 * - Freigabekarten für CLI-Aktionen
 * - I5 Kontext-Trenner (100k-Token-Rotation)
 * - Stopp-Knopf & Warteschlangen-Hinweis
 * - Strikt hinter Feature-Flag getT3Flag("bridge")
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useT3Chat,
  getT3Flag,
  type ConnectChatItem,
  type ConnectChatTextItem,
  type ConnectChatToolItem,
  type ConnectChatApprovalItem,
  type ConnectChatContextSwitchItem,
  type T3ApprovalDecision,
  type ConnectChatItemStatus,
  type T3MessageResponse,
} from "@/lib/t3";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { AlertCircle, Bot, CornerDownLeft, Sparkles, User } from "lucide-react";

import { T3ToolLine } from "./t3-tool-line";
import { T3ApprovalCard } from "./t3-approval-card";
import { T3ContextSeparator } from "./t3-context-separator";
import { T3StopButton } from "./t3-stop-button";
import { T3QueueNotice, T3MessageStatusLine } from "./t3-queue-notice";

/* ---------------------------------------------------------------------------------------- *
 * 1. Status Context
 * ---------------------------------------------------------------------------------------- */

export type T3ChatContextValue = {
  agentId: string;
  status: ConnectChatItemStatus;
  isStreaming: boolean;
  interrupt: (reason?: string) => Promise<unknown>;
  respondApproval: (requestId: string, decision: T3ApprovalDecision) => Promise<unknown>;
  queuePosition?: number;
};

const T3ChatContext = createContext<T3ChatContextValue | null>(null);

export const useT3ChatContext = () => useContext(T3ChatContext);

/* ---------------------------------------------------------------------------------------- *
 * 2. Hook: useT3AgentChat (analog useCloudAgentChat)
 * ---------------------------------------------------------------------------------------- */

export type UseT3AgentChatOptions = {
  mock?: boolean;
  onReply?: (text: string) => void;
};

export function useT3AgentChat(agentId: string, options: UseT3AgentChatOptions = {}) {
  const isEnabled = getT3Flag("bridge");
  const chat = useT3Chat(agentId, { mock: options.mock });

  const onReplyRef = useRef(options.onReply);
  onReplyRef.current = options.onReply;

  // Letzte Antwort melden, sobald ein Turn beendet ist
  useEffect(() => {
    if (chat.status === "done" && chat.messages.length > 0) {
      const last = chat.messages[chat.messages.length - 1];
      if (last && last.kind === "text" && last.role === "assistant" && last.text) {
        onReplyRef.current?.(last.text);
      }
    }
  }, [chat.status, chat.messages]);

  return {
    ...chat,
    isEnabled,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 3. Chat-Verlauf (T3ChatTranscript)
 * ---------------------------------------------------------------------------------------- */

export type T3ChatTranscriptProps = {
  items: ConnectChatItem[];
  isStreaming?: boolean;
  onRespondApproval?: (requestId: string, decision: T3ApprovalDecision) => Promise<unknown> | void;
  onUpdateContextSummary?: (itemId: string, newSummary: string) => Promise<unknown> | void;
  cliName?: string;
  className?: string;
};

export function T3ChatTranscript({
  items,
  isStreaming,
  onRespondApproval,
  onUpdateContextSummary,
  cliName,
  className,
}: T3ChatTranscriptProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Automatisches sanftes Nach-Unten-Scrollen bei neuem Inhalt
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [items, isStreaming]);

  return (
    <div
      ref={scrollerRef}
      className={cn("flex flex-1 flex-col gap-4 overflow-y-auto p-4 select-text", className)}
      role="log"
      aria-label="T3-Chatverlauf"
    >
      {items.length === 0 ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center text-center text-muted-foreground">
          <Bot className="mb-2 size-8 opacity-40" />
          <p className="text-sm font-medium">Noch keine Nachrichten in diesem T3-Thread.</p>
          <p className="text-xs text-muted-foreground/80">
            Schreibe etwas, um das Gespräch mit dem T3-Agenten zu beginnen.
          </p>
        </div>
      ) : null}

      {items.map((item) => {
        switch (item.kind) {
          case "text": {
            const isUser = item.role === "user";
            return (
              <div
                key={item.id}
                className={cn(
                  "flex w-full flex-col",
                  isUser ? "items-end" : "items-start"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                  {isUser ? (
                    <>
                      <span>Du</span>
                      <User className="size-3" />
                    </>
                  ) : (
                    <>
                      <Bot className="size-3 text-primary" />
                      <span>{cliName || "T3 Agent"}</span>
                    </>
                  )}
                </div>

                <Bubble
                  align={isUser ? "end" : "start"}
                  variant={isUser ? "muted" : "default"}
                  className={cn(
                    "max-w-[85%] transition-all",
                    item.status === "running" && "ring-1 ring-primary/40 shadow-sm"
                  )}
                >
                  <BubbleContent>
                    {isUser ? (
                      <span className="whitespace-pre-wrap">{item.text}</span>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <Streamdown>{item.text || "…"}</Streamdown>
                      </div>
                    )}
                  </BubbleContent>
                </Bubble>

                {/* Statuszeile unter der Nachricht */}
                <T3MessageStatusLine
                  status={item.status}
                  queuePosition={item.status === "queued" ? 1 : undefined}
                />
              </div>
            );
          }

          case "tool":
            return <T3ToolLine key={item.id} item={item} />;

          case "approval":
            return (
              <T3ApprovalCard
                key={item.id}
                item={item}
                cliName={cliName}
                onRespond={onRespondApproval}
              />
            );

          case "context_switch":
            return (
              <T3ContextSeparator
                key={item.id}
                item={item}
                onUpdateSummary={onUpdateContextSummary}
              />
            );

          case "error":
            return (
              <div
                key={item.id}
                className="my-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Fehler bei der Ausführung</p>
                  <p className="mt-0.5 text-muted-foreground">{item.message}</p>
                </div>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- *
 * 4. Fallback-Ansicht bei deaktivierter Bridge
 * ---------------------------------------------------------------------------------------- */

export function T3BridgeDisabledFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center p-6 text-center",
        className
      )}
    >
      <div className="rounded-xl border border-muted bg-muted/20 p-6 max-w-md">
        <Sparkles className="size-8 mx-auto mb-3 text-muted-foreground/60" />
        <h3 className="text-base font-semibold text-foreground">
          T3-Bridge deaktiviert
        </h3>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Das Feature-Flag <code className="font-mono">connect.t3.bridge</code> ist derzeit
          inaktiv. Aktiviere das Flag in den Einstellungen, um die T3-Chat-Engine zu nutzen.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- *
 * 5. T3AgentChatActive (Aktiver Chat-Container)
 * ---------------------------------------------------------------------------------------- */

function T3AgentChatActive({
  agentId,
  cliName,
  queuePosition,
  mock = false,
  className,
  onReply,
}: T3AgentChatProps) {
  const {
    messages,
    status,
    isStreaming,
    sendMessage,
    interrupt,
    respondApproval,
  } = useT3AgentChat(agentId, { mock, onReply });

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInputText("");
    try {
      await sendMessage(trimmed);
    } catch {
      // Fehler wird in state gehalten
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const contextValue: T3ChatContextValue = {
    agentId,
    status,
    isStreaming,
    interrupt,
    respondApproval,
    queuePosition,
  };

  return (
    <T3ChatContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex flex-1 flex-col h-full min-h-0 bg-background text-foreground",
          className
        )}
      >
        {/* Warteschlangen-Hinweis bei wartendem Turn */}
        {queuePosition && queuePosition > 0 ? (
          <div className="px-4 pt-2">
            <T3QueueNotice position={queuePosition} />
          </div>
        ) : null}

        {/* Chat-Verlauf */}
        <T3ChatTranscript
          items={messages}
          isStreaming={isStreaming}
          cliName={cliName}
          onRespondApproval={respondApproval}
        />

        {/* Fußzeile mit Stopp-Knopf bei laufendem Stream */}
        <div className="border-t border-border bg-card/40 p-3 backdrop-blur">
          {isStreaming ? (
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground animate-pulse">
                T3-Antwort wird generiert…
              </span>
              <T3StopButton onInterrupt={interrupt} isRunning={isStreaming} />
            </div>
          ) : null}

          {/* Eingabezeile */}
          <div className="relative flex items-center gap-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder={`Nachricht an ${cliName || "T3-Agent"}… (Enter zum Senden)`}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              size="sm"
              variant="default"
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="gap-1.5 shrink-0"
            >
              <CornerDownLeft className="size-3.5" />
              Senden
            </Button>
          </div>
        </div>
      </div>
    </T3ChatContext.Provider>
  );
}

/* ---------------------------------------------------------------------------------------- *
 * 6. T3AgentChat (Hauptkomponente mit Feature-Flag Prüfung)
 * ---------------------------------------------------------------------------------------- */

export type T3AgentChatProps = {
  agentId: string;
  cliName?: string;
  queuePosition?: number;
  mock?: boolean;
  className?: string;
  onReply?: (text: string) => void;
};

export function T3AgentChat(props: T3AgentChatProps) {
  const isEnabled = getT3Flag("bridge");

  // Flag aus: Altes Verhalten / Deaktivierter Zustand
  if (!isEnabled && !props.mock) {
    return <T3BridgeDisabledFallback className={props.className} />;
  }

  return <T3AgentChatActive {...props} />;
}
