/**
 * v06 mobileV2 (A14): Mobile CompanyAppsView
 * Listet nur die Apps der aktiven Firma (z.B. Flux -> nur Flux-Apps).
 * Gibt es genau eine App, wird sie direkt geöffnet (mit replace, damit Zurück nicht in Schleife führt).
 */
import { useEffect, useMemo, useRef } from "react";
import { IconBuildingStore } from "@tabler/icons-react";
import { companyAppLinks } from "@/lib/mobile/app-links";
import type { ConnectCompany } from "@/lib/companies/store";
import { getFlag } from "@/contracts/v06/flags";
import { EmptyState } from "@/v06/design";

export type Company = ConnectCompany;

export type CompanyAppItem = {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  kind: "integrated" | "link";
  url?: string;
  manifestId?: string;
};

export type ResolveCompanyAppsOptions = {
  getIntegratedApp?: (company: any) => { manifest: { id: string; name?: string; description?: string } } | null | undefined;
  getLinks?: (companyId: string) => Array<{ id: string; label: string; url: string; site?: boolean }>;
};

/**
 * Ermittelt alle Apps (integriert + Links) für das übergebene Unternehmen.
 */
export function getActiveCompanyApps(
  activeCompany: { id: string; name: string; logo?: string; accent?: string; handle?: string } | null | undefined,
  options?: ResolveCompanyAppsOptions,
): CompanyAppItem[] {
  if (!activeCompany) return [];

  const resolveLinks = options?.getLinks ?? companyAppLinks;

  const items: CompanyAppItem[] = [];
  const integrated = options?.getIntegratedApp
    ? options.getIntegratedApp(activeCompany)
    : activeCompany.id === "flux"
      ? { manifest: { id: "flux", name: activeCompany.name || "Flux", description: "Integrierte Connect-App" } }
      : null;

  if (integrated) {
    items.push({
      id: integrated.manifest.id,
      name: integrated.manifest.name ?? activeCompany.name,
      description: integrated.manifest.description ?? "Integrierte Connect-App",
      logo: integrated.manifest.id === "flux" ? "/flux-logo.png" : activeCompany.logo,
      kind: "integrated",
      manifestId: integrated.manifest.id,
    });
  }

  const links = resolveLinks(activeCompany.id);
  for (const link of links) {
    if (integrated && link.site) continue;
    items.push({
      id: link.id,
      name: link.label,
      description: link.url.replace(/^https?:\/\//, ""),
      kind: "link",
      url: link.url,
    });
  }

  return items;
}

/**
 * Auto-Open-Regel: Genau dann, wenn apps.length === 1, soll diese einzige App automatisch geöffnet werden.
 */
export function getAutoOpenApp(apps: CompanyAppItem[]): CompanyAppItem | null {
  if (apps.length === 1) {
    return apps[0];
  }
  return null;
}

export interface CompanyAppsViewProps {
  activeCompany: Company | null | undefined;
  isTabActive?: boolean;
  autoOpen?: boolean;
  getIntegratedApp?: (company: any) => { manifest: { id: string; name?: string; description?: string } } | null | undefined;
  onOpenApp: (app: CompanyAppItem, options?: { replace?: boolean }) => void;
}

export function CompanyAppsView({
  activeCompany,
  isTabActive = true,
  autoOpen = true,
  getIntegratedApp,
  onOpenApp,
}: CompanyAppsViewProps) {
  const apps = useMemo(
    () => getActiveCompanyApps(activeCompany, { getIntegratedApp }),
    [activeCompany, getIntegratedApp],
  );
  const autoOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTabActive || !autoOpen || !activeCompany) return;
    const target = getAutoOpenApp(apps);
    if (!target) return;

    const key = `${activeCompany.id}:${target.id}`;
    if (autoOpenedRef.current === key) return;
    autoOpenedRef.current = key;

    // Sofort öffnen mit replace, damit der Browser-Verlauf keinen Loop erzeugt
    onOpenApp(target, { replace: true });
  }, [isTabActive, autoOpen, activeCompany, apps, onOpenApp]);

  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <section
        aria-label="Unternehmen"
        className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-[var(--p-text-1)]"
      >
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-[22px] font-semibold tracking-tight text-[var(--p-text-1)]">
            {activeCompany?.name ? `Apps · ${activeCompany.name}` : "Unternehmen"}
          </h2>
          <p className="mt-1 text-[14px] text-[var(--p-text-2)]">
            Apps und Tools dieses Profils. Wechsel über dein Profilbild oben links.
          </p>
        </div>

        {apps.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              compact
              icon={<IconBuildingStore className="size-6 text-[var(--p-accent)]" stroke={1.5} />}
              title="Keine Apps vorhanden"
              description={`Noch keine Apps für ${activeCompany?.name || "dieses Profil"}.`}
            />
          </div>
        ) : (
          <ul className="space-y-2.5 px-4 pt-2">
            {apps.map((app) => (
              <li key={app.id}>
                <button
                  className="flex w-full min-h-[56px] items-center gap-4 rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-3.5 text-left transition-all duration-150 hover:border-[var(--p-border-strong)] active:scale-[0.99]"
                  onClick={() => onOpenApp(app, { replace: false })}
                  type="button"
                >
                  {app.logo ? (
                    <img
                      alt=""
                      className="size-[52px] rounded-[var(--p-radius-md)] object-cover ring-1 ring-[var(--p-border)]"
                      src={app.logo}
                    />
                  ) : (
                    <span
                      className="flex size-[52px] items-center justify-center rounded-[var(--p-radius-md)] ring-1 ring-[var(--p-border)]"
                      style={{ background: activeCompany?.accent || "var(--p-surface-3)" }}
                    >
                      <IconBuildingStore className="size-6 text-[var(--p-text-2)]" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-[var(--p-text-1)]">
                      {app.name}
                    </span>
                    {app.description ? (
                      <span className="mt-0.5 block truncate text-[13px] text-[var(--p-text-2)]">
                        {app.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="inline-flex min-h-[44px] min-w-[72px] items-center justify-center rounded-full bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 px-3.5 py-2 text-[13px] font-medium text-[var(--p-accent)] transition-all hover:bg-[var(--p-accent)]/25 active:scale-95">
                    Öffnen
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Unternehmen" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="px-5 pb-2 pt-5">
        <h2 className="text-[22px] font-semibold tracking-tight">
          {activeCompany?.name ? `Apps · ${activeCompany.name}` : "Unternehmen"}
        </h2>
        <p className="mt-1 text-[14px] text-white/45">
          Apps und Tools dieses Profils. Wechsel über dein Profilbild oben links.
        </p>
      </div>

      {apps.length === 0 ? (
        <p className="px-6 py-8 text-center text-[15px] text-white/45">
          Noch keine Apps für {activeCompany?.name || "dieses Profil"}.
        </p>
      ) : (
        <ul className="pt-2">
          {apps.map((app) => (
            <li key={app.id}>
              <button
                className="flex w-full items-center gap-4 px-5 py-3.5 text-left active:bg-white/[0.06]"
                onClick={() => onOpenApp(app, { replace: false })}
                type="button"
              >
                {app.logo ? (
                  <img
                    alt=""
                    className="size-[52px] rounded-2xl object-cover ring-1 ring-white/10"
                    src={app.logo}
                  />
                ) : (
                  <span
                    className="flex size-[52px] items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10"
                    style={{ background: activeCompany?.accent || "#334155" }}
                  >
                    <IconBuildingStore className="size-6 text-white/70" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold text-white">
                    {app.name}
                  </span>
                  {app.description ? (
                    <span className="mt-0.5 block truncate text-[14px] text-white/45">
                      {app.description}
                    </span>
                  ) : null}
                </span>
                <span className="rounded-full bg-sky-400/20 px-3 py-1 text-[13px] font-medium text-sky-300">
                  Öffnen
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
