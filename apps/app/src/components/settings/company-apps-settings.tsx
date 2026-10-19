/**
 * Per-Company Tool-Konfiguration:
 *   • Welche Tools in dieser Company verfügbar sind
 *   • Welche Tools beim Wechsel in diese Company automatisch starten
 *
 * Wird in /settings#company-tools gerendert. Liest aus
 * `useMarketListings`, schreibt direkt in den Katalog-Store.
 */

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  IconApps,
  IconArrowRight,
  IconBolt,
  IconCircleCheck,
  IconSettings,
} from "@tabler/icons-react";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { useMarketListings, type MarketListing } from "@/lib/market/catalog";
import { cn } from "@/lib/utils";

function isAuto(listing: MarketListing, companyId: string): boolean {
  return listing.availableInCompanyIds.includes(`${companyId}#auto`);
}

function toggleAuto(
  listing: MarketListing,
  companyId: string,
  next: boolean,
): MarketListing {
  const set = new Set(listing.availableInCompanyIds);
  if (next) {
    set.add(companyId);
    set.add(`${companyId}#auto`);
  } else {
    set.delete(`${companyId}#auto`);
  }
  return { ...listing, availableInCompanyIds: Array.from(set) };
}

function enableInCompany(
  listing: MarketListing,
  companyId: string,
  enable: boolean,
): MarketListing {
  const set = new Set(listing.availableInCompanyIds);
  if (enable) {
    set.add(companyId);
  } else {
    set.delete(companyId);
    set.delete(`${companyId}#auto`);
  }
  return { ...listing, availableInCompanyIds: Array.from(set) };
}

export function CompanyAppsSettingsPanel() {
  const { listings, install, uninstall, toggleAutoStart, isAutoStart } =
    useMarketListings();
  const { active: activeCompany, companies, labels } = useCompanySwitcher();

  const companyId = activeCompany?.id ?? null;
  const allApps = useMemo(
    () => listings.filter((l) => l.kind === "tool"),
    [listings],
  );
  const enabledApps = useMemo(
    () =>
      allApps.filter((l) =>
        companyId ? l.availableInCompanyIds.includes(companyId) : false,
      ),
    [allApps, companyId],
  );
  const autoApps = useMemo(
    () =>
      allApps.filter(
        (l) => companyId && isAutoStart(l, companyId),
      ),
    [allApps, companyId, isAutoStart],
  );

  if (!companyId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Wähle oben in der Sidebar eine Firma aus, um deren Tools zu verwalten.
        </p>
        <Empty className="h-[160px] border border-dashed">
          <EmptyHeader>
            <EmptyTitle className="text-muted-foreground">
              Keine aktive Firma
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Tools für „{activeCompany?.name ?? companyId}"
        </h2>
        <p className="text-sm text-muted-foreground">
          Lege fest, welche Connect-Tools in dieser Firma unten in der Sidebar
          unter „Tools" verfügbar sind und welche automatisch starten, sobald du
          in diese Firma wechselst.
        </p>
      </header>

      {/* Aktive Firma – Übersicht */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/10 text-base font-semibold">
            {(activeCompany?.name ?? companyId).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {activeCompany?.name ?? companyId}
            </p>
            <p className="text-xs text-muted-foreground">
              {labels?.title ?? "Firmen"} · {companies.length} verfügbar
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline"
            to="/market"
            search={{ section: "tools" }}
          >
            <IconApps className="size-3.5" />
            Tools im Marketplace durchsuchen
            <IconArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Auto-Start */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <IconBolt className="size-4 text-amber-400" />
          Automatischer Start
        </h3>
        {autoApps.length > 0 ? (
          <ul className="space-y-2">
            {autoApps.map((listing) => (
              <li
                key={listing.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${listing.logoColor}, ${listing.logoColor}88)`,
                    }}
                  >
                    {listing.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{listing.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Startet beim Wechsel in diese Firma
                    </p>
                  </div>
                </div>
                <button
                  className="rounded-md border border-white/10 px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-white/5"
                  onClick={() => toggleAutoStart(listing.id, companyId)}
                  type="button"
                >
                  Stoppen
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground/80">
            Kein Tool startet aktuell automatisch. Aktiviere den Schalter unten
            bei einem Tool, um es hier hinzuzufügen.
          </p>
        )}
      </section>

      {/* Tool-Liste */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <IconSettings className="size-4 text-sky-300" />
          Verfügbare Tools
        </h3>
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
          {allApps.map((listing) => {
            const enabled = listing.availableInCompanyIds.includes(companyId);
            const auto = isAuto(listing, companyId);
            return (
              <li
                key={listing.id}
                className="flex flex-wrap items-center gap-3 p-3"
              >
                <div
                  className="flex size-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${listing.logoColor}, ${listing.logoColor}88)`,
                  }}
                >
                  {listing.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{listing.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {listing.tagline}
                  </p>
                </div>
                <label
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    !enabled && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      if (e.target.checked) {
                        install(listing.id, companyId);
                      } else {
                        uninstall(listing.id, companyId);
                      }
                    }}
                    className="size-4 rounded border-white/20 bg-white/5"
                  />
                  <span>In dieser Firma</span>
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    !enabled && "pointer-events-none opacity-30",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={auto}
                    disabled={!enabled}
                    onChange={(e) => {
                      toggleAutoStart(listing.id, companyId);
                      if (e.target.checked) {
                        install(listing.id, companyId);
                      }
                    }}
                    className="size-4 rounded border-white/20 bg-white/5"
                  />
                  <span>Auto-Start</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <IconCircleCheck className="size-3" />
          „In dieser Firma" steuert die Sidebar. „Auto-Start" öffnet das Tool
          sofort im rechten Panel, wenn du diese Firma aktivierst.
        </p>
      </section>
    </div>
  );
}
