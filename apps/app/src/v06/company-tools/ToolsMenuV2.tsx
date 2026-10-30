import {
  IconCheck,
  IconCode,
  IconCopy,
  IconPlus,
  IconSettings,
  IconTools,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { openCompanyApp } from "@/company-apps/registry";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import {
  GROUP_ROW_CLASS,
  RowChevron,
  RowName,
  SectionLabel,
} from "@/components/sidebar-v2/group-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarGroup, SidebarMenuButton } from "@/components/ui/sidebar";
import { openInHeliumTab } from "@/lib/ui/open-window";
import { SidebarSection, ListRow, EmptyState } from "@/v06/design";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import type { CompanyToolItem } from "./types";
import { useCompanyTools } from "./useCompanyTools";

const INTEGRATION_PROMPT = `Integriere meine App als eigenständiges Connect-Modul in Messages.

Lege sie unter apps/app/src/company-apps/modules/<app-id>/ ab und registriere sie über manifest.ts und app.tsx. Nutze den CompanyAppProps-Vertrag aus ../../types, kapsle App-Daten in einem eigenen Namensraum und bette die vollständige bestehende App ein, statt sie neu zu bauen oder durch ein Dashboard-Mockup zu ersetzen. Ergänze Name und Beschreibung im Manifest. Die Connect-App-Auswahl erkennt neue Module automatisch.

Arbeite nur an dieser App-Integration. Ändere nicht die Connect-Agenten, Gruppen, Sidebar-Reihenfolge oder andere Company-Module. Prüfe am Ende TypeScript und den Apps-Build und nenne die geänderten Dateien.`;

const COLLAPSED_KEY = "connect.sidebar.toolsCollapsed.v06";

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

/**
 * 24px Logo Komponente fuer Tools laut Anforderung.
 * Fällt bei Ladefehlern elegant auf den Anfangsbuchstaben zurueck.
 */
export function ToolLogo24({ tool }: { tool: CompanyToolItem }) {
  const [broken, setBroken] = useState(false);
  const isDesignV2 = getFlag("designV2");

  useEffect(() => {
    setBroken(false);
  }, [tool.logoUrl]);

  if (tool.logoUrl && !broken) {
    return (
      <img
        src={tool.logoUrl}
        alt={tool.name}
        width={24}
        height={24}
        onError={() => setBroken(true)}
        className={cn(
          "size-6 shrink-0 object-contain p-0.5",
          isDesignV2
            ? "rounded-[var(--p-radius-sm)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)]"
            : "rounded-md bg-background/50 border border-border/30",
        )}
        style={{ width: 24, height: 24 }}
      />
    );
  }

  const initial = tool.name?.charAt(0)?.toUpperCase() || "T";
  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center font-semibold text-[11px]",
        isDesignV2
          ? "rounded-[var(--p-radius-sm)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] border border-[var(--p-border-subtle)]"
          : "rounded-md bg-sidebar-accent text-sidebar-foreground border border-sidebar-border/40",
      )}
      style={{ width: 24, height: 24 }}
    >
      {initial}
    </div>
  );
}

/**
 * Öffnet ein Tool basierend auf URL, kind oder Company-App Registry.
 */
export function launchTool(tool: CompanyToolItem, navigate?: (opts: any) => void) {
  if (tool.url) {
    if (tool.url.startsWith("/")) {
      if (navigate) {
        try {
          navigate({ to: tool.url as any });
          return;
        } catch {}
      }
      window.location.href = tool.url;
      return;
    }
    try {
      openInHeliumTab(tool.url);
    } catch {
      window.open(tool.url, "_blank");
    }
    return;
  }

  // Fallback fuer interne Company-Apps
  openCompanyApp(tool.id);
}

/**
 * Dialog zur App-Integration („Eigene App integrieren“).
 */
