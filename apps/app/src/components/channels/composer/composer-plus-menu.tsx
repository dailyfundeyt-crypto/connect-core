import {
  IconBrandChrome,
  IconCloud,
  IconCloudComputing,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconPaperclip,
  IconPlus,
  IconRobot,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getAgentApiKeys,
  getAgentManusApiKey,
} from "@/lib/agents/agent-api-keys";
import { uploadAutomationForTraining } from "@/lib/agents/agent-automations";
import {
  ensureAgentBrowserStarted,
  getAgentBrowserMode,
  setAgentBrowserMode,
  subscribeAgentBrowser,
  type AgentBrowserMode,
} from "@/lib/agents/agent-browser";
import {
  ANCHOR_CLOUD_KEY_HINT,
  ANCHOR_CLOUD_LABELS,
  type AnchorCloudTarget,
  anchorTargetForPrefs,
  getAgentComputerPrefs,
  MANUS_CLOUD_KEY_HINT,
  RUNTIME_LABELS,
} from "@/lib/agents/agent-computer";

/**
 * Composer “+” menu — attach, automation, or computer runtime
 * (Chrome · PC · Manus · Default/Azure/Oracle Cloud · Smartphone).
 */
export function ComposerPlusMenu({
  agentId,
  disabled,
  onAttachFiles,
  onBrowserStarted,
}: {
  agentId?: string;
  disabled?: boolean;
  onAttachFiles: () => void;
  /** Optional: open the watch pane after starting a browser. */
  onBrowserStarted?: () => void;
}) {
  const automationInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentBrowserMode>(() =>
    agentId ? getAgentBrowserMode(agentId) : "chrome",
  );
  const [anchor, setAnchor] = useState<AnchorCloudTarget>(() =>
    agentId ? anchorTargetForPrefs(getAgentComputerPrefs(agentId)) : "azure",
  );

  useEffect(() => {
    if (!agentId) return;
    const refresh = () => {
      setMode(getAgentBrowserMode(agentId));
      setAnchor(anchorTargetForPrefs(getAgentComputerPrefs(agentId)));
    };
    refresh();
    return subscribeAgentBrowser(refresh);
  }, [agentId]);

  const onAutomationPick = async (file: File | undefined) => {
    if (!file || !agentId) return;
    setError(null);
    try {
      const body = await file.text();
      if (!body.trim()) throw new Error("Datei ist leer.");
      const entry = uploadAutomationForTraining(agentId, {
        name: file.name.replace(/\.[^.]+$/, ""),
        body,
      });
      setToast(
        `„${entry.name}“ an Grok zum Trainieren und an Claude zum Planen geschickt.`,
      );
      window.setTimeout(() => setToast(null), 4500);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Upload fehlgeschlagen.",
      );
    }
  };

  const startBrowser = async (next: AgentBrowserMode) => {
    if (!agentId) return;
    setError(null);
    if (next === "manus" && !getAgentManusApiKey(agentId)) {
      setError(MANUS_CLOUD_KEY_HINT);
      return;
    }
    if (next === "cloud" && !getAgentApiKeys(agentId).browserUse.trim()) {
      setError(ANCHOR_CLOUD_KEY_HINT);
      return;
    }
    setMode(setAgentBrowserMode(agentId, next));
    const session = await ensureAgentBrowserStarted(agentId);
    if (session.status === "error") {
      setError(session.message ?? "Computer-Start fehlgeschlagen.");
      return;
    }
    setToast(`${RUNTIME_LABELS[next]} gestartet.`);
    window.setTimeout(() => setToast(null), 3500);
    onBrowserStarted?.();
  };

  const startCloud = async (target: AnchorCloudTarget) => {
    if (!agentId) return;
    setError(null);
    if (!getAgentApiKeys(agentId).browserUse.trim()) {
      setError(ANCHOR_CLOUD_KEY_HINT);
      return;
    }
    setMode(setAgentBrowserMode(agentId, "cloud", target));
    const session = await ensureAgentBrowserStarted(agentId);
    if (session.status === "error") {
      setError(session.message ?? "Computer-Start fehlgeschlagen.");
      return;
    }
    setToast(`${ANCHOR_CLOUD_LABELS[target]} gestartet.`);
    window.setTimeout(() => setToast(null), 3500);
    onBrowserStarted?.();
  };

  return (
    <div className="relative self-end">
      <input
        accept=".json,.txt,.md,.yaml,.yml,application/json,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          void onAutomationPick(e.target.files?.[0]);
          e.target.value = "";
        }}
        ref={automationInputRef}
        type="file"
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Mehr Optionen"
              className="self-end"
              disabled={disabled}
              size="icon"
              type="button"
              variant="ghost"
            >
              <IconPlus className="size-5" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-56" side="top">
          <DropdownMenuItem
            className="gap-2"
            onClick={() => {
              onAttachFiles();
            }}
          >
            <IconPaperclip className="size-4" />
            Dateien anhängen
          </DropdownMenuItem>
          {agentId ? (
            <DropdownMenuItem
              className="gap-2"
              onClick={() => automationInputRef.current?.click()}
            >
              <IconRobot className="size-4 text-red-500" />
              Automatisierung hochladen
            </DropdownMenuItem>
          ) : null}
          {agentId ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startBrowser("chrome")}
              >
                <IconBrandChrome className="size-4" />
                Chrome Browser
                {mode === "chrome" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Standard
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startBrowser("local")}
              >
                <IconDeviceDesktop className="size-4 text-amber-500" />
                {RUNTIME_LABELS.local}
                {mode === "local" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    aktiv
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startBrowser("manus")}
              >
                <IconCloudComputing className="size-4 text-sky-600" />
                {RUNTIME_LABELS.manus}
                {mode === "manus" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    aktiv
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startCloud("default")}
              >
                <IconCloud className="size-4" />
                {ANCHOR_CLOUD_LABELS.default}
                {mode === "cloud" && anchor === "default" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    aktiv
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startCloud("azure")}
              >
                <IconCloud className="size-4" />
                {ANCHOR_CLOUD_LABELS.azure}
                {mode === "cloud" && anchor === "azure" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    aktiv
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startCloud("oracle")}
              >
                <IconCloud className="size-4" />
                {ANCHOR_CLOUD_LABELS.oracle}
                {mode === "cloud" && anchor === "oracle" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    aktiv
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onClick={() => void startBrowser("phone")}
              >
                <IconDeviceMobile className="size-4 text-emerald-600" />
                Smartphone
                {mode === "phone" ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    aktiv
                  </span>
                ) : null}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p
          className="absolute bottom-full left-0 mb-1 w-56 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="absolute bottom-full left-0 mb-1 w-64 rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-sm">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
