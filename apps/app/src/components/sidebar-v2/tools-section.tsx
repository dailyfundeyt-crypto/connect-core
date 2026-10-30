import { IconSettings, IconTools } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SidebarGroup } from "@/components/ui/sidebar";
import { openCompanyApp } from "@/company-apps/registry";
import { openInHeliumTab } from "@/lib/ui/open-window";
import {
  CountPill,
  FolderTile,
  GROUP_ROW_CLASS,
  RowChevron,
  RowName,
  SectionLabel,
} from "./group-row";
import { isToolEnabled, TOOLS_CATALOG, TRADING_TOOLS_CATALOG, type ToolItem, useToolsEnabled } from "./tools-store";
import { getFlag } from "@/contracts/v06/flags";
import { ToolsMenuV2 } from "@/v06/company-tools/ToolsMenuV2";
import { SidebarSection, ListRow, EmptyState } from "@/v06/design";
import { cn } from "@/lib/utils";

// Re-Exports fuer bestehende Importe
export { TOOLS_CATALOG, TRADING_TOOLS_CATALOG, type ToolItem } from "./tools-store";
export { ToolsMenuV2 } from "@/v06/company-tools/ToolsMenuV2";

const COLLAPSED_KEY = "connect.sidebar.toolsCollapsed";
const TRADING_OPEN_KEY = "connect.sidebar.tradingOpen";

function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {}
}

function toolGradient(color: string): string {
  return `linear-gradient(to bottom, ${color}b3, ${color})`;
}

/**
 * Tools unten in der Sidebar im GRUPPEN-Stil. Keine Schalter mehr hier: an/aus wird nur in
 * Einstellungen → Sidebar-Tools geschaltet; deaktivierte Tools sind hier unsichtbar.
 *
 * v06: Wenn FLAGS_V06.companyTools aktiv ist, wird ToolsMenuV2 verwendet (Tools pro Firma mit 24px Logo).
 * v06: Wenn FLAGS_V06.designV2 aktiv ist, wird SidebarSection und ListRow genutzt.
 */
