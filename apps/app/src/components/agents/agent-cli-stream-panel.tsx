/**
 * Agent-CLI-Stream-Panel (Stufe 1.3).
 *
 * Zeigt für einen Agent den Live-Stream eines laufenden CLI-Runs
 * (Antigravity/Codex/Claude) an. Das Panel hat drei Modi:
 *
 *   - **Live-Stream** (default): jedes ankommende Delta wird sofort
 *     angezeigt, mit Auto-Scroll zum Ende. So sieht der User, was der
 *     Agent gerade denkt, lädt oder klickt.
 *   - **Final Only**: nur die fertige Antwort wird gerendert, alles
 *     davor bleibt unsichtbar. Nützlich wenn der Stream zu rauschig ist.
 *   - **Off**: gar nichts anzeigen (z.B. wenn der User schon im
 *     Chat-Panel mitlesen kann).
 *
 * Buttons: **Senden** startet einen neuen Run, **Stop** bricht den
 * aktuellen ab. Beim Öffnen wird der letzte Run (60s-Cache) geladen
 * und als `done` angezeigt, damit der User nicht „nichts" sieht.
 */

import {
  IconBolt,
  IconCircleX,
  IconLoader2,
  IconPlayerPlay,
  IconPlayerStop,
  IconSettings,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type CliDelta,
  type CliProvider,
  type CliRunMeta,
  abortAgentCliRun,
  getLastAgentCliRun,
  streamAgentCli,
} from "@/lib/agents/agent-mcp-client";

type StreamMode = "live" | "final" | "off";

const MODES: Array<{ id: StreamMode; label: string; hint: string }> = [
  { id: "live", label: "Live", hint: "Jedes Delta sofort sehen" },
  { id: "final", label: "Final", hint: "Nur die fertige Antwort" },
  { id: "off", label: "Aus", hint: "Stream ignorieren" },
];

