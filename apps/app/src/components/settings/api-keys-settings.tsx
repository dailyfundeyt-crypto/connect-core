import { IconKey, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  AGENT_API_KEY_META,
  type AgentApiKeyKind,
  maskApiKey,
  subscribeAgentApiKeys,
} from "@/lib/agents/agent-api-keys";
import {
  clearGlobalApiKey,
  getGlobalApiKeys,
  seedGlobalManusFromEnv,
  setGlobalApiKey,
  type GlobalApiKeys,
} from "@/lib/agents/global-api-keys";

/** @deprecated use seedGlobalManusFromEnv from global-api-keys */
function seedManusFromEnv() {
  seedGlobalManusFromEnv();
}

/**
 * Settings → API-Keys — global defaults for Manus, Anchor, ElevenLabs, Ziel AI.
 * Per-agent keys (Agent dialog) override these.
 */
export function ApiKeysSettingsPanel() {
  const [keys, setKeys] = useState<GlobalApiKeys>(() => getGlobalApiKeys());
  const [drafts, setDrafts] = useState<
    Record<Exclude<AgentApiKeyKind, "codex">, string>
  >({
    manus: "",
    browserUse: "",
    elevenLabs: "",
    zielAi: "",
  });

  useEffect(() => {
    seedManusFromEnv();
    const refresh = () => setKeys(getGlobalApiKeys());
    refresh();
    return subscribeAgentApiKeys(refresh);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle className="flex items-center gap-1.5">
            <IconKey className="size-3.5 opacity-60" />
            Globale API-Keys
          </ItemTitle>
          <ItemDescription>
            Standard für alle Bots. Einzelne Agenten können unter Agent →
            API-Keys einen eigenen Key setzen (überschreibt global).
          </ItemDescription>
        </ItemContent>
      </Item>

      {AGENT_API_KEY_META.map((meta) => {
        const saved = keys[meta.id];
        return (
          <Item key={meta.id} size="sm" variant="muted">
            <ItemContent>
              <ItemTitle className="flex items-center gap-1.5">
                <IconKey className="size-3.5 opacity-60" />
                {meta.label}
              </ItemTitle>
              <ItemDescription>{meta.hint}</ItemDescription>
              {saved ? (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Gespeichert: {maskApiKey(saved)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Noch kein Key.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label={`${meta.label} API key`}
                  autoComplete="off"
                  className="h-8 font-mono text-xs"
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [meta.id]: e.target.value }))
                  }
                  placeholder={meta.placeholder}
                  spellCheck={false}
                  type="password"
                  value={drafts[meta.id]}
                />
                <Button
                  disabled={!drafts[meta.id]?.trim()}
                  onClick={() => {
                    setKeys(setGlobalApiKey(meta.id, drafts[meta.id]!));
                    setDrafts((d) => ({ ...d, [meta.id]: "" }));
                  }}
                  size="sm"
                  type="button"
                >
                  Speichern
                </Button>
              </div>
            </ItemContent>
            {saved ? (
              <ItemActions>
                <Button
                  aria-label={`${meta.label} Key entfernen`}
                  onClick={() => setKeys(clearGlobalApiKey(meta.id))}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconTrash className="size-3.5" />
                </Button>
              </ItemActions>
            ) : null}
          </Item>
        );
      })}
    </div>
  );
}
