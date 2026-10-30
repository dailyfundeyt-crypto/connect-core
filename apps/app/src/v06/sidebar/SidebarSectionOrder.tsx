import React from "react";
import { SidebarContent } from "@/components/ui/sidebar";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

export interface SidebarSectionOrderProps {
  /** Sektion 1: Firmenwechsel + Firmen-Settings (oben) */
  header?: React.ReactNode;
  /** Sektion 2: Apps mit Multi-Login */
  apps?: React.ReactNode;
  /** Sektion 3: Bot-Ordner */
  folders?: React.ReactNode;
  /** Sektion 4: Bots ohne Ordner */
  unfiled?: React.ReactNode;
  /** Sektion 5: Tools aktivierbar */
  tools?: React.ReactNode;
  /** Sektion 6: Profilbild / Profilmenue (ganz unten, sticky bottom) */
  profile?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * SidebarSectionOrder (A01 - v06)
 *
 * Rendert die Messages-Sidebar in der festen v06-Reihenfolge:
 * (1) oben Firmenwechsel + Firmen-Settings
 * (2) Apps (Multi-Login: Codex, Antigravity, Manus)
 * (3) Bot-Ordner
 * (4) Bots ohne Ordner
 * (5) Tools (aktivierbar)
 * (6) ganz unten Profilbild/Profilmenü (sticky bottom)
 *
 * Erhaelt die bestehenden Inhalte als Children / Slots, um Logik nicht zu duplizieren.
 * v06 Design-System: Obsidian-Tokens, Hairline-Borders und Sticky Footer unter FLAGS_V06.designV2.
 */
export function SidebarSectionOrder({
  header,
  apps,
  folders,
  unfiled,
  tools,
  profile,
  className,
  children,
}: SidebarSectionOrderProps) {
  const isDesignV2 = getFlag("designV2");

  // Falls Children als Subkomponenten uebergeben wurden, extrahieren
  let headerSlot = header;
  let appsSlot = apps;
  let foldersSlot = folders;
  let unfiledSlot = unfiled;
  let toolsSlot = tools;
  let profileSlot = profile;

  if (children) {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const type = child.type as any;
      const props = (child.props as any) || {};
      if (type === SidebarSectionOrder.Header || type?.displayName === "SidebarSectionOrderHeader") {
        headerSlot = props.children;
      } else if (type === SidebarSectionOrder.Apps || type?.displayName === "SidebarSectionOrderApps") {
        appsSlot = props.children;
      } else if (type === SidebarSectionOrder.Folders || type?.displayName === "SidebarSectionOrderFolders") {
        foldersSlot = props.children;
      } else if (type === SidebarSectionOrder.Unfiled || type?.displayName === "SidebarSectionOrderUnfiled") {
        unfiledSlot = props.children;
      } else if (type === SidebarSectionOrder.Tools || type?.displayName === "SidebarSectionOrderTools") {
        toolsSlot = props.children;
      } else if (type === SidebarSectionOrder.Profile || type?.displayName === "SidebarSectionOrderProfile") {
        profileSlot = props.children;
      }
    });
  }

  return (
    <div
      data-testid="sidebar-section-order"
      data-v06-sidebar-order="true"
      className={cn(
        "flex flex-col h-full w-full overflow-hidden select-none",
        isDesignV2 && "bg-[var(--p-bg)] text-[var(--p-text-1)]",
        className,
      )}
    >
      {/* 1. Sektion: Firmenwechsel + Firmen-Settings (oben) */}
      <div data-testid="sidebar-section-header" data-section="1-header" className="shrink-0 w-full z-10">
        {headerSlot}
      </div>

      {/* Scrollable Body fuer Sektionen 2, 3, 4 */}
      <SidebarContent
        data-testid="sidebar-section-body"
        className={cn(
          "scroll-fade-b px-1 py-1 gap-2 flex-1 overflow-y-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:overflow-x-hidden group-data-[collapsible=icon]:px-1",
          isDesignV2 && "bg-transparent",
        )}
      >
        {/* 2. Sektion: Apps (Multi-Login) */}
        <div data-testid="sidebar-section-apps" data-section="2-apps" className="w-full">
          {appsSlot}
        </div>

        <div
          className={cn(
            isDesignV2
              ? "h-px bg-[var(--p-border-subtle)] mx-3 my-0.5 shrink-0"
              : "h-px bg-sidebar-border/40 mx-2 shrink-0",
          )}
        />

        {/* 3. Sektion: Bot-Ordner */}
        <div data-testid="sidebar-section-folders" data-section="3-folders" className="w-full">
          {foldersSlot}
        </div>

        <div
          className={cn(
            isDesignV2
              ? "h-px bg-[var(--p-border-subtle)] mx-3 my-0.5 shrink-0"
              : "h-px bg-sidebar-border/40 mx-2 shrink-0",
          )}
        />

        {/* 4. Sektion: Bots ohne Ordner */}
        <div data-testid="sidebar-section-unfiled" data-section="4-unfiled" className="w-full">
          {unfiledSlot}
        </div>
      </SidebarContent>

      {/* 5. Sektion: Tools (aktivierbar) - ueber dem Profilmenue fixiert */}
      <div
        data-testid="sidebar-section-tools"
        data-section="5-tools"
        className={cn(
          "shrink-0 w-full z-10",
          isDesignV2
            ? "border-t border-[var(--p-border-subtle)] bg-[var(--p-bg)]/95 backdrop-blur-md"
            : "border-t border-sidebar-border/40 bg-sidebar/95 backdrop-blur-xs",
        )}
      >
        {toolsSlot}
      </div>

      {/* 6. Sektion: Profilbild / Profilmenue (ganz unten fixiert, sticky bottom) */}
      <div
        data-testid="sidebar-section-profile"
        data-section="6-profile"
        className={cn(
          "shrink-0 mt-auto sticky bottom-0 w-full z-20",
          isDesignV2
            ? "bg-[var(--p-bg)] border-t border-[var(--p-border-subtle)]"
            : "bg-sidebar border-t border-sidebar-border/50",
        )}
      >
        {profileSlot}
      </div>
    </div>
  );
}

// Compound-Komponenten fuer flexible Slot-Nutzung
const SidebarSectionOrderHeader = function ({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
SidebarSectionOrderHeader.displayName = "SidebarSectionOrderHeader";
SidebarSectionOrder.Header = SidebarSectionOrderHeader;

const SidebarSectionOrderApps = function ({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
SidebarSectionOrderApps.displayName = "SidebarSectionOrderApps";
SidebarSectionOrder.Apps = SidebarSectionOrderApps;

const SidebarSectionOrderFolders = function ({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
SidebarSectionOrderFolders.displayName = "SidebarSectionOrderFolders";
SidebarSectionOrder.Folders = SidebarSectionOrderFolders;

const SidebarSectionOrderUnfiled = function ({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
SidebarSectionOrderUnfiled.displayName = "SidebarSectionOrderUnfiled";
SidebarSectionOrder.Unfiled = SidebarSectionOrderUnfiled;

const SidebarSectionOrderTools = function ({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
SidebarSectionOrderTools.displayName = "SidebarSectionOrderTools";
SidebarSectionOrder.Tools = SidebarSectionOrderTools;

const SidebarSectionOrderProfile = function ({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
SidebarSectionOrderProfile.displayName = "SidebarSectionOrderProfile";
SidebarSectionOrder.Profile = SidebarSectionOrderProfile;

export default SidebarSectionOrder;
