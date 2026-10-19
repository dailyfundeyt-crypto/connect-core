import {
  IconChevronDown,
  IconHeadphones,
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconVolume,
  IconWaveSine,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { BRAIN_FM_TRACKS } from "@/lib/audio/brainfm-tracks";
import { type AudioSettings, type BrainwaveFrequency, FREQUENCY_CONFIG, focusAudio } from "@/lib/audio/focus-audio";
import { getMusicQueue } from "@/lib/audio/music-library";
import { MusicLibraryPanel } from "@/components/audio/music-library-panel";

export function useFocusAudio(): AudioSettings {
  const [s, setS] = useState<AudioSettings>(() => focusAudio.getSettings());
  useEffect(() => focusAudio.subscribe((n) => setS(n)), []);
  return s;
}

/**
 * Musik & Beats fürs Handy-Kalender-Popover (helium-focuschain3). Gleiche Engine wie das
 * Profilmenü am PC (focusAudio, Brain.fm-Titel + Binaural Beats), spielt direkt im Browser.
 */
export function MobileMusicCard() {
  const s = useFocusAudio();
  const playing = s.isPlaying || s.isPlayingTrack;
  const title =
    s.isPlayingTrack && s.currentTrack
      ? s.currentTrack.title
      : s.isPlaying
        ? FREQUENCY_CONFIG[s.frequency as Exclude<BrainwaveFrequency, "off">]?.label || "Binaural Beats"
        : s.currentTrack?.title || BRAIN_FM_TRACKS[0]?.title || "Musik";
  const sub = s.isPlayingTrack && s.currentTrack ? s.currentTrack.zoneLabel : s.isPlaying ? "Binaural Beats" : "Musik & Beats";

  const toggle = () => {
    if (s.isPlayingTrack || (s.currentTrack && !s.isPlaying)) focusAudio.toggleBrainFmTrack(s.currentTrack ?? undefined);
    else if (s.isPlaying) focusAudio.toggle();
    else if (BRAIN_FM_TRACKS[0]) void focusAudio.playBrainFmTrack(BRAIN_FM_TRACKS[0]);
  };
  const next = () => stepTrack(s, 1);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-[28px] border border-white/10 bg-[#1c1c1e] p-3 pl-4 text-white shadow-2xl" data-testid="mobile-music-card">
      <button aria-label="Musik-Vollansicht öffnen" className="flex min-w-0 flex-1 items-center gap-3 text-left" data-testid="music-open-sheet" onClick={() => setSheet(true)} type="button">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          {playing ? <IconHeadphones className="size-5 animate-pulse" /> : <IconMusic className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{title}</span>
          <span className="block truncate text-[12px] text-white/45">{sub}</span>
        </span>
      </button>
      <button
        aria-label={playing ? "Musik pausieren" : "Musik abspielen"}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black active:scale-95"
        onClick={toggle}
        type="button"
      >
        {playing ? <IconPlayerPauseFilled className="size-4" /> : <IconPlayerPlayFilled className="ml-0.5 size-4" />}
      </button>
      <button
        aria-label="Nächster Titel"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/80 active:scale-95"
        onClick={next}
        type="button"
      >
        <IconPlayerTrackNextFilled className="size-4" />
      </button>
      {sheet ? createPortal(<MobileMusicSheet onClose={() => setSheet(false)} />, document.body) : null}
    </div>
  );
}

function stepTrack(s: AudioSettings, d: 1 | -1) {
  // Weiter/Zurück im zuletzt gewählten Ordner (sonst Brain.fm-Liste)
  const list = getMusicQueue();
  if (list.length === 0) return;
  const i = s.currentTrack ? list.findIndex((t) => t.id === s.currentTrack?.id) : -1;
  const n = list.length;
  const t = list[(((i < 0 && d < 0 ? 0 : i) + d) % n + n) % n];
  if (t) void focusAudio.playBrainFmTrack(t);
}

const fmt = (sec: number) => {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
};

/**
 * Musik-Vollansicht (Handy): großes Cover, Titel/Quelle, Fortschritt, große Steuerung,
 * Lautstärke, Titelliste (Brain.fm) + Binaural-Beats. Schließen per X oder nach unten wischen.
 */
export function MobileMusicSheet({ onClose }: { onClose: () => void }) {
  const s = useFocusAudio();
  const [dragY, setDragY] = useState(0);
  const [waveLevels, setWaveLevels] = useState<number[]>(() =>
    Array.from({ length: 64 }, () => 0.08),
  );
  const start = useRef<number | null>(null);
  const track = s.currentTrack ?? BRAIN_FM_TRACKS[0] ?? null;
  const playing = s.isPlayingTrack;
  const accent =
    track?.zone === "delta" ? "#60a5fa" :
    track?.zone === "theta" ? "#a78bfa" :
    track?.zone === "beta" ? "#fbbf24" :
    track?.zone === "gamma" ? "#fb7185" :
    track?.zone === "alpha" ? "#34d399" : "#22c55e";
  const progress = s.trackDuration > 0 ? Math.min(1, s.trackProgress / s.trackDuration) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWaveLevels(focusAudio.getVisualizerLevels(64));
    }, 90);
    return () => window.clearInterval(timer);
  }, []);

  const wavePhase = Date.now() / 420;
  const wavePath = waveLevels
    .map((level, index) => {
      const x = (index / (waveLevels.length - 1)) * 480;
      const amplitude = (playing ? 1.5 : 1) + level * (playing ? 4 : 2);
      const y = 48 + Math.sin(index * 0.72 + wavePhase) * amplitude;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const progressIndex = progress * (waveLevels.length - 1);
  const progressFloor = Math.floor(progressIndex);
  const progressRatio = progressIndex - progressFloor;
  const waveYAt = (index: number) => {
    const level = waveLevels[index] ?? 0.08;
    const amplitude = (playing ? 1.5 : 1) + level * (playing ? 4 : 2);
    return 48 + Math.sin(index * 0.72 + wavePhase) * amplitude;
  };
  const progressY = waveYAt(progressFloor) + (waveYAt(Math.min(progressFloor + 1, waveLevels.length - 1)) - waveYAt(progressFloor)) * progressRatio;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggle = () => {
    if (s.currentTrack) focusAudio.toggleBrainFmTrack();
    else if (track) void focusAudio.playBrainFmTrack(track);
  };

  return (
    <div
      aria-label="Musik"
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#07080c] text-white animate-in slide-in-from-bottom-6 fade-in-0 duration-200 md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(860px,92vh)] md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[32px] md:border md:border-white/10 md:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.85)]"
      data-testid="music-sheet"
      role="dialog"
      style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, background: `radial-gradient(120% 60% at 50% 0%, ${accent}33 0%, #07080c 60%)` }}
    >
      <div
        className="flex touch-none items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]"
        onPointerDown={(e) => {
          start.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current != null) setDragY(Math.max(0, e.clientY - start.current));
        }}
        onPointerUp={() => {
          if (dragY > 90) onClose();
          setDragY(0);
          start.current = null;
        }}
      >
        <button aria-label="Schließen" className="flex size-10 items-center justify-center rounded-full bg-white/[0.06] active:scale-95" onClick={onClose} type="button">
          <IconChevronDown className="size-6" />
        </button>
        <span className="h-1 w-10 rounded-full bg-white/20" />
        <span className="w-10 text-right text-[11px] uppercase tracking-[0.2em] text-white/40">Musik</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mt-3 flex aspect-square w-full max-w-[300px] items-center justify-center">
          <div
            aria-label={playing ? "Schallplatte dreht sich" : "Schallplatte steht"}
            className={cn(
              "relative flex size-[92%] items-center justify-center rounded-full shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]",
              playing && "animate-[spin_36s_linear_infinite]",
            )}
            role="img"
            style={{
              background:
                "repeating-radial-gradient(circle at center, #17191f 0 2px, #20232a 3px 4px, #111318 5px 7px)",
            }}
          >
            <span className="absolute inset-[10%] rounded-full border border-white/[0.08]" />
            <span className="absolute inset-[18%] rounded-full border border-white/[0.06]" />
            <span className="absolute inset-[27%] rounded-full border border-white/[0.08]" />
            <span
              className="relative flex size-[34%] items-center justify-center rounded-full shadow-inner"
              style={{ background: `radial-gradient(circle at 35% 30%, ${accent}, #101114 82%)` }}
            >
              <span className="absolute size-2 rounded-full bg-black/70 ring-2 ring-white/30" />
              <IconHeadphones className="size-1/2 text-white/80" stroke={1.4} />
            </span>
          </div>
        </div>

        <div className="mt-6">
          <p className="truncate font-semibold text-[24px] tracking-tight">{track?.title ?? "Musik"}</p>
          <p className="truncate text-[14px] text-white/50">{track ? (track.id.startsWith("pc:") ? `PC-Musik · ${track.promptTitle}` : `${track.zoneLabel} · ${track.zoneHz} · Brain.fm`) : "Musik & Beats"}</p>
        </div>

        <div className="mt-5">
          <div className="group relative h-12 touch-none" data-testid="music-waveform-seek">
            <svg
              aria-hidden="true"
              className="h-full w-full overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 480 96"
            >
              <path d={wavePath} fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="4" strokeLinecap="round" />
              <path d={wavePath} fill="none" stroke={accent} strokeOpacity="0.68" strokeWidth="2" strokeLinecap="round" />
              <circle cx={progress * 480} cy={progressY} r="7" fill="white" fillOpacity="0.12" />
              <circle cx={progress * 480} cy={progressY} r="3.5" fill="white" />
            </svg>
            <input
              aria-label="Wiedergabeposition in der Wellenform"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              max={Math.max(1, Math.floor(s.trackDuration))}
              min={0}
              onChange={(e) => focusAudio.seekTrack(Number(e.target.value))}
              type="range"
              value={Math.floor(s.trackProgress)}
            />
          </div>
          <div className="mt-1 flex justify-between text-[12px] tabular-nums text-white/40">
            <span>{fmt(s.trackProgress)}</span>
            <span>{fmt(s.trackDuration)}</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-8">
          <button aria-label="Vorheriger Titel" className="flex size-14 items-center justify-center rounded-full text-white/85 active:scale-95" onClick={() => stepTrack(s, -1)} type="button">
            <IconPlayerTrackPrevFilled className="size-7" />
          </button>
          <button aria-label={playing ? "Pause" : "Abspielen"} className="flex size-20 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_40px_-10px_rgba(255,255,255,0.5)] active:scale-95" onClick={toggle} type="button">
            {playing ? <IconPlayerPauseFilled className="size-8" /> : <IconPlayerPlayFilled className="ml-1 size-8" />}
          </button>
          <button aria-label="Nächster Titel" className="flex size-14 items-center justify-center rounded-full text-white/85 active:scale-95" onClick={() => stepTrack(s, 1)} type="button">
            <IconPlayerTrackNextFilled className="size-7" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <IconVolume className="size-5 shrink-0 text-white/50" />
          <input
            aria-label="Lautstärke"
            className="h-1 flex-1 cursor-pointer accent-white"
            max={100}
            min={0}
            onChange={(e) => focusAudio.setVolume(Number(e.target.value) / 100)}
            type="range"
            value={Math.round(s.volume * 100)}
          />
          <span className="w-9 text-right text-[12px] tabular-nums text-white/40">{Math.round(s.volume * 100)}%</span>
        </div>

        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
            <IconWaveSine className="size-3.5" /> Binaural Beats
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(["gamma", "alpha", "theta", "delta"] as const).map((f) => {
              const on = s.isPlaying && s.frequency === f;
              return (
                <button
                  className={cn("h-10 rounded-2xl border text-[13px] capitalize active:scale-95", on ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/70")}
                  key={f}
                  onClick={() => {
                    if (on) focusAudio.toggle();
                    else {
                      focusAudio.setFrequency(f);
                      if (!s.isPlaying) focusAudio.toggle();
                    }
                  }}
                  type="button"
                >
                  {f}
                </button>
              );
            })}
          </div>
          {s.frequency !== "off" ? (
            <label className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
              <IconVolume className="size-4 shrink-0 text-white/45" />
              <span className="w-[118px] shrink-0 text-[12px] text-white/65">{FREQUENCY_CONFIG[s.frequency].label.split(" ")[0]} Lautstärke</span>
              <input
                aria-label={`${FREQUENCY_CONFIG[s.frequency].label.split(" ")[0]} Lautstärke`}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-300"
                max={100}
                min={0}
                onChange={(event) => focusAudio.setFrequencyVolume(s.frequency as Exclude<BrainwaveFrequency, "off">, Number(event.target.value) / 100)}
                type="range"
                value={Math.round(s.frequencyVolumes[s.frequency] * 100)}
              />
              <span className="w-9 text-right text-[11px] tabular-nums text-white/40">{Math.round(s.frequencyVolumes[s.frequency] * 100)}%</span>
            </label>
          ) : null}
        </div>

        <MusicLibraryPanel className="mt-6" dark />
      </div>
    </div>
  );
}
