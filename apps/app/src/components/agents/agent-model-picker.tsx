import { IconChevronDown } from "@tabler/icons-react";
import { useEffect, useState } from "react";
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
