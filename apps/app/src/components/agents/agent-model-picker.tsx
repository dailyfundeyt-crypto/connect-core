import { IconChevronDown } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { T3CliSelector } from "@/components/agents/t3-cli-selector";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAgentModel,
  getAgentModelOptions,
  setAgentModel,
  subscribeAgentModels,
  type AgentModelId,
} from "@/lib/agents/agent-models";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";

/**
 * Compact model dropdown for the composer (and agent settings).
 * Shows the current model label plus a chevron — Cursor-style.
 */
export function AgentModelPicker({
  agentId,
  className,
  size = "sm",
  showProvider = false,
}: {
  agentId: string;
  className?: string;
  size?: "sm" | "default";
  /** When true, options read "ChatGPT · GPT-5" instead of just "GPT-5". */
  showProvider?: boolean;
}) {
  const [model, setModel] = useState<AgentModelId>(() => getAgentModel(agentId));
  const [options, setOptions] = useState(() => getAgentModelOptions(agentId));

  useEffect(() => {
    const refresh = () => {
      setModel(getAgentModel(agentId));
      setOptions(getAgentModelOptions(agentId));
    };
    refresh();
    return subscribeAgentModels(refresh);
  }, [agentId]);

  /*
   * DER CLI-TAUSCH (A23) — an EXAKT DERSELBEN STELLE, im selben Look.
   *
   * Hinter `connect.t3.cliSwap` tauscht die Auswahl in diesem Trigger durch die T3-CLI-Auswahl
   * (Status-Punkte, T3-/Legacy-Gruppen). Der Trigger selbst bleibt derselbe: runder 8-px-Trigger,
   * `h-8`, `text-[11px]`, Chevron, `align="end"` — genau die Vorlage aus A01/A23. Flag aus = das
   * alte Modell-Dropdown, unangetastet (die alte Komponente und ihr Katalog bleiben im Code).
   */
  if (getT3Flag("cliSwap")) {
    return (
      <T3CliSelector agentId={agentId} className={className} size={size} />
    );
  }

  if (options.length === 0) return null;

  return (
    <Select
      onValueChange={(value) => {
        if (typeof value !== "string") return;
        setModel(setAgentModel(agentId, value as AgentModelId));
      }}
      value={model}
    >
      <SelectTrigger
        aria-label="Model"
        className={cn(
          "gap-1 border-border bg-background font-medium shadow-none [&>svg:last-of-type]:hidden",
          size === "sm" &&
            "h-8 max-w-[9.5rem] rounded-full px-2.5 text-[11px] data-[size=sm]:h-8",
          size === "default" && "h-8 min-w-40 rounded-lg text-sm",
          className,
        )}
        data-testid="agent-model-picker"
        size="sm"
      >
        <SelectValue />
        <IconChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-44">
        <SelectGroup>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {showProvider ? `${m.provider} · ${m.label}` : m.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
