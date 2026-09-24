/**
 * ElevenLabs API key ring — rotate to the next key after CHAR_BUDGET characters of TTS.
 * Stored locally (localStorage) until Supabase/Postgres settings tables are available.
 * Never commit real keys to git.
 */

export type ElevenLabsKey = {
  id: string;
  /** Masked label for UI; full key stays in `key` */
  label: string;
  key: string;
  charsUsed: number;
  createdAt: string;
};

export type VoiceSettings = {
  keys: ElevenLabsKey[];
  activeIndex: number;
  /** Default ElevenLabs voice id */
  voiceId: string;
  modelId: string;
  /** Playback speed for TTS (0.75–1.5). */
  speed: number;
  /** BCP-47 lang for Whisper / Web Speech, or "auto". */
  language: string;
  /** Friendly voice preset name shown in the call UI. */
  voiceLabel: string;
};

const KEY = "connect.voice-settings";
export const CHAR_BUDGET = 8000;

/** Astronomical voice labels (call UI) mapped to public ElevenLabs voice ids. */
export const VOICE_PRESETS: { id: string; label: string }[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "Helix" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Altair" },
  { id: "Xb7hH8UNXvPdYeT2k1j4", label: "Ara" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Atlas" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Aurora" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Carina" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Castor" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Celeste" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Cosmo" },
  { id: "ThT5KcBeYPX3keUQqHPh", label: "Eve" },
];

const DEFAULT: VoiceSettings = {
  keys: [],
  activeIndex: 0,
  voiceId: VOICE_PRESETS[0]!.id,
  modelId: "eleven_flash_v2_5",
  speed: 1,
  language: "de-DE",
  voiceLabel: "Helix",
};

function read(): VoiceSettings {
  if (typeof window === "undefined") return { ...DEFAULT };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const voiceId =
      typeof parsed.voiceId === "string" && parsed.voiceId
        ? parsed.voiceId
        : DEFAULT.voiceId;
    const preset = VOICE_PRESETS.find((p) => p.id === voiceId);
    return {
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      activeIndex:
        typeof parsed.activeIndex === "number" ? parsed.activeIndex : 0,
      voiceId,
      modelId:
        typeof parsed.modelId === "string" && parsed.modelId
          ? parsed.modelId
          : DEFAULT.modelId,
      speed:
        typeof parsed.speed === "number" && parsed.speed >= 0.5 && parsed.speed <= 2
          ? parsed.speed
          : DEFAULT.speed,
      language:
        typeof parsed.language === "string" && parsed.language
          ? parsed.language
          : DEFAULT.language,
      voiceLabel:
        typeof parsed.voiceLabel === "string" && parsed.voiceLabel
          ? parsed.voiceLabel
          : (preset?.label ?? "Custom"),
    };
  } catch {
    return { ...DEFAULT };
  }
}

function write(settings: VoiceSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("connect-voice-settings-changed"));
}

export function getVoiceSettings(): VoiceSettings {
  return read();
}

export function subscribeVoiceSettings(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-voice-settings-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-voice-settings-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

export function addElevenLabsKey(apiKey: string, label?: string): VoiceSettings {
  const key = apiKey.trim();
  if (!key) throw new Error("API key is required.");
  const settings = read();
  if (settings.keys.some((k) => k.key === key)) return settings;
  const entry: ElevenLabsKey = {
    id: `el-${Date.now().toString(36)}`,
    label: label?.trim() || `Key ${settings.keys.length + 1}`,
    key,
    charsUsed: 0,
    createdAt: new Date().toISOString(),
  };
  settings.keys.push(entry);
  write(settings);
  return settings;
}

export function removeElevenLabsKey(id: string): VoiceSettings {
  const settings = read();
  settings.keys = settings.keys.filter((k) => k.id !== id);
  if (settings.activeIndex >= settings.keys.length) {
    settings.activeIndex = Math.max(0, settings.keys.length - 1);
  }
  write(settings);
  return settings;
}

export function setVoiceDefaults(input: {
  voiceId?: string;
  modelId?: string;
  speed?: number;
  language?: string;
  voiceLabel?: string;
}): VoiceSettings {
  const settings = read();
  if (input.voiceId?.trim()) {
    settings.voiceId = input.voiceId.trim();
    const preset = VOICE_PRESETS.find((p) => p.id === settings.voiceId);
    settings.voiceLabel = input.voiceLabel?.trim() || preset?.label || "Custom";
  }
  if (input.modelId?.trim()) settings.modelId = input.modelId.trim();
  if (typeof input.speed === "number") settings.speed = input.speed;
  if (input.language?.trim()) settings.language = input.language.trim();
  if (input.voiceLabel?.trim()) settings.voiceLabel = input.voiceLabel.trim();
  write(settings);
  return settings;
}

/** Active key; rotates when charsUsed crosses CHAR_BUDGET. */
export function takeActiveKey(opts?: {
  voiceId?: string;
}): { key: string; voiceId: string; modelId: string } | null {
  const settings = read();
  if (settings.keys.length === 0) return null;
  let index = Math.min(settings.activeIndex, settings.keys.length - 1);
  let entry = settings.keys[index];
  if (entry.charsUsed >= CHAR_BUDGET && settings.keys.length > 1) {
    index = (index + 1) % settings.keys.length;
    settings.activeIndex = index;
    entry = settings.keys[index];
    // Reset usage on the newly active key so the ring keeps turning.
    if (entry.charsUsed >= CHAR_BUDGET) entry.charsUsed = 0;
    write(settings);
  }
  return {
    key: entry.key,
    voiceId: opts?.voiceId?.trim() || settings.voiceId,
    modelId: settings.modelId,
  };
}

export function recordTtsChars(count: number) {
  const settings = read();
  if (settings.keys.length === 0) return;
  const index = Math.min(settings.activeIndex, settings.keys.length - 1);
  settings.keys[index].charsUsed += Math.max(0, count);
  if (
    settings.keys[index].charsUsed >= CHAR_BUDGET &&
    settings.keys.length > 1
  ) {
    settings.activeIndex = (index + 1) % settings.keys.length;
  }
  write(settings);
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Call ElevenLabs TTS from the browser using the active rotated key. */
export async function speakWithElevenLabs(
  text: string,
  opts?: { voiceId?: string; agentId?: string },
): Promise<ArrayBuffer> {
  let apiKey: string | null = null;
  let voiceId = opts?.voiceId;
  let modelId = read().modelId;

  if (opts?.agentId) {
    const { getAgentApiKeys } = await import("@/lib/agents/agent-api-keys");
    const agentKey = getAgentApiKeys(opts.agentId).elevenLabs.trim();
    if (agentKey) apiKey = agentKey;
  }

  if (!apiKey) {
    const active = takeActiveKey({ voiceId: opts?.voiceId });
    if (!active) {
      throw new Error("Add an ElevenLabs API key in Settings → Voice.");
    }
    apiKey = active.key;
    voiceId = active.voiceId;
    modelId = active.modelId;
  } else if (!voiceId) {
    voiceId = read().voiceId;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS failed (${response.status})${detail ? `: ${detail.slice(0, 120)}` : ""}`,
    );
  }
  if (!opts?.agentId) recordTtsChars(text.length);
  return response.arrayBuffer();
}

/** Play an ElevenLabs buffer honouring the saved speed when the API ignores it. */
export async function playElevenLabsAudio(
  buffer: ArrayBuffer,
  opts?: { speed?: number },
): Promise<void> {
  const settings = read();
  const blob = new Blob([buffer], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    audio.playbackRate = opts?.speed ?? settings.speed ?? 1;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed."));
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
