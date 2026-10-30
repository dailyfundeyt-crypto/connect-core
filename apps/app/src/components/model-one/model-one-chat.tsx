/**
 * Model One Chat-Komponente.
 *
 * Minimal: Input unten, Antworten oben (Stream). Wie Grok oder
 * Perplexity Computer - keine Buttons, keine Modals, keine Tooltips.
 * Usage-Sidebar kommt aus einer separaten Komponente.
 */
import { useState } from "react";
import { tryClient } from "@/lib/client";
import { ModelOneUsagePanel } from "@/components/model-one/usage-panel";

type Message = { id: string; role: "user" | "assistant"; text: string; at: string };

export function ModelOneChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, role: "user", text, at: new Date().toISOString() }]);
    setMessages((prev) => [...prev, { id: `${id}-a`, role: "assistant", text: "", at: new Date().toISOString() }]);
    setStreaming(true);
    try {
      const response = await tryClient("/api/model-one/chat", {
        method: "POST",
        body: { prompt: text, agentId: "model-one" },
      });
      if (!response.ok || !response.body) {
        const message = `Server-Fehler: ${response.status}`;
        setError(message);
        setMessages((prev) => prev.map((m) => (m.id === `${id}-a` ? { ...m, text: `⚠️ ${message}` } : m)));
        setStreaming(false);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const raw = part.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as { type: string; text?: string; error?: string };
            if (event.type === "text" && event.text) {
              setMessages((prev) => prev.map((m) => (m.id === `${id}-a` ? { ...m, text: m.text + event.text } : m)));
            } else if (event.type === "error" && event.error) {
              setError(event.error);
              setMessages((prev) => prev.map((m) => (m.id === `${id}-a` ? { ...m, text: m.text + (m.text ? "\n\n" : "") + `⚠️ ${event.error}` } : m)));
            }
          } catch {
            // malformed SSE line - skip
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setMessages((prev) => prev.map((m) => (m.id === `${id}-a` ? { ...m, text: `⚠️ ${message}` } : m)));
    } finally {
      setStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-full w-full">
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-800 px-6 py-4">
          <h1 className="text-lg font-semibold text-zinc-100">Model One</h1>
          <p className="text-xs text-zinc-500">Zentraler Orchestrator · Antigravity · Browser-Subagent</p>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 text-center">
              <h2 className="text-2xl font-semibold text-zinc-200">Was kann ich für dich tun?</h2>
              <p className="text-sm text-zinc-500">
                Frag mich etwas, ich nutze Antigravity, dein Brain und den Browser-Subagenten.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user" ? "bg-zinc-800 text-zinc-100" : "bg-zinc-900 text-zinc-200"
                  }`}
                >
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                    {m.role === "user" ? "Du" : "Model One"}
                  </div>
                  <div className="whitespace-pre-wrap">{m.text || (streaming ? "…" : "")}</div>
                </article>
              ))}
            </div>
          )}
        </main>

        <footer className="border-t border-zinc-800 px-6 py-4">
          {error ? <p className="mb-2 text-xs text-red-400">{error}</p> : null}
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              rows={2}
              placeholder="Frag Model One…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={streaming}
            />
            <button
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
            >
              {streaming ? "…" : "Senden"}
            </button>
          </div>
        </footer>
      </div>

      <ModelOneUsagePanel />
    </div>
  );
}
