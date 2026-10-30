import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconBuildingStore,
  IconChevronDown,
  IconChevronRight,
  IconPalette,
  IconPlugConnected,
  IconRobot,
  IconSearch,
  IconSettings,
  IconShieldLock,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import type {
  SettingsGroup,
  SettingsSectionMeta,
} from "@/contracts/v06/settings-meta";
import {
  type NavGroupWithItems,
  SETTINGS_GROUPS,
  type SettingsNavItemMeta,
  getKeepSections,
  getNavGroups,
  searchSections,
} from "./settingsNav";
import { CompaniesManagePage } from "./CompaniesManagePage";
import { ThemeSettingsSection } from "@/v06/theme";
import { CompanyToolsSettingsSection } from "@/v06/company-tools";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import "@/v06/design/tokens.css";
import {
  Button as DesignButton,
  Card as DesignCard,
  EmptyState as DesignEmptyState,
} from "@/v06/design";

// ─── Bestehende Komponenten (Wiederverwendung ohne Duplizierung) ─────────────
import { FocusChainSettingsPanel } from "@/components/settings/focus-chain-settings";
import { PhoneConnectPanel } from "@/components/settings/phone-connect-panel";
import { ErweitertPanel } from "@/components/settings/erweitert-panel";
import { ProfileEditDialog } from "@/components/settings/profile-edit-dialog";
import { ApiKeysSettingsPanel } from "@/components/settings/api-keys-settings";
import { CompanyAppsSettingsPanel } from "@/components/settings/company-apps-settings";
import { CodexUsagePanel } from "@/components/settings/codex-usage-panel";
import { DeploymentModePanel } from "@/components/settings/deployment-mode-panel";
import { DonatePanel } from "@/components/settings/donate-panel";
import { DriveBackupPanel } from "@/components/settings/drive-backup-panel";
import { BrowserGroupsPanel } from "@/components/settings/browser-groups-panel";
import { SidebarToolsSettingsPanel } from "@/components/settings/sidebar-tools-settings";
import { McpConnectorMappingPanel } from "@/components/settings/mcp-connector-mapping";
import { McpSettingsPanel } from "@/components/settings/mcp-settings";
import { EmailAgentsSettings } from "@/components/settings/email-agents/email-agents-settings";
import { McpGrantsSettings } from "@/components/settings/email-agents/mcp-grants-settings";
import { ConnectorGallery } from "@/components/agent-hub/connector-gallery";
import { BrainSettingsPage } from "@/components/brain/brain-settings-page";
import { ModelProviderSettingsPanel } from "@/components/settings/model-provider-settings";
import { CliProvidersSettingsPanel } from "@/components/settings/cli-providers-settings";
import { ModelOnePanel } from "@/components/settings/model-one-panel";
import { MeinHeliumPanel } from "@/components/pc-bridge/mein-helium";
import { ShortcutsPanel } from "@/components/settings/shortcuts-panel";
import { StandingInstructions } from "@/components/settings/standing-instructions";
import { SupabaseSyncCard } from "@/components/settings/supabase-sync-card";
import { UbuntuMachinesPanel } from "@/components/settings/ubuntu-machines-settings";
import { VoiceSettingsPanel } from "@/components/settings/voice-settings";
import { CalendarSettingsPanel } from "@/components/calendar/calendar-settings-panel";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { DesktopControlSettingsPanel } from "@/components/settings/desktop-control-settings";
import {
  getLocalProfile,
  subscribeLocalProfile,
} from "@/lib/auth/local-profile";
import { useSignOut } from "@/lib/auth/use-sign-out";

// ─── Slot-API für dynamische Registrierung (A13 u.a.) ─────────────────────────

export interface RegisteredSectionSlot {
  meta: SettingsSectionMeta;
  Component: React.ComponentType<{ className?: string }>;
}

const registeredSlots = new Map<string, RegisteredSectionSlot>();
const slotListeners = new Set<() => void>();

/**
 * Slot-API: Erlaubt anderen Modulen (z.B. A13 "Tools pro Firma"), eigene Abschnitte
 * deklarativ in die SettingsShellV2 einzuhängen.
 */
