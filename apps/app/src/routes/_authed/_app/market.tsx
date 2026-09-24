import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentDialog } from "@/components/agents/agent-dialog";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { StaggerItem } from "@/components/layout/stagger";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { agentListQueryOptions, isSharedWithYou } from "@/lib/agents/queries";

const marketSearchSchema = z.object({
  agent: z.string().optional(),
});

export const Route = createFileRoute("/_authed/_app/market")({
  validateSearch: marketSearchSchema,
  component: MarketScreen,
});

/**
 * Agent market — discover shared / catalog agents.
 * Layout mirrors a plugin store: section header + two-column icon rows.
 */
function MarketScreen() {
  const { agent: selectedAgentId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    data: agents,
    isPending: loading,
    isError: failed,
  } = useQuery(agentListQueryOptions());
  const explore = agents?.filter(isSharedWithYou);
  const showProfile = selectedAgentId !== undefined;
  const close = () => navigate({ search: {} });

  return (
    <>
      <SidebarToggleBar />
      <div className="mx-auto w-full max-w-3xl px-4 pb-16">
        <div className="mt-10 w-full">
          <h1 className="text-lg font-bold tracking-tight">Market</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse agents shared with you. Your own bots stay under Agents.
          </p>

          {loading ? (
            <div className="mt-8 space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton className="h-14 rounded-xl" key={i} />
                ))}
              </div>
            </div>
          ) : explore?.length ? (
            <section className="mt-8">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-semibold tracking-tight">
                  Empfohlene Agents
                </h2>
                <span className="text-[13px] text-muted-foreground/70">
                  {explore.length} verfügbar
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
                {explore.map((agent, index) => (
                  <StaggerItem index={index} key={agent.id}>
                    <Link
                      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      search={{ agent: agent.id }}
                      to="/market"
                    >
                      <AgentCard
                        agent={agent}
                        statusLabel="Hinzugefügt"
                        variant="row"
                      />
                    </Link>
                  </StaggerItem>
                ))}
              </div>
            </section>
          ) : failed && agents === undefined ? (
            <Empty className="mt-8 h-[180px] border border-dashed border-destructive">
              <EmptyHeader>
                <EmptyTitle className="text-destructive">
                  Market agents couldn&apos;t be loaded.
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty className="mt-8 h-[180px] border border-dashed">
              <EmptyHeader>
                <EmptyTitle className="text-muted-foreground">
                  Nobody has shared an agent with you yet.
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>
      <AgentDialog
        agentId={selectedAgentId ?? null}
        onClose={close}
        open={showProfile}
      />
    </>
  );
}
