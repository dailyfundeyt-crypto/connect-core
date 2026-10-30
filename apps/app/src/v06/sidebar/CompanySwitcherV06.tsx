import {
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CompanyMark,
  useCompanySwitcher,
} from "@/components/companies/company-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES_V06 } from "@/contracts/v06/routes-ui";
import { getFlag } from "@/contracts/v06/flags";
import { appConfig } from "@/lib/generated/application-config";
import { cn } from "@/lib/utils";

export interface CompanySwitcherV06Props {
  showLabel?: boolean;
}

/**
 * CompanySwitcherV06 (A01 - v06)
 *
 * Firmen-Dropdown in der Sidebar-Kopfzeile fuer v06:
 * - „Firmenprofil“ -> ROUTES_V06.socialCompanyProfile(activeCompanyId), mit Fallback auf bestehende Seite /social?tab=company
 * - „Firmen verwalten“ -> ROUTES_V06.settingsCompanies (/settings/companies), mit Fallback auf /settings
 * - Keine Abstuerze, wenn eine Route noch nicht existiert.
 * - v06 Design-System: Obsidian-Tokens, Hairline-Borders und Dark/Light-Konsistenz unter FLAGS_V06.designV2.
 */
export function CompanySwitcherV06({ showLabel = false }: CompanySwitcherV06Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const sw = useCompanySwitcher();
  const { companies, active, brand, labels } = sw;
  const [open, setOpen] = useState(false);
  const isDesignV2 = getFlag("designV2");

  const closeThen = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };

  const handleOpenProfile = () => {
    const id = active?.id;
    if (!id) return;

    const target = ROUTES_V06.socialCompanyProfile(id);
    const hasTargetRoute = Boolean(
      (router as any)?.routesByPath?.[target] ||
      (router as any)?.routesByPath?.["/social/company/$companyId"] ||
      (typeof (router as any)?.hasRoute === "function" && (router as any).hasRoute(target as any)),
    );

    if (hasTargetRoute) {
      void navigate({ to: target as any });
    } else {
      // Fallback: bestehende Seite Connect Sozial mit Query-Parametern
      void navigate({
        to: "/social" as any,
        search: { tab: "company", companyId: id } as any,
      });
    }
  };

  const handleManageCompanies = () => {
    const target = ROUTES_V06.settingsCompanies;
    const hasTargetRoute = Boolean(
      (router as any)?.routesByPath?.[target] ||
      (router as any)?.routesByPath?.["/settings/companies"] ||
      (typeof (router as any)?.hasRoute === "function" && (router as any).hasRoute(target as any)),
    );

    if (hasTargetRoute) {
      void navigate({ to: target as any });
    } else {
      // Fallback: Allgemeine Einstellungen
      void navigate({ to: "/settings" as any, hash: "companies" });
    }
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label="Unternehmen wechseln"
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 overflow-hidden outline-none transition-colors",
          showLabel
            ? "max-w-[10.5rem] px-1.5 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            : "w-8 justify-center",
          isDesignV2
            ? cn(
                "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] text-[var(--p-text-1)]",
                "hover:bg-[var(--p-surface-2)] hover:border-[var(--p-border)] focus-visible:ring-1 focus-visible:ring-[var(--p-accent)]",
                open && "bg-[var(--p-surface-2)] border-[var(--p-border-strong)] shadow-[var(--p-shadow-sm)]",
              )
            : cn(
                "rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                open && "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]",
              ),
        )}
        title={
          brand
            ? `${appConfig.brand.productName} · ${brand.name}`
            : appConfig.brand.productName
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <CompanyMark company={brand} size={24} />
        </span>
        {showLabel ? (
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs font-medium group-data-[collapsible=icon]:hidden">
            <span className={cn("truncate text-[11px]", isDesignV2 && "text-[var(--p-text-1)] font-semibold")}>
              {active?.name ?? labels.pick}
            </span>
            <IconChevronDown
              className={cn(
                "size-3 shrink-0 transition-transform duration-150",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-sidebar-foreground/45",
                open && "rotate-180",
              )}
            />
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className={cn(
          "w-72 p-1.5 shadow-xl",
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] backdrop-blur-md shadow-[var(--p-shadow-lg)]"
            : "rounded-xl bg-card border-sidebar-border",
        )}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel
            className={cn(
              isDesignV2 && "text-[10px] uppercase tracking-wider font-semibold text-[var(--p-text-3)] px-2 py-1",
            )}
          >
            {labels.title}
          </DropdownMenuLabel>
          {companies.length === 0 ? (
            <p className={cn("px-2 py-1.5 text-xs", isDesignV2 ? "text-[var(--p-text-dim)]" : "text-muted-foreground")}>
              {labels.empty}
            </p>
          ) : null}
          {companies.map((company) => (
            <DropdownMenuItem
              className={cn(
                "items-start gap-2.5 rounded-lg py-2 cursor-pointer transition-colors",
                isDesignV2
                  ? cn(
                      "rounded-[var(--p-radius-md)] p-2 text-xs text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]",
                      company.id === active?.id && "bg-[var(--p-surface-3)] text-[var(--p-text-1)] border border-[var(--p-border-subtle)] shadow-[var(--p-shadow-sm)]",
                    )
                  : cn(
                      "rounded-lg",
                      company.id === active?.id && "bg-accent/60",
                    ),
              )}
              key={company.id}
              onClick={() => closeThen(() => sw.select(company))}
            >
              <CompanyMark company={company} size={30} />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-xs font-medium", isDesignV2 && "text-[var(--p-text-1)] font-semibold")}>
                  {company.name}
                </p>
                <p
                  className={cn(
                    "line-clamp-2 text-[11px]",
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                  )}
                >
                  {company.description}
                </p>
              </div>
              {company.id === active?.id ? (
                <IconCheck
                  aria-label={labels.active}
                  className={cn(
                    "mt-1 size-4 shrink-0",
                    isDesignV2 ? "text-[var(--p-accent)]" : "text-muted-foreground",
                  )}
                />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator
          className={cn(
            isDesignV2 && "bg-[var(--p-border-subtle)] my-1",
          )}
        />
        <DropdownMenuGroup>
          {active ? (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer gap-2.5 text-xs transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                  : "rounded-lg",
              )}
              onClick={() => closeThen(handleOpenProfile)}
            >
              <IconBuilding
                className={cn(
                  "size-4",
                  isDesignV2 ? "text-[var(--p-text-3)]" : "text-foreground",
                )}
              />
              {labels.profile}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className={cn(
              "cursor-pointer gap-2.5 text-xs transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "rounded-lg",
            )}
            onClick={() => closeThen(sw.newCompany)}
          >
            <IconPlus
              className={cn(
                "size-4",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-foreground",
              )}
            />
            {labels.create}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(
              "cursor-pointer gap-2.5 text-xs transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] px-2.5 py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "rounded-lg",
            )}
            onClick={() => closeThen(handleManageCompanies)}
          >
            <IconSettings
              className={cn(
                "size-4",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-foreground",
              )}
            />
            {labels.manage}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default CompanySwitcherV06;
