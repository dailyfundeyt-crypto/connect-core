import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/settings")({
  component: RouteComponent,
});

/**
 * Layout parent — no visual chrome.
 * - /settings/ renders the self-contained minimalist page (no sidebar)
 * - /settings/brain, /settings/mcp render their own PageShell with the sidebar
 */
function RouteComponent() {
  return <Outlet />;
}
