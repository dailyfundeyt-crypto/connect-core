/**
 * Bottom Z-composer for Unternehmen site tasks — minimal floating card.
 * Agent + optional marks + instruction, voice, and quick bug chips.
 */

import {
  IconMicrophone,
  IconPlayerStopFilled,
  IconRobot,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Button } from "@/components/ui/button";
import { ensureAgentBrowserStarted } from "@/lib/agents/agent-browser";
import { type AgentProfile } from "@/lib/agents/queries";
import { useStartChannel } from "@/lib/channels/start";
import {
  buildSiteTaskPrompt,
  clearSiteMarks,
  getSiteMark,
  setSiteMarkAgent,
  setSiteMarking,
  subscribeSiteMark,
  type SiteMarkState,
} from "@/lib/companies/site-mark";
import { getVoiceSettings } from "@/lib/voice/elevenlabs";
import {
  startMicRecording,
  transcribeWithWhisper,
} from "@/lib/voice/whisper";
import { cn } from "@/lib/utils";

// cn used for floating card / chip / mic states

const BUG_CHIPS = [
  "Finde Bugs auf dieser Seite",
  "Console-Fehler und Warnungen prüfen",
  "Kaputte Links und 404s finden",
  "Layout-Brüche auf Mobile prüfen",
  "Formulare und Validierung testen",
  "A11y: Fokus, Kontrast, Labels",
] as const;

export function SiteTaskComposer({
  companyId,
  companyName,
  siteUrl,
  agents,
}: {
  companyId: string;
  companyName: string;
  siteUrl: string;
  agents: AgentProfile[];
}) {
  const { startChosen, pending } = useStartChannel();
  const [mark, setMark] = useState<SiteMarkState>(() => getSiteMark(companyId));
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const stopMicRef = useRef<(() => Promise<Blob>) | null>(null);
  const timerRef = useRef<number | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMark(getSiteMark(companyId));
    return subscribeSiteMark(() => setMark(getSiteMark(companyId)));
  }, [companyId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      void stopMicRef.current?.().catch(() => {});
    };
  }, []);

  const agent = agents.find((a) => a.id === mark.agentId) ?? null;
  const hasMarks = mark.marks.length > 0;
  const show = Boolean(agent) || mark.marking || hasMarks;

  if (!show) return null;

  const dismiss = () => {
    setSiteMarkAgent(companyId, null);
    setSiteMarking(companyId, false);
    clearSiteMarks(companyId);
    setText("");
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!agent) {
      setError("Links einen Agenten auswählen.");
      return;
    }
    const task = text.trim();
    if (!task) {
      setError("Auftrag schreiben.");
      return;
    }
    const prompt = buildSiteTaskPrompt({
      siteUrl,
      companyName,
      marks: mark.marks,
      task,
    });
    try {
      void ensureAgentBrowserStarted(agent.id);
      await startChosen(agent.id, prompt);
      setText("");
      clearSiteMarks(companyId);
      setSiteMarking(companyId, false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Auftrag konnte nicht gestartet werden.",
      );
    }
  };

  const startVoice = async () => {
    setError(null);
    try {
      const session = await startMicRecording();
      stopMicRef.current = session.stop;
      setListening(true);
      setSeconds(0);
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      );
    } catch {
      setError("Mikrofon nicht verfügbar.");
    }
  };

  const stopVoice = async () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stop = stopMicRef.current;
    stopMicRef.current = null;
    setListening(false);
    if (!stop) return;
    try {
      const blob = await stop();
      const transcript = await transcribeWithWhisper(blob, {
        language: getVoiceSettings().language,
      });
      const piece = transcript.trim();
      if (!piece) return;
      setText((prev) => {
        const t = prev.trim();
        return t ? `${t} ${piece}` : piece;
      });
      requestAnimationFrame(() => areaRef.current?.focus());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Spracherkennung fehlgeschlagen.",
      );
    }
  };

  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl",
          "border border-neutral-200/90 bg-white/95",
          "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] backdrop-blur-sm",
        )}
      >
        <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1">
          {agent ? (
            <>
              <AbstractAvatar
                agentId={agent.id}
                name={agent.name}
                seed={agent.avatarSeed}
                size={20}
              />
              <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">
                {agent.name}
              </span>
            </>
          ) : (
            <>
              <IconRobot
                className="size-4 shrink-0 text-neutral-400"
                stroke={1.5}
              />
              <span className="text-[13px] text-neutral-400">
                Links einen Agenten wählen
              </span>
            </>
          )}

          {hasMarks ? (
            <span className="ml-auto rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              {mark.marks.length} Markierung
              {mark.marks.length === 1 ? "" : "en"}
            </span>
          ) : (
            <span className="ml-auto" />
          )}

          <button
            aria-label="Schließen"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            onClick={dismiss}
            type="button"
          >
            <IconX className="size-3.5" stroke={1.75} />
          </button>
        </div>

        {listening ? (
          <div className="mx-3.5 mb-1.5 flex items-center gap-2.5 rounded-xl bg-[#2b2b2f] px-3 py-2 text-white">
            <span className="text-[11px] font-medium tracking-wide text-sky-400">
              Sprache
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] italic text-white/85">
              Sprich den Auftrag…
            </span>
            <span aria-hidden className="flex items-end gap-0.5 pb-0.5">
              {[3, 5, 4, 7, 3, 5].map((h, i) => (
                <span
                  className="w-0.5 animate-pulse rounded-full bg-white/75"
                  key={i}
                  style={{ height: h * 2, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-white/70">
              {mm}:{ss}
            </span>
            <button
              aria-label="Aufnahme stoppen"
              className="flex size-6 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
              onClick={() => void stopVoice()}
              type="button"
            >
              <IconPlayerStopFilled className="size-3" />
            </button>
          </div>
        ) : null}

        <div className="px-3.5 pt-1 pb-3">
          <textarea
            className={cn(
              "min-h-[4.25rem] w-full resize-none rounded-xl border-0 bg-transparent",
              "px-0.5 py-1 text-[14px] leading-relaxed text-neutral-900",
              "outline-none placeholder:text-neutral-400 focus:ring-0",
            )}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={
              agent
                ? `@${agent.name} und …`
                : "Zuerst links einen Agenten anklicken…"
            }
            ref={areaRef}
            value={text}
          />

          <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {BUG_CHIPS.map((chip) => {
              const active = text.includes(chip);
              return (
                <button
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition",
                    active
                      ? "border-neutral-800 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:bg-white",
                  )}
                  key={chip}
                  onClick={() => {
                    setText((prev) => {
                      const t = prev.trim();
                      if (t.includes(chip)) return t;
                      return t ? `${t}\n${chip}` : chip;
                    });
                    areaRef.current?.focus();
                  }}
                  type="button"
                >
                  {chip}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[10px] leading-snug text-neutral-400">
              ⌘/Ctrl+Enter senden · Agent öffnet die Seite mit Browser Use
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                aria-label={listening ? "Aufnahme stoppen" : "Sprachnachricht"}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition",
                  listening
                    ? "bg-emerald-500 text-white"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
                )}
                disabled={pending}
                onClick={() =>
                  listening ? void stopVoice() : void startVoice()
                }
                type="button"
              >
                <IconMicrophone className="size-3.5" stroke={1.75} />
              </button>
              <Button
                className="h-8 gap-1.5 rounded-full px-3.5"
                disabled={pending || !agent || !text.trim()}
                onClick={() => void submit()}
                size="sm"
                type="button"
              >
                <IconSend className="size-3.5" stroke={1.75} />
                Auftrag
              </Button>
            </div>
          </div>

          {error ? (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
