import { useMemo } from "react";
import {
  IconApps,
  IconCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconX,
  IconSparkles,
} from "@tabler/icons-react";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { useCompanyApps } from "./use-company-apps";
import { CompanyAppRow } from "./company-app-row";
import { cn } from "@/lib/utils";

export function CompanyAppsSettingsPanel() {
  const { active: activeCompany, companies } = useCompanySwitcher();
  const companyId = activeCompany?.id ?? null;

  const {
    apps,
    isLoading,
    isSaving,
    toggleApp,
    reorderApp,
    toast,
    dismissToast,
  } = useCompanyApps(companyId);

  const stats = useMemo(() => {
    const total = apps.length;
    const activeCount = apps.filter((a) => a.enabled).length;
    return { total, activeCount };
  }, [apps]);

  if (!companyId) {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-6">
        <Empty className="h-44 border border-dashed border-white/10">
          <EmptyHeader>
            <EmptyTitle className="text-sm font-medium text-neutral-400">
              Bitte wähle zuerst ein Unternehmen in der Sidebar aus.
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Feedback Banner */}
      {toast && (
        <div
          role="status"
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs font-medium shadow-lg transition-all animate-in fade-in-0 slide-in-from-top-2",
            toast.type === "success" &&
              "border-emerald-500/30 bg-emerald-950/70 text-emerald-300 shadow-emerald-950/20",
            toast.type === "error" &&
              "border-rose-500/30 bg-rose-950/70 text-rose-300 shadow-rose-950/20",
            toast.type === "info" &&
              "border-sky-500/30 bg-sky-950/70 text-sky-300 shadow-sky-950/20"
          )}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" && <IconCheck className="size-4 shrink-0 text-emerald-400" />}
            {toast.type === "error" && <IconAlertCircle className="size-4 shrink-0 text-rose-400" />}
            {toast.type === "info" && <IconInfoCircle className="size-4 shrink-0 text-sky-400" />}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="rounded-md p-1 opacity-70 hover:opacity-100"
            aria-label="Benachrichtigung schließen"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      )}

      {/* Header Bereich */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
              <IconApps className="size-5 text-sky-400" />
              Unternehmens-Apps für „{activeCompany?.name ?? companyId}“
            </h2>
            <p className="text-xs leading-relaxed text-neutral-400">
              Steuere, welche Tools für dieses Unternehmen aktiv sind. Aktivierte Apps werden mit
              ihrem Logo im Firmen-Menü der Workspace-Navigation angezeigt.
            </p>
          </div>

          {/* Aktive Statistik Badge */}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">{stats.activeCount}</span> von{" "}
            <span>{stats.total} aktiv</span>
          </div>
        </div>
      </header>

      {/* App Liste */}
      <section className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-20 animate-pulse rounded-2xl border border-white/5 bg-neutral-900/40"
              />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <Empty className="h-32 border border-dashed border-white/10">
            <EmptyHeader>
              <EmptyTitle className="text-xs text-neutral-400">
                Keine Apps für dieses Unternehmen registriert.
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2.5">
            {apps.map((app, idx) => (
              <CompanyAppRow
                key={app.appId}
                app={app}
                index={idx}
                totalCount={apps.length}
                onToggle={toggleApp}
                onReorder={reorderApp}
                disabled={isSaving}
              />
            ))}
          </div>
        )}
      </section>

      {/* Footer Info & Hilfetext */}
      <footer className="rounded-xl border border-white/5 bg-neutral-950/40 p-3.5 text-[11px] text-neutral-400">
        <div className="flex items-start gap-2.5">
          <IconSparkles className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p className="leading-relaxed">
            Änderungen werden dank optimistischer Updates sofort im Menü und in der Sidebar
            wirksam und in der Postgres-Datenbank persistent gesichert.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default CompanyAppsSettingsPanel;
