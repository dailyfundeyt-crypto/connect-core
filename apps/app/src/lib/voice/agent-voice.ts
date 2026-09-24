/**
 * Per-bot phone / TTS preferences (Stimme, Geschwindigkeit, Sprache, Benachrichtigungen).
 * Stored in localStorage until agent profiles carry these fields on the server.
 */

import {
  getVoiceSettings,
  VOICE_PRESETS,
  type VoiceSettings,
} from "./elevenlabs";

export type AgentVoiceSettings = {
  /** ElevenLabs voice id, or "" for “Nicht festgelegt” (inherit global). */
  voiceId: string;
  voiceLabel: string;
  speed: number;
  language: string;
  /** Notify when this bot finishes or needs input. */
  notify: boolean;
};

const KEY = "connect.agent-voice";

const DEFAULT: AgentVoiceSettings = {
  voiceId: "",
  voiceLabel: "",
  speed: 1,
  language: "auto",
  notify: true,
};

type Store = Record<string, AgentVoiceSettings>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("connect-agent-voice-changed"));
}

function normalize(entry: Partial<AgentVoiceSettings> | undefined): AgentVoiceSettings {
  const voiceId =
    typeof entry?.voiceId === "string" ? entry.voiceId : DEFAULT.voiceId;
  const preset = VOICE_PRESETS.find((p) => p.id === voiceId);
  return {
    voiceId,
    voiceLabel:
      typeof entry?.voiceLabel === "string" && entry.voiceLabel
        ? entry.voiceLabel
        : (preset?.label ?? ""),
    speed:
      typeof entry?.speed === "number" && entry.speed >= 0.5 && entry.speed <= 2
        ? entry.speed
        : DEFAULT.speed,
    language:
      typeof entry?.language === "string" && entry.language
        ? entry.language
        : DEFAULT.language,
    notify: typeof entry?.notify === "boolean" ? entry.notify : DEFAULT.notify,
  };
}

export function getAgentVoiceSettings(agentId: string): AgentVoiceSettings {
  if (!agentId) return { ...DEFAULT };
  return normalize(readStore()[agentId]);
}

export function setAgentVoiceSettings(
  agentId: string,
  patch: Partial<AgentVoiceSettings>,
): AgentVoiceSettings {
  if (!agentId) return { ...DEFAULT };
  const store = readStore();
  const next = normalize({ ...normalize(store[agentId]), ...patch });
  if (patch.voiceId !== undefined) {
    const preset = VOICE_PRESETS.find((p) => p.id === next.voiceId);
    next.voiceLabel =
      patch.voiceLabel?.trim() ||
      preset?.label ||
      (next.voiceId ? "Custom" : "");
  }
  store[agentId] = next;
  writeStore(store);
  return next;
}

export function subscribeAgentVoiceSettings(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-agent-voice-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-agent-voice-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Effective voice for a call: agent override when set, else global Settings → Voice.
 */
export function resolveCallVoice(
  agentId: string | undefined,
): Pick<VoiceSettings, "voiceId" | "voiceLabel" | "speed" | "language"> & {
  notify: boolean;
} {
  const global = getVoiceSettings();
  if (!agentId) {
    return {
      voiceId: global.voiceId,
      voiceLabel: global.voiceLabel,
      speed: global.speed,
      language: global.language,
      notify: true,
    };
  }
  const agent = getAgentVoiceSettings(agentId);
  const voiceId = agent.voiceId || global.voiceId;
  const preset = VOICE_PRESETS.find((p) => p.id === voiceId);
  return {
    voiceId,
    voiceLabel:
      agent.voiceId
        ? agent.voiceLabel || preset?.label || "Custom"
        : global.voiceLabel,
    speed: agent.speed,
    language: agent.language === "auto" ? "auto" : agent.language || global.language,
    notify: agent.notify,
  };
}
