/**
 * Shell settings — Model One (Manus API / ZGPT CLI) vs Model Two (Hermes).
 * Terminal stays invisible; chat + upload only.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  type AgentModelFamily,
  getAgentModelFamily,
  isBetaModelFamily,
  subscribeAgentModels,
} from "@/lib/agents/agent-models";
import { getAgentManusApiKey } from "@/lib/agents/agent-api-keys";
import {
  type AgentResidency,
  familyBrandLabel,
  familyBrandTone,
  getAgentShell,
  isShellFamily,
  RESIDENCY_HINTS,
  RESIDENCY_LABELS,
  setAgentShell,
  subscribeAgentShells,
} from "@/lib/agents/agent-shell";
import {
  ensureZgptProfileForAgent,
  getZgptProfile,
  upsertZgptProfile,
} from "@/lib/agents/zgpt-profiles";
import { describeActiveProvider } from "@/lib/agents/model-provider-dispatch";
import { cn } from "@/lib/utils";

export function AgentShellSettings({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [family, setFamily] = useState<AgentModelFamily>(() =>
    getAgentModelFamily(agentId),
  );
  const [shell, setShell] = useState(() => getAgentShell(agentId));
  const [hasManusKey, setHasManusKey] = useState(
    () => Boolean(getAgentManusApiKey(agentId)),
  );
  const [profileLabel, setProfileLabel] = useState(() => {
    const id = getAgentShell(agentId).zgptProfileId;
    return getZgptProfile(id)?.label ?? agentName;
  });
  const [providerLabel, setProviderLabel] = useState(() =>
    describeActiveProvider(),
  );

  useEffect(() => {
    const refresh = () => {
      setFamily(getAgentModelFamily(agentId));
      const next = getAgentShell(agentId);
      setShell(next);
      setProfileLabel(getZgptProfile(next.zgptProfileId)?.label ?? agentName);
      setHasManusKey(Boolean(getAgentManusApiKey(agentId)));
      setProviderLabel(describeActiveProvider());
    };
    refresh();
    const offFamily = subscribeAgentModels(refresh);
    const offShell = subscribeAgentShells(refresh);
    return () => {
      offFamily();
      offShell();
    };
  }, [agentId, agentName]);

  if (!isShellFamily(family)) return null;

  const hints = RESIDENCY_HINTS[family] ?? RESIDENCY_HINTS.default;
  const isManus = family === "manus";
  const isZgpt = family === "chatgpt";
  const showResidency = isBetaModelFamily(family);

  const pickResidency = (residency: AgentResidency) => {
    const next = setAgentShell(agentId, { residency });
    setShell(next);
    if (family === "chatgpt" && residency === "local") {
      const profile = ensureZgptProfileForAgent(agentId, agentName);
      setAgentShell(agentId, { zgptProfileId: profile.id });
      setProfileLabel(profile.label);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-medium text-muted-foreground">
        Model One · {familyBrandLabel(family)}
        {isBetaModelFamily(family) ? " · Beta" : ""}
      </p>

      <div
        className={cn(
          "mx-1 inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
          familyBrandTone(family),
        )}
      >
        Hintergrund-Agent — kein sichtbares Terminal
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        Global: {providerLabel}. Settings → Model Provider.
      </p>

      {isManus ? (
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>Manus Open API</ItemTitle>
            <ItemDescription>
              Chat + Upload → Manus im Hintergrund (task.create). Kein
              Browser-Embed. Key unter Settings → Model Provider / API-Keys.
            </ItemDescription>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {hasManusKey
                ? "Manus-API-Key ist gesetzt — Cloud-Features aktiv."
                : "Kein Manus-Key — Manus-Features bleiben aus (kein silent fake)."}
            </p>
          </ItemContent>
        </Item>
      ) : isZgpt ? (
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>ZGPT · unsichtbares Terminal</ItemTitle>
            <ItemDescription>
              Nachrichten gehen an die Codex/ZGPT-CLI im Hintergrund
              (`/api/cli-bridge`). Nutzer meldet sich einmal an — kein
              PowerShell-/Agent-Fenster. Browser Use & Sandbox wie bei Manus.
            </ItemDescription>
          </ItemContent>
        </Item>
      ) : (
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>Betrieb</ItemTitle>
            <ItemDescription>{hints[shell.residency]}</ItemDescription>
          </ItemContent>
        </Item>
      )}

      {showResidency ? (
        <div className="flex gap-2 px-1">
          {(["local", "cloud"] as const).map((mode) => {
            const active = shell.residency === mode;
            return (
              <button
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-left transition",
                  active
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-muted/60",
                )}
                key={mode}
                onClick={() => pickResidency(mode)}
                type="button"
              >
                <p className="text-sm font-medium">{RESIDENCY_LABELS[mode]}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {hints[mode]}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}

      {isZgpt ? (
        <Item size="sm" variant="muted">
          <ItemContent className="gap-2">
            <ItemTitle>ZGPT-Profil (Login-Instanz)</ItemTitle>
            <ItemDescription>
              Einmal anmelden — danach nur Connect-Chat. Terminal bleibt
              versteckt.
            </ItemDescription>
            <Input
              className="h-8"
              onBlur={() => {
                const profile = upsertZgptProfile({
                  id: shell.zgptProfileId,
                  label: profileLabel.trim() || agentName,
                });
                setAgentShell(agentId, { zgptProfileId: profile.id });
              }}
              onChange={(e) => setProfileLabel(e.target.value)}
              placeholder="Profilname"
              value={profileLabel}
            />
          </ItemContent>
        </Item>
      ) : null}
    </div>
  );
}
