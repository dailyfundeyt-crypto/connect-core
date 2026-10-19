import {
  IconCheck,
  IconClock,
  IconHeadphones,
  IconMoon,
  IconMusic,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconPlus,
  IconRepeat,
  IconTrash,
  IconUpload,
  IconVolume,
  IconVolume2,
  IconVolume3,
  IconVolumeOff,
  IconWaveSine,
  IconSparkles,
} from "@tabler/icons-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  focusAudio,
  FREQUENCY_CONFIG,
  SOUNDSCAPES_CONFIG,
  type AudioSettings,
  type BrainwaveFrequency,
  type SoundscapeType,
} from "@/lib/audio/focus-audio";
import { BRAIN_FM_TRACKS, type BrainFmTrack } from "@/lib/audio/brainfm-tracks";
import { MusicLibraryPanel } from "@/components/audio/music-library-panel";
import {
  listCustomAudioTracks,
  saveCustomAudioTrack,
  deleteCustomAudioTrack,
  type CustomAudioTrack,
} from "@/lib/audio/custom-audio-store";

function formatSeconds(secs: number) {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Spotify-inspired Minimalist Audio Studio Dialog with Custom Upload Section
 */
export function AudioStudioDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings, setSettings] = useState<AudioSettings>(() =>
    focusAudio.getSettings(),
  );
  const [activeTab, setActiveTab] = useState<"tracks" | "custom" | "folders" | "binaural">(
    "tracks",
  );
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [customTracks, setCustomTracks] = useState<CustomAudioTrack[]>([]);
  const [customUrls, setCustomUrls] = useState<Map<string, string>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return focusAudio.subscribe((s) => setSettings(s));
  }, []);

  // Load custom tracks from IndexedDB
  const refreshCustomTracks = async () => {
    try {
      const list = await listCustomAudioTracks();
      setCustomTracks(list);

      // Create Object URLs for playback
      const urlMap = new Map<string, string>();
      list.forEach((track) => {
        urlMap.set(track.id, URL.createObjectURL(track.blob));
      });
      setCustomUrls(urlMap);
    } catch (e) {
      console.warn("Failed to load custom tracks:", e);
    }
  };

  useEffect(() => {
    if (open) {
      void refreshCustomTracks();
    }
  }, [open]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      customUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [customUrls]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file && (file.type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".wav") || file.name.endsWith(".ogg") || file.name.endsWith(".m4a"))) {
          await saveCustomAudioTrack(file);
        }
      }
      await refreshCustomTracks();
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteCustomTrack = async (
    id: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    try {
      if (settings.currentTrack?.id === id) {
        focusAudio.pauseBrainFmTrack();
      }
      await deleteCustomAudioTrack(id);
      await refreshCustomTracks();
    } catch (e) {
      console.error("Failed to delete track:", e);
    }
  };

  const isAnythingPlaying = settings.isPlaying || settings.isPlayingTrack;

  // Track filtering
  const filteredTracks = BRAIN_FM_TRACKS.filter((t) => {
    if (selectedZone === "all") return true;
    return t.zone === selectedZone;
  });

  const allAvailableTracks: BrainFmTrack[] = [
    ...BRAIN_FM_TRACKS,
    ...customTracks.map((c) => ({
      id: c.id,
      title: c.title,
      zone: "bonus" as const,
      zoneLabel: "Eigene Musik",
      zoneHz: "Eigen",
      promptTitle: c.filename,
      description: `Eigene Audiodatei · ${formatBytes(c.size)}`,
      audioUrl: customUrls.get(c.id) || "",
      color: "from-emerald-600/20 to-teal-950/30",
    })),
  ];

  const currentTrackIndex = settings.currentTrack
    ? allAvailableTracks.findIndex((t) => t.id === settings.currentTrack?.id)
    : -1;

  const handleNextTrack = () => {
    if (allAvailableTracks.length === 0) return;
    const nextIdx = (currentTrackIndex + 1) % allAvailableTracks.length;
    focusAudio.playBrainFmTrack(allAvailableTracks[nextIdx]!);
  };

  const handlePrevTrack = () => {
    if (allAvailableTracks.length === 0) return;
    const prevIdx =
      (currentTrackIndex - 1 + allAvailableTracks.length) %
      allAvailableTracks.length;
    focusAudio.playBrainFmTrack(allAvailableTracks[prevIdx]!);
  };

  const toggleMainPlayback = () => {
    if (isAnythingPlaying) {
      if (settings.isPlayingTrack) focusAudio.toggleBrainFmTrack();
      if (settings.isPlaying) focusAudio.toggle();
    } else {
      if (settings.currentTrack) {
        focusAudio.toggleBrainFmTrack();
      } else if (allAvailableTracks.length > 0) {
        focusAudio.playBrainFmTrack(allAvailableTracks[0]!);
      } else {
        focusAudio.toggle();
      }
    }
  };

  const playCustomTrack = (track: CustomAudioTrack) => {
    const url = customUrls.get(track.id);
    if (!url) return;

    const pseudoTrack: BrainFmTrack = {
      id: track.id,
      title: track.title,
      zone: "bonus",
      zoneLabel: "Eigene Musik",
      zoneHz: "Eigen",
      promptTitle: track.filename,
      description: `Eigene Audiodatei · ${formatBytes(track.size)}`,
      audioUrl: url,
      color: "from-emerald-600/20 to-teal-950/30",
    };

    focusAudio.playBrainFmTrack(pseudoTrack);
  };

  const activeTrack = settings.currentTrack || allAvailableTracks[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121212] text-zinc-900 dark:text-zinc-100 p-0 shadow-2xl">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Main Header / Tab Switcher */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 pr-12">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <button
              type="button"
              onClick={() => setActiveTab("tracks")}
              className={cn(
                "text-sm font-semibold tracking-tight transition-colors pb-1 border-b-2",
                activeTab === "tracks"
                  ? "border-emerald-500 text-zinc-950 dark:text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
              )}
            >
              Brain.fm ({BRAIN_FM_TRACKS.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("custom")}
              className={cn(
                "text-sm font-semibold tracking-tight transition-colors pb-1 border-b-2 flex items-center gap-1.5",
                activeTab === "custom"
                  ? "border-emerald-500 text-zinc-950 dark:text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
              )}
            >
              Eigene Musik
              {customTracks.length > 0 && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                  {customTracks.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("folders")}
              data-testid="music-tab-folders"
              className={cn(
                "text-sm font-semibold tracking-tight transition-colors pb-1 border-b-2",
                activeTab === "folders"
                  ? "border-emerald-500 text-zinc-950 dark:text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
              )}
            >
              Ordner & PC-Musik
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("binaural")}
              className={cn(
                "text-sm font-semibold tracking-tight transition-colors pb-1 border-b-2",
                activeTab === "binaural"
                  ? "border-emerald-500 text-zinc-950 dark:text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
              )}
            >
              Binaurale Beats & Klangwelten
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="h-[390px] overflow-y-auto px-6 py-2">
          {/* TAB 1: Built-in Brain.fm tracks */}
          {activeTab === "tracks" && (
            <div className="space-y-3">
              {/* Category Pills (Spotify style) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
                {[
                  { id: "all", label: "Alle" },
                  { id: "alpha", label: "Alpha · Flow" },
                  { id: "beta", label: "Beta · Fokus" },
                  { id: "gamma", label: "Gamma · Peak" },
                  { id: "theta", label: "Theta · Deep" },
                  { id: "delta", label: "Delta · Schlaf" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedZone(cat.id)}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium transition-all whitespace-nowrap",
                      selectedZone === cat.id
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                        : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Minimal Clean Track Table */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 pt-1">
                {filteredTracks.map((track, idx) => {
                  const isCurrent = settings.currentTrack?.id === track.id;
                  const isPlayingThis = isCurrent && settings.isPlayingTrack;

                  return (
                    <div
                      key={track.id}
                      onClick={() => focusAudio.playBrainFmTrack(track)}
                      className={cn(
                        "group flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer transition-colors",
                        isCurrent
                          ? "bg-zinc-100/90 dark:bg-zinc-800/50"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60",
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Track Index or Play icon */}
                        <div className="flex size-7 shrink-0 items-center justify-center font-mono text-xs text-zinc-400">
                          {isPlayingThis ? (
                            <div className="flex items-end gap-[2px] h-3">
                              <span className="w-[3px] rounded-full bg-emerald-500 animate-[pulse_0.6s_ease-in-out_infinite] h-full" />
                              <span className="w-[3px] rounded-full bg-emerald-500 animate-[pulse_0.6s_ease-in-out_0.2s_infinite] h-2" />
                              <span className="w-[3px] rounded-full bg-emerald-500 animate-[pulse_0.6s_ease-in-out_0.4s_infinite] h-2.5" />
                            </div>
                          ) : (
                            <span className="group-hover:hidden">
                              {idx + 1}
                            </span>
                          )}
                          {!isPlayingThis && (
                            <IconPlayerPlay className="size-3.5 hidden group-hover:block fill-current text-zinc-900 dark:text-white" />
                          )}
                        </div>

                        {/* Title & Desc */}
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "text-sm font-medium truncate",
                              isCurrent
                                ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                : "text-zinc-900 dark:text-zinc-100",
                            )}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-sm">
                            {track.description}
                          </p>
                        </div>
                      </div>

                      {/* Right Tag */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          {track.zoneHz}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: Ordner/Playlists + PC-Musik (helium-music, gleich wie Handy) */}
          {activeTab === "folders" && <MusicLibraryPanel className="py-2" dark={false} />}

          {/* TAB 2: Custom Uploads */}
          {activeTab === "custom" && (
            <div className="space-y-4 pt-1">
              {/* Upload trigger bar */}
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <IconUpload className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                      Eigene Musik oder Soundtracks hochladen
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      MP3, WAV, OGG oder M4A direkt im Browser speichern
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-1.5 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-medium text-xs h-8"
                >
                  <IconPlus className="size-3.5" />
                  {isUploading ? "Wird geladen…" : "Datei auswählen"}
                </Button>
              </div>

              {/* List of uploaded tracks */}
              {customTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400">
                  <IconMusic className="size-10 stroke-[1.2] opacity-40 mb-2" />
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    Noch keine eigenen Tracks vorhanden
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5 max-w-xs">
                    Lade deine Lieblings-Fokusmusik, binauralen Aufnahmen oder Podcasts hoch, um sie jederzeit offline abzuspielen.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 pt-1">
                  {customTracks.map((track, idx) => {
                    const isCurrent = settings.currentTrack?.id === track.id;
                    const isPlayingThis = isCurrent && settings.isPlayingTrack;

                    return (
                      <div
                        key={track.id}
                        onClick={() => playCustomTrack(track)}
                        className={cn(
                          "group flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer transition-colors",
                          isCurrent
                            ? "bg-zinc-100/90 dark:bg-zinc-800/50"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60",
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Track Index or Play icon */}
                          <div className="flex size-7 shrink-0 items-center justify-center font-mono text-xs text-zinc-400">
                            {isPlayingThis ? (
                              <div className="flex items-end gap-[2px] h-3">
                                <span className="w-[3px] rounded-full bg-emerald-500 animate-[pulse_0.6s_ease-in-out_infinite] h-full" />
                                <span className="w-[3px] rounded-full bg-emerald-500 animate-[pulse_0.6s_ease-in-out_0.2s_infinite] h-2" />
                                <span className="w-[3px] rounded-full bg-emerald-500 animate-[pulse_0.6s_ease-in-out_0.4s_infinite] h-2.5" />
                              </div>
                            ) : (
                              <span className="group-hover:hidden">
                                {idx + 1}
                              </span>
                            )}
                            {!isPlayingThis && (
                              <IconPlayerPlay className="size-3.5 hidden group-hover:block fill-current text-zinc-900 dark:text-white" />
                            )}
                          </div>

                          {/* Title & Info */}
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "text-sm font-medium truncate",
                                isCurrent
                                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                                  : "text-zinc-900 dark:text-zinc-100",
                              )}
                            >
                              {track.title}
                            </p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-sm">
                              {track.filename} · {formatBytes(track.size)}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomTrack(track.id, e)}
                            className="size-7 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-md transition-colors"
                            title="Track löschen"
                          >
                            <IconTrash className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Binaural Beats & Soundscapes */}
          {activeTab === "binaural" && (
            <div className="space-y-6 pt-2">
              {/* Binaural Frequencies */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Binaurale Frequenzen
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">Intensität</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(settings.binauralVolume * 100)}
                      onChange={(e) =>
                        focusAudio.setBinauralVolume(
                          Number(e.target.value) / 100,
                        )
                      }
                      className="h-1 w-20 accent-emerald-500 cursor-pointer"
                    />
                    <span className="w-7 font-mono text-[11px] text-zinc-400 text-right">
                      {Math.round(settings.binauralVolume * 100)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    Object.entries(FREQUENCY_CONFIG) as Array<
                      [
                        Exclude<BrainwaveFrequency, "off">,
                        (typeof FREQUENCY_CONFIG)[Exclude<
                          BrainwaveFrequency,
                          "off"
                        >],
                      ]
                    >
                  ).map(([freqKey, config]) => {
                    const isSelected =
                      settings.frequency === freqKey && settings.isPlaying;
                    return (
                      <button
                        key={freqKey}
                        type="button"
                        onClick={() => {
                          focusAudio.setFrequency(freqKey);
                          if (!settings.isPlaying) focusAudio.toggle();
                        }}
                        className={cn(
                          "flex flex-col text-left p-3 rounded-xl border transition-all",
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10"
                            : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              isSelected
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-zinc-900 dark:text-white",
                            )}
                          >
                            {config.label}
                          </span>
                          {isSelected && (
                            <IconCheck className="size-3.5 text-emerald-500" />
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-normal line-clamp-1">
                          {config.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {settings.isPlaying && (
                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => focusAudio.setFrequency("off")}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    >
                      Binaural Beats ausschalten
                    </button>
                  </div>
                )}
              </div>

              {/* Soundscapes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Klangwelten & Rauschen
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400">Rauschen</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(settings.soundscapeVolume * 100)}
                      onChange={(e) =>
                        focusAudio.setSoundscapeVolume(
                          Number(e.target.value) / 100,
                        )
                      }
                      className="h-1 w-20 accent-emerald-500 cursor-pointer"
                    />
                    <span className="w-7 font-mono text-[11px] text-zinc-400 text-right">
                      {Math.round(settings.soundscapeVolume * 100)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {SOUNDSCAPES_CONFIG.map((sc) => {
                    const isSelected =
                      settings.soundscape === sc.id && settings.isPlaying;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          focusAudio.setSoundscape(sc.id);
                          if (!settings.isPlaying && sc.id !== "none") {
                            focusAudio.toggle();
                          }
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center py-3 px-2 rounded-xl border text-center transition-all",
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                            : "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 text-zinc-700 dark:text-zinc-300",
                        )}
                      >
                        <span className="text-xs truncate w-full">{sc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Minimal Spotify-Style Bottom Player Bar */}
        <div className="border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#181818] px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Now Playing info */}
            <div className="flex items-center gap-3 min-w-0 max-w-48">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                <IconHeadphones className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                  {settings.isPlayingTrack && settings.currentTrack
                    ? settings.currentTrack.title
                    : settings.isPlaying
                      ? FREQUENCY_CONFIG[
                          settings.frequency as Exclude<
                            BrainwaveFrequency,
                            "off"
                          >
                        ]?.label || "Binaural Beats"
                      : activeTrack
                        ? activeTrack.title
                        : "Bereit"}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {settings.isPlayingTrack
                    ? settings.currentTrack?.zone === "bonus"
                      ? "Eigene Musik"
                      : "Brain.fm Instrumental"
                    : settings.isPlaying
                      ? "Binaurale Frequenzen"
                      : "Pausiert"}
                </p>
              </div>
            </div>

            {/* Center: Controls + Progress Bar */}
            <div className="flex flex-1 flex-col items-center max-w-sm gap-1.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrevTrack}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  title="Vorheriger Track"
                >
                  <IconPlayerTrackPrev className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleMainPlayback}
                  className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 hover:scale-105 transition-all shadow-md"
                  title={isAnythingPlaying ? "Pause" : "Play"}
                >
                  {isAnythingPlaying ? (
                    <IconPlayerPause className="size-4" />
                  ) : (
                    <IconPlayerPlay className="size-4 fill-current ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleNextTrack}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  title="Nächster Track"
                >
                  <IconPlayerTrackNext className="size-4" />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2 w-full text-[10px] font-mono text-zinc-400">
                <span className="w-7 text-right">
                  {formatSeconds(settings.trackProgress)}
                </span>
                <div className="h-1 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-700/60 overflow-hidden">
                  <div
                    className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all"
                    style={{
                      width: `${
                        settings.trackDuration > 0
                          ? Math.min(
                              100,
                              (settings.trackProgress /
                                settings.trackDuration) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="w-7">
                  {formatSeconds(settings.trackDuration)}
                </span>
              </div>
            </div>

            {/* Right: Master Volume */}
            <div className="flex items-center gap-2 shrink-0">
              <IconVolume2 className="size-4 text-zinc-400" />
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(settings.volume * 100)}
                onChange={(e) =>
                  focusAudio.setVolume(Number(e.target.value) / 100)
                }
                className="h-1 w-20 accent-emerald-500 cursor-pointer"
                title="Lautstärke"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dropdown item & quick controller inside user profile dropdown menu
 */
export function ProfileAudioMenu() {
  const [settings, setSettings] = useState<AudioSettings>(() =>
    focusAudio.getSettings(),
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    return focusAudio.subscribe((s) => setSettings(s));
  }, []);

  const isAnythingPlaying = settings.isPlaying || settings.isPlayingTrack;

  return (
    <>
      <DropdownMenuItem
        className="gap-2 px-2 py-1.5 flex items-center justify-between"
        closeOnClick={false}
        onClick={(e) => {
          e.preventDefault();
          setIsExpanded((v) => !v);
        }}
      >
        <div className="flex items-center gap-2">
          {isAnythingPlaying ? (
            <IconHeadphones className="size-4 text-emerald-500 animate-pulse" />
          ) : (
            <IconMusic className="size-4" />
          )}
          <span>Musik & Beats</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isAnythingPlaying && (
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <span className="text-[11px] text-muted-foreground">
            {isExpanded ? "Schließen" : "Öffnen"}
          </span>
        </div>
      </DropdownMenuItem>

      {/* Embedded inline player inside dropdown */}
      {isExpanded && (
        <div
          className="mx-1 my-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 space-y-2.5 text-xs shadow-xs"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Quick Play/Pause row */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground text-xs">
                {settings.isPlayingTrack && settings.currentTrack
                  ? settings.currentTrack.title
                  : settings.isPlaying
                    ? FREQUENCY_CONFIG[
                        settings.frequency as Exclude<BrainwaveFrequency, "off">
                      ]?.label || "Binaural Beats"
                    : "Bereit"}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {isAnythingPlaying
                  ? settings.isPlaying && settings.isPlayingTrack
                    ? "Beats + Musik"
                    : settings.isPlayingTrack
                      ? "Musik aktiv"
                      : "Beats aktiv"
                  : "Brain.fm & Frequenzen"}
              </span>
            </div>

            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 transition-transform active:scale-95"
              onClick={() => {
                if (settings.isPlayingTrack) {
                  focusAudio.toggleBrainFmTrack();
                } else if (settings.isPlaying) {
                  focusAudio.toggle();
                } else {
                  if (BRAIN_FM_TRACKS.length > 0) {
                    focusAudio.playBrainFmTrack(BRAIN_FM_TRACKS[0]!);
                  } else {
                    focusAudio.setFrequency("alpha");
                    focusAudio.toggle();
                  }
                }
              }}
              title={isAnythingPlaying ? "Pausieren" : "Starten"}
            >
              {isAnythingPlaying ? (
                <IconPlayerPause className="size-3.5" />
              ) : (
                <IconPlayerPlay className="size-3.5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Quick frequency chips */}
          <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
            {(["gamma", "alpha", "theta", "delta"] as const).map((freq) => {
              const isSelected =
                settings.frequency === freq && settings.isPlaying;
              return (
                <button
                  key={freq}
                  type="button"
                  onClick={() => {
                    focusAudio.setFrequency(freq);
                    if (!settings.isPlaying) focusAudio.toggle();
                  }}
                  className={cn(
                    "flex-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors text-center",
                    isSelected
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-semibold"
                      : "bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white",
                  )}
                >
                  {freq}
                </button>
              );
            })}
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
            <IconVolume className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(settings.volume * 100)}
              onChange={(e) =>
                focusAudio.setVolume(Number(e.target.value) / 100)
              }
              className="h-1 flex-1 cursor-pointer accent-emerald-500"
              title="Lautstärke"
            />
            <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">
              {Math.round(settings.volume * 100)}%
            </span>
          </div>

          {/* Open full studio button */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            onClick={() => setIsDialogOpen(true)}
          >
            <IconSparkles className="size-3 text-emerald-500" />
            Vollständiges Studio öffnen
          </button>
        </div>
      )}

      {/* Full Studio Dialog */}
      <AudioStudioDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
