/**
 * Swarm-Dashboard Route (/swarm) - Phase E Schritt 21.
 *
 * Raster mit 20 Kacheln (Live-Screenshot, Status, aktuelle Aufgabe, Stop/Übernehmen), Gesamtfortschritt.
 */
import { createFileRoute } from "@tanstack/react-router";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { AgentSwarmPanel } from "@/components/agent-hub/agent-swarm-panel";

export const Route = createFileRoute("/_authed/_app/swarm")({
  component: SwarmDashboardRoute,
});

function SwarmDashboardRoute() {
  return (
    <>
      <SidebarToggleBar />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full">
        <AgentSwarmPanel />
      </div>
    </>
  );
}