export function IntegrationPromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isDesignV2 = getFlag("designV2");

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(INTEGRATION_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.warn("Could not copy prompt:", e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-xl",
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)]"
            : "",
        )}
        closeLabel="Schließen"
        overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
      >
        <DialogHeader>
          <DialogTitle className={cn(isDesignV2 && "text-[var(--p-text-1)] font-semibold")}>
            Eigenes Tool integrieren
          </DialogTitle>
          <DialogDescription className={cn(isDesignV2 && "text-[var(--p-text-2)] text-xs")}>
            Kopiere diesen Auftrag in Cursor oder eine andere Coding-AI. Das Tool wird als Modul gebaut und mit Connect ausgeliefert.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <textarea
            aria-label="Prompt für die App-Integration"
            className={cn(
              "min-h-52 w-full resize-y p-3 font-mono text-xs leading-relaxed outline-none",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] focus-visible:border-[var(--p-accent)]"
                : "rounded-lg border border-border bg-muted/40 text-foreground",
            )}
            readOnly
            value={INTEGRATION_PROMPT}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            className={cn(
              isDesignV2 && "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-text-on-accent)] font-medium",
            )}
            onClick={() => void copyPrompt()}
          >
            {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
            {copied ? "Kopiert" : "Prompt kopieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ToolsMenuV2 – Zeigt in der Sidebar ausschliesslich fuer die aktive Firma aktivierte Tools mit 24px Logo.
 * Behaelt „Eigene App integrieren“ und bietet leeren Zustand mit Einstellungen-Link.
 * v06 Design-System: Obsidian-Tokens, SidebarSection und ListRow unter FLAGS_V06.designV2.
 */
export function ToolsMenuV2() {
  const navigate = useNavigate();
  const { active: activeCompany } = useCompanySwitcher();
  const companyId = activeCompany?.id ?? null;
  const { enabledTools } = useCompanyTools(companyId);
  const isDesignV2 = getFlag("designV2");

  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY, false));
  const [promptOpen, setPromptOpen] = useState(false);

  const openSettings = () => {
    void navigate({ to: "/settings", hash: "company-tools" });
  };

  const handleOpenTool = (tool: CompanyToolItem) => {
    launchTool(tool, navigate);
  };

  const labelText = activeCompany
    ? `Tools in ${activeCompany.name}`
    : "Tools in Connect";

  return (
    <>
      {isDesignV2 ? (
        <SidebarSection
          title="COMPANY TOOLS"
          badge={enabledTools.length}
          collapsible
          defaultExpanded={!collapsed}
          action={
            <button
              type="button"
              title="Tools in den Einstellungen verwalten"
              onClick={openSettings}
              className="p-1 rounded-[var(--p-radius-sm)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)] transition-colors"
            >
              <IconSettings className="size-3.5" />
            </button>
          }
          className="px-1"
        >
          <div className="flex flex-col gap-0.5 w-full">
            {enabledTools.map((tool) => (
              <ListRow
                key={tool.id}
                compact
                clickable
                title={tool.name}
                subtitle={tool.kind === "builtin" ? "Integriertes Modul" : "Externes Werkzeug"}
                leftAccessory={<ToolLogo24 tool={tool} />}
                onClick={() => handleOpenTool(tool)}
                className="py-1.5"
              />
            ))}

            {enabledTools.length === 0 ? (
              <EmptyState
                icon={<IconTools className="size-4" />}
                compact
                title="Keine Tools aktiv"
                description="In den Einstellungen für diese Firma aktivieren."
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-[var(--p-accent)] hover:text-[var(--p-accent-hover)]"
                    onClick={openSettings}
                  >
                    Einstellungen öffnen
                  </Button>
                }
              />
            ) : null}

            {/* Eigene App integrieren */}
            <ListRow
              compact
              clickable
              title="Eigene App integrieren"
              leftAccessory={
                <div className="flex size-6 shrink-0 items-center justify-center rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)]">
                  <IconCode className="size-3.5 text-[var(--p-text-2)]" />
                </div>
              }
              onClick={() => setPromptOpen(true)}
              className="py-1.5 text-[var(--p-text-2)] hover:text-[var(--p-text-1)]"
            />
          </div>
        </SidebarSection>
      ) : (
        <SidebarGroup className="w-full gap-0.5 p-0 px-2 py-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <SectionLabel
            action={
              <>
                <button
                  type="button"
                  title="Tools in den Einstellungen verwalten"
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
            {labelText} ({enabledTools.length})
          </SectionLabel>

          {!collapsed ? (
            <div className="flex w-full flex-col gap-0.5">
              {/* 1. Aktivierte Tools mit 24px Logo links neben dem Namen */}
              {enabledTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  title={`${tool.name} öffnen`}
                  onClick={() => handleOpenTool(tool)}
                  className={GROUP_ROW_CLASS}
                >
                  <ToolLogo24 tool={tool} />
                  <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <RowName>{tool.name}</RowName>
                    <span className="block truncate text-[11px] text-sidebar-foreground/45">
                      {tool.kind === "builtin" ? "Integriertes Modul" : "Externes Werkzeug"}
                    </span>
                  </span>
                </button>
              ))}

              {/* 2. Leerer Zustand: Keine Tools aktiv – in Einstellungen aktivieren */}
              {enabledTools.length === 0 ? (
                <button
                  type="button"
                  onClick={openSettings}
                  className="mx-1 rounded-lg border border-dashed border-sidebar-border/50 px-2 py-2 text-center text-[11px] text-sidebar-foreground/45 italic hover:text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden transition-colors"
                >
                  Keine Tools aktiv – in Einstellungen aktivieren
                </button>
              ) : null}

              {/* 3. Eigene App integrieren bleibt */}
              <button
                type="button"
                onClick={() => setPromptOpen(true)}
                className={cn(GROUP_ROW_CLASS, "text-sidebar-foreground/60 hover:text-sidebar-foreground pt-1")}
                title="Eigenes Tool integrieren"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-sidebar-border/40 bg-sidebar-accent/50">
                  <IconCode className="size-3.5" />
                </div>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-[12px] font-medium">Eigene App integrieren</span>
                </span>
              </button>
            </div>
          ) : null}
        </SidebarGroup>
      )}

      <IntegrationPromptDialog open={promptOpen} onOpenChange={setPromptOpen} />
    </>
  );
}

