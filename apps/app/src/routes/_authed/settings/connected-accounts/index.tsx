import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PageEmpty,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import type { PluginServer } from "@/lib/plugins/queries";

/**
 * Connect is local-first: no OAuth or brokered vendor accounts against an
 * external catalogue. The route stays so old bookmarks and tests that import
 * the list rule keep working; the page itself offers nothing to connect.
 */
export const Route = createFileRoute("/_authed/settings/connected-accounts/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): { connected?: string } =>
    typeof search.connected === "string" ? { connected: search.connected } : {},
});

/**
 * Which brokered apps the Connected accounts page *would* list.
 * Kept for unit tests; the page no longer renders that catalogue.
 */
export function brokeredAccountsListedOn(
  servers: PluginServer[],
): PluginServer[] {
  return servers.filter(
    (server) =>
      server.provenance === "composio" && server.authScheme !== "NO_AUTH",
  );
}

function RouteComponent() {
  return (
    <PageShell
      description="Connect keeps data and credentials on this deployment. External vendor accounts are disabled."
      title="Connected accounts"
    >
      <PageEmpty>
        Local only — there is nothing to connect here. Bots and data stay on the
        local database.
      </PageEmpty>
      <div className="mt-4">
        <Button render={<Link to="/settings" />} size="sm" variant="outline">
          Back to settings
        </Button>
      </div>
    </PageShell>
  );
}
