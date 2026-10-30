import { createFileRoute } from "@tanstack/react-router";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { UsagePage } from "@/pages/usage";

export const Route = createFileRoute("/_authed/_app/usage")({
  component: UsageRoute,
});

function UsageRoute() {
  return (
    <>
      <SidebarToggleBar />
      <div className="flex-1 overflow-y-auto">
        <UsagePage />
      </div>
    </>
  );
}