export function ToolsSection() {
  if (getFlag("companyTools")) {
    return <ToolsMenuV2 />;
  }

  const navigate = useNavigate();
  const { enabledMap } = useToolsEnabled();
  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY, false));
  const [tradingOpen, setTradingOpen] = useState(() => readFlag(TRADING_OPEN_KEY, false));
  const isDesignV2 = getFlag("designV2");

  const tools = TOOLS_CATALOG.filter((t) => isToolEnabled(enabledMap, t.id));
  const trading = TRADING_TOOLS_CATALOG.filter((t) => isToolEnabled(enabledMap, t.id));
  const total = tools.length + trading.length;

  const handleOpenTool = (tool: ToolItem) => {
    if (tool.kind === "route" && tool.route) {
      try {
        navigate({ to: tool.route as any });
        return;
      } catch {
        window.location.href = tool.route;
        return;
      }
    }
    if (tool.kind === "app" && tool.appId) {
      openCompanyApp(tool.appId);
      return;
    }
    if (tool.url) {
      try {
        openInHeliumTab(tool.url);
      } catch {
        window.open(tool.url, "_blank");
      }
    }
  };

  const openSettings = () => {
    void navigate({ to: "/settings", hash: "sidebar-tools" });
  };

  const renderTool = (tool: ToolItem, nested = false) => {
    const Icon = tool.icon;
    if (isDesignV2) {
      return (
        <ListRow
          key={tool.id}
          compact
          clickable
          title={tool.label}
          subtitle={nested ? "Trading" : undefined}
          leftAccessory={
            <div
              className="size-6 rounded-[var(--p-radius-sm)] flex items-center justify-center shrink-0 shadow-xs"
              style={{ background: toolGradient(tool.color) }}
            >
              <Icon className="size-3.5 text-white drop-shadow-xs" />
            </div>
          }
          onClick={() => handleOpenTool(tool)}
          className={cn("py-1.5", nested && "pl-5")}
        />
      );
    }

    return (
      <button
        key={tool.id}
        type="button"
        title={`${tool.label} öffnen`}
        onClick={() => handleOpenTool(tool)}
        className={`${GROUP_ROW_CLASS} ${nested ? "pl-7" : ""}`}
      >
        <FolderTile
          gradient={toolGradient(tool.color)}
          center={<Icon className="size-[18px] text-white" stroke={2} />}
        />
        <span className="flex min-w-0 flex-1 items-center justify-between group-data-[collapsible=icon]:hidden">
          <RowName>{tool.label}</RowName>
        </span>
      </button>
    );
  };

  return isDesignV2 ? (
    <SidebarSection
      title="TOOLS"
      badge={total}
      collapsible
      defaultExpanded={!collapsed}
      action={
        <button
          type="button"
          onClick={openSettings}
          className="p-1 rounded-[var(--p-radius-sm)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)] transition-colors"
          title="Tools in Einstellungen anpassen"
        >
          <IconSettings className="size-3.5" />
        </button>
      }
      className="px-1"
    >
      {total === 0 ? (
        <EmptyState
          icon={<IconTools className="size-4" />}
          compact
          title="Keine Tools aktiv"
          description="In Einstellungen aktivieren."
        />
      ) : (
        <div className="flex flex-col gap-0.5 w-full">
          {tools.map((t) => renderTool(t))}
          {trading.length > 0 && trading.map((t) => renderTool(t, true))}
        </div>
      )}
    </SidebarSection>
  ) : (
    <SidebarGroup className="w-full gap-0.5 p-0 px-2 py-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
      <SectionLabel
        action={
          <>
            <button
              type="button"
              title="Tools in den Einstellungen anpassen"
              onClick={openSettings}
              className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <IconSettings className="size-3.5" />
            </button>
            <button
              type="button"
              title={collapsed ? "Tools aufklappen" : "Tools zuklappen"}
              onClick={() => {
                setCollapsed((c) => {
                  writeFlag(COLLAPSED_KEY, !c);
                  return !c;
                });
              }}
              className="flex size-5 items-center justify-center rounded-md hover:bg-sidebar-accent"
            >
              <RowChevron open={!collapsed} className="ml-0" />
            </button>
          </>
        }
      >
        Tools ({total})
      </SectionLabel>

      {!collapsed ? (
        <div className="flex w-full flex-col gap-0.5">
          {tools.map((t) => renderTool(t))}

          {trading.length > 0 ? (
            <div className="flex w-full flex-col">
              <button
                type="button"
                onClick={() => {
                  setTradingOpen((o) => {
                    writeFlag(TRADING_OPEN_KEY, !o);
                    return !o;
                  });
                }}
                className={GROUP_ROW_CLASS}
                title="Trading Tools"
              >
                <FolderTile
                  gradient="linear-gradient(to bottom, #10b981b3, #10b981)"
                  center={<span className="font-mono text-xs font-bold text-white">TR</span>}
                />
                <span className="flex min-w-0 flex-1 items-center justify-between group-data-[collapsible=icon]:hidden">
                  <RowName>Trading</RowName>
                  <span className="flex items-center gap-1">
                    <CountPill count={trading.length} />
                    <RowChevron open={tradingOpen} />
                  </span>
                </span>
              </button>

              {tradingOpen ? (
                <div className="flex w-full flex-col gap-0.5 pt-0.5">
                  {trading.map((t) => renderTool(t, true))}
                </div>
              ) : null}
            </div>
          ) : null}

          {total === 0 ? (
            <button
              type="button"
              onClick={openSettings}
              className="mx-1 rounded-lg border border-dashed border-sidebar-border/50 px-2 py-2 text-center text-[11px] text-sidebar-foreground/45 italic hover:text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden transition-colors"
            >
              Keine Tools aktiv – in Einstellungen aktivieren
            </button>
          ) : null}
        </div>
      ) : null}
    </SidebarGroup>
  );
}

export default ToolsSection;
