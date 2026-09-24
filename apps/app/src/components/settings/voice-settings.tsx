import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  addElevenLabsKey,
  CHAR_BUDGET,
  getVoiceSettings,
  maskKey,
  removeElevenLabsKey,
  setVoiceDefaults,
  subscribeVoiceSettings,
  VOICE_PRESETS,
  type VoiceSettings,
} from "@/lib/voice/elevenlabs";
import { prefetchWhisper } from "@/lib/voice/whisper";

/**
 * ElevenLabs key ring + voice defaults. Keys rotate after CHAR_BUDGET characters.
 * Stored locally (localStorage / local Supabase-ready shape).
 */
export function VoiceSettingsPanel() {
  const [settings, setSettings] = useState<VoiceSettings>(() =>
    getVoiceSettings(),
  );
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeVoiceSettings(() => setSettings(getVoiceSettings()));
  }, []);

  // Seed from local Vite env (never committed to git) so first open works.
  useEffect(() => {
    const seeded = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined;
    if (seeded?.trim() && getVoiceSettings().keys.length === 0) {
      setSettings(addElevenLabsKey(seeded.trim(), "Primary"));
    }
  }, []);

  // Warm Whisper so the first call is faster.
  useEffect(() => {
    prefetchWhisper();
  }, []);

  return (
    <div id="voice">
      <PageSection title="Voice (ElevenLabs + Whisper)">
        <PageRows>
          <Item size="sm">
            <ItemContent>
              <ItemTitle>API keys</ItemTitle>
              <ItemDescription>
                Keys stay on this device (local storage). After {CHAR_BUDGET}{" "}
                characters of speech, Connect switches to the next key — add more
                with +.
              </ItemDescription>
            </ItemContent>
          </Item>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {settings.keys.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                No keys yet — add one below.
              </li>
            ) : (
              settings.keys.map((entry, index) => (
                <li
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  key={entry.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {entry.label}
                      {index === settings.activeIndex ? (
                        <span className="ml-2 text-xs font-semibold text-sky-600">
                          active
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {maskKey(entry.key)} · {entry.charsUsed}/{CHAR_BUDGET}{" "}
                      chars
                    </p>
                  </div>
                  <Button
                    aria-label={`Remove ${entry.label}`}
                    onClick={() => setSettings(removeElevenLabsKey(entry.id))}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </li>
              ))
            )}
          </ul>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              try {
                setSettings(addElevenLabsKey(newKey));
                setNewKey("");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Failed");
              }
            }}
          >
            <input
              autoComplete="off"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk_… ElevenLabs API key"
              type="password"
              value={newKey}
            />
            <Button className="gap-1" size="sm" type="submit">
              <IconPlus className="size-4" />
              Add key
            </Button>
          </form>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Item size="sm">
            <ItemContent>
              <ItemTitle>Stimme</ItemTitle>
              <ItemDescription>
                ElevenLabs voice for employee replies (Helix and more).
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <select
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                onChange={(e) => {
                  const voiceId = e.target.value;
                  const preset = VOICE_PRESETS.find((p) => p.id === voiceId);
                  setSettings(
                    setVoiceDefaults({
                      voiceId,
                      voiceLabel: preset?.label,
                    }),
                  );
                }}
                value={settings.voiceId}
              >
                {VOICE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </ItemActions>
          </Item>

          <Item size="sm">
            <ItemContent>
              <ItemTitle>Geschwindigkeit</ItemTitle>
              <ItemDescription>Playback speed for spoken replies.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <select
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                onChange={(e) =>
                  setSettings(setVoiceDefaults({ speed: Number(e.target.value) }))
                }
                value={String(settings.speed)}
              >
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
              </select>
            </ItemActions>
          </Item>

          <Item size="sm">
            <ItemContent>
              <ItemTitle>Sprache</ItemTitle>
              <ItemDescription>
                Whisper / listening language (local speech-to-text).
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <select
                className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
                onChange={(e) =>
                  setSettings(setVoiceDefaults({ language: e.target.value }))
                }
                value={settings.language}
              >
                <option value="auto">Auto-detect</option>
                <option value="de-DE">Deutsch</option>
                <option value="en-US">English</option>
              </select>
            </ItemActions>
          </Item>

          <Item size="sm">
            <ItemContent>
              <ItemTitle>Model</ItemTitle>
              <ItemDescription>
                ElevenLabs model id (default eleven_flash_v2_5).
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <code className="rounded bg-muted px-2 py-1 text-xs">
                {settings.modelId}
              </code>
            </ItemActions>
          </Item>
        </PageRows>
      </PageSection>
    </div>
  );
}
