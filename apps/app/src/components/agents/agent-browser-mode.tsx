import {
  IconBrandChrome,
  IconCloud,
  IconCloudComputing,
  IconDeviceDesktop,
  IconDeviceMobile,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAgentApiKeys,
  getAgentManusApiKey,
} from "@/lib/agents/agent-api-keys";
import {
  ANCHOR_CLOUD_KEY_HINT,
  BOX_LABELS,
  boxSizesForRuntime,
  type AgentBoxSize,
  type AgentComputerPrefs,
  computerDisplayLabel,
  getAgentComputerPrefs,
  MANUS_CLOUD_KEY_HINT,
  pickerValueForPrefs,
  prefsPatchForPicker,
  SANDBOX_PICKER_OPTIONS,
  type SandboxPickerValue,
  setAgentComputerPrefs,
  subscribeAgentComputer,
} from "@/lib/agents/agent-computer";
import { ensureAgentBrowserStarted } from "@/lib/agents/agent-browser";
import { cn } from "@/lib/utils";

/**
 * Cloud picker — Default Cloud, Azure Cloud, Oracle Cloud, Manus Cloud,
 * PC (Ubuntu-Docker), and Smartphone. Missing keys grey a row; they do not hide it.
 */
export function AgentBrowserModeSelect({
  agentId,
  className,
  compact = false,
}: {
  agentId: string;
  className?: string;
  compact?: boolean;
}) {
  const [prefs, setPrefs] = useState<AgentComputerPrefs>(() =>
    getAgentComputerPrefs(agentId),
  );
  const [hasManusKey, setHasManusKey] = useState(false);
  const [hasAnchorKey, setHasAnchorKey] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPrefs(getAgentComputerPrefs(agentId));
      setHasManusKey(Boolean(getAgentManusApiKey(agentId)));
      setHasAnchorKey(Boolean(getAgentApiKeys(agentId).browserUse.trim()));
    };
    refresh();
    return subscribeAgentComputer(refresh);
  }, [agentId]);

  const applyValue = (value: SandboxPickerValue) => {
    const option = SANDBOX_PICKER_OPTIONS.find((row) => row.value === value);
    if (option?.needs === "manus" && !hasManusKey) return;
    if (option?.needs === "anchor" && !hasAnchorKey) return;
    const next = setAgentComputerPrefs(agentId, prefsPatchForPicker(value));
    setPrefs(next);
    void ensureAgentBrowserStarted(agentId);
  };

  const applyBox = (boxSize: AgentBoxSize) => {
    const next = setAgentComputerPrefs(agentId, { boxSize });
    setPrefs(next);
    if (
      next.runtime !== "chrome" &&
      next.runtime !== "phone" &&
      next.runtime !== "manus"
    ) {
      void ensureAgentBrowserStarted(agentId);
    }
  };

  const boxChoices = boxSizesForRuntime(prefs.runtime);
  const selectValue = pickerValueForPrefs(prefs);

  const RuntimeIcon =
    prefs.runtime === "phone"
      ? IconDeviceMobile
      : prefs.runtime === "local"
        ? IconDeviceDesktop
        : prefs.runtime === "chrome"
          ? IconBrandChrome
          : prefs.runtime === "manus"
            ? IconCloudComputing
            : IconCloud;

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        compact ? "max-w-[16rem]" : undefined,
        className,
      )}
    >
      <Select
        onValueChange={(value) => {
          if (value == null || !isPickerValue(value)) return;
          applyValue(value);
        }}
        value={selectValue}
      >
        <SelectTrigger
          aria-label="Cloud / Smartphone"
          className={cn(
            compact &&
              "h-8 max-w-[11.5rem] rounded-full px-2.5 text-[11px] data-[size=sm]:h-8",
          )}
          data-testid="agent-browser-mode"
          size="sm"
        >
          <SelectValue>
            <span className="inline-flex items-center gap-2">
              <RuntimeIcon
                className={cn(
                  "size-3.5",
                  prefs.runtime === "phone" && "text-emerald-600",
                  prefs.runtime === "manus" && "text-sky-600",
                  prefs.runtime === "local" && "text-amber-500",
                )}
              />
              <span className="truncate text-[11px]">
                {computerDisplayLabel(prefs)}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end" className="min-w-56">
          <SelectGroup>
            <SelectLabel className="text-[10px] text-muted-foreground">
              Cloud · Smartphone
            </SelectLabel>
            {SANDBOX_PICKER_OPTIONS.map((option) => {
              const missing =
                (option.needs === "anchor" && !hasAnchorKey) ||
                (option.needs === "manus" && !hasManusKey);
              return (
                <SelectItem
                  data-testid={`sandbox-cloud-${option.value}`}
                  disabled={missing}
                  key={option.value}
                  value={option.value}
                >
                  <span className="inline-flex items-center gap-2">
                    <PickerIcon value={option.value} />
                    {option.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
          {!hasAnchorKey ? (
            <p
              className="border-t border-border px-2 py-1.5 text-[10px] leading-snug text-destructive"
              role="status"
            >
              {ANCHOR_CLOUD_KEY_HINT}
            </p>
          ) : null}
          {!hasManusKey ? (
            <p
              className="border-t border-border px-2 py-1.5 text-[10px] leading-snug text-destructive"
              role="status"
            >
              {MANUS_CLOUD_KEY_HINT}
            </p>
          ) : null}
        </SelectContent>
      </Select>

      {boxChoices.length > 0 && !compact ? (
        <Select
          onValueChange={(value) => {
            if (value !== "small" && value !== "medium" && value !== "large") {
              return;
            }
            if (!boxChoices.includes(value)) return;
            applyBox(value);
          }}
          value={
            boxChoices.includes(prefs.boxSize) ? prefs.boxSize : boxChoices[0]
          }
        >
          <SelectTrigger
            aria-label="Box-Größe"
            className="h-8 max-w-[8.5rem] rounded-full px-2.5 text-[11px] data-[size=sm]:h-8"
            size="sm"
          >
            <SelectValue>
              <span className="truncate text-[11px]">
                {BOX_LABELS[prefs.boxSize]}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end" className="min-w-48">
            <SelectGroup>
              <SelectLabel className="text-[10px] text-muted-foreground">
                {prefs.runtime === "cloud" ? "Cloud-Box" : "Lokale Box"}
              </SelectLabel>
              {boxChoices.map((size) => (
                <SelectItem key={size} value={size}>
                  {BOX_LABELS[size]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function isPickerValue(value: string): value is SandboxPickerValue {
  return SANDBOX_PICKER_OPTIONS.some((option) => option.value === value);
}

function PickerIcon({ value }: { value: SandboxPickerValue }) {
  if (value === "manus") {
    return <IconCloudComputing className="size-3.5 text-sky-600" />;
  }
  if (value === "phone") {
    return <IconDeviceMobile className="size-3.5 text-emerald-600" />;
  }
  if (value === "local") {
    return <IconDeviceDesktop className="size-3.5 text-amber-500" />;
  }
  if (value === "chrome") {
    return <IconBrandChrome className="size-3.5" />;
  }
  return <IconCloud className="size-3.5" />;
}
