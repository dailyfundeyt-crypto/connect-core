/**
 * Web Audio API based Focus & Flow Audio Engine (Binaural Beats & Soundscapes).
 * 100% offline, Web Audio API synthesis + Brain.fm music track player.
 */

import type { BrainFmTrack } from "./brainfm-tracks";

export type BrainwaveFrequency = "gamma" | "alpha" | "theta" | "delta" | "off";
export type FrequencyVolumeMap = Record<Exclude<BrainwaveFrequency, "off">, number>;
export type SoundscapeType = "none" | "brown_noise" | "rain" | "lofi" | "forest";

const FREQUENCY_VOLUME_KEY = "connect.audio.frequency-volumes.v1";
const DEFAULT_FREQUENCY_VOLUMES: FrequencyVolumeMap = {
  gamma: 0.5,
  alpha: 0.5,
  theta: 0.5,
  delta: 0.5,
};

function readFrequencyVolumes(): FrequencyVolumeMap {
  if (typeof window === "undefined") return { ...DEFAULT_FREQUENCY_VOLUMES };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FREQUENCY_VOLUME_KEY) ?? "null") as Partial<FrequencyVolumeMap> | null;
    return Object.fromEntries(
      (Object.keys(DEFAULT_FREQUENCY_VOLUMES) as (keyof FrequencyVolumeMap)[]).map((key) => {
        const value = parsed?.[key];
        return [key, typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_FREQUENCY_VOLUMES[key]];
      }),
    ) as FrequencyVolumeMap;
  } catch {
    return { ...DEFAULT_FREQUENCY_VOLUMES };
  }
}

export interface AudioSettings {
  frequency: BrainwaveFrequency;
  soundscape: SoundscapeType;
  volume: number; // 0 to 1
  binauralVolume: number; // 0 to 1
  soundscapeVolume: number; // 0 to 1
  trackVolume: number; // 0 to 1
  frequencyVolumes: FrequencyVolumeMap;
  isPlaying: boolean; // binaural / soundscape playing
  isPlayingTrack: boolean; // music track playing
  currentTrack: BrainFmTrack | null;
  trackProgress: number; // seconds
  trackDuration: number; // seconds
}

export const FREQUENCY_CONFIG: Record<
  Exclude<BrainwaveFrequency, "off">,
  { label: string; hz: number; desc: string; carrier: number; color: string }
> = {
  gamma: {
    label: "Gamma (40 Hz)",
    hz: 40,
    desc: "Laser-Fokus, Problemlösung & Spitzenleistung",
    carrier: 200,
    color: "text-rose-500",
  },
  alpha: {
    label: "Alpha (10 Hz)",
    hz: 10,
    desc: "Flow-Zustand, entspannte Konzentration & Lernen",
    carrier: 180,
    color: "text-emerald-500",
  },
  theta: {
    label: "Theta (6 Hz)",
    hz: 6,
    desc: "Kreativität, Intuition & tiefes Nachdenken",
    carrier: 140,
    color: "text-purple-500",
  },
  delta: {
    label: "Delta (2 Hz)",
    hz: 2,
    desc: "Tiefe Entspannung, Regeneration & Schlaf",
    carrier: 100,
    color: "text-blue-500",
  },
};

export const SOUNDSCAPES_CONFIG: Array<{
  id: SoundscapeType;
  label: string;
  desc: string;
}> = [
  { id: "none", label: "Stille", desc: "Kein Hintergrund-Rauschen" },
  { id: "brown_noise", label: "Brown Noise", desc: "Tiefes Rauschen, beruhigend & ADHS-Fokus" },
  { id: "rain", label: "Regen", desc: "Sanfter, gleichmäßiger Regen" },
  { id: "lofi", label: "Lo-Fi", desc: "Warme, generative Akkorde" },
  { id: "forest", label: "Wald", desc: "Sommerbrise & Waldrauschen" },
];

class FocusAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private binauralGain: GainNode | null = null;
  private soundscapeGain: GainNode | null = null;
  private trackSource: MediaElementAudioSourceNode | null = null;
  private trackGain: GainNode | null = null;

  // Binaural oscillators
  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;

  // Soundscape nodes
  private noiseNode: AudioNode | null = null;
  private lofiInterval: number | null = null;

  private settings: AudioSettings = {
    frequency: "alpha",
    soundscape: "brown_noise",
    volume: 0.6,
    binauralVolume: 0.5,
    soundscapeVolume: 0.6,
    trackVolume: 0.8,
    frequencyVolumes: readFrequencyVolumes(),
    isPlaying: false,
    isPlayingTrack: false,
    currentTrack: null,
    trackProgress: 0,
    trackDuration: 0,
  };

  private audioEl: HTMLAudioElement | null = null;
  private listeners: Set<(s: AudioSettings) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
    }
  }

  private initAudioElement() {
    if (this.audioEl || typeof window === "undefined") return;
    this.audioEl = new Audio();
    this.audioEl.loop = true;
    this.audioEl.volume = this.settings.trackVolume * this.settings.volume;
    this.audioEl.crossOrigin = "anonymous";

    this.audioEl.addEventListener("timeupdate", () => {
      if (this.audioEl) {
        this.settings.trackProgress = this.audioEl.currentTime;
        this.settings.trackDuration = this.audioEl.duration || 0;
        this.notify();
      }
    });

    this.audioEl.addEventListener("play", () => {
      this.settings.isPlayingTrack = true;
      this.notify();
    });

    this.audioEl.addEventListener("pause", () => {
      this.settings.isPlayingTrack = false;
      this.notify();
    });

    this.audioEl.addEventListener("ended", () => {
      this.settings.isPlayingTrack = false;
      this.notify();
    });
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.settings.volume;
      this.outputAnalyser = this.ctx.createAnalyser();
      this.outputAnalyser.fftSize = 512;
      this.outputAnalyser.smoothingTimeConstant = 0.72;
      this.masterGain.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.ctx.destination);

      this.binauralGain = this.ctx.createGain();
      this.binauralGain.gain.value = this.effectiveBinauralVolume();
      this.binauralGain.connect(this.masterGain);

      this.soundscapeGain = this.ctx.createGain();
      this.soundscapeGain.gain.value = this.settings.soundscapeVolume;
      this.soundscapeGain.connect(this.masterGain);
    }

    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /** Live frequency levels (0–1) for the small calendar equalizer. */
  public getVisualizerLevels(count = 4): number[] {
    const analyser = this.outputAnalyser;
    const ctx = this.ctx;
    if (!analyser || !ctx || count < 1) return Array.from({ length: count }, () => 0.06);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    const nyquist = ctx.sampleRate / 2;
    const minHz = 45;
    const maxHz = Math.min(12_000, nyquist);
    return Array.from({ length: count }, (_, index) => {
      const lowHz = minHz * (maxHz / minHz) ** (index / count);
      const highHz = minHz * (maxHz / minHz) ** ((index + 1) / count);
      const start = Math.max(1, Math.floor((lowHz / nyquist) * bins.length));
      const end = Math.min(bins.length, Math.max(start + 1, Math.ceil((highHz / nyquist) * bins.length)));
      let total = 0;
      for (let bin = start; bin < end; bin++) total += bins[bin] ?? 0;
      const average = total / Math.max(1, end - start);
      return Math.min(1, Math.max(0.06, Math.sqrt(average / 255) * 1.35));
    });
  }

  public subscribe(listener: (s: AudioSettings) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const s = this.getSettings();
    this.listeners.forEach((l) => l(s));
  }

  public async start() {
    this.initContext();
    if (!this.ctx) return;

    this.stopNodes();
    this.startBinaural();
    this.startSoundscape();

    this.settings.isPlaying = true;
    this.notify();
  }

  public stop() {
    this.stopNodes();
    this.settings.isPlaying = false;
    this.notify();
  }

  public toggle() {
    if (this.settings.isPlaying) {
      this.stop();
    } else {
      void this.start();
    }
  }

  // --- Real Music Track Controls ---
  public async playBrainFmTrack(track: BrainFmTrack) {
    this.initContext();
    this.initAudioElement();
    if (!this.audioEl) return;
    this.ensureTrackPath();

    if (this.settings.currentTrack?.id !== track.id) {
      this.audioEl.src = track.audioUrl;
      this.settings.currentTrack = track;
    }

    if (this.trackGain) this.trackGain.gain.setTargetAtTime(this.settings.trackVolume, this.ctx!.currentTime, 0.05);
    else this.audioEl.volume = this.settings.trackVolume * this.settings.volume;
    try {
      await this.audioEl.play();
      this.settings.isPlayingTrack = true;
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
    this.notify();
  }

  public pauseBrainFmTrack() {
    if (this.audioEl) {
      this.audioEl.pause();
      this.settings.isPlayingTrack = false;
      this.notify();
    }
  }

  public resumeBrainFmTrack() {
    if (this.audioEl && this.settings.currentTrack) {
      void this.audioEl.play();
      this.settings.isPlayingTrack = true;
      this.notify();
    }
  }

  public toggleBrainFmTrack(track?: BrainFmTrack) {
    if (track && this.settings.currentTrack?.id !== track.id) {
      void this.playBrainFmTrack(track);
      return;
    }
    if (this.settings.isPlayingTrack) {
      this.pauseBrainFmTrack();
    } else if (this.settings.currentTrack) {
      this.resumeBrainFmTrack();
    } else if (track) {
      void this.playBrainFmTrack(track);
    }
  }

  public setTrackVolume(vol: number) {
    this.settings.trackVolume = Math.max(0, Math.min(1, vol));
    if (this.trackGain && this.ctx) {
      this.trackGain.gain.setTargetAtTime(this.settings.trackVolume, this.ctx.currentTime, 0.05);
    } else if (this.audioEl) {
      this.audioEl.volume = this.settings.trackVolume * this.settings.volume;
    }
    this.notify();
  }

  public seekTrack(seconds: number) {
    if (this.audioEl && Number.isFinite(seconds)) {
      this.audioEl.currentTime = seconds;
      this.settings.trackProgress = seconds;
      this.notify();
    }
  }

  public setFrequency(freq: BrainwaveFrequency) {
    this.settings.frequency = freq;
    if (this.settings.isPlaying) {
      this.startBinaural();
    }
    this.notify();
  }

  public setSoundscape(type: SoundscapeType) {
    this.settings.soundscape = type;
    if (this.settings.isPlaying) {
      this.startSoundscape();
    }
    this.notify();
  }

  public setVolume(vol: number) {
    this.settings.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.05);
    }
    if (this.audioEl && !this.trackGain) {
      this.audioEl.volume = this.settings.trackVolume * this.settings.volume;
    }
    this.notify();
  }

  public setBinauralVolume(vol: number) {
    this.settings.binauralVolume = Math.max(0, Math.min(1, vol));
    if (this.binauralGain && this.ctx) {
      this.binauralGain.gain.setTargetAtTime(this.effectiveBinauralVolume(), this.ctx.currentTime, 0.05);
    }
    this.notify();
  }

  public setFrequencyVolume(freq: Exclude<BrainwaveFrequency, "off">, vol: number) {
    this.settings.frequencyVolumes = {
      ...this.settings.frequencyVolumes,
      [freq]: Math.max(0, Math.min(1, vol)),
    };
    try {
      window.localStorage.setItem(FREQUENCY_VOLUME_KEY, JSON.stringify(this.settings.frequencyVolumes));
    } catch { /* device storage may be unavailable */ }
    if (this.settings.frequency === freq && this.binauralGain && this.ctx) {
      this.binauralGain.gain.setTargetAtTime(this.effectiveBinauralVolume(), this.ctx.currentTime, 0.05);
    }
    this.notify();
  }

  private effectiveBinauralVolume() {
    const perFrequency = this.settings.frequency === "off" ? 1 : this.settings.frequencyVolumes[this.settings.frequency];
    return this.settings.binauralVolume * perFrequency;
  }

  public setSoundscapeVolume(vol: number) {
    this.settings.soundscapeVolume = Math.max(0, Math.min(1, vol));
    if (this.soundscapeGain && this.ctx) {
      this.soundscapeGain.gain.setTargetAtTime(this.settings.soundscapeVolume, this.ctx.currentTime, 0.05);
    }
    this.notify();
  }

  private stopNodes() {
    if (this.leftOsc) {
      try {
        this.leftOsc.stop();
        this.leftOsc.disconnect();
      } catch {}
      this.leftOsc = null;
    }
    if (this.rightOsc) {
      try {
        this.rightOsc.stop();
        this.rightOsc.disconnect();
      } catch {}
      this.rightOsc = null;
    }
    if (this.noiseNode) {
      try {
        this.noiseNode.disconnect();
      } catch {}
      this.noiseNode = null;
    }
    if (this.lofiInterval) {
      window.clearInterval(this.lofiInterval);
      this.lofiInterval = null;
    }
  }

  /** Route the track through the shared output analyser once, so its bars follow real audio. */
  private ensureTrackPath() {
    if (!this.ctx || !this.masterGain || !this.audioEl || this.trackSource) return;
    try {
      this.trackSource = this.ctx.createMediaElementSource(this.audioEl);
      this.trackGain = this.ctx.createGain();
      this.trackGain.gain.value = this.settings.trackVolume;
      this.trackSource.connect(this.trackGain);
      this.trackGain.connect(this.masterGain);
      this.audioEl.volume = 1;
    } catch {
      // Keep playback working on browsers that cannot route a media element through Web Audio.
      this.trackSource = null;
      this.trackGain = null;
    }
  }

  private startBinaural() {
    if (!this.ctx || !this.binauralGain) return;
    if (this.leftOsc) {
      try {
        this.leftOsc.stop();
        this.leftOsc.disconnect();
      } catch {}
      this.leftOsc = null;
    }
    if (this.rightOsc) {
      try {
        this.rightOsc.stop();
        this.rightOsc.disconnect();
      } catch {}
      this.rightOsc = null;
    }

    if (this.settings.frequency === "off") return;

    const conf = FREQUENCY_CONFIG[this.settings.frequency];
    if (!conf) return;

    this.binauralGain.gain.setTargetAtTime(this.effectiveBinauralVolume(), this.ctx.currentTime, 0.05);

    const merger = this.ctx.createChannelMerger(2);

    // Left ear (carrier)
    this.leftOsc = this.ctx.createOscillator();
    this.leftOsc.type = "sine";
    this.leftOsc.frequency.value = conf.carrier;
    this.leftOsc.connect(merger, 0, 0);

    // Right ear (carrier + beat frequency)
    this.rightOsc = this.ctx.createOscillator();
    this.rightOsc.type = "sine";
    this.rightOsc.frequency.value = conf.carrier + conf.hz;
    this.rightOsc.connect(merger, 0, 1);

    merger.connect(this.binauralGain);

    this.leftOsc.start();
    this.rightOsc.start();
  }

  private startSoundscape() {
    if (!this.ctx || !this.soundscapeGain) return;

    if (this.noiseNode) {
      try {
        this.noiseNode.disconnect();
      } catch {}
      this.noiseNode = null;
    }
    if (this.lofiInterval) {
      window.clearInterval(this.lofiInterval);
      this.lofiInterval = null;
    }

    const type = this.settings.soundscape;
    if (type === "none") return;

    if (type === "brown_noise" || type === "rain" || type === "forest") {
      this.startNoise(type);
    } else if (type === "lofi") {
      this.startLofi();
    }
  }

  private startNoise(type: "brown_noise" | "rain" | "forest") {
    if (!this.ctx || !this.soundscapeGain) return;

    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === "brown_noise") {
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i]!;
        output[i]! *= 3.5;
      } else if (type === "rain") {
        output[i] = (lastOut + 0.08 * white) / 1.08;
        lastOut = output[i]!;
        if (Math.random() < 0.002) output[i]! += (Math.random() * 2 - 1) * 0.4;
      } else {
        output[i] = (lastOut + 0.03 * white) / 1.03;
        lastOut = output[i]!;
      }
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    if (type === "brown_noise") {
      filter.type = "lowpass";
      filter.frequency.value = 400;
    } else if (type === "rain") {
      filter.type = "bandpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.8;
    } else {
      filter.type = "lowpass";
      filter.frequency.value = 650;
    }

    whiteNoise.connect(filter);
    filter.connect(this.soundscapeGain);
    whiteNoise.start();

    this.noiseNode = whiteNoise;
  }

  private startLofi() {
    if (!this.ctx || !this.soundscapeGain) return;

    const chords = [
      [220, 261.63, 329.63, 392.0], // Am7
      [174.61, 220, 261.63, 329.63], // Fmaj7
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [196.0, 246.94, 293.66, 349.23], // G7
    ];
    let chordIdx = 0;

    const playChord = () => {
      if (!this.ctx || !this.soundscapeGain || !this.settings.isPlaying) return;
      const chord = chords[chordIdx % chords.length]!;
      chordIdx++;

      chord.forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const filter = this.ctx!.createBiquadFilter();

        osc.type = "triangle";
        osc.frequency.value = freq;

        filter.type = "lowpass";
        filter.frequency.value = 800;

        const now = this.ctx!.currentTime;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 1.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 4.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.soundscapeGain!);

        osc.start(now);
        osc.stop(now + 5);
      });
    };

    playChord();
    this.lofiInterval = window.setInterval(playChord, 5000);
  }

  public playChime() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const time = this.ctx!.currentTime + idx * 0.15;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(time);
      osc.stop(time + 1.3);
    });
  }
}

export const focusAudio = new FocusAudioEngine();
