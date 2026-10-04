import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { McpSettingsPanel } from "@/components/settings/mcp-settings";
import { ConnectorGallery } from "@/components/agent-hub/connector-gallery";

/**
 * Dedicated MCP settings — not stacked under General with Shortcuts.
 */
export const Route = createFileRoute("/_authed/settings/mcp")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell
      description="Verbinder (MCP) für deine Agents: eigener Browser, Dateien, GitHub, Notion und mehr. Pro Agent ein- und ausschaltbar."
      title="MCP"
    >
      <ConnectorGallery className="mt-2 mb-10" pageSize={8} />
      <McpSettingsPanel />
    </PageShell>
  );
}
