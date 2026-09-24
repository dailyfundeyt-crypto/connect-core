/**
 * Dark Aufgabe field — looks like the floating chat composer.
 * @mentions and "quoted" assignments outlined red / blue.
 */

import { IconArrowUp, IconMicrophone, IconPlayerStopFilled } from "@tabler/icons-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Button } from "@/components/ui/button";
import {
  HIGHLIGHT_COLORS,
  highlightSiteTask,
  type SiteTaskAgent,
  type SiteTaskHighlight,
} from "@/lib/companies/site-task-parse";
import { getVoiceSettings } from "@/lib/voice/elevenlabs";
import {
  startMicRecording,
  transcribeWithWhisper,
} from "@/lib/voice/whisper";
import { cn } from "@/lib/utils";

export function SiteAufgabeField({
  agents,
  primaryAgent,
  value,
  onChange,
  onSubmit,
  pending,
  placeholder,
  error,
}: {
  agents: SiteTaskAgent[];
  primaryAgent: { id: string; name: string; avatarSeed?: string } | null;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  pending?: boolean;
  placeholder?: string;
  error?: string | null;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const stopMicRef = useRef<(() => Promise<Blob>) | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      void stopMicRef.current?.().catch(() => {});
    };
  }, []);

  const startVoice = async () => {
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
      /* mic denied */
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
      onChange(value.trim() ? `${value.trim()} ${piece}` : piece);
      requestAnimationFrame(() => areaRef.current?.focus());
    } catch {
      /* transcription failed */
    }
  };

  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, "0");

  const segments = useMemo(
    () => highlightSiteTask(value, agents),
    [value, agents],
  );

  const filtered = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return agents.filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [agents, mentionOpen, mentionQuery]);

  useEffect(() => {
    const area = areaRef.current;
    const back = backdropRef.current;
    if (!area || !back) return;
    const sync = () => {
      back.scrollTop = area.scrollTop;
      back.scrollLeft = area.scrollLeft;
    };
    area.addEventListener("scroll", sync);
    return () => area.removeEventListener("scroll", sync);
  }, []);

  const insertMention = (agent: SiteTaskAgent) => {
    const area = areaRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const at = before.lastIndexOf("@");
    const head = at >= 0 ? before.slice(0, at) : before;
    const next = `${head}@${agent.name} ""${after}`;
    onChange(next);
    setMentionOpen(false);
    setMentionQuery("");
    requestAnimationFrame(() => {
      const pos = head.length + agent.name.length + 3; // after @Name "
      area.focus();
      area.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (mentionOpen && e.key === "Escape") {
      e.preventDefault();
      setMentionOpen(false);
      return;
    }
    if (mentionOpen && e.key === "Enter" && filtered[0]) {
      e.preventDefault();
      insertMention(filtered[0]);
    }
  };

  const onInput = (next: string) => {
    onChange(next);
    const area = areaRef.current;
    if (!area) return;
    const cursor = area.selectionStart;
    const before = next.slice(0, cursor);
    const match = before.match(/@([\w .-]*)$/);
    if (match) {
      setMentionOpen(true);
      setMentionQuery(match[1] ?? "");
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  return (
    <div className="flex flex-col">
      <div className="relative overflow-hidden rounded-b-none bg-[#1c1c1e] text-white">
        {listening ? (
          <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-lg bg-black/40 px-2.5 py-1.5">
            <span className="text-[10px] font-medium tracking-wide text-sky-400">
              Sprache
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] italic text-white/80">
              Sprich den Auftrag…
            </span>
            <span className="font-mono text-[10px] tabular-nums text-white/60">
              {mm}:{ss}
            </span>
            <button
              aria-label="Aufnahme stoppen"
              className="flex size-5 items-center justify-center rounded text-white/80 hover:bg-white/10"
              onClick={() => void stopVoice()}
              type="button"
            >
              <IconPlayerStopFilled className="size-2.5" />
            </button>
          </div>
        ) : null}
        <div className="relative min-h-[6.5rem]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words px-3.5 pt-3 pb-11 text-[13px] leading-relaxed"
            ref={backdropRef}
          >
            {value ? (
              <HighlightLayers segments={segments} />
            ) : (
              <span className="text-white/35">
                {placeholder ??
                  "Aufgabe… @Agent \"Auftrag in Anführungszeichen\""}
              </span>
            )}
          </div>
          <textarea
            className="relative z-[1] min-h-[6.5rem] w-full resize-none bg-transparent px-3.5 pt-3 pb-11 text-[13px] leading-relaxed text-transparent caret-white outline-none"
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            ref={areaRef}
            spellCheck={false}
            value={value}
          />
          {mentionOpen && filtered.length > 0 ? (
            <ul className="absolute bottom-10 left-2 z-10 max-h-40 w-52 overflow-auto rounded-xl border border-white/10 bg-[#2c2c2e] py-1 shadow-xl">
              {filtered.slice(0, 6).map((agent) => (
                <li key={agent.id}>
                  <button
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-white/90 hover:bg-white/10"
                    onClick={() => insertMention(agent)}
                    type="button"
                  >
                    <AbstractAvatar
                      agentId={agent.id}
                      name={agent.name}
                      seed={agent.id}
                      size={18}
                    />
                    <span className="truncate">{agent.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
          <span className="truncate text-[11px] text-white/45">
            {primaryAgent ? primaryAgent.name : "Auto"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              aria-label={listening ? "Aufnahme stoppen" : "Sprachnachricht"}
              className={cn(
                "size-8 rounded-full",
                listening
                  ? "bg-emerald-500 text-white hover:bg-emerald-400"
                  : "text-white/50 hover:bg-white/10 hover:text-white",
              )}
              onClick={() =>
                listening ? void stopVoice() : void startVoice()
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <IconMicrophone className="size-3.5" />
            </Button>
            <Button
              aria-label="Aufgabe senden"
              className="size-8 rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-40"
              disabled={pending || !value.trim()}
              onClick={onSubmit}
              size="icon"
              type="button"
            >
              <IconArrowUp className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="bg-[#1c1c1e] px-3 pb-2 text-[11px] text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function HighlightLayers({
  segments,
}: {
  segments: SiteTaskHighlight[];
}) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "plain") {
          return (
            <span className="text-white/90" key={i}>
              {seg.text}
            </span>
          );
        }
        const colors = HIGHLIGHT_COLORS[seg.color];
        return (
          <span
            className={cn("rounded-[3px] px-0.5")}
            key={i}
            style={{
              color: colors.text,
              backgroundColor: colors.bg,
              boxShadow: `inset 0 0 0 1.5px ${colors.outline}`,
            }}
          >
            {seg.text}
          </span>
        );
      })}
    </>
  );
}
