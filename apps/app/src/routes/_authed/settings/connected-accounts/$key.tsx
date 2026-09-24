import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PageEmpty,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

/**
 * Per-vendor connect screen disabled: Connect does not dial external OAuth or
 * Composio. Old deep links land on this notice instead of a consent redirect.
 */
export const Route = createFileRoute(
  "/_authed/settings/connected-accounts/$key",
)({ component: RouteComponent });

function RouteComponent() {
  return (
    <PageShell
      description="External account linking is turned off on this deployment."
      title="Connected accounts"
    >
      <PageEmpty>
        This connector is not available locally.
      </PageEmpty>
      <div className="mt-4">
        <Button render={<Link to="/settings" />} size="sm" variant="outline">
          Back to settings
        </Button>
      </div>
    </PageShell>
  );
}
