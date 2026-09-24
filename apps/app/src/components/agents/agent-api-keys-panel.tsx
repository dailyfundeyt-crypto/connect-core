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
import { Switch } from "@/components/ui/switch";
import {
  AGENT_API_KEY_META,
  type AgentApiKeyKind,
  type AgentCodexKeySource,
  clearAgentApiKey,
  getAgentApiKeys,
  getAgentCodexKeySource,
  maskApiKey,
  setAgentApiKey,
  setAgentCodexKeySource,
  subscribeAgentApiKeys,
} from "@/lib/agents/agent-api-keys";

/**
 * Per-agent keys so Manus, Browser Use, ElevenLabs, Ziel AI, and optionally
 * Codex each have their own quota. Codex defaults to the global Settings key.
 *
 * Pass `kinds` to show only some key rows (e.g. browser / voice sections).
 */
export function AgentApiKeysPanel({
  agentId,
  kinds,
  showCodex = true,
}: {
  agentId: string;
  /** Subset of non-codex keys to render. Default: all. */
  kinds?: ReadonlyArray<Exclude<AgentApiKeyKind, "codex">>;
  /** Codex row (default true). Set false in focused sections. */
  showCodex?: boolean;
}) {
  const [keys, setKeys] = useState(() => getAgentApiKeys(agentId));
  const [codexSource, setCodexSource] = useState<AgentCodexKeySource>(() =>
    getAgentCodexKeySource(agentId),
  );
  const [drafts, setDrafts] = useState<Record<AgentApiKeyKind, string>>({
    manus: "",
    browserUse: "",
    elevenLabs: "",
    zielAi: "",
    codex: "",
  });

  useEffect(() => {
    const refresh = () => {
      setKeys(getAgentApiKeys(agentId));
      setCodexSource(getAgentCodexKeySource(agentId));
    };
    refresh();
    return subscribeAgentApiKeys(refresh);
  }, [agentId]);

  const useOwnCodex = codexSource === "own";
  const savedCodex = keys.codex;
  const metaRows = AGENT_API_KEY_META.filter(
    (meta) => !kinds || kinds.includes(meta.id),
  );

  return (
    <div className="flex flex-col gap-2">
      {showCodex ? (
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle className="flex items-center gap-1.5">
              <IconKey className="size-3.5 opacity-60" />
              Codex API-Key
            </ItemTitle>
            <ItemDescription>
              {useOwnCodex
                ? "Dieser Bot nutzt seinen eigenen Codex-/OpenAI-Key für Bot-CLI (ChatGPT & Cursor)."
                : "Dieser Bot nutzt den globalen Key unter Settings → Usage."}
            </ItemDescription>
            {useOwnCodex ? (
              <>
                {savedCodex ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Gespeichert: {maskApiKey(savedCodex)}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Noch kein eigener Key — Bot-CLI schlägt fehl, bis einer
                    gespeichert ist.
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <Input
                    aria-label="Codex API key"
                    autoComplete="off"
                    className="h-8 font-mono text-xs"
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, codex: e.target.value }))
                    }
                    placeholder="sk-… Codex API-Key"
                    spellCheck={false}
                    type="password"
                    value={drafts.codex}
                  />
                  <Button
                    disabled={!drafts.codex?.trim()}
                    onClick={() => {
                      setKeys(setAgentApiKey(agentId, "codex", drafts.codex!));
                      setDrafts((d) => ({ ...d, codex: "" }));
                    }}
                    size="sm"
                    type="button"
                  >
                    Speichern
                  </Button>
                </div>
              </>
            ) : null}
          </ItemContent>
          <ItemActions className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {useOwnCodex ? "Eigener" : "Global"}
              </span>
              <Switch
                aria-label="Eigenen Codex-Key nutzen"
                checked={useOwnCodex}
                onCheckedChange={(checked) => {
                  const next = setAgentCodexKeySource(
                    agentId,
                    checked ? "own" : "global",
                  );
                  setCodexSource(next);
                }}
                size="sm"
              />
            </div>
            {useOwnCodex && savedCodex ? (
              <Button
                aria-label="Codex Key entfernen"
                onClick={() => setKeys(clearAgentApiKey(agentId, "codex"))}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <IconTrash className="size-3.5" />
              </Button>
            ) : null}
          </ItemActions>
        </Item>
      ) : null}

      {metaRows.map((meta) => {
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
                    setKeys(setAgentApiKey(agentId, meta.id, drafts[meta.id]!));
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
                  onClick={() => setKeys(clearAgentApiKey(agentId, meta.id))}
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
