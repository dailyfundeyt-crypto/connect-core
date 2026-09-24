import { IconBuildingBank } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PageEmpty,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

/**
 * External SAML / OIDC identity providers are disabled. Connect authenticates
 * against the local deployment only (single-user / local sessions).
 */
export const Route = createFileRoute("/_authed/admin/identity-providers")({
  component: IdentityProvidersPage,
});

function IdentityProvidersPage() {
  return (
    <PageShell
      description="Connect runs locally. Company SAML and OpenID Connect providers are not configured here."
      title="Identity providers"
    >
      <PageEmpty>
        <span className="inline-flex items-center gap-2">
          <IconBuildingBank className="size-4 shrink-0" />
          Local auth only — no external identity provider.
        </span>
      </PageEmpty>
      <div className="mt-4">
        <Button render={<Link to="/admin" />} size="sm" variant="outline">
          Back to admin
        </Button>
      </div>
    </PageShell>
  );
}
