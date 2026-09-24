import type { ReactNode } from "react";
import {
  IconBrandChrome,
  IconCloud,
  IconCloudComputing,
  IconDeviceDesktop,
  IconDeviceMobile,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getAgentApiKeys,
  getAgentManusApiKey,
} from "@/lib/agents/agent-api-keys";
import {
  ensureAgentBrowserStarted,
  getAgentBrowserMode,
  getAgentBrowserSession,
  setAgentBrowserMode,
  subscribeAgentBrowser,
  type AgentBrowserMode,
} from "@/lib/agents/agent-browser";
import {
  ANCHOR_CLOUD_KEY_HINT,
  ANCHOR_CLOUD_LABELS,
  anchorTargetForPrefs,
  BOX_LABELS,
  boxSizesForRuntime,
  type AgentBoxSize,
  type AgentComputerPrefs,
  getAgentComputerPrefs,
  MANUS_CLOUD_KEY_HINT,
  RUNTIME_HINTS,
  RUNTIME_LABELS,
  setAgentComputerPrefs,
} from "@/lib/agents/agent-computer";
import { cn } from "@/lib/utils";

/**
 * Full Computer menu — Chrome, PC (Ubuntu-Docker), Manus, Default/Azure/Oracle, Smartphone.
 */
export function AgentBrowserMenu({
  agentId,
  active,
  needsYou,
  onOpenWatch,
  disabled,
}: {
  agentId: string;
  active?: boolean;
  needsYou?: boolean;
  onOpenWatch: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AgentBrowserMode>(() =>
    getAgentBrowserMode(agentId),
  );
  const [prefs, setPrefs] = useState<AgentComputerPrefs>(() =>
    getAgentComputerPrefs(agentId),
  );
  const [boxSize, setBoxSize] = useState<AgentBoxSize>(
    () => getAgentComputerPrefs(agentId).boxSize,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasAnchorKey, setHasAnchorKey] = useState(false);
  const [hasManusKey, setHasManusKey] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const nextPrefs = getAgentComputerPrefs(agentId);
      setPrefs(nextPrefs);
      setMode(getAgentBrowserMode(agentId));
      setBoxSize(nextPrefs.boxSize);
      setHasAnchorKey(Boolean(getAgentApiKeys(agentId).browserUse.trim()));
      setHasManusKey(Boolean(getAgentManusApiKey(agentId)));
      const session = getAgentBrowserSession(agentId);
      if (session.status === "error") setMessage(session.message ?? null);
    };
    refresh();
    return subscribeAgentBrowser(refresh);
  }, [agentId]);

  const start = async (next: AgentBrowserMode) => {
    setBusy(true);
    setMessage(null);
    try {
      if (next === "manus" && !hasManusKey) {
        setMessage(MANUS_CLOUD_KEY_HINT);
        return;
      }
      if (next === "cloud" && !hasAnchorKey) {
        setMessage(ANCHOR_CLOUD_KEY_HINT);
        return;
      }
      setMode(setAgentBrowserMode(agentId, next));
      const session = await ensureAgentBrowserStarted(agentId);
      if (session.status === "error") {
        setMessage(session.message ?? "Computer konnte nicht starten.");
        return;
      }
      setOpen(false);
      onOpenWatch();
    } finally {
      setBusy(false);
    }
  };

  const pickBox = (size: AgentBoxSize) => {
    const next = setAgentComputerPrefs(agentId, { boxSize: size });
    setPrefs(next);
    setBoxSize(next.boxSize);
    setMode(next.runtime);
  };

  const startCloud = (target: "default" | "azure" | "oracle") => {
    if (!hasAnchorKey) {
      setMessage(ANCHOR_CLOUD_KEY_HINT);
      return;
    }
    setAgentComputerPrefs(agentId, {
      runtime: "cloud",
      cloudTarget: target,
    });
    void start("cloud");
  };

  const anchor = anchorTargetForPrefs(prefs);

  const boxChoices = boxSizesForRuntime(mode);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Computer"
            aria-pressed={active}
            className={cn("relative", active && "bg-foreground/5")}
            disabled={disabled}
            size="icon"
            title="Computer"
            type="button"
            variant="ghost"
          >
            <IconDeviceDesktop className="size-4.5" />
            {needsYou ? (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500" />
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="w-64 rounded-2xl border border-border p-0 shadow-lg"
        side="bottom"
      >
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold tracking-tight">Computer</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Chrome · Ubuntu · Default · Azure · Oracle · Manus · Smartphone
          </p>
        </div>

        <RuntimeRow
          active={mode === "chrome"}
          busy={busy}
          hint={RUNTIME_HINTS.chrome}
          icon={<IconBrandChrome className="size-4" />}
          label={RUNTIME_LABELS.chrome}
          onClick={() => void start("chrome")}
        />
        <RuntimeRow
          active={mode === "local"}
          busy={busy}
          hint={RUNTIME_HINTS.local}
          icon={<IconDeviceDesktop className="size-4 text-amber-500" />}
          label={RUNTIME_LABELS.local}
          onClick={() => void start("local")}
        />
        <RuntimeRow
          active={mode === "cloud" && anchor === "default"}
          busy={busy}
          disabled={!hasAnchorKey}
          hint={
            hasAnchorKey
              ? "Anchor Remote-Box · kleine Box"
              : ANCHOR_CLOUD_KEY_HINT
          }
          icon={<IconCloud className="size-4" />}
          label={ANCHOR_CLOUD_LABELS.default}
          onClick={() => startCloud("default")}
        />
        <RuntimeRow
          active={mode === "cloud" && anchor === "azure"}
          busy={busy}
          disabled={!hasAnchorKey}
          hint={
            hasAnchorKey ? RUNTIME_HINTS.cloud : ANCHOR_CLOUD_KEY_HINT
          }
          icon={<IconCloud className="size-4" />}
          label={ANCHOR_CLOUD_LABELS.azure}
          onClick={() => startCloud("azure")}
        />
        <RuntimeRow
          active={mode === "cloud" && anchor === "oracle"}
          busy={busy}
          disabled={!hasAnchorKey}
          hint={
            hasAnchorKey
              ? "Anchor Remote-Box · ~24 GB"
              : ANCHOR_CLOUD_KEY_HINT
          }
          icon={<IconCloud className="size-4" />}
          label={ANCHOR_CLOUD_LABELS.oracle}
          onClick={() => startCloud("oracle")}
        />
        <RuntimeRow
          active={mode === "manus"}
          busy={busy}
          disabled={!hasManusKey}
          hint={hasManusKey ? RUNTIME_HINTS.manus : MANUS_CLOUD_KEY_HINT}
          icon={<IconCloudComputing className="size-4 text-sky-600" />}
          label={RUNTIME_LABELS.manus}
          onClick={() => void start("manus")}
        />
        <RuntimeRow
          active={mode === "phone"}
          busy={busy}
          hint={RUNTIME_HINTS.phone}
          icon={<IconDeviceMobile className="size-4 text-emerald-600" />}
          label={RUNTIME_LABELS.phone}
          onClick={() => void start("phone")}
        />

        {boxChoices.length > 0 ? (
          <div className="border-t border-border px-3 py-2">
            <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {mode === "cloud" ? "Cloud-Box" : "Lokale Box"}
            </p>
            <div className="flex flex-col gap-0.5">
              {boxChoices.map((size) => (
                <button
                  className={cn(
                    "rounded-xl px-2.5 py-1.5 text-left text-xs hover:bg-muted",
                    boxSize === size && "bg-muted font-medium",
                  )}
                  key={size}
                  onClick={() => pickBox(size)}
                  type="button"
                >
                  {BOX_LABELS[size]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {message ? (
          <p
            className="border-t border-border px-4 py-2 text-[11px] text-destructive"
            role="alert"
          >
            {message}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RuntimeRow({
  label,
  hint,
  icon,
  active,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  active: boolean;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-2.5 px-4 py-2 text-left hover:bg-muted",
        (busy || disabled) && "pointer-events-none opacity-50",
        active && "bg-muted/60",
      )}
      disabled={busy || disabled}
      onClick={onClick}
      type="button"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {active ? (
            <span className="text-[10px] font-normal text-muted-foreground">
              aktiv
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  );
}
