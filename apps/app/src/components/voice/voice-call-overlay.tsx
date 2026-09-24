import {
  IconMessageCircle,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconPlayerPlay,
  IconSettings,
  IconWaveSine,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Button } from "@/components/ui/button";
import { getLocalProfile } from "@/lib/auth/local-profile";
import { getAgentApiKeys } from "@/lib/agents/agent-api-keys";
import {
  getAgentVoiceSettings,
  resolveCallVoice,
  setAgentVoiceSettings,
  subscribeAgentVoiceSettings,
} from "@/lib/voice/agent-voice";
import { playCallTone } from "@/lib/voice/call-tones";
import {
  getVoiceSettings,
  playElevenLabsAudio,
  setVoiceDefaults,
  speakWithElevenLabs,
  subscribeVoiceSettings,
  takeActiveKey,
  VOICE_PRESETS,
} from "@/lib/voice/elevenlabs";
import {
  startLiveSpeech,
  startMicRecording,
  transcribeWithWhisper,
} from "@/lib/voice/whisper";
import { cn } from "@/lib/utils";

type CallPhase = "idle" | "listening" | "thinking" | "speaking";

type CallVoiceUi = {
  voiceId: string;
  voiceLabel: string;
  speed: number;
  language: string;
};

/**
 * Meet-style voice call card: local Whisper (or Web Speech) in,
 * ElevenLabs voice out, Zoom/Meet join tones, Stimme/Speed/Sprache.
 * When `agentId` is set, Stimme/Speed/Sprache persist on that bot.
 */
