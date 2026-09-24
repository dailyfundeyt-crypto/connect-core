import { IconPlayerPlay } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  getAgentVoiceSettings,
  setAgentVoiceSettings,
  subscribeAgentVoiceSettings,
  type AgentVoiceSettings,
} from "@/lib/voice/agent-voice";
import { getAgentApiKeys } from "@/lib/agents/agent-api-keys";
import {
  playElevenLabsAudio,
  speakWithElevenLabs,
  takeActiveKey,
  VOICE_PRESETS,
} from "@/lib/voice/elevenlabs";

const SPEEDS = [
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
] as const;

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "de-DE", label: "Deutsch" },
  { value: "en-US", label: "English" },
] as const;

/**
 * Per-bot phone settings: Stimme (with preview), Geschwindigkeit, Sprache, Benachrichtigungen.
 * Shown on the agent Einstellungen / General panel.
 */
export function AgentPhoneSettings({ agentId }: { agentId: string }) {
  const [settings, setSettings] = useState<AgentVoiceSettings>(() =>
    getAgentVoiceSettings(agentId),
  );
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(getAgentVoiceSettings(agentId));
    return subscribeAgentVoiceSettings(() =>
      setSettings(getAgentVoiceSettings(agentId)),
    );
  }, [agentId]);

  const patch = (next: Partial<AgentVoiceSettings>) => {
    setSettings(setAgentVoiceSettings(agentId, next));
  };

  const previewVoice = async (voiceId: string) => {
    if (!voiceId || previewing) return;
    setPreviewError(null);
    setPreviewing(voiceId);
    try {
      if (takeActiveKey() || getAgentApiKeys(agentId).elevenLabs.trim()) {
        const buffer = await speakWithElevenLabs(
          "Hallo, so klinge ich in Telefonaten.",
          { voiceId, agentId },
        );
        await playElevenLabsAudio(buffer, { speed: settings.speed });
      } else {
        await new Promise<void>((resolve) => {
          const utter = new SpeechSynthesisUtterance(
            "Hallo, so klinge ich in Telefonaten.",
          );
          utter.lang =
            settings.language === "auto" ? "de-DE" : settings.language;
          utter.rate = settings.speed;
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          window.speechSynthesis.speak(utter);
        });
      }
    } catch (caught) {
      setPreviewError(
        caught instanceof Error ? caught.message : "Vorschau fehlgeschlagen.",
      );
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Stimme</ItemTitle>
          <ItemDescription>
            Stimme für Telefonate mit diesem Bot.
          </ItemDescription>
        </ItemContent>
        <ItemActions className="flex items-center gap-1">
          <select
            aria-label="Stimme"
            className="h-8 min-w-36 rounded-lg border border-border bg-background px-2 text-sm"
            onChange={(e) => {
              const voiceId = e.target.value;
              const preset = VOICE_PRESETS.find((p) => p.id === voiceId);
              patch({
                voiceId,
                voiceLabel: preset?.label ?? "",
              });
            }}
            value={settings.voiceId}
          >
            <option value="">Nicht festgelegt</option>
            {VOICE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {settings.voiceId ? (
            <button
              aria-label="Stimme anhören"
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              disabled={previewing === settings.voiceId}
              onClick={() => void previewVoice(settings.voiceId)}
              type="button"
            >
              <IconPlayerPlay className="size-4" />
            </button>
          ) : null}
        </ItemActions>
      </Item>

      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Geschwindigkeit</ItemTitle>
          <ItemDescription>Sprechtempo in Telefonaten.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <select
            aria-label="Geschwindigkeit"
            className="h-8 min-w-24 rounded-lg border border-border bg-background px-2 text-sm"
            onChange={(e) => patch({ speed: Number(e.target.value) })}
            value={String(settings.speed)}
          >
            {SPEEDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </ItemActions>
      </Item>

      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Sprache</ItemTitle>
          <ItemDescription>
            Erkennungssprache für Sprachanrufe.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <select
            aria-label="Sprache"
            className="h-8 min-w-32 rounded-lg border border-border bg-background px-2 text-sm"
            onChange={(e) => patch({ language: e.target.value })}
            value={settings.language}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </ItemActions>
      </Item>

      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Benachrichtigungen</ItemTitle>
          <ItemDescription>
            Lass dich benachrichtigen, wenn dieser Bot fertig ist oder Eingaben
            braucht.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={settings.notify}
            onCheckedChange={(notify) => patch({ notify })}
          />
        </ItemActions>
      </Item>

      {previewError ? (
        <p className="px-1 text-xs text-destructive" role="alert">
          {previewError}
        </p>
      ) : null}
    </div>
  );
}
