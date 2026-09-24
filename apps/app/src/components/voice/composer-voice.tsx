import {
  IconMicrophone,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getVoiceSettings } from "@/lib/voice/elevenlabs";
import {
  startMicRecording,
  transcribeWithWhisper,
} from "@/lib/voice/whisper";
import { cn } from "@/lib/utils";

/**
 * Push-to-talk mic for the composer: records locally, transcribes with Whisper,
 * and returns the text (to fill the draft or auto-send).
 */
export function ComposerMicButton({
  disabled,
  onTranscript,
  onRecordingChange,
  className,
}: {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<Blob>) | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      void stopRef.current?.().catch(() => {});
    };
  }, []);

  const setRecordingState = (next: boolean) => {
    setRecording(next);
    onRecordingChange?.(next);
  };

  const start = async () => {
    setError(null);
    try {
      const session = await startMicRecording();
      stopRef.current = session.stop;
      setRecordingState(true);
      setSeconds(0);
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      );
    } catch {
      setError("Mikrofon nicht verfügbar.");
    }
  };

  const stop = async () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stopFn = stopRef.current;
    stopRef.current = null;
    setRecordingState(false);
    if (!stopFn) return;
    try {
      const blob = await stopFn();
      const text = await transcribeWithWhisper(blob, {
        language: getVoiceSettings().language,
      });
      onTranscript(text);
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
    <div className={cn("relative flex items-center", className)}>
      {recording ? (
        <div className="mr-1 flex items-center gap-2 rounded-full bg-[#3c4043] px-2.5 py-1 text-white">
          <button
            aria-label="Aufnahme stoppen"
            className="flex size-5 items-center justify-center rounded-sm bg-white/90 text-[#3c4043]"
            onClick={() => void stop()}
            type="button"
          >
            <IconPlayerStopFilled className="size-3" />
          </button>
          <span className="font-mono text-xs tabular-nums">
            {mm}:{ss}
          </span>
          <span className="flex items-end gap-0.5 pb-0.5" aria-hidden>
            {[3, 5, 4, 6, 3].map((h, i) => (
              <span
                className="w-0.5 animate-pulse rounded-full bg-white/80"
                key={i}
                style={{
                  height: h * 2,
                  animationDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </span>
        </div>
      ) : null}
      <Button
        aria-label={recording ? "Aufnahme stoppen" : "Sprachnachricht"}
        className={cn(
          "size-8 shrink-0 rounded-full p-0",
          recording && "bg-emerald-500 text-white hover:bg-emerald-400",
        )}
        disabled={disabled && !recording}
        onClick={() => (recording ? void stop() : void start())}
        size="icon"
        type="button"
        variant="ghost"
      >
        <IconMicrophone className="size-4" />
      </Button>
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Listening placeholder swap for the composer while recording. */
export function listeningPlaceholder(active: boolean, fallback: string) {
  return active ? "Hört zu..." : fallback;
}