export function VoiceCallOverlay({
  open,
  onClose,
  agentName,
  agentId,
  onUserUtterance,
}: {
  open: boolean;
  onClose: () => void;
  agentName: string;
  agentId?: string;
  /** Return the agent's reply text for TTS. */
  onUserUtterance: (text: string) => Promise<string>;
}) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [settings, setSettings] = useState<CallVoiceUi>(() =>
    resolveCallVoice(agentId),
  );
  const [seconds, setSeconds] = useState(0);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const liveStopRef = useRef<(() => void) | null>(null);
  const recorderStopRef = useRef<(() => Promise<Blob>) | null>(null);
  const handlingRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const refresh = () => setSettings(resolveCallVoice(agentId));
    refresh();
    const unsubGlobal = subscribeVoiceSettings(refresh);
    const unsubAgent = subscribeAgentVoiceSettings(refresh);
    return () => {
      unsubGlobal();
      unsubAgent();
    };
  }, [agentId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      teardown();
      setPhase("idle");
      setTranscript("");
      setReply("");
      setError(null);
      setMuted(false);
      return;
    }
    playCallTone("join");
    void beginListening();
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function teardown() {
    liveStopRef.current?.();
    liveStopRef.current = null;
    if (recorderStopRef.current) {
      void recorderStopRef.current().catch(() => {});
      recorderStopRef.current = null;
    }
  }

  function persistCallSettings(patch: {
    voiceId?: string;
    voiceLabel?: string;
    speed?: number;
    language?: string;
  }) {
    if (agentId) {
      const agentPatch: Parameters<typeof setAgentVoiceSettings>[1] = {};
      if (patch.voiceId !== undefined) {
        // Empty string = Nicht festgelegt → inherit global for calls.
        agentPatch.voiceId = patch.voiceId;
        agentPatch.voiceLabel = patch.voiceLabel ?? "";
      }
      if (typeof patch.speed === "number") agentPatch.speed = patch.speed;
      if (patch.language !== undefined) agentPatch.language = patch.language;
      setAgentVoiceSettings(agentId, agentPatch);
      setSettings(resolveCallVoice(agentId));
      return;
    }
    setVoiceDefaults(patch);
    setSettings(resolveCallVoice(undefined));
  }

  async function beginListening() {
    if (muted) {
      setPhase("idle");
      return;
    }
    setError(null);
    setPhase("listening");
    setTranscript("");

    const lang = settingsRef.current.language;

    // Parallel: live captions (Web Speech) + Whisper clip for accuracy.
    const live = startLiveSpeech({
      language: lang,
      onInterim: (text) => setTranscript(text),
      onFinal: (text) => {
        if (!handlingRef.current) void handleFinal(text);
      },
      onError: (message) => setError(message),
    });
    liveStopRef.current = live?.stop ?? null;

    try {
      const recording = await startMicRecording();
      recorderStopRef.current = recording.stop;
      // Auto-stop after a natural pause window if Web Speech did not finalize.
      window.setTimeout(() => {
        if (phaseRef.current === "listening" && !handlingRef.current) {
          void finalizeFromWhisper();
        }
      }, 6_000);
    } catch {
      if (!live) {
        setError("Mikrofon-Berechtigung wird für Sprachanrufe benötigt.");
        setPhase("idle");
      }
    }
  }

  async function finalizeFromWhisper() {
    if (handlingRef.current) return;
    const stop = recorderStopRef.current;
    recorderStopRef.current = null;
    liveStopRef.current?.();
    liveStopRef.current = null;
    if (!stop) return;
    try {
      const blob = await stop();
      const text = await transcribeWithWhisper(blob, {
        language: settingsRef.current.language,
      });
      await handleFinal(text);
    } catch (caught) {
      if (phaseRef.current === "listening") {
        setError(
          caught instanceof Error
            ? caught.message
            : "Spracherkennung fehlgeschlagen.",
        );
        setPhase("idle");
      }
    }
  }

  async function handleFinal(text: string) {
    if (handlingRef.current || !text.trim()) return;
    handlingRef.current = true;
    liveStopRef.current?.();
    liveStopRef.current = null;
    if (recorderStopRef.current) {
      void recorderStopRef.current().catch(() => {});
      recorderStopRef.current = null;
    }
    setPhase("thinking");
    setTranscript(text);
    try {
      const answer = await onUserUtterance(text.trim());
      setReply(answer);
      setPhase("speaking");
      playCallTone("speak");
      const voice = settingsRef.current;
      if (
        takeActiveKey({ voiceId: voice.voiceId }) ||
        (agentId && getAgentApiKeys(agentId).elevenLabs.trim())
      ) {
        const buffer = await speakWithElevenLabs(answer, {
          voiceId: voice.voiceId,
          agentId,
        });
        await playElevenLabsAudio(buffer, { speed: voice.speed });
      } else {
        await speakBrowser(answer, voice.language, voice.speed);
      }
      handlingRef.current = false;
      if (!muted) void beginListening();
      else setPhase("idle");
    } catch (caught) {
      handlingRef.current = false;
      setError(
        caught instanceof Error ? caught.message : "Sprachanruf fehlgeschlagen",
      );
      setPhase("idle");
    }
  }

  async function previewVoice(voiceId: string) {
    if (!voiceId || previewing) return;
    setPreviewing(voiceId);
    try {
      if (
        takeActiveKey({ voiceId }) ||
        (agentId && getAgentApiKeys(agentId).elevenLabs.trim())
      ) {
        const buffer = await speakWithElevenLabs(
          "Hallo, so klinge ich in Telefonaten.",
          { voiceId, agentId },
        );
        await playElevenLabsAudio(buffer, { speed: settings.speed });
      } else {
        await speakBrowser(
          "Hallo, so klinge ich in Telefonaten.",
          settings.language,
          settings.speed,
        );
      }
    } catch {
      /* preview is best-effort */
    } finally {
      setPreviewing(null);
    }
  }

  if (!open) return null;

  const profile = getLocalProfile();
  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const agentVoiceId = agentId
    ? getAgentVoiceSettings(agentId).voiceId
    : settings.voiceId;
  const selectVoiceValue = agentId
    ? agentVoiceId
    : settings.voiceId || getVoiceSettings().voiceId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-black/5 bg-white shadow-2xl shadow-black/20">
        {/* Connection strip — bot ↔ you */}
        <div className="px-5 pt-5">
          <div className="flex items-center justify-center gap-3 rounded-full bg-[#f3f4f6] px-4 py-3">
            <AbstractAvatar
              agentId={agentId}
              name={agentName}
              seed={agentId ?? agentName}
              size={40}
            />
            <div className="flex flex-1 items-center justify-center gap-1 px-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  className={cn(
                    "size-1 rounded-full bg-foreground/20",
                    phase === "listening" || phase === "speaking"
                      ? "animate-pulse bg-foreground/45"
                      : "",
                  )}
                  key={i}
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            <div className="size-10 overflow-hidden rounded-full bg-muted">
              {profile.avatarUrl ? (
                <img
                  alt=""
                  className="size-full object-cover"
                  src={profile.avatarUrl}
                />
              ) : (
                <div className="flex size-full items-center justify-center text-xs font-semibold text-muted-foreground">
                  {(profile.name || "Du").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 text-center">
            <p className="text-sm font-semibold text-foreground">{agentName}</p>
            <p className="text-xs text-muted-foreground">
              {phase === "listening"
                ? `Hört zu… · ${mm}:${ss}`
                : phase === "thinking"
                  ? "Denkt nach…"
                  : phase === "speaking"
                    ? "Spricht…"
                    : muted
                      ? "Stumm"
                      : "Bereit"}
            </p>
            {(transcript || reply) && (
              <p className="mt-2 line-clamp-3 px-2 text-xs text-foreground/80">
                {phase === "speaking" ? reply : transcript}
              </p>
            )}
            {error ? (
              <p className="mt-2 px-2 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-5 flex items-center justify-center gap-3 px-5">
          <Button
            aria-label="Call settings"
            className="size-12 rounded-full bg-[#f3f4f6] text-foreground hover:bg-[#e8eaed]"
            onClick={() => setShowSettings((v) => !v)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconSettings className="size-5" />
          </Button>
          <Button
            aria-label="Show chat"
            className="size-12 rounded-full bg-[#f3f4f6] text-foreground hover:bg-[#e8eaed]"
            onClick={() => {
              playCallTone("leave");
              onClose();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconMessageCircle className="size-5" />
          </Button>
          <Button
            aria-label={muted ? "Unmute" : "Mute"}
            className="size-12 rounded-full bg-[#f3f4f6] text-foreground hover:bg-[#e8eaed]"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              playCallTone(next ? "mute" : "unmute");
              if (next) {
                teardown();
                setPhase("idle");
              } else {
                void beginListening();
              }
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            {muted ? (
              <IconMicrophoneOff className="size-5" />
            ) : (
              <IconMicrophone className="size-5" />
            )}
          </Button>
          <Button
            aria-label="End call"
            className="size-14 rounded-full bg-[#ea4335] text-white hover:bg-[#d93025]"
            onClick={() => {
              playCallTone("leave");
              onClose();
            }}
            size="icon"
            type="button"
          >
            <IconX className="size-6" stroke={2.5} />
          </Button>
        </div>

        {/* Stimme / Geschwindigkeit / Sprache */}
        {showSettings ? (
          <div className="mt-5 space-y-3 border-t border-black/5 px-5 py-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground/80">Stimme</span>
              <div className="flex items-center gap-1">
                <select
                  className="h-9 min-w-32 rounded-xl border border-black/8 bg-[#f8f9fa] px-3 text-sm outline-none focus:border-foreground/25"
                  onChange={(e) => {
                    const voiceId = e.target.value;
                    const preset = VOICE_PRESETS.find((p) => p.id === voiceId);
                    persistCallSettings({
                      voiceId,
                      voiceLabel: preset?.label,
                    });
                  }}
                  value={selectVoiceValue}
                >
                  {agentId ? (
                    <option value="">Nicht festgelegt</option>
                  ) : null}
                  {VOICE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {selectVoiceValue ? (
                  <button
                    aria-label="Stimme anhören"
                    className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-[#f3f4f6] hover:text-foreground disabled:opacity-50"
                    disabled={previewing === selectVoiceValue}
                    onClick={() => void previewVoice(selectVoiceValue)}
                    type="button"
                  >
                    <IconPlayerPlay className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
            <VoiceSelect
              label="Geschwindigkeit"
              onChange={(speed) =>
                persistCallSettings({ speed: Number(speed) })
              }
              options={[
                { value: "0.75", label: "0.75x" },
                { value: "1", label: "1x" },
                { value: "1.25", label: "1.25x" },
                { value: "1.5", label: "1.5x" },
              ]}
              value={String(settings.speed)}
            />
            <VoiceSelect
              label="Sprache"
              onChange={(language) => persistCallSettings({ language })}
              options={[
                { value: "auto", label: "Auto-detect" },
                { value: "de-DE", label: "Deutsch" },
                { value: "en-US", label: "English" },
              ]}
              value={settings.language}
            />
          </div>
        ) : (
          <div className="h-4" />
        )}
      </div>
    </div>
  );
}

function VoiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium text-foreground/80">{label}</span>
      <select
        className="h-9 min-w-32 rounded-xl border border-black/8 bg-[#f8f9fa] px-3 text-sm outline-none focus:border-foreground/25"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function speakBrowser(
  text: string,
  language: string,
  speed = 1,
): Promise<void> {
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = language === "auto" ? "de-DE" : language;
    utter.rate = speed;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

/** Waveform button that opens the Meet-style voice call. */
export function VoiceCallButton({
  className,
  onClick,
  active,
}: {
  className?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Button
      aria-label="Sprachanruf starten"
      className={cn(
        "size-8 rounded-full p-0",
        active
          ? "bg-foreground text-background hover:bg-foreground/90"
          : "bg-foreground text-background hover:bg-foreground/90",
        className,
      )}
      onClick={onClick}
      size="icon"
      type="button"
    >
      <IconWaveSine className="size-4" />
    </Button>
  );
}

export function VoiceCallHangupIcon() {
  return <IconPhoneOff className="size-5" />;
}