export function AgentCliStreamPanel({ agentId }: { agentId: string }) {
  const [provider, setProvider] = useState<CliProvider>("antigravity");
  const [model, setModel] = useState("auto");
  const [prompt, setPrompt] = useState("");
  const [allowWrite, setAllowWrite] = useState(false);
  const [mode, setMode] = useState<StreamMode>("live");
  const [deltaText, setDeltaText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<CliRunMeta | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Beim Mount: letzten Run laden (falls vorhanden)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const last = await getLastAgentCliRun(agentId).catch(() => null);
      if (cancelled || !last?.ok || !last.run) return;
      setRunMeta(last.run);
      if (last.run.fullText) setDeltaText(last.run.fullText);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Auto-Scroll
  useEffect(() => {
    if (mode !== "live") return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [deltaText, mode]);

  const startRun = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setRunning(true);
    setErrorText(null);
    setDeltaText("");
    setRunMeta(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      for await (const event of streamAgentCli(
        agentId,
        { provider, model, prompt: trimmed, allowWrite },
        { signal: ac.signal },
      )) {
        if (event.kind === "meta" && event.meta) {
          setRunMeta(event.meta);
        } else if (event.kind === "delta") {
          applyDelta(event.delta);
        } else if (event.kind === "end") {
          setRunMeta(event.meta);
          setRunning(false);
        } else if (event.kind === "error") {
          setErrorText(event.error);
          setRunning(false);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err instanceof DOMException && err.name === "AbortError"
            ? "Abbruch."
            : String(err);
      setErrorText(message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const applyDelta = (delta: CliDelta) => {
    if (delta.error) setErrorText(delta.error);
    if (delta.text) {
      setDeltaText((prev) => prev + delta.text);
    }
    if (delta.usage && runMeta) {
      setRunMeta({ ...runMeta, usage: delta.usage });
    }
  };

  const stopRun = async () => {
    const ac = abortRef.current;
    if (ac) {
      ac.abort();
      abortRef.current = null;
    }
    if (runMeta?.status === "running") {
      await abortAgentCliRun(agentId, runMeta.runId).catch(() => undefined);
    }
    setRunning(false);
  };

  const visibleText = mode === "off" ? "" : deltaText;
  const isLive = running;

  return (
    <section
      className="grid gap-3 rounded-xl border border-border bg-card/40 p-4"
      data-testid="agent-cli-stream-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconBolt className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">CLI-Live-Stream (Stufe 1.3)</h3>
          {isLive ? (
            <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              läuft
            </span>
          ) : runMeta ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {runMeta.status} · {Math.max(1, Math.round(((runMeta.finishedAt ?? Date.now()) - runMeta.startedAt) / 1000))}s
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </header>

      {/* Form: Provider/Model/Prompt */}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <ProviderSelect provider={provider} onChange={setProvider} />
        <ModelInput model={model} onChange={setModel} provider={provider} />
        <label className="flex items-center gap-1 self-center text-[11px] text-muted-foreground">
          <input
            checked={allowWrite}
            disabled={isLive}
            onChange={(event) => setAllowWrite(event.target.checked)}
            type="checkbox"
          />
          Schreiben
        </label>
      </div>

      <Textarea
        className="min-h-[80px] font-mono text-[12px]"
        disabled={isLive}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder='Frag den Agenten etwas — z.B. "Fasse heise.de zusammen" oder "Antworte mit PONG"'
        value={prompt}
      />

      <div className="flex flex-wrap items-center gap-2">
        {isLive ? (
          <Button
            disabled={!runMeta}
            onClick={() => void stopRun()}
            size="sm"
            type="button"
            variant="destructive"
          >
            <IconPlayerStop className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            disabled={!prompt.trim()}
            onClick={() => void startRun()}
            size="sm"
            type="button"
            variant="default"
          >
            <IconPlayerPlay className="size-3.5" />
            Senden
          </Button>
        )}
        {runMeta?.usage ? (
          <span className="text-[11px] text-muted-foreground">
            {runMeta.usage.input} in · {runMeta.usage.output} out
          </span>
        ) : null}
        {runMeta?.error ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
            <IconCircleX className="size-3" />
            {runMeta.error}
          </span>
        ) : null}
      </div>

      {/* Stream-Ausgabe */}
      {mode !== "off" ? (
        <div
          className="relative max-h-[400px] overflow-auto rounded-lg border bg-[#0e1017] p-3 font-mono text-[12px] leading-relaxed text-white/90"
          ref={scrollerRef}
        >
          {visibleText ? (
            <pre className="whitespace-pre-wrap break-words">{visibleText}</pre>
          ) : (
            <p className="flex items-center gap-2 text-white/40">
              {isLive ? (
                <>
                  <IconLoader2 className="size-3.5 animate-spin" />
                  Agent denkt…
                </>
              ) : (
                "Noch nichts gesendet. Schick einen Prompt, um den Stream zu sehen."
              )}
            </p>
          )}
        </div>
      ) : null}

      {errorText ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">
          {errorText}
        </p>
      ) : null}

      <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        <IconSettings className="-mt-0.5 mr-1 inline size-3" />
        Live-Modus zeigt jedes ankommende Delta. Schalte auf „Final" für nur
        die fertige Antwort, oder „Aus" wenn du den Stream nicht brauchst.
        Stufe 1.3: der letzte Run wird 60s gecached, damit ein Panel-Refresh
        nichts verliert.
      </p>
    </section>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: StreamMode;
  onChange: (m: StreamMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {MODES.map((m) => (
        <button
          aria-pressed={mode === m.id}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
            mode === m.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          key={m.id}
          onClick={() => onChange(m.id)}
          title={m.hint}
          type="button"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function ProviderSelect({
  provider,
  onChange,
}: {
  provider: CliProvider;
  onChange: (p: CliProvider) => void;
}) {
  return (
    <select
      className="h-9 rounded-md border border-border bg-background px-2 text-[12px]"
      onChange={(event) => onChange(event.target.value as CliProvider)}
      value={provider}
    >
      <option value="antigravity">Antigravity (agy)</option>
      <option value="codex">Codex (codex)</option>
      <option value="claude">Claude (claude)</option>
    </select>
  );
}

function ModelInput({
  model,
  onChange,
  provider,
}: {
  model: string;
  onChange: (m: string) => void;
  provider: CliProvider;
}) {
  const placeholder =
    provider === "antigravity"
      ? "auto | gemini-3.8-flash-high | …"
      : provider === "codex"
        ? "gpt-5.5 | gpt-5.6-luna | …"
        : "sonnet | opus | haiku";
  return (
    <input
      className="h-9 rounded-md border border-border bg-background px-2 text-[12px] font-mono"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={model}
    />
  );
}