/**
 * Dropdown-Variante des Tools-Menüs (z.B. als Drop-in Replacement für MessagesAppsMenu).
 */
export function ToolsMenuDropdown({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const navigate = useNavigate();
  const { active: activeCompany } = useCompanySwitcher();
  const companyId = activeCompany?.id ?? null;
  const { enabledTools } = useCompanyTools(companyId);
  const [promptOpen, setPromptOpen] = useState(false);
  const isDesignV2 = getFlag("designV2");

  const openSettings = () => {
    void navigate({ to: "/settings", hash: "company-tools" });
  };

  const handleOpenTool = (tool: CompanyToolItem) => {
    launchTool(tool, navigate);
  };

  const labelText = activeCompany
    ? `Tools in ${activeCompany.name}`
    : "Tools in Connect";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5 px-2 text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                  : "",
                triggerClassName,
              )}
            />
          }
        >
          <span className="truncate">{labelText}</span>
          <span
            className={cn(
              "ml-1 rounded px-1.5 py-0.5 text-[10px]",
              isDesignV2
                ? "bg-[var(--p-surface-3)] text-[var(--p-text-3)] border border-[var(--p-border-subtle)]"
                : "bg-muted text-muted-foreground",
            )}
          >
            {enabledTools.length}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={cn(
            "w-64 p-1.5",
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)] backdrop-blur-md"
              : "rounded-xl",
          )}
        >
          <DropdownMenuLabel
            className={cn(
              "text-xs",
              isDesignV2 ? "text-[var(--p-text-3)] font-semibold uppercase tracking-wider" : "text-muted-foreground",
            )}
          >
            {labelText}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className={cn(isDesignV2 && "bg-[var(--p-border-subtle)] my-1")} />

          {enabledTools.map((tool) => (
            <DropdownMenuItem
              key={tool.id}
              onClick={() => handleOpenTool(tool)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 text-xs cursor-pointer transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                  : "rounded-lg",
              )}
            >
              <ToolLogo24 tool={tool} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{tool.name}</p>
                <p
                  className={cn(
                    "truncate text-[10px]",
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                  )}
                >
                  {tool.kind === "builtin" ? "Integriertes Modul" : "Extern"}
                </p>
              </div>
            </DropdownMenuItem>
          ))}

          {enabledTools.length === 0 ? (
            <div
              className={cn(
                "px-2.5 py-2 text-xs italic",
                isDesignV2 ? "text-[var(--p-text-dim)]" : "text-muted-foreground",
              )}
            >
              Keine Tools für dieses Unternehmen aktiv.
            </div>
          ) : null}

          <DropdownMenuSeparator className={cn(isDesignV2 && "bg-[var(--p-border-subtle)] my-1")} />

          <DropdownMenuItem
            onClick={() => setPromptOpen(true)}
            className={cn(
              "gap-2 text-xs cursor-pointer transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "rounded-lg",
            )}
          >
            <IconCode className="size-4" />
            Eigene App integrieren…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={openSettings}
            className={cn(
              "gap-2 text-xs cursor-pointer transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "rounded-lg",
            )}
          >
            <IconSettings className="size-4" />
            Tools in Einstellungen verwalten
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IntegrationPromptDialog open={promptOpen} onOpenChange={setPromptOpen} />
    </>
  );
}

export default ToolsMenuV2;
