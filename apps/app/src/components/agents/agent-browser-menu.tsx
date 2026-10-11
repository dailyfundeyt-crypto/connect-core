import type { ReactNode } from "react";
import {
  IconBrandChrome,
  IconCloud,
  IconCloudComputing,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconCheck,
  IconChevronRight,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
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
  const mobile = useMobileShell();

  /*
   * Handy (helium-mobile4): kein enges Desktop-Dropdown, sondern ein Blatt von unten im
   * Grok-Stil – große Zeilen, gruppiert in Browser / Cloud-Maschine / Gerät, dunkler Tech-Look.
   * Gleiche Logik und gleiche Aktionen wie das Dropdown.
   */
  if (mobile) {
    const cloudRows: MobileRow[] = [
      {
        key: "cloud-default",
        label: ANCHOR_CLOUD_LABELS.default,
        hint: hasAnchorKey ? "Anchor Remote-Box · kleine Box" : ANCHOR_CLOUD_KEY_HINT,
        icon: <IconCloud className="size-5 text-sky-300" />,
        active: mode === "cloud" && anchor === "default",
        disabled: !hasAnchorKey,
        onClick: () => startCloud("default"),
      },
      {
        key: "cloud-azure",
        label: ANCHOR_CLOUD_LABELS.azure,
        hint: hasAnchorKey ? RUNTIME_HINTS.cloud : ANCHOR_CLOUD_KEY_HINT,
        icon: <IconCloud className="size-5 text-sky-300" />,
        active: mode === "cloud" && anchor === "azure",
        disabled: !hasAnchorKey,
        onClick: () => startCloud("azure"),
      },
      {
        key: "cloud-oracle",
        label: ANCHOR_CLOUD_LABELS.oracle,
        hint: hasAnchorKey ? "Anchor Remote-Box · ~24 GB" : ANCHOR_CLOUD_KEY_HINT,
        icon: <IconCloud className="size-5 text-sky-300" />,
        active: mode === "cloud" && anchor === "oracle",
        disabled: !hasAnchorKey,
        onClick: () => startCloud("oracle"),
      },
      {
        key: "manus",
        label: RUNTIME_LABELS.manus,
        hint: hasManusKey ? RUNTIME_HINTS.manus : MANUS_CLOUD_KEY_HINT,
        icon: <IconCloudComputing className="size-5 text-sky-300" />,
        active: mode === "manus",
        disabled: !hasManusKey,
        onClick: () => void start("manus"),
      },
    ];
    return (
      <>
        <Button
          aria-label="Computer"
          aria-pressed={active}
          className={cn("relative", active && "bg-foreground/5")}
          disabled={disabled}
          onClick={() => setOpen(true)}
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
        {open
          ? createPortal(
              <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Computer wählen">
                <button
                  aria-label="Schließen"
                  className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in-0"
                  onClick={() => setOpen(false)}
                  type="button"
                />
                <div className="absolute inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-[30px] border-t border-white/10 bg-[#0d0f16]/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5 text-white shadow-[0_-20px_60px_-20px_rgba(56,189,248,0.25)] backdrop-blur-2xl animate-in slide-in-from-bottom-8 duration-200">
                  <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
                  <div className="mb-4 px-1">
                    <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-sky-300/70">
                      Computer des Agenten
                    </p>
                    <p className="text-[20px] font-semibold tracking-tight">Wo soll er arbeiten?</p>
                  </div>

                  <MobileGroup title="Browser">
                    <MobileRuntimeRow
                      active={mode === "chrome"}
                      busy={busy}
                      hint={RUNTIME_HINTS.chrome}
                      icon={<IconBrandChrome className="size-5 text-white" />}
                      label={RUNTIME_LABELS.chrome}
                      onClick={() => void start("chrome")}
                    />
                    <MobileRuntimeRow
                      active={mode === "local"}
                      busy={busy}
                      hint={RUNTIME_HINTS.local}
                      icon={<IconDeviceDesktop className="size-5 text-amber-300" />}
                      label={RUNTIME_LABELS.local}
                      onClick={() => void start("local")}
                    />
                  </MobileGroup>

                  <MobileGroup title="Cloud-Maschine">
                    {cloudRows.map((row) => (
                      <MobileRuntimeRow
                        active={row.active}
                        busy={busy}
                        disabled={row.disabled}
                        hint={row.hint}
                        icon={row.icon}
                        key={row.key}
                        label={row.label}
                        onClick={row.onClick}
                      />
                    ))}
                  </MobileGroup>

                  <MobileGroup title="Gerät">
                    <MobileRuntimeRow
                      active={mode === "phone"}
                      busy={busy}
                      hint={RUNTIME_HINTS.phone}
                      icon={<IconDeviceMobile className="size-5 text-emerald-300" />}
                      label={RUNTIME_LABELS.phone}
                      onClick={() => void start("phone")}
                    />
                  </MobileGroup>

                  {boxChoices.length > 0 ? (
                    <MobileGroup title={mode === "cloud" ? "Cloud-Box" : "Lokale Box"}>
                      <div className="flex flex-wrap gap-2 p-3">
                        {boxChoices.map((size) => (
                          <button
                            className={cn(
                              "rounded-full border px-3.5 py-2 text-[13px] transition active:scale-95",
                              boxSize === size
                                ? "border-sky-400/50 bg-sky-400/15 text-sky-100"
                                : "border-white/10 bg-white/[0.04] text-white/70",
                            )}
                            key={size}
                            onClick={() => pickBox(size)}
                            type="button"
                          >
                            {BOX_LABELS[size]}
                          </button>
                        ))}
                      </div>
                    </MobileGroup>
                  ) : null}

                  {message ? (
                    <p
                      className="mt-1 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200"
                      role="alert"
                    >
                      {message}
                    </p>
                  ) : null}

                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-full bg-white/[0.08] text-[15px] font-medium text-white active:bg-white/15"
                    onClick={() => {
                      setOpen(false);
                      onOpenWatch();
                    }}
                    type="button"
                  >
                    Live-Ansicht öffnen
                  </button>
                </div>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

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

type MobileRow = {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function MobileGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 px-2 text-[12px] font-medium uppercase tracking-[0.14em] text-white/35">
        {title}
      </p>
      <div className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.035] divide-y divide-white/[0.06]">
        {children}
      </div>
    </div>
  );
}

function MobileRuntimeRow({
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
        "flex w-full items-center gap-3 px-3 py-3 text-left transition active:bg-white/[0.06]",
        (busy || disabled) && "opacity-45",
      )}
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl border",
          active ? "border-sky-400/40 bg-sky-400/15" : "border-white/10 bg-white/[0.05]",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{label}</span>
        <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-white/45">{hint}</span>
      </span>
      {active ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-400 text-[#07080c]">
          <IconCheck className="size-4" stroke={3} />
        </span>
      ) : (
        <IconChevronRight className="size-4 shrink-0 text-white/25" />
      )}
    </button>
  );
}
