import { useState, useRef, useEffect } from "react";
import {
  IconSend,
  IconSparkles,
  IconBookmark,
  IconRefresh,
  IconCheck,
  IconCopy,
  IconAlertCircle,
  IconBulb,
  IconCpu,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CitationChip, type Citation } from "./citation-chip";
import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidence?: number;
  insufficientData?: boolean;
  provider?: string;
  durationMs?: number;
  timestamp: string;
}

const SAMPLE_PROMPTS = [
  "Was sind die wichtigsten Erkenntnisse in den Notizen?",
  "Welche Aufgaben und Meilensteine stehen an?",
  "Fasse das technische Architekturkonzept zusammen.",
  "Gibt es offene Fragen oder Risiken in den Notizen?",
];

export function AskPanel({
  onOpenNote,
  className,
}: {
  onOpenNote?: (path: string, line?: number) => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleAsk = async (queryText?: string) => {
    const q = (queryText ?? inputQuery).trim();
    if (!q || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setIsLoading(true);
    setSavedStatus(null);

    const botMessageId = `bot_${Date.now()}`;
    let accumulatedText = "";
    let finalCitations: Citation[] = [];
    let providerName = "cli-runner";
    let isInsufficient = false;
    let confidenceScore = 0.9;
    let duration = 0;

    // Temporary bot message placeholder for streaming
    setMessages((prev) => [
      ...prev,
      {
        id: botMessageId,
        role: "assistant",
        content: "",
        citations: [],
        timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    try {
      // Attempt SSE streaming first
      const res = await fetch("/api/brain/learn/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, maxCitations: 5 }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              const dataStr = trimmed.slice(5).trim();
              try {
                const event = JSON.parse(dataStr);
                if (event.type === "token") {
                  accumulatedText += event.text;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === botMessageId ? { ...msg, content: accumulatedText } : msg,
                    ),
                  );
                } else if (event.type === "citations") {
                  finalCitations = event.citations;
                } else if (event.type === "done") {
                  if (event.response) {
                    accumulatedText = event.response.answer;
                    finalCitations = event.response.citations || [];
                    providerName = event.response.provider || providerName;
                    isInsufficient = Boolean(event.response.insufficientData);
                    confidenceScore = event.response.confidence ?? 0.85;
                    duration = event.response.durationMs || 0;
                  }
                }
              } catch {}
            }
          }
        }
      } else {
        // Fallback to standard JSON POST
        const jsonRes = await fetch("/api/brain/learn/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, maxCitations: 5 }),
        });
        const data = await jsonRes.json();
        accumulatedText = data.answer || "Keine Antwort erhalten.";
        finalCitations = data.citations || [];
        providerName = data.provider || "cli-runner";
        isInsufficient = Boolean(data.insufficientData);
        confidenceScore = data.confidence ?? 0.85;
        duration = data.durationMs || 0;
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                content: accumulatedText,
                citations: finalCitations,
                provider: providerName,
                insufficientData: isInsufficient,
                confidence: confidenceScore,
                durationMs: duration,
              }
            : msg,
        ),
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                content: `Fehler beim Abrufen der Antwort: ${err?.message || "Netzwerkfehler"}`,
                insufficientData: true,
              }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChatAsNote = async () => {
    if (messages.length === 0) return;
    try {
      const allCitations = messages.flatMap((m) => m.citations || []);
      const title = messages[0]?.content.slice(0, 40) || "Spark Chat";

      const res = await fetch("/api/brain/learn/ask/save-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Q&A: ${title}`,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            citations: m.citations,
            timestamp: m.timestamp,
          })),
          citations: allCitations,
          targetFolder: "_spark/chats",
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSavedStatus(data.result.message);
      } else {
        setSavedStatus("Fehler beim Speichern");
      }
    } catch {
      setSavedStatus("Verbindungsfehler");
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /**
   * Replaces citation markers like [1], [2] in text with clickable CitationChip components.
   */
  const renderContentWithCitations = (content: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
    }

    const citationMap = new Map(citations.map((c) => [c.n, c]));
    const parts = content.split(/(\[\d+\])/g);

    return (
      <div className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const num = parseInt(match[1], 10);
            const cit = citationMap.get(num);
            if (cit) {
              return <CitationChip key={i} citation={cit} onOpen={onOpenNote} />;
            }
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-full bg-background border rounded-xl overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <IconSparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Spark Q&A</h3>
            <p className="text-[11px] text-muted-foreground">
              Fragen über deinen Wissens-Vault mit verlässlichen Zitaten
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveChatAsNote}
              className="h-7 text-xs gap-1"
              title="Chatverlauf als Markdown-Notiz in _spark/chats/ speichern"
            >
              <IconBookmark className="size-3.5 text-muted-foreground" />
              <span>Als Notiz speichern</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([]);
                setSavedStatus(null);
              }}
              className="h-7 text-xs text-muted-foreground"
              title="Chat leeren"
            >
              <IconRefresh className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {savedStatus && (
        <div className="px-4 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between border-b">
          <span>{savedStatus}</span>
          <button type="button" onClick={() => setSavedStatus(null)} className="text-[10px] font-semibold">
            ✕
          </button>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
            <div className="p-3 rounded-full bg-sky-500/10 text-sky-500">
              <IconBulb className="size-8" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Stelle eine Frage an deinen Spark-Vault</h4>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Der Assistent sucht hybrid (Vektor + Volltext) in deinen Notizen und belegt jede Aussage mit genauen Zeilenangaben.
              </p>
            </div>

            <div className="w-full max-w-md pt-2 space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground block text-left">
                Beispiel-Fragen:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {SAMPLE_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAsk(prompt)}
                    className="w-full text-left p-2 rounded-lg border bg-muted/20 hover:bg-muted/50 text-xs transition-colors truncate"
                  >
                    💬 {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[88%] rounded-xl p-3.5 text-xs shadow-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground rounded-tr-none"
                  : "mr-auto bg-card border rounded-tl-none",
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-1 opacity-70 text-[10px]">
                <span className="font-semibold uppercase tracking-wider">
                  {msg.role === "user" ? "Du" : "Spark Assistent"}
                </span>
                <span>{msg.timestamp}</span>
              </div>

              {msg.role === "assistant" && msg.content === "" ? (
                <div className="space-y-2 py-1">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              ) : (
                renderContentWithCitations(msg.content, msg.citations)
              )}

              {/* Citations Footer */}
              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border/60">
                  <div className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <IconBookmark className="size-3" />
                    <span>Zitierte Quellen ({msg.citations.length}):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((c) => (
                      <CitationChip key={c.n} citation={c} onOpen={onOpenNote} />
                    ))}
                  </div>
                </div>
              )}

              {/* Meta & Provider badge */}
              {msg.role === "assistant" && msg.content !== "" && (
                <div className="mt-2.5 pt-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground border-t border-border/40">
                  <div className="flex items-center gap-2">
                    {msg.provider && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">
                        <IconCpu className="size-2.5" />
                        {msg.provider}
                      </span>
                    )}
                    {msg.durationMs !== undefined && (
                      <span>{Math.round(msg.durationMs / 100) / 10}s</span>
                    )}
                    {msg.insufficientData && (
                      <span className="text-amber-500 font-medium flex items-center gap-0.5">
                        <IconAlertCircle className="size-3" /> Keine Treffer
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="hover:text-foreground p-0.5"
                    title="Antwort kopieren"
                  >
                    {copiedId === msg.id ? (
                      <IconCheck className="size-3.5 text-emerald-500" />
                    ) : (
                      <IconCopy className="size-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 border-t bg-muted/20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Frage an den Vault stellen … (z.B. Was ist das Ziel von Projekt X?)"
            className="text-xs h-9"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="sm"
            disabled={isLoading || !inputQuery.trim()}
            className="h-9 px-3 shrink-0 gap-1"
          >
            <IconSend className="size-3.5" />
            <span className="hidden sm:inline">Fragen</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
