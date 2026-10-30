import { createFileRoute } from "@tanstack/react-router";
import { CompanySettingsPanel } from "@/components/settings/company-settings";
import { PageShell } from "@/components/layout/page-shell";

export const Route = createFileRoute("/_authed/settings/companies")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell
      description="Firmenprofile anlegen und bearbeiten — Name, Beschreibung und Logo für alle Workspace-Ebenen."
      title="Unternehmen"
    >
      <CompanySettingsPanel />
    </PageShell>
  );
}
