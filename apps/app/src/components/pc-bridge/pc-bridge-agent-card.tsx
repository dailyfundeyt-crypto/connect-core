import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheck, IconDeviceDesktop, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PcBridgePill } from "@/components/pc-bridge/pc-bridge-pill";
import {
  lastSeenText,
  type PcBridgeStatus,
  type PcProvider,
  pcAgentLinkQuery,
  pcBridgeKeys,
  pcGrokBotsQuery,
  removePcAgentLink,
  savePcAgentLink,
} from "@/lib/pc-bridge/api";

type Choice = "off" | PcProvider;

const CHOICES: { id: Choice; label: string; hint: string }[] = [
  { id: "off", label: "Aus – Standardmodell", hint: "Der Agent antwortet wie bisher über das Modell des Servers." },
  { id: "codex-cli", label: "Codex · dein ChatGPT-Konto", hint: "Die Codex-CLI auf deinem PC antwortet (nur lesen, eigener Ordner pro Agent)." },
  { id: "claude-cli", label: "Claude · dein Claude-Konto", hint: "Claude Code auf deinem PC antwortet." },
  { id: "grok-bot", label: "Grok Bot", hint: "Die Nachricht geht an einen deiner Grok Bots (Grok-Bot-App am PC), die Antwort kommt hierher zurück." },
];

/**
 * Online (Handy/Vercel): Agent → Einstellungen → Modell. Ein eigener Agent kann über die Anbieter-CLI
 * auf dem eigenen PC antworten; der PC holt die Nachricht über eine ausgehende Verbindung ab.
 */
export function PcBridgeAgentCard({ agentId, status }: { agentId: string; status: Extract<PcBridgeStatus, { mode: "relay" }> }) {
  const queryClient = useQueryClient();
  const linkQuery = useQuery(pcAgentLinkQuery(agentId));
  const [choice, setChoice] = useState<Choice>("off");
  const [model, setModel] = useState("");
  const grok = useQuery(pcGrokBotsQuery(choice === "grok-bot"));
  const link = linkQuery.data?.link ?? null;

  useEffect(() => {
    if (!linkQuery.data) return;
    setChoice(link ? link.provider : "off");
    setModel(link?.model ?? "");
  }, [linkQuery.data, link]);

  const providerInfo = status.providers.find((entry) => entry.kind === choice);
  const models = providerInfo?.models ?? [];
  const bots = grok.data?.bots ?? [];
  const botName = useMemo(() => bots.find((bot) => bot.id === model)?.name, [bots, model]);

  const invalidate = () => Promise.all([queryClient.invalidateQueries({ queryKey: pcBridgeKeys.all })]);
  const save = useMutation({
    mutationFn: () =>
      choice === "off"
        ? removePcAgentLink(agentId)
        : savePcAgentLink(agentId, { provider: choice, model, ...(choice === "grok-bot" && botName ? { label: botName } : {}) }),
    onSuccess: invalidate,
  });

  const dirty = (link ? link.provider : "off") !== choice || (choice !== "off" && (link?.model ?? "") !== model);
  const owner = linkQuery.data?.owner ?? false;
  const info = CHOICES.find((entry) => entry.id === choice);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border p-4" data-testid="pc-bridge-agent-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <IconDeviceDesktop className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold text-[15px]">Antwort über deinen PC</h3>
            <p className="text-[12.5px] text-muted-foreground">Codex, Claude oder ein Grok Bot – mit deinem Login am PC, ohne API-Key.</p>
          </div>
        </div>
        <PcBridgePill online={status.online} />
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        {status.online
          ? `Dein PC (${status.label ?? "Connect App"}) ist verbunden · zuletzt ${lastSeenText(status.lastSeen)}.`
          : status.lastSeen
            ? `Dein PC ist offline (zuletzt ${lastSeenText(status.lastSeen)}). Starte die Connect App am PC – dann antwortet der Agent wieder.`
            : "Noch kein PC verbunden. Die Connect App am PC verbindet sich automatisch, sobald die Handy-Brücke dort eingerichtet ist."}
      </p>

      {linkQuery.isLoading ? (
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" /> Lade …
        </span>
      ) : !owner ? (
        <p className="text-[13px] text-muted-foreground">Nur eigene (private) Agenten können über deinen PC antworten.</p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-[13px]">Anbieter</span>
            <select
              className="h-10 rounded-lg border border-input bg-background px-2.5 text-[15px]"
              data-testid="pc-bridge-provider"
              onChange={(event) => {
                const next = event.target.value as Choice;
                setChoice(next);
                const nextInfo = status.providers.find((entry) => entry.kind === next);
                setModel(next === link?.provider ? link.model : next === "grok-bot" ? "" : (nextInfo?.models[0] ?? ""));
              }}
              value={choice}
            >
              {CHOICES.map((entry) => {
                const provider = status.providers.find((candidate) => candidate.kind === entry.id);
                const notReady = entry.id !== "off" && provider && !provider.ready;
                return (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                    {notReady ? " (am PC nicht bereit)" : ""}
                  </option>
                );
              })}
            </select>
            {info ? <span className="text-[12px] text-muted-foreground">{info.hint}</span> : null}
            {providerInfo && !providerInfo.ready ? <span className="text-[12px] text-amber-500">Am PC: {providerInfo.detail}</span> : null}
          </label>

          {choice === "codex-cli" || choice === "claude-cli" ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-[13px]">Modell</span>
              <select
                className="h-10 rounded-lg border border-input bg-background px-2.5 text-[15px]"
                onChange={(event) => setModel(event.target.value)}
                value={model}
              >
                {(models.length ? models : [model].filter(Boolean)).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {choice === "grok-bot" ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-[13px]">Grok Bot</span>
              {grok.isLoading ? (
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <IconLoader2 className="size-4 animate-spin" /> Lade Bots vom PC …
                </span>
              ) : bots.length === 0 ? (
                <span className="text-[12.5px] text-muted-foreground">Keine Grok Bots gemeldet. Ist die Grok-Bot-App am PC angemeldet?</span>
              ) : (
                <select
                  className="h-10 rounded-lg border border-input bg-background px-2.5 text-[15px]"
                  data-testid="pc-bridge-grok-bot"
                  onChange={(event) => setModel(event.target.value)}
                  value={model}
                >
                  <option value="">– Bot wählen –</option>
                  {bots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                      {bot.agentId && bot.agentId !== agentId ? " (schon verknüpft)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="pc-bridge-save"
              disabled={save.isPending || !dirty || (choice !== "off" && !model)}
              onClick={() => save.mutate()}
              type="button"
            >
              {save.isPending ? <IconLoader2 className="animate-spin" /> : null} Speichern
            </Button>
            {save.isSuccess && !dirty ? (
              <span className="flex items-center gap-1 text-[12.5px] text-emerald-500">
                <IconCircleCheck className="size-4" /> Gespeichert – gilt ab der nächsten Nachricht.
              </span>
            ) : null}
          </div>
          {save.isError ? <p className="text-destructive text-xs">{(save.error as Error).message}</p> : null}
        </>
      )}
    </div>
  );
}
