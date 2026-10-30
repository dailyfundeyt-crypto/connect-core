import { useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconBuilding,
  IconCheck,
  IconRefresh,
  IconTool,
} from "@tabler/icons-react";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { CompanyMark, useCompanySwitcher } from "@/components/companies/company-switcher";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCompanyTools } from "./useCompanyTools";
import type { CompanyToolItem } from "./types";

interface ToolLogoProps {
  tool: CompanyToolItem;
  size?: number;
}

export function ToolLogo({ tool, size = 28 }: ToolLogoProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [tool.logoUrl]);

  if (tool.logoUrl && !error) {
    return (
      <img
        src={tool.logoUrl}
        alt={tool.name}
        width={size}
        height={size}
        onError={() => setError(true)}
        className="shrink-0 rounded-lg object-contain bg-background/50 p-0.5 border border-border/40"
        style={{ width: size, height: size }}
      />
    );
  }

  const initial = tool.name?.charAt(0)?.toUpperCase() || "T";
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80 font-semibold border border-border/40"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </div>
  );
}

export function CompanyToolsSettingsSection() {
  const { companies, active } = useCompanySwitcher();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(() => {
    return active?.id ?? companies[0]?.id ?? null;
  });

  // Aktualisieren, falls anfangs noch keine Company geladen war
  useEffect(() => {
    if (!selectedCompanyId && active?.id) {
      setSelectedCompanyId(active.id);
    } else if (!selectedCompanyId && companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [active?.id, companies, selectedCompanyId]);

  const { tools, enabledTools, isLoading, error, toggleTool, refetch } =
    useCompanyTools(selectedCompanyId);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? active ?? null;

  return (
    <div className="w-full space-y-6" data-testid="company-tools-settings-section">
      <SettingsSectionHeader
        title="Tools pro Firma"
        description="Aktiviere oder deaktiviere Tools separat für jedes deiner Unternehmen. Nur die für eine Firma aktivierten Tools erscheinen in deren Tools-Menü in der Seitenleiste."
      />

      {/* 1. Firmenauswahl oben */}
      <section className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Firma auswählen
        </label>
        {companies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Keine Firmenprofile gefunden. Lege zuerst ein Unternehmen an.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {companies.map((company) => {
              const isSelected = company.id === selectedCompanyId;
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setSelectedCompanyId(company.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-xs"
                      : "border-border bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground",
                  )}
                  aria-pressed={isSelected}
                >
                  <CompanyMark company={company} size={24} />
                  <span>{company.name}</span>
                  {isSelected ? (
                    <IconCheck className="size-4 text-primary shrink-0 ml-1" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Liste der Tools fuer die ausgewaehlte Firma */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {selectedCompany ? `Werkzeuge für ${selectedCompany.name}` : "Werkzeuge"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {enabledTools.length} von {tools.length} aktiv
            </p>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconRefresh className="size-3.5 animate-spin" />
              <span>Lade...</span>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
            <div className="flex items-center gap-2">
              <IconAlertCircle className="size-4 shrink-0" />
              <span>Fehler beim Laden der Tools: {error.message}</span>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
            >
              <IconRefresh className="size-3" />
              Erneut versuchen
            </button>
          </div>
        ) : null}

        {tools.length === 0 && !isLoading ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Keine Tools für dieses Unternehmen verfügbar.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tools.map((tool) => {
              const switchId = `toggle-company-tool-${tool.id}`;
              return (
                <label
                  key={tool.id}
                  htmlFor={switchId}
                  className="flex cursor-pointer items-center justify-between gap-3.5 rounded-xl border border-border bg-card/60 p-3 transition-colors hover:bg-card/90"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ToolLogo tool={tool} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {tool.name}
                        </span>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {tool.kind === "builtin" ? "Integriert" : "Extern"}
                        </span>
                      </div>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tool.url ? tool.url : "Modul in Connect"}
                      </span>
                    </div>
                  </div>

                  <Switch
                    id={switchId}
                    checked={tool.enabled}
                    onCheckedChange={(checked) => void toggleTool(tool.id, checked)}
                    aria-label={`Tool ${tool.name} ${tool.enabled ? "deaktivieren" : "aktivieren"}`}
                  />
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default CompanyToolsSettingsSection;