export function registerSettingsSection(
  meta: SettingsSectionMeta,
  Component: React.ComponentType<{ className?: string }>,
): () => void {
  registeredSlots.set(meta.id, { meta, Component });
  slotListeners.forEach((fn) => fn());
  return () => {
    registeredSlots.delete(meta.id);
    slotListeners.forEach((fn) => fn());
  };
}

export function getRegisteredSettingsSections(): RegisteredSectionSlot[] {
  return Array.from(registeredSlots.values());
}

export function subscribeRegisteredSections(listener: () => void): () => void {
  slotListeners.add(listener);
  return () => {
    slotListeners.delete(listener);
  };
}

// ─── Icons für die 6 Gruppen ──────────────────────────────────────────────────

const GROUP_ICONS: Record<
  SettingsGroup,
  React.ComponentType<{ className?: string }>
> = {
  konto: IconUser,
  firma: IconBuildingStore,
  verbindungen: IconPlugConnected,
  agenten: IconRobot,
  darstellung: IconPalette,
  system: IconShieldLock,
};

// ─── Inlined Panels ──────────────────────────────────────────────────────────

function McpCombinedPanel() {
  return (
    <div className="space-y-8">
      <ConnectorGallery className="mt-2" pageSize={8} />
      <McpSettingsPanel />
      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Connector-Mapping & Quellen
        </h3>
        <McpConnectorMappingPanel />
      </div>
      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          MCP-Freigaben
        </h3>
        <McpGrantsSettings />
      </div>
    </div>
  );
}

function SyncBackupCombinedPanel() {
  return (
    <div className="space-y-8">
      <DriveBackupPanel />
      <div className="border-t border-border pt-6">
        <SupabaseSyncCard />
      </div>
    </div>
  );
}

function ApiKeysCombinedPanel() {
  return (
    <div className="space-y-8">
      <ApiKeysSettingsPanel />
      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Modell-Provider Konfiguration
        </h3>
        <ModelProviderSettingsPanel />
      </div>
    </div>
  );
}

function DarstellungCombinedPanel() {
  return (
    <div className="space-y-8">
      {/* ThemeSettingsSection von A03 */}
      <ThemeSettingsSection />
      <div className="border-t border-border pt-6">
        <AppearanceSettings />
      </div>
    </div>
  );
}

