import { useQuery } from "@tanstack/react-query";
import { IconPlug } from "@tabler/icons-react";
import { useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { agentHubAgentQuery } from "@/lib/agent-hub/api";
import { cn } from "@/lib/utils";
import { ConnectorGallery } from "./connector-gallery";

/** Composer: MCP-Knopf mit Zähler; öffnet die Verbinder-Galerie für genau diesen Agent. */
export function AgentMcpButton({ agentId, className }: { agentId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const agent = useQuery({ ...agentHubAgentQuery(agentId), retry: false });
  const count = agent.data?.links.filter((link) => link.enabled).length ?? 0;
  if (agent.isError) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Verbinder (MCP)"
              onClick={() => setOpen(true)}
              className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", className)}
              data-testid="composer-mcp-button"
            />
          }
        >
          <IconPlug className="size-[18px]" stroke={1.8} />
          {count > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground">{count}</span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent>Verbinder (MCP)</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl md:max-h-[760px]" closeLabel="Schließen">
          <DialogTitle className="sr-only">Verbinder</DialogTitle>
          <DialogBody>
            <ConnectorGallery agentId={agentId} variant="section" pageSize={8} className="[&>div:first-child]:pr-9" />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
