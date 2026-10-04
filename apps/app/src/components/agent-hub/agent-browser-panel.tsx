import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircleCheck, IconCircleX, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { agentHubAgentQuery, agentHubCatalogQuery, invalidateAgentHub, saveAgentBrowser, testAgentBrowser } from "@/lib/agent-hub/api";
import { ConnectorIcon } from "./connector-gallery";

/** Eigener Helium-Browser pro Agent (Playwright MCP, eigenes Profil, unsichtbar). */
export function AgentBrowserPanel({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();
  const agent = useQuery(agentHubAgentQuery(agentId));
  const catalog = useQuery(agentHubCatalogQuery());
  const serverId = agent.data?.browser.serverId;
  const server = catalog.data?.servers.find((candidate) => candidate.id === serverId);
  const enabled = !!agent.data?.links.some((link) => link.serverId === serverId && link.enabled);
  const headless = server ? server.options.headless !== false : true;

  const save = useMutation({
    mutationFn: (input: { enabled: boolean; headless: boolean }) => saveAgentBrowser(agentId, input),
    onSettled: () => invalidateAgentHub(queryClient),
  });
  const test = useMutation({ mutationFn: () => testAgentBrowser(agentId) });
  const state = server ? (save.isPending ? "connecting" : server.status.state) : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4" data-testid="agent-browser-panel">
      <div className="flex items-center gap-3">
        <ConnectorIcon icon="helium" state={enabled ? state : null} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14.5px]">Eigener Browser (Helium)</div>
          <div className="text-[12.5px] text-muted-foreground leading-snug">
            Der Agent steuert einen eigenen Helium mit eigenem Profil – getrennt von deinem Browser und von anderen Agents.
          </div>
        </div>
        <Switch checked={enabled} disabled={save.isPending} onCheckedChange={(checked) => save.mutate({ enabled: checked, headless })} aria-label="Eigenen Browser aktivieren" />
      </div>
      {enabled ? (
        <>
          <label className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-[13px]">
              Unsichtbar im Hintergrund
              <span className="block text-[11.5px] text-muted-foreground">Aus = Fenster wird sichtbar geöffnet (z. B. zum Einloggen).</span>
            </span>
            <Switch checked={headless} disabled={save.isPending} onCheckedChange={(checked) => save.mutate({ enabled: true, headless: checked })} />
          </label>
          <div className="text-[11.5px] text-muted-foreground">
            Profil: <span className="font-mono">{agent.data?.browser.profile}</span>
          </div>
          {server?.status.state === "error" ? <p className="whitespace-pre-wrap rounded-lg bg-destructive/5 px-2.5 py-2 font-mono text-[11.5px] text-destructive">{server.status.error}</p> : null}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? <IconLoader2 className="animate-spin" /> : null} Browser testen
            </Button>
            {server?.tools.length ? <span className="text-[12px] text-muted-foreground">{server.tools.length} Browser-Werkzeuge</span> : null}
          </div>
          {test.data ? (
            <p className={`flex items-start gap-1.5 text-[12px] ${test.data.ok ? "text-emerald-700" : "text-destructive"}`}>
              {test.data.ok ? <IconCircleCheck className="mt-0.5 size-4 shrink-0" /> : <IconCircleX className="mt-0.5 size-4 shrink-0" />}
              <span className="line-clamp-3">{test.data.ok ? "example.com wurde im Agent-Browser geöffnet." : (test.data.error ?? test.data.text)}</span>
            </p>
          ) : null}
          {test.isError ? <p className="text-destructive text-xs">{(test.error as Error).message}</p> : null}
        </>
      ) : null}
      {save.isError ? <p className="text-destructive text-xs">{(save.error as Error).message}</p> : null}
    </div>
  );
}
