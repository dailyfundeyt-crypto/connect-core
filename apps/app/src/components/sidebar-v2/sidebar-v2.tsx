import { useState } from "react";
import { Sidebar, SidebarContent, SidebarRail } from "@/components/ui/sidebar";
import { AgentGrid } from "@/components/app-sidebar/agent-grid";
import { CompanyHeader } from "./company-header";
import { AppsSection } from "./apps-section";
import { BotFolders } from "./bot-folders";
import { UnfiledBots } from "./unfiled-bots";
import { ToolsSection } from "./tools-section";
import { ProfileFooter } from "./profile-footer";
import { SidebarSectionOrder } from "@/v06/sidebar/SidebarSectionOrder";
import { AppsSectionV06 } from "@/v06/sidebar/AppsSectionV06";
import { getFlag } from "@/contracts/v06/flags";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";
import type { ChannelSummary } from "@/lib/channels/queries";
import "@/v06/design/tokens.css";

export interface SidebarV2ComponentProps extends React.ComponentProps<typeof Sidebar> {
  channels?: readonly ChannelSummary[];
}

/**
 * Sidebar V2 (Lane 1)
 *
 * Exakte kanonische Reihenfolge:
 * 1. CompanyHeader (Company-Settings + Company-Wechsler oben)
 * 2. AppsSection (Apps mit Multi-Login: Codex, Antigravity, Manus)
 * 3. BotFolders (Bot-Ordner)
 * 4. UnfiledBots (Bots ohne Ordner)
 * 5. ToolsSection (Tools aktivierbar - fixiert ganz unten)
 * 6. ProfileFooter (Profilbild ganz unten)
 *
 * v06 Design-System: Obsidian-Tokens, Hairline-Borders und Sticky Footer unter FLAGS_V06.designV2.
 */
export function SidebarV2({
  channels = [],
  className,
  ...props
}: SidebarV2ComponentProps) {
  const [search, setSearch] = useState("");
  const isDesignV2 = getFlag("designV2");
  /**
   * A28/A39: hinter `mascot` ersetzt das Grok-Bot-Raster die alten Bot-Ordner-
   * und Unfiled-Listen. APPS/PC-APPS und Tools bleiben unverändert (I3/I4).
   * SidebarV2 ist die Live-Sidebar (`sidebarV2`-Flag) — ohne diese Verdrahtung
   * bleibt die T3-UI unsichtbar, obwohl AgentGrid in app-sidebar hängt.
   */
  const agentGridEnabled = getT3Flag("mascot");
  const foldersSlot = agentGridEnabled ? (
    <AgentGrid search={search} />
  ) : (
    <BotFolders channels={channels} search={search} />
  );
  const unfiledSlot = agentGridEnabled ? null : (
    <UnfiledBots channels={channels} search={search} />
  );

  if (getFlag("sidebarV2Order")) {
    return (
      <Sidebar
        data-chat-sidebar="true"
        data-sidebar-v2="true"
        collapsible="icon"
        className={cn(
          isDesignV2 && "bg-[var(--p-bg)] text-[var(--p-text-1)] border-r border-[var(--p-border-subtle)] transition-colors duration-200",
          className,
        )}
        {...props}
      >
        <SidebarSectionOrder
          header={<CompanyHeader search={search} onSearchChange={setSearch} />}
          apps={<AppsSectionV06 />}
          folders={foldersSlot}
          unfiled={unfiledSlot}
          tools={<ToolsSection />}
          profile={<ProfileFooter />}
        />
        <SidebarRail />
      </Sidebar>
    );
  }

  return (
    <Sidebar
      data-chat-sidebar="true"
      data-sidebar-v2="true"
      collapsible="icon"
      className={cn(
        isDesignV2 && "bg-[var(--p-bg)] text-[var(--p-text-1)] border-r border-[var(--p-border-subtle)] transition-colors duration-200",
        className,
      )}
      {...props}
    >
      {/* 1. CompanyHeader */}
      <CompanyHeader search={search} onSearchChange={setSearch} />

      {/* Main scrollable body for sections 2, 3, 4 */}
      <SidebarContent
        className={cn(
          "scroll-fade-b px-1 py-1 gap-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:overflow-x-hidden group-data-[collapsible=icon]:px-1",
          isDesignV2 && "bg-transparent",
        )}
      >
        {/* 2. Apps mit Multi-Login */}
        <AppsSection />

        <div
          className={cn(
            isDesignV2
              ? "h-px bg-[var(--p-border-subtle)] mx-3 my-0.5"
              : "h-px bg-sidebar-border/40 mx-2",
          )}
        />

        {/* 3+4. Agenten-Raster (T3) oder Bot-Ordner + Unfiled */}
        {agentGridEnabled ? (
          <AgentGrid search={search} />
        ) : (
          <>
            <BotFolders channels={channels} search={search} />

            <div
              className={cn(
                isDesignV2
                  ? "h-px bg-[var(--p-border-subtle)] mx-3 my-0.5"
                  : "h-px bg-sidebar-border/40 mx-2",
              )}
            />

            <UnfiledBots channels={channels} search={search} />
          </>
        )}
      </SidebarContent>

      {/* 5. Tools aktivierbar - fixiert ganz unten über dem Profil-Footer */}
      <div
        className={cn(
          isDesignV2
            ? "shrink-0 border-t border-[var(--p-border-subtle)] bg-[var(--p-bg)]/95 backdrop-blur-md"
            : "shrink-0 border-t border-sidebar-border/40 bg-sidebar/95 backdrop-blur-xs",
        )}
      >
        <ToolsSection />
      </div>

      {/* 6. Profilbild ganz unten */}
      <ProfileFooter />

      <SidebarRail />
    </Sidebar>
  );
}

export default SidebarV2;
