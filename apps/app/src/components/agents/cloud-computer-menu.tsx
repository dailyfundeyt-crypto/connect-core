import {
  IconCloud,
  IconDeviceDesktop,
  IconPlus,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAgentApiKeys } from "@/lib/agents/agent-api-keys";
import {
  ensureAgentBrowserStarted,
  setAgentBrowserMode,
} from "@/lib/agents/agent-browser";
import {
  createCloudComputer,
  getCloudComputer,
  isCloudComputerActive,
  subscribeCloudComputers,
} from "@/lib/agents/cloud-computer";
import { cn } from "@/lib/utils";

/**
 * Chat header — Cloud-Computer create / local browser, matching the product card.
 */
export function CloudComputerMenu({
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudActive, setCloudActive] = useState(() =>
    isCloudComputerActive(agentId),
  );
  const hasAnchorKey = Boolean(getAgentApiKeys(agentId).browserUse.trim());

  useEffect(() => {
    const refresh = () => setCloudActive(isCloudComputerActive(agentId));
    refresh();
    return subscribeCloudComputers(refresh);
  }, [agentId]);

  const createCloud = async () => {
    setBusy(true);
    setMessage(null);
    try {
      createCloudComputer(agentId, {
        mcpEnabled: true,
        browserEnabled: true,
        automationsEnabled: true,
      });
      if (!hasAnchorKey) {
        setMessage(
          "Cloud-Computer angelegt. Anchor-Key unter API-Keys setzen, dann Browser starten.",
        );
        setCloudActive(true);
        return;
      }
      const session = await ensureAgentBrowserStarted(agentId);
      if (session.status === "error") {
        setMessage(session.message ?? "Browser-Start fehlgeschlagen.");
        setCloudActive(true);
        return;
      }
      setOpen(false);
      onOpenWatch();
    } finally {
      setBusy(false);
    }
  };

  const openLocal = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setAgentBrowserMode(agentId, "local");
      const session = await ensureAgentBrowserStarted(agentId);
      if (session.status === "error") {
        setMessage(session.message ?? "Lokaler Browser fehlgeschlagen.");
        return;
      }
      setOpen(false);
      onOpenWatch();
    } finally {
      setBusy(false);
    }
  };

  const openExistingCloud = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const computer = getCloudComputer(agentId);
      if (computer?.browserEnabled) {
        setAgentBrowserMode(agentId, "cloud", "azure");
        if (!hasAnchorKey) {
          setMessage("Anchor-API-Key fehlt in den Agent-Einstellungen.");
          return;
        }
        const session = await ensureAgentBrowserStarted(agentId);
        if (session.status === "error") {
          setMessage(session.message ?? "Cloud-Browser fehlgeschlagen.");
          return;
        }
      }
      setOpen(false);
      onOpenWatch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Cloud-Computer"
            aria-pressed={active}
            className={cn("relative", active && "bg-foreground/5")}
            disabled={disabled}
            size="icon"
            title="Cloud-Computer"
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
        className="w-72 rounded-2xl border border-border p-0 shadow-lg"
        side="bottom"
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
              <IconCloud className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">
                Cloud-Computer
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Läuft auf Qwen mit eurem MCP-Server und Cloud-Browser — auch am
                Handy. Automatisierte Tasks können dort weiterlaufen.
              </p>
            </div>
          </div>
          {cloudActive ? (
            <Button
              className="h-9 w-full rounded-xl text-sm font-semibold"
              disabled={busy}
              onClick={() => void openExistingCloud()}
              type="button"
            >
              {busy ? "Öffnet…" : "Öffnen"}
            </Button>
          ) : (
            <Button
              className="h-9 w-full rounded-xl text-sm font-semibold"
              disabled={busy}
              onClick={() => void createCloud()}
              type="button"
            >
              {busy ? "Erstellt…" : "Erstellen"}
            </Button>
          )}
        </div>
        <div className="border-t border-border px-2 py-1.5">
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted",
              busy && "pointer-events-none opacity-60",
            )}
            disabled={busy}
            onClick={() => void openLocal()}
            type="button"
          >
            <IconPlus className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 font-medium">
              Lokalen Ordner hinzufügen
            </span>
          </button>
        </div>
        {message ? (
          <p
            className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground"
            role="status"
          >
            {message}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
