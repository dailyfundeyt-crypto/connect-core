import {
  IconBuildingStore,
  IconPlus,
  IconRobot,
  IconSearch,
  IconServer,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useSidebar } from "@/components/ui/sidebar";
import {
  CompanyLevelChips,
  SidebarCollapseGlyph,
} from "@/components/companies/company-level-chips";
import { CompanySwitcher } from "@/components/companies/company-switcher";
import { CompanySwitcherV06 } from "@/v06/sidebar/CompanySwitcherV06";
import { ROUTES_V06 } from "@/contracts/v06/routes-ui";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

export interface CompanyHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function CompanyHeader({ search, onSearchChange }: CompanyHeaderProps) {
  const navigate = useNavigate();
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const isDesignV2 = getFlag("designV2");

  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-2.5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1.5",
        isDesignV2
          ? "border-b border-[var(--p-border-subtle)] bg-transparent"
          : "border-b border-sidebar-border/50",
      )}
    >
      {/* Top rail: Company-Switcher + Company-Level + Settings + Collapse */}
      <div className="flex w-full shrink-0 items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
        {getFlag("sidebarV2Order") ? (
          <CompanySwitcherV06 showLabel />
        ) : (
          <CompanySwitcher showLabel />
        )}
        <CompanyLevelChips />
        <div className="ml-auto flex items-center gap-1 group-data-[collapsible=icon]:ml-0">
          {!getFlag("sidebarV2Order") && (
            <Button
              aria-label="Company-Einstellungen"
              className={cn(
                "size-8 shrink-0 p-0 group-data-[collapsible=icon]:hidden transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                  : "rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
              onClick={() => void navigate({ to: "/settings" as any })}
              size="icon"
              title="Company-Einstellungen"
              type="button"
              variant="ghost"
            >
              <IconSettings className="size-4" />
            </Button>
          )}
          <Button
            aria-label={
              sidebarState === "collapsed"
                ? "Sidebar ausklappen"
                : "Sidebar verkleinern"
            }
            className={cn(
              "size-8 shrink-0 p-0 transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                : "rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
            onClick={toggleSidebar}
            size="icon"
            title="Sidebar einklappen (⌘B)"
            type="button"
            variant="ghost"
          >
            <SidebarCollapseGlyph expanded={sidebarState === "expanded"} />
          </Button>
        </div>
      </div>

      {/* Search & Quick Actions bar */}
      <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
        <InputGroup
          className={cn(
            "flex-1 shadow-none transition-all",
            isDesignV2
              ? "h-8 rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-xs text-[var(--p-text-1)] focus-within:border-[var(--p-accent)] focus-within:ring-1 focus-within:ring-[var(--p-accent)]"
              : "h-9 rounded-xl border-sidebar-border/70 bg-sidebar-accent/55 text-sm focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/30",
          )}
        >
          <InputGroupAddon
            className={cn(
              isDesignV2
                ? "pl-2 text-[var(--p-text-3)]"
                : "pl-2.5 text-sidebar-foreground/45",
            )}
          >
            <IconSearch className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Bots durchsuchen"
            className={cn(
              "text-xs",
              isDesignV2
                ? "placeholder:text-[var(--p-text-dim)] text-[var(--p-text-1)]"
                : "placeholder:text-sidebar-foreground/40",
            )}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Bots durchsuchen…"
            value={search}
          />
          {search ? (
            <button
              type="button"
              aria-label="Suche leeren"
              onClick={() => onSearchChange("")}
              className={cn(
                "mr-1.5 p-0.5 rounded transition-colors",
                isDesignV2
                  ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                  : "text-sidebar-foreground/45 hover:text-sidebar-foreground",
              )}
            >
              <IconX className="size-3" />
            </button>
          ) : null}
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Neu"
                className={cn(
                  "shrink-0 transition-colors",
                  isDesignV2
                    ? "size-8 rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                    : "size-9 rounded-xl bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80",
                )}
                size="icon"
                variant="ghost"
              />
            }
          >
            <IconPlus className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={cn(
              "w-52 p-1.5 shadow-xl",
              isDesignV2
                ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] backdrop-blur-md shadow-[var(--p-shadow-lg)]"
                : "rounded-xl",
            )}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={cn(
                  "gap-2 text-xs cursor-pointer transition-colors",
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                    : "rounded-lg px-2.5 py-2",
                )}
                onClick={() =>
                  void navigate({
                    to: "/agents",
                    search: { new: true, tab: "mine" },
                  } as any)
                }
              >
                <IconRobot
                  className={cn(
                    "size-4",
                    isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
                  )}
                />
                Neuer Agent
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 text-xs cursor-pointer transition-colors",
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                    : "rounded-lg px-2.5 py-2",
                )}
                onClick={() =>
                  void navigate({
                    to: (isDesignV2 ? (ROUTES_V06.store ?? "/store") : "/market") as any,
                  })
                }
              >
                <IconBuildingStore
                  className={cn(
                    "size-4",
                    isDesignV2 ? "text-[var(--p-warning)]" : "text-amber-500",
                  )}
                />
                {isDesignV2 ? "Store" : "Marketplace"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 text-xs cursor-pointer transition-colors",
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                    : "rounded-lg px-2.5 py-2",
                )}
                onClick={() => void navigate({ to: "/swarm" as any })}
              >
                <IconServer
                  className={cn(
                    "size-4",
                    isDesignV2 ? "text-[var(--p-success)]" : "text-emerald-500",
                  )}
                />
                Swarm-Dashboard
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator
              className={cn(
                isDesignV2 && "bg-[var(--p-border-subtle)] my-1",
              )}
            />
            <DropdownMenuItem
              className={cn(
                "gap-2 text-xs cursor-pointer transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                  : "rounded-lg px-2.5 py-2",
              )}
              onClick={() => void navigate({ to: "/settings" as any })}
            >
              <IconSettings
                className={cn(
                  "size-4",
                  isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                )}
              />
              Einstellungen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
export default CompanyHeader;
