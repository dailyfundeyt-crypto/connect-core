import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { Switch } from "@/components/ui/switch";
import {
  isToolEnabled,
  TOOLS_CATALOG,
  TRADING_TOOLS_CATALOG,
  type ToolItem,
  useToolsEnabled,
} from "@/components/sidebar-v2/tools-store";
import { getFlag } from "@/contracts/v06/flags";
import { CompanyToolsSettingsSection } from "@/v06/company-tools/CompanyToolsSettingsSection";

export { CompanyToolsSettingsSection } from "@/v06/company-tools/CompanyToolsSettingsSection";

/**
 * Einstellungen › Sidebar-Tools (helium-sidebar 2026-10-23).
 *
 * v06: Wenn FLAGS_V06.companyTools aktiv ist, wird CompanyToolsSettingsSection verwendet
 * (Tools pro Firma mit Firmenauswahl, 24-32px Logo und Toggle).
 */
export function SidebarToolsSettingsPanel() {
  if (getFlag("companyTools")) {
    return <CompanyToolsSettingsSection />;
  }

  const { enabledMap, setToolEnabled } = useToolsEnabled();

  const renderGroup = (title: string, hint: string, items: ToolItem[]) => (
    <section className="mb-6">
      <h3 className="mb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
        {title}
      </h3>
      <p className="mb-2 text-muted-foreground text-xs">{hint}</p>
      <div className="flex flex-col gap-2">
        {items.map((tool) => {
          const Icon = tool.icon;
          const on = isToolEnabled(enabledMap, tool.id);
          return (
            <label
              key={tool.id}
              htmlFor={`sidebar-tool-${tool.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card/60 px-3 py-2.5"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm ring-1 ring-black/10"
                style={{ backgroundImage: `linear-gradient(to bottom, ${tool.color}b3, ${tool.color})` }}
              >
                <Icon className="size-[18px]" stroke={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[15px] md:text-sm">{tool.label}</span>
                <span className="block truncate text-muted-foreground text-xs">{tool.blurb}</span>
              </span>
              <Switch
                id={`sidebar-tool-${tool.id}`}
                checked={on}
                onCheckedChange={(checked) => void setToolEnabled(tool.id, checked)}
                title={on ? "Tool deaktivieren" : "Tool aktivieren"}
              />
            </label>
          );
        })}
      </div>
    </section>
  );

  return (
    <>
      <SettingsSectionHeader
        description="Welche Tools unten in der Chat-Sidebar erscheinen. Deaktivierte Tools werden dort ausgeblendet – ihre Daten bleiben erhalten."
        title="Sidebar-Tools"
      />
      {renderGroup("Tools", "Eigene Connect-Apps.", TOOLS_CATALOG)}
      {renderGroup(
        "Trading-Tools",
        "Standardmäßig aus. Nur aktivierte Trading-Tools erscheinen in der Sidebar.",
        TRADING_TOOLS_CATALOG,
      )}
    </>
  );
}

export default SidebarToolsSettingsPanel;
