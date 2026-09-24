import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PageEmpty,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import type { ComposioApp } from "@/lib/plugins/queries";

/**
 * Composio's external catalogue is disabled. Connect does not dial vendor
 * directories over the network. The route and `matchingApps` stay for tests and
 * old bookmarks.
 */
export const Route = createFileRoute("/_authed/admin/plugins/composio")({
  component: RouteComponent,
});

/**
 * The apps to draw, in the order to draw them.
 * Kept for unit tests; the page no longer searches Composio.
 */
export function matchingApps(apps: ComposioApp[]): ComposioApp[] {
  return [...apps].sort((left, right) => left.name.localeCompare(right.name));
}

function RouteComponent() {
  return (
    <PageShell
      description="External app directories are turned off. Tools stay on this deployment."
      title="Composio"
    >
      <PageEmpty>
        Local only — the Composio catalogue is not available.
      </PageEmpty>
      <div className="mt-4">
        <Button
          render={<Link to="/admin/plugins" />}
          size="sm"
          variant="outline"
        >
          Back to plugins
        </Button>
      </div>
    </PageShell>
  );
}
