import { createFileRoute } from "@tanstack/react-router";
import { BrainSettingsPage } from "@/components/brain/brain-settings-page";
import { PageShell } from "@/components/layout/page-shell";

/** Settings › Brain: Stefans gemeinsames Gedächtnis (lokaler Ordner), nur lesen + Rechte je Agent. */
export const Route = createFileRoute("/_authed/settings/brain")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell
      description="Das gemeinsame Gedächtnis aller Agents: lesen, durchsuchen und festlegen, wer welche Bereiche nutzen darf."
      title="Brain"
      width="wide"
    >
      <BrainSettingsPage />
    </PageShell>
  );
}
