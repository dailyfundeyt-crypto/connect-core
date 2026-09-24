import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { McpSettingsPanel } from "@/components/settings/mcp-settings";

/**
 * Dedicated MCP settings — not stacked under General with Shortcuts.
 */
export const Route = createFileRoute("/_authed/settings/mcp")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell
      description="App · Hermes · Manus connectors with hard isolation. Enable local MCP servers and set Ask / Allow / Deny. Manus OAuth only in dedicated Voll-Chrome profile."
      title="MCP"
    >
      <McpSettingsPanel />
    </PageShell>
  );
}
