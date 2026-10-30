import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconApps,
  IconCheck,
  IconBrain,
  IconChartHistogram,
  IconNews,
  IconReceiptTax,
  IconShoppingBag,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  openCompanyApp,
  useActiveCompanyApp,
} from "@/company-apps/registry";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import type { CompanyAppToggle, GetCompanyAppsResponse } from "@/contracts/swarm-v3";
import { cn } from "@/lib/utils";

/**
 * Standard-Metadaten für Fallback-Logos und Icons
 */
export const APP_ICONS: Record<
  string,
  { name: string; icon: any; color: string; defaultLogo?: string }
> = {
  "connect-sozial": {
    name: "Connect Sozial",
    icon: IconNews,
    color: "#ec4899",
    defaultLogo: "/brand/connect-logo.png",
  },
  flux: {
    name: "Flux",
    icon: IconShoppingBag,
    color: "#10b981",
    defaultLogo: "/brand/flux-logo.png",
  },
  analysis: {
    name: "Analysis",
    icon: IconChartHistogram,
    color: "#a855f7",
    defaultLogo: "/brand/analysis-logo.png",
  },
  brain: {
    name: "Brain",
    icon: IconBrain,
    color: "#0ea5e9",
    defaultLogo: "/brand/brain-logo.png",
  },
  finance: {
    name: "Finance",
    icon: IconReceiptTax,
    color: "#14b8a6",
    defaultLogo: "/brand/finance-logo.png",
  },
};

/**
 * Hook, der nur die AKTIVIERTEN Unternehmens-Apps für eine Company liefert.
 * Hört auf das `connect:company-apps-changed`-Event für sofortige Synchronisation.
 */
export function useFilteredCompanyApps(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["company-apps", companyId ?? ""];

  const { data: allApps = [], isLoading } = useQuery<CompanyAppToggle[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      try {
        const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}/apps`);
        if (!res.ok) throw new Error("Fetch failed");
        const json: GetCompanyAppsResponse = await res.json();
        return json.apps || [];
      } catch {
        // Fallback: alle Standard-Apps enabled
        return Object.entries(APP_ICONS).map(([appId, meta], idx) => ({
          companyId,
          appId,
          enabled: true,
          sort: (idx + 1) * 10,
          appName: meta.name,
          appLogo: meta.defaultLogo,
          updatedAt: new Date().toISOString(),
        }));
      }
    },
    staleTime: 1000 * 30,
  });

  // Auf Sofort-Events aus dem Einstellungs-Panel hören
  useEffect(() => {
    const handleAppsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ companyId: string; apps: CompanyAppToggle[] }>;
      if (customEvent.detail && customEvent.detail.companyId === companyId) {
        queryClient.setQueryData(queryKey, customEvent.detail.apps);
      }
    };

    window.addEventListener("connect:company-apps-changed", handleAppsChanged);
    return () => {
      window.removeEventListener("connect:company-apps-changed", handleAppsChanged);
    };
  }, [companyId, queryClient, queryKey]);

  // Nur AKTIVIERTE Apps filtern und nach sort sortieren
  const enabledApps = useMemo(() => {
    return allApps
      .filter((app) => app.enabled)
      .sort((a, b) => a.sort - b.sort);
  }, [allApps]);

  return {
    enabledApps,
    allApps,
    isLoading,
  };
}

/**
 * Ein einzelnes App-Logo mit scharfem Bild in Dark/Light Mode oder Icon-Fallback
 */
export function CompanyAppLogo({
  appId,
  appLogo,
  appName,
  size = 24,
}: {
  appId: string;
  appLogo?: string;
  appName?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const meta = APP_ICONS[appId];
  const IconComponent = meta?.icon || IconApps;
  const logoSrc = appLogo || meta?.defaultLogo;

  if (logoSrc && !broken) {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-neutral-900/90 shadow-sm"
        style={{ width: size, height: size }}
      >
        <img
          src={logoSrc}
          alt={appName || appId}
          className="size-full object-contain p-0.5"
          onError={() => setBroken(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 text-white shadow-sm"
      style={{
        width: size,
        height: size,
        background: meta?.color
          ? `linear-gradient(135deg, ${meta.color}, ${meta.color}99)`
          : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      }}
    >
      <IconComponent className="size-3.5" />
    </div>
  );
}

/**
 * Menü-Item für eine aktivierte Unternehmens-App
 */
export function CompanyAppMenuItem({
  app,
  isActive = false,
  onClick,
}: {
  app: CompanyAppToggle;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem
      key={app.appId}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
        isActive
          ? "bg-accent/80 text-foreground font-semibold"
          : "text-foreground/90 hover:bg-accent/50"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* Logo links neben Label */}
        <CompanyAppLogo
          appId={app.appId}
          appLogo={app.appLogo}
          appName={app.appName}
          size={22}
        />
        <span className="truncate">{app.appName || app.appId}</span>
      </div>

      {isActive ? (
        <IconCheck className="size-4 shrink-0 text-primary" aria-label="Aktiv" />
      ) : (
        <IconChevronRight className="size-3 shrink-0 opacity-40" />
      )}
    </DropdownMenuItem>
  );
}

/**
 * Vollständige Menü-Sektion für das Firmen-Menü.
 * Zeigt NUR aktivierte Apps an, jeweils mit App-Logo links neben dem Label.
 */
export function CompanyAppMenuSection({
  companyId,
  companyName,
  onAppSelected,
}: {
  companyId?: string | null;
  companyName?: string;
  onAppSelected?: (appId: string) => void;
}) {
  const { enabledApps, isLoading } = useFilteredCompanyApps(companyId);
  const { activeAppId, openApp } = useActiveCompanyApp();

  const handleSelect = (appId: string) => {
    openApp(appId);
    if (onAppSelected) onAppSelected(appId);
  };

  if (isLoading) {
    return (
      <div className="space-y-1.5 p-2">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
        <div className="h-8 w-full animate-pulse rounded-lg bg-neutral-900/60" />
      </div>
    );
  }

  if (enabledApps.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        Keine aktiven Apps für {companyName || "dieses Unternehmen"}.
      </div>
    );
  }

  return (
    <div className="py-1">
      <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {companyName ? `Apps · ${companyName}` : "Unternehmens-Apps"}
      </DropdownMenuLabel>
      {enabledApps.map((app) => (
        <CompanyAppMenuItem
          key={app.appId}
          app={app}
          isActive={activeAppId === app.appId}
          onClick={() => handleSelect(app.appId)}
        />
      ))}
    </div>
  );
}

/**
 * Dropdown-Komponente für die Navigation oder den Header:
 * Zeigt einen "Apps"-Button, der das gefilterte App-Menü öffnet.
 */
export function CompanyAppMenuDropdown({
  align = "start",
  side = "bottom",
}: {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  const { active: activeCompany } = useCompanySwitcher();
  const [open, setOpen] = useState(false);
  const { enabledApps } = useFilteredCompanyApps(activeCompany?.id);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Unternehmens-Apps anzeigen"
            aria-label="Unternehmens-Apps anzeigen"
          >
            <IconApps className="size-4 text-sky-400" />
            <span className="hidden sm:inline">Apps</span>
            {enabledApps.length > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold">
                {enabledApps.length}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent
        align={align}
        side={side}
        className="w-64 rounded-xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-xl backdrop-blur-md"
      >
        <CompanyAppMenuSection
          companyId={activeCompany?.id}
          companyName={activeCompany?.name}
          onAppSelected={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default CompanyAppMenuSection;