function KontoPanel({ onEditProfile }: { onEditProfile: () => void }) {
  const [profile, setProfile] = useState(() => getLocalProfile());
  const { signOut, isPending } = useSignOut();
  const isDesignV2 = getFlag("designV2");

  useEffect(() => {
    return subscribeLocalProfile(() => setProfile(getLocalProfile()));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h2 className={cn("text-base font-semibold", isDesignV2 ? "text-[var(--p-text-1)] tracking-tight text-lg" : "text-foreground")}>
          Konto & persönliches Profil
        </h2>
        <p className={cn("mt-1 text-xs", isDesignV2 ? "text-[var(--p-text-2)] text-sm" : "text-muted-foreground")}>
          Verwalte deinen Anzeigenamen, Profilbild und deine aktive Sitzung.
        </p>
      </header>

      {/* Profil-Karte */}
      <div
        className={cn(
          "flex items-center justify-between p-4",
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-sm transition-colors"
            : "rounded-xl border border-border bg-card",
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold",
              isDesignV2
                ? "border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-1)]"
                : "bg-muted text-foreground",
            )}
          >
            {profile.avatarUrl ? (
              <img
                alt=""
                className="size-full object-cover"
                src={profile.avatarUrl}
              />
            ) : (
              (profile.name || "U").slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className={cn("text-sm font-semibold", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>
              {profile.name || "Connect User"}
            </p>
            <p className={cn("text-xs", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>Lokales Profil</p>
          </div>
        </div>
        {isDesignV2 ? (
          <DesignButton size="sm" variant="secondary" onClick={onEditProfile}>
            Bearbeiten
          </DesignButton>
        ) : (
          <Button size="sm" variant="outline" onClick={onEditProfile}>
            Bearbeiten
          </Button>
        )}
      </div>

      {/* Anmelde-Sitzungen (merged) */}
      <div
        className={cn(
          "p-4",
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-sm"
            : "rounded-xl border border-border bg-card",
        )}
      >
        <h3 className={cn("text-sm font-semibold", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>
          Anmelde-Sitzungen
        </h3>
        <p className={cn("mt-1 text-xs", isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground")}>
          Diese Connect-Instanz läuft lokal auf Helium (Port 3101).
        </p>
      </div>

      {/* Abmelden */}
      <div
        className={cn(
          "flex items-center justify-between p-4",
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-sm"
            : "rounded-xl border border-border bg-card",
        )}
      >
        <div>
          <p className={cn("text-sm font-medium", isDesignV2 ? "text-[var(--p-danger)]" : "text-destructive")}>
            Sitzung beenden
          </p>
          <p className={cn("text-xs", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>
            Meldet diesen Browser von der lokalen Sitzung ab.
          </p>
        </div>
        {isDesignV2 ? (
          <DesignButton
            size="sm"
            variant="danger"
            loading={isPending}
            onClick={() => void signOut()}
          >
            Abmelden
          </DesignButton>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => void signOut()}
          >
            {isPending ? "Abmelde…" : "Abmelden"}
          </Button>
        )}
      </div>
    </div>
  );
}

function UberPanel() {
  const isDesignV2 = getFlag("designV2");

  return (
    <div className="space-y-6">
      <header>
        <h2 className={cn("text-base font-semibold", isDesignV2 ? "text-[var(--p-text-1)] tracking-tight text-lg" : "text-foreground")}>
          Über Connect & Rechtliches
        </h2>
        <p className={cn("mt-1 text-xs", isDesignV2 ? "text-[var(--p-text-2)] text-sm" : "text-muted-foreground")}>
          Versionshinweise, Protokolle und Richtlinien.
        </p>
      </header>

      <div
        className={cn(
          "p-4 space-y-4",
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-sm"
            : "rounded-xl border border-border bg-card",
        )}
      >
        <div className="flex items-center justify-between">
          <span className={cn("text-xs", isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground")}>Version</span>
          <span
            className={cn(
              "px-2 py-0.5 text-xs font-mono font-medium",
              isDesignV2
                ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-1)]"
                : "rounded bg-muted text-foreground",
            )}
          >
            v{import.meta.env.VITE_APP_VERSION ?? "0.6.0-helium"}
          </span>
        </div>
        <div className={cn("flex items-center justify-between pt-3", isDesignV2 ? "border-t border-[var(--p-border)]" : "border-t border-border")}>
          <div>
            <p className={cn("text-xs font-medium", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>Server-Logs</p>
            <p className={cn("text-[11px]", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>
              Konsole & Diagnose-Protokoll
            </p>
          </div>
          {isDesignV2 ? (
            <DesignButton
              size="sm"
              variant="secondary"
              onClick={() => {
                try {
                  (
                    window as unknown as { __openLogs__?: () => void }
                  ).__openLogs__?.();
                } catch {
                  /* ignore */
                }
              }}
            >
              Logs öffnen
            </DesignButton>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  (
                    window as unknown as { __openLogs__?: () => void }
                  ).__openLogs__?.();
                } catch {
                  /* ignore */
                }
              }}
            >
              Logs öffnen
            </Button>
          )}
        </div>
        <div className={cn("flex items-center justify-between pt-3", isDesignV2 ? "border-t border-[var(--p-border)]" : "border-t border-border")}>
          <span className={cn("text-xs font-medium", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>
            Datenschutzerklärung
          </span>
          <a
            href="/datenschutz"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-xs underline-offset-2 hover:underline",
              isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
            )}
          >
            Öffnen
          </a>
        </div>
        <div className={cn("flex items-center justify-between pt-3", isDesignV2 ? "border-t border-[var(--p-border)]" : "border-t border-border")}>
          <span className={cn("text-xs font-medium", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>
            Nutzungsbedingungen
          </span>
          <a
            href="/nutzungsbedingungen"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-xs underline-offset-2 hover:underline",
              isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
            )}
          >
            Öffnen
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Hauptkomponente: SettingsShellV2 ─────────────────────────────────────────

export interface SettingsShellV2Props {
  className?: string;
  initialHash?: string;
}

export function SettingsShellV2({
  className,
  initialHash,
}: SettingsShellV2Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [registered, setRegistered] = useState<RegisteredSectionSlot[]>(() =>
    getRegisteredSettingsSections(),
  );

  // Aktiver Hash aus TanStack-Router
  const routerHash = useRouterState({
    select: (s) => s.location.hash.replace(/^#/, ""),
  });
  const activeHash = routerHash || initialHash || "";

  // Ausklapp-Status der 6 Gruppen (Standard: alle offen)
  const [openGroups, setOpenGroups] = useState<Set<SettingsGroup>>(
    () => new Set(SETTINGS_GROUPS.map((g) => g.id)),
  );

  useEffect(() => {
    return subscribeRegisteredSections(() => {
      setRegistered(getRegisteredSettingsSections());
    });
  }, []);

  const toggleGroup = (id: SettingsGroup) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Navigationsgruppen mit Berücksichtigung von Suchfiltern und Slot-Erweiterungen
  const navGroups = useMemo<NavGroupWithItems[]>(() => {
    const baseGroups = getNavGroups();

    // Dynamisch registrierte Slots in passende Gruppen einfügen
    registered.forEach((slot) => {
      const targetGroup = baseGroups.find((g) => g.id === slot.meta.group);
      if (targetGroup) {
        // Falls bereits vorhanden (z.B. company-tools), ersetzen; sonst anhängen
        const existingIdx = targetGroup.items.findIndex(
          (i) => i.id === slot.meta.id,
        );
        const itemMeta: SettingsNavItemMeta = {
          ...slot.meta,
          description: slot.meta.label,
        };
        if (existingIdx >= 0) {
          targetGroup.items[existingIdx] = itemMeta;
        } else {
          targetGroup.items.push(itemMeta);
        }
      }
    });

    if (!search.trim()) {
      return baseGroups;
    }

    const matches = searchSections(search);
    const matchIds = new Set(matches.map((m) => m.id));

    return baseGroups
      .map((group) => {
        const filteredItems = group.items.filter((item) =>
          matchIds.has(item.id),
        );
        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [search, registered]);

  // Passende Komponente für den aktiven Hash ermitteln
  const renderContent = () => {
    // 1. Eingehängte Slot-Komponente?
    const slot = registered.find((s) => s.meta.id === activeHash);
    if (slot) {
      const SlotComponent = slot.Component;
      return <SlotComponent />;
    }

    // 2. Spezifische Hauptseiten
    switch (activeHash) {
      case "konto":
      case "security":
        return <KontoPanel onEditProfile={() => setProfileOpen(true)} />;
      case "companies":
        return <CompaniesManagePage />;
      case "company-tools":
        return getFlag("companyTools") ? <CompanyToolsSettingsSection /> : <CompanyAppsSettingsPanel />;
      case "sidebar-tools":
        return <SidebarToolsSettingsPanel />;
      case "browser-groups":
        return <BrowserGroupsPanel />;
      case "standing-instructions":
      case "connect-agenten":
        return <StandingInstructions />;
      case "fokus":
        return <FocusChainSettingsPanel />;
      case "voice":
        return <VoiceSettingsPanel />;
      case "desktop-control":
        return <DesktopControlSettingsPanel />;
      case "email-agents":
        return <EmailAgentsSettings />;
      case "model-one":
        return <ModelOnePanel />;
      case "api-keys":
      case "model-provider":
        return <ApiKeysCombinedPanel />;
      case "cli-providers":
        return <CliProvidersSettingsPanel />;
      case "mcp":
      case "connector-mapping":
      case "mcp-grants":
        return <McpCombinedPanel />;
      case "handy-verbinden":
        return <PhoneConnectPanel />;
      case "mein-helium":
        return <MeinHeliumPanel />;
      case "calendar":
        return <CalendarSettingsPanel />;
      case "appearance":
        return <DarstellungCombinedPanel />;
      case "shortcuts":
        return <ShortcutsPanel />;
      case "sync-backup":
        return <SyncBackupCombinedPanel />;
      case "deployment-mode":
      case "codex-usage":
      case "erweitert":
        return (
          <div className="space-y-8">
            <DeploymentModePanel />
            <div className="border-t border-border pt-6">
              <CodexUsagePanel />
            </div>
            <div className="border-t border-border pt-6">
              <ErweitertPanel />
            </div>
          </div>
        );
      case "brain":
        return <BrainSettingsPage />;
      case "uber":
      case "datenschutz":
        return <UberPanel />;
      case "ubuntu-machines":
        return <UbuntuMachinesPanel />;
      case "donate":
        return <DonatePanel />;
      default:
        // Übersicht wenn kein Hash gesetzt ist
        return <SettingsV2Overview onSelectHash={(h) => {}} />;
    }
  };

  const isDesignV2 = getFlag("designV2");

  return (
    <div
      className={cn(
        "flex h-svh w-full overflow-hidden",
        isDesignV2
          ? "bg-[var(--p-bg)] text-[var(--p-text-1)]"
          : "bg-background text-foreground",
        className,
      )}
      data-testid="settings-shell-v2"
    >
      {/* ── Linke Seitenleiste: Navigation mit max. 6 Gruppen ── */}
      <aside
        className={cn(
          "flex w-72 shrink-0 flex-col",
          isDesignV2
            ? "border-r border-[var(--p-border)] bg-[var(--p-surface-1)]"
            : "border-r border-border bg-card/60 backdrop-blur",
        )}
      >
        {/* Seitenleisten-Kopf: EINZIGER Zurück-Button + Titel */}
        <div
          className={cn(
            "flex h-14 items-center justify-between px-3.5",
            isDesignV2
              ? "border-b border-[var(--p-border)]"
              : "border-b border-border",
          )}
        >
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className={cn(
                "flex size-8 items-center justify-center transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)]"
                  : "rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label="Zurück zur App"
            >
              <IconArrowLeft className="size-4" />
            </Link>
            <div className="flex items-center gap-2">
              <IconSettings
                className={cn(
                  "size-4",
                  isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
                )}
              />
              <span
                className={cn(
                  "text-sm font-semibold tracking-tight",
                  isDesignV2 ? "text-[var(--p-text-1)]" : "",
                )}
              >
                Einstellungen
              </span>
            </div>
          </div>

          <Link
            to="/settings"
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              isDesignV2
                ? !activeHash
                  ? "bg-[var(--p-accent)]/15 text-[var(--p-accent)] font-semibold border border-[var(--p-accent)]/20"
                  : "text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                : !activeHash
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            Übersicht
          </Link>
        </div>

        {/* Suchfeld */}
        <div
          className={cn(
            "p-3",
            isDesignV2
              ? "border-b border-[var(--p-border)]"
              : "border-b border-border/60",
          )}
        >
          <div className="relative">
            <IconSearch
              className={cn(
                "pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
              )}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Einstellungen durchsuchen…"
              className={cn(
                "h-8 w-full pl-8 pr-7 text-xs outline-none transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:ring-1 focus:ring-[var(--p-accent)]/30"
                  : "rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary",
              )}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2",
                  isDesignV2
                    ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="Suche löschen"
              >
                <IconX className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Gruppen & Einträge (max. 6 Gruppen) */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navGroups.length === 0 ? (
            isDesignV2 ? (
              <div className="p-4">
                <DesignEmptyState
                  icon={<IconSearch className="size-5 text-[var(--p-text-3)]" />}
                  title="Keine Treffer"
                  description={`Keine Abschnitte für „${search}“ gefunden.`}
                  action={
                    <DesignButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearch("")}
                    >
                      Suche zurücksetzen
                    </DesignButton>
                  }
                />
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                Keine Abschnitte für &bdquo;{search}&ldquo; gefunden.
              </div>
            )
          ) : (
            navGroups.map((group) => {
              const Icon = GROUP_ICONS[group.id] || IconSettings;
              const isOpen = search ? true : openGroups.has(group.id);
              const hasActiveItem = group.items.some(
                (item) => item.id === activeHash,
              );

              return (
                <div key={group.id} className="rounded-lg">
                  {/* Gruppen-Header (einklappbar) */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                      isDesignV2
                        ? hasActiveItem
                          ? "text-[var(--p-accent)]"
                          : "text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)] rounded-[var(--p-radius-sm)]"
                        : hasActiveItem
                          ? "text-primary"
                          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground rounded-lg",
                    )}
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5" />
                      <span>{group.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.2 text-[10px] font-normal",
                          isDesignV2
                            ? "bg-[var(--p-surface-3)] text-[var(--p-text-2)]"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {group.items.length}
                      </span>
                      <IconChevronDown
                        className={cn(
                          "size-3 transition-transform duration-150",
                          isDesignV2
                            ? "text-[var(--p-text-3)]"
                            : "text-muted-foreground",
                          !isOpen && "-rotate-90",
                        )}
                      />
                    </div>
                  </button>

                  {/* Abschnitte der Gruppe */}
                  {isOpen && (
                    <div
                      className={cn(
                        "mt-0.5 ml-2 pl-2 space-y-0.5",
                        isDesignV2
                          ? "border-l border-[var(--p-border)]"
                          : "border-l border-border/50",
                      )}
                    >
                      {group.items.map((item) => {
                        const isActive = activeHash === item.id;

                        return (
                          <Link
                            key={item.id}
                            to="/settings"
                            hash={item.id}
                            className={cn(
                              "flex w-full items-center justify-between px-2 py-1.5 text-xs transition-colors",
                              isDesignV2
                                ? isActive
                                  ? "rounded-[var(--p-radius-sm)] bg-[var(--p-accent)]/15 font-semibold text-[var(--p-accent)] border border-[var(--p-accent)]/20 shadow-xs"
                                  : "rounded-[var(--p-radius-sm)] text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)]"
                                : isActive
                                  ? "rounded-md bg-primary/10 font-medium text-primary shadow-xs"
                                  : "rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            )}
                          >
                            <span className="truncate">{item.label}</span>
                            {isActive && (
                              <IconChevronRight
                                className={cn(
                                  "size-3 shrink-0",
                                  isDesignV2
                                    ? "text-[var(--p-accent)]"
                                    : "text-primary",
                                )}
                              />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>
      </aside>

      {/* ── Rechter Inhaltsbereich ── */}
      <main
        id="settings-v2-scroll"
        className={cn(
          "flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8",
          isDesignV2 ? "bg-[var(--p-bg)]" : "",
        )}
      >
        <div className="mx-auto max-w-4xl">{renderContent()}</div>
      </main>

      {/* Profil-Dialog */}
      <ProfileEditDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  );
}

// ─── Grok-Bot Style 6-Gruppen Übersicht ───────────────────────────────────────

function SettingsV2Overview({
  onSelectHash,
}: {
  onSelectHash: (hash: string) => void;
}) {
  const groups = getNavGroups();
  const isDesignV2 = getFlag("designV2");

  return (
    <div className="space-y-6">
      <header>
        <h1
          className={cn(
            "text-2xl font-bold tracking-tight",
            isDesignV2 ? "text-[var(--p-text-1)] text-3xl" : "text-foreground",
          )}
        >
          Einstellungen
        </h1>
        <p
          className={cn(
            "mt-1 text-sm",
            isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
          )}
        >
          Zentrale Konfiguration für Konten, Firmen, Verbindungen, Agenten, Darstellung und System.
        </p>
      </header>

      {/* 6 Kacheln (max. 6 Gruppen) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const Icon = GROUP_ICONS[group.id] || IconSettings;

          return (
            <div
              key={group.id}
              className={cn(
                "flex flex-col justify-between p-5 transition-all duration-200",
                isDesignV2
                  ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] hover:border-[var(--p-accent)]/50 hover:bg-[var(--p-surface-hover)] hover:shadow-lg group"
                  : "rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm",
              )}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center transition-colors",
                      isDesignV2
                        ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-accent)] group-hover:border-[var(--p-accent)]/40 group-hover:bg-[var(--p-accent)]/15"
                        : "size-8 rounded-lg bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <h2
                    className={cn(
                      "text-sm font-semibold",
                      isDesignV2 ? "text-[var(--p-text-1)] text-base" : "text-foreground",
                    )}
                  >
                    {group.label}
                  </h2>
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs leading-relaxed",
                    isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
                  )}
                >
                  {group.description}
                </p>
              </div>

              {/* Chips der 'keep'-Elemente */}
              <div
                className={cn(
                  "mt-4 flex flex-wrap gap-1.5 pt-3",
                  isDesignV2
                    ? "border-t border-[var(--p-border)]"
                    : "border-t border-border/50",
                )}
              >
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    to="/settings"
                    hash={item.id}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-medium transition-colors",
                      isDesignV2
                        ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-2)] hover:border-[var(--p-accent)]/50 hover:bg-[var(--p-accent)]/10 hover:text-[var(--p-accent)]"
                        : "rounded-md border border-border/80 bg-background text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SettingsShellV2;
