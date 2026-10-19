/**
 * Model One Usage-Panel (rechts).
 *
 * Pollt /api/model-one/usage alle 2 Sekunden, zeigt Live-Stats.
 * Ausklappbar per Toggle-Button oben rechts.
 */
import { useEffect, useState } from "react";
import { tryClient } from "@/lib/client";

type Usage = {
  inputTokens: number;
  outputTokens: number;
  browserCalls: number;
  shellCalls: number;
  startedAt: string;
  lastCallAt: string | null;
};

const POLL_MS = 2000;

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function ModelOneUsagePanel() {
  const [open, setOpen] = useState(true);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await tryClient("/api/model-one/usage");
        if (cancelled || !response.ok) return;
        const body = (await response.json()) as { usage: Usage };
        setUsage(body.usage);
      } catch {
        // ignore - will retry on next poll
      }
    }
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!open) {
    return (
      <button
        className="absolute right-4 top-4 z-10 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
        onClick={() => setOpen(true)}
      >
        Usage
      </button>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-l border-zinc-800 bg-zinc-950 px-4 py-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Nutzung</h3>
        <button
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          onClick={() => setOpen(false)}
          aria-label="Panel schließen"
        >
          ✕
        </button>
      </div>

      {usage ? (
        <div className="flex flex-col gap-3">
          <Stat label="Input-Tokens" value={formatTokens(usage.inputTokens)} />
          <Stat label="Output-Tokens" value={formatTokens(usage.outputTokens)} />
          <Stat label="Browser-Calls" value={String(usage.browserCalls)} />
          <Stat label="Shell-Calls" value={String(usage.shellCalls)} />
          <div className="mt-2 border-t border-zinc-800 pt-3 text-[10px] text-zinc-600">
            <div>Gestartet: {new Date(usage.startedAt).toLocaleTimeString("de-DE")}</div>
            {usage.lastCallAt ? <div>Letzter Call: {new Date(usage.lastCallAt).toLocaleTimeString("de-DE")}</div> : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Lade…</p>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="font-mono text-base text-zinc-200">{value}</span>
    </div>
  );
}
