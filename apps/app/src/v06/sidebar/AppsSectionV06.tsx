import {
  IconApps,
  IconCheck,
  IconChevronDown,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconPlayerPlay,
  IconPlus,
  IconRobot,
  IconSparkles,
  IconTerminal2,
  IconWorldWww,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarGroup } from "@/components/ui/sidebar";
import { CountPill, FolderTile, GROUP_ROW_CLASS, RowName, SectionLabel } from "@/components/sidebar-v2/group-row";
import { AppPreviewPanel } from "@/components/sidebar-v2/app-preview-panel";
import type { AppAccountUI } from "@/components/sidebar-v2/types";
import { SidebarSection, ListRow, EmptyState, Skeleton } from "@/v06/design";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { useMultiLoginApps } from "./useMultiLoginApps";

export interface AppVisualConfig {
  id: string;
  name: string;
  badge: string;
  icon: typeof IconSparkles;
  colorClass: string;
  gradient: string;
  loginHint: string;
}

const APP_VISUAL_MAP: Record<string, Partial<AppVisualConfig>> = {
  codex: {
    badge: "CLI / Desktop",
    icon: IconTerminal2,
    colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    gradient: "linear-gradient(to bottom, #6ee7b7, #059669)",
    loginHint: "Öffnet eine isolierte Codex/ChatGPT Instanz mit eigenem User-Data & Config Profil.",
  },
  antigravity: {
    badge: "Agentic IDE",
    icon: IconSparkles,
    colorClass: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    gradient: "linear-gradient(to bottom, #7ec8f5, #3b9de0)",
    loginHint: "Schaltet den aktiven Antigravity CLI Account (AGY_ACCOUNT) um.",
  },
  manus: {
    badge: "Web-Agent",
    icon: IconWorldWww,
    colorClass: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    gradient: "linear-gradient(to bottom, #d8b4fe, #7c3aed)",
    loginHint: "Öffnet Manus in einem isolierten Helium-Browser-Agentenprofil.",
  },
  grokbot: {
    badge: "xAI / Browser",
    icon: IconRobot,
    colorClass: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    gradient: "linear-gradient(to bottom, #fb7185, #e11d48)",
    loginHint: "Öffnet Grok Bot in einem isolierten Profil.",
  },
  cue: {
    badge: "Assistant",
    icon: IconSparkles,
    colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    gradient: "linear-gradient(to bottom, #fcd34d, #d97706)",
    loginHint: "Startet Cue über PC-App oder Web.",
  },
};

/**
 * AppsSectionV06 (A01 - v06, aufgewertet durch A34)
 *
 * Apps-Sektion der Messages-Sidebar:
 * - Liest die Liste der Apps dynamisch aus GET /api/v06/multilogin/apps (via useMultiLoginApps)
 * - Bei 404 Fallback auf Codex/Antigravity/Manus
 * - Verwaltet Accounts und Multi-Login
 * - v06 Design-System: Obsidian-Tokens, SidebarSection und ListRow unter FLAGS_V06.designV2.
 */
export function AppsSectionV06() {
  const { apps: registryApps } = useMultiLoginApps();
  const [accounts, setAccounts] = useState<AppAccountUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const isDesignV2 = getFlag("designV2");

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetApp, setTargetApp] = useState<AppVisualConfig | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ accountId: string; title: string } | null>(null);
  const [restartOffer, setRestartOffer] = useState<{ accountId: string; message: string } | null>(null);

  const supportedApps: AppVisualConfig[] = useMemo(() => {
    return registryApps.map((app) => {
      const visual = APP_VISUAL_MAP[app.id.toLowerCase()] || {};
      return {
        id: app.id,
        name: app.name || app.id,
        badge: visual.badge || (app.launch?.kind ? app.launch.kind.toUpperCase() : "App"),
        icon: visual.icon || IconSparkles,
        colorClass: visual.colorClass || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
        gradient: visual.gradient || "linear-gradient(to bottom, #9ca3af, #4b5563)",
        loginHint: visual.loginHint || `Öffnet ${app.name} in einer isolierten Umgebung.`,
      };
    });
  }, [registryApps]);

  const titleFor = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    const app = supportedApps.find((x) => x.id === acc?.app?.toLowerCase());
    return `${app?.name ?? acc?.app ?? "App"} · ${acc?.email || acc?.label || accountId}`;
  };

  const openPreview = async (accountId: string) => {
    try {
      const res = await fetch(`/api/app-accounts/${encodeURIComponent(accountId)}/preview`);
      const data = await res.json();
      if (data.preview) {
        setPreview({ accountId, title: titleFor(accountId) });
        return;
      }
      setStatusMsg("Läuft nicht mit Vorschau – erst starten");
      setTimeout(() => setStatusMsg(null), 3500);
    } catch {
      setStatusMsg("Vorschau nicht erreichbar");
      setTimeout(() => setStatusMsg(null), 3500);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/app-accounts");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch app-accounts:", e);
    }
  };

  useEffect(() => {
    void fetchAccounts();
  }, []);

  const handleActivate = async (accountId: string) => {
    try {
      setActiveActionId(accountId);
      const res = await fetch(`/api/app-accounts/${encodeURIComponent(accountId)}/activate`, {
        method: "POST",
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((acc) => {
            const target = prev.find((a) => a.id === accountId);
            if (target && acc.app === target.app) {
              return { ...acc, isActive: acc.id === accountId };
            }
            return acc;
          }),
        );
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const handleLaunch = async (accountId: string, opts?: { withPreview?: boolean }) => {
    try {
      setActiveActionId(accountId);
      setRestartOffer(null);
      const res = await fetch(`/api/app-accounts/${encodeURIComponent(accountId)}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withPreview: opts?.withPreview ?? true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.preview) {
          setPreview({ accountId, title: titleFor(accountId) });
        } else if (data.restartAvailable) {
          setRestartOffer({
            accountId,
            message:
              data.message ||
              "Die App läuft bereits im Vollbild. Vorschau erfordert Neustart mit Vorschaufenster.",
          });
        }
        await fetchAccounts();
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const handleCreateAccount = async () => {
    if (!targetApp || !newLabel.trim()) return;
    try {
      setLoading(true);
      const res = await fetch("/api/app-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app: targetApp.id,
          label: newLabel.trim(),
          email: newEmail.trim() || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewLabel("");
        setNewEmail("");
        await fetchAccounts();
      }
    } finally {
      setLoading(false);
    }
  };

  // Render accounts dropdown items
  const renderAppAccountsDropdown = (app: AppVisualConfig, appAccounts: AppAccountUI[], activeAccount?: AppAccountUI) => (
    <DropdownMenuContent
      align="start"
      className={cn(
        "w-64 p-1.5 shadow-xl",
        isDesignV2
          ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] backdrop-blur-md shadow-[var(--p-shadow-lg)]"
          : "rounded-xl bg-card border-sidebar-border",
      )}
    >
      <DropdownMenuLabel
        className={cn(
          "flex items-center justify-between text-xs py-1",
          isDesignV2 && "text-[var(--p-text-1)] font-semibold",
        )}
      >
        <span>{app.name} Accounts</span>
        <span
          className={cn(
            "text-[10px] font-normal",
            isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
          )}
        >
          {app.badge}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator className={cn(isDesignV2 && "bg-[var(--p-border-subtle)] my-1")} />

      {appAccounts.length === 0 ? (
        <div
          className={cn(
            "px-2 py-2 text-xs italic",
            isDesignV2 ? "text-[var(--p-text-dim)]" : "text-muted-foreground",
          )}
        >
          Noch kein Account konfiguriert.
        </div>
      ) : (
        appAccounts.map((acc) => (
          <DropdownMenuItem
            key={acc.id}
            className={cn(
              "flex items-center justify-between gap-2 px-2.5 py-2 text-xs cursor-pointer transition-colors",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "rounded-lg",
            )}
            onClick={() => handleActivate(acc.id)}
          >
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium truncate", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>
                {acc.label}
              </p>
              {acc.email ? (
                <p className={cn("text-[11px] truncate", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>
                  {acc.email}
                </p>
              ) : null}
            </div>
            {acc.isActive ? (
              <IconCheck
                className={cn(
                  "size-3.5 shrink-0",
                  isDesignV2 ? "text-[var(--p-success)]" : "text-emerald-400",
                )}
              />
            ) : null}
          </DropdownMenuItem>
        ))
      )}

      <DropdownMenuSeparator className={cn(isDesignV2 && "bg-[var(--p-border-subtle)] my-1")} />

      {activeAccount ? (
        <DropdownMenuItem
          className={cn(
            "gap-2 px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors",
            isDesignV2
              ? "rounded-[var(--p-radius-md)] text-[var(--p-success)] hover:bg-[var(--p-success-subtle)] hover:text-[var(--p-success-hover)]"
              : "rounded-lg text-emerald-400 hover:bg-emerald-500/10",
          )}
          onClick={() => handleLaunch(activeAccount.id)}
          disabled={activeActionId === activeAccount.id}
        >
          <IconExternalLink className="size-3.5" />
          Aktiven Account starten
        </DropdownMenuItem>
      ) : null}

      {activeAccount ? (
        <DropdownMenuItem
          className={cn(
            "gap-2 px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors",
            isDesignV2
              ? "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
              : "rounded-lg",
          )}
          onClick={() => openPreview(activeAccount.id)}
        >
          <IconEye className="size-3.5" />
          Live-Vorschau öffnen
        </DropdownMenuItem>
      ) : null}

      <DropdownMenuItem
        className={cn(
          "gap-2 text-xs font-medium px-2.5 py-2 cursor-pointer transition-colors",
          isDesignV2
            ? "rounded-[var(--p-radius-md)] text-[var(--p-accent)] hover:text-[var(--p-accent-hover)] hover:bg-[var(--p-accent-subtle)]"
            : "rounded-lg text-primary",
        )}
        onClick={() => {
          setTargetApp(app);
          setNewLabel("");
          setNewEmail("");
          setDialogOpen(true);
        }}
      >
        <IconPlus className="size-3.5" />
        Account hinzufügen…
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <>
      {isDesignV2 ? (
        <SidebarSection
          title="APPS"
          badge={supportedApps.length}
          collapsible
          defaultExpanded
          className="px-1"
        >
          {loading ? (
            <div className="flex flex-col gap-1 p-1">
              <Skeleton variant="rect" height={34} />
              <Skeleton variant="rect" height={34} />
              <Skeleton variant="rect" height={34} />
            </div>
          ) : supportedApps.length === 0 ? (
            <EmptyState
              icon={<IconApps className="size-4" />}
              compact
              title="Keine Apps"
              description="Keine Multi-Login Apps registriert."
            />
          ) : (
            <div className="flex flex-col gap-0.5 w-full">
              {supportedApps.map((app) => {
                const appAccounts = accounts.filter(
                  (acc) => acc.app.toLowerCase() === app.id.toLowerCase(),
                );
                const activeAccount = appAccounts.find((a) => a.isActive);
                const AppIcon = app.icon;

                return (
                  <DropdownMenu key={app.id}>
                    <DropdownMenuTrigger
                      render={
                        <ListRow
                          compact
                          clickable
                          title={app.name}
                          subtitle={
                            activeAccount
                              ? (activeAccount.label || activeAccount.email || "Aktiv")
                              : app.badge
                          }
                          status={activeAccount ? "online" : undefined}
                          badge={appAccounts.length > 0 ? `${appAccounts.length}` : undefined}
                          leftAccessory={
                            <div
                              className="size-6 rounded-[var(--p-radius-sm)] flex items-center justify-center shrink-0 shadow-xs"
                              style={{ background: app.gradient }}
                            >
                              <AppIcon className="size-3.5 text-white drop-shadow-xs" />
                            </div>
                          }
                          rightAccessory={
                            <div className="flex items-center gap-1.5 shrink-0">
                              {activeAccount ? (
                                <IconPlayerPlay
                                  className="size-3 text-[var(--p-success)] opacity-80"
                                  aria-label="Aktiver Account bereit"
                                />
                              ) : null}
                              <IconChevronDown className="size-3 text-[var(--p-text-3)] transition-transform" />
                            </div>
                          }
                          className="py-1.5"
                        />
                      }
                    />
                    {renderAppAccountsDropdown(app, appAccounts, activeAccount)}
                  </DropdownMenu>
                );
              })}
            </div>
          )}
        </SidebarSection>
      ) : (
        <SidebarGroup className="gap-0.5 p-0 px-2 py-1 w-full group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <SectionLabel>Apps ({supportedApps.length})</SectionLabel>

          <div className="flex flex-col gap-0.5 w-full">
            {supportedApps.map((app) => {
              const appAccounts = accounts.filter(
                (acc) => acc.app.toLowerCase() === app.id.toLowerCase(),
              );
              const activeAccount = appAccounts.find((a) => a.isActive);
              const AppIcon = app.icon;

              return (
                <div
                  key={app.id}
                  className="group/app flex flex-col rounded-xl transition-colors hover:bg-sidebar-accent/40"
                >
                  {/* App-Zeile */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="w-full text-left outline-none">
                      <div className={GROUP_ROW_CLASS} title={app.name}>
                        <FolderTile
                          gradient={app.gradient}
                          center={<AppIcon className="size-4 text-white drop-shadow-sm" />}
                        />

                        <span className="flex min-w-0 flex-1 items-center justify-between group-data-[collapsible=icon]:hidden">
                          <RowName>{app.name}</RowName>
                          <span className="flex items-center gap-1">
                            <CountPill count={appAccounts.length} />
                            <IconChevronDown className="size-3 text-sidebar-foreground/45" />
                          </span>
                        </span>
                      </div>
                    </DropdownMenuTrigger>
                    {renderAppAccountsDropdown(app, appAccounts, activeAccount)}
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </SidebarGroup>
      )}

      {/* Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={cn(
            "max-w-sm p-5 shadow-2xl",
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)]"
              : "rounded-2xl bg-card border-sidebar-border",
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "flex items-center gap-2 text-base font-semibold",
                isDesignV2 && "text-[var(--p-text-1)]",
              )}
            >
              <IconPlus
                className={cn(
                  "size-4",
                  isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
                )}
              />
              Account für {targetApp?.name} anlegen
            </DialogTitle>
            <DialogDescription
              className={cn(
                "text-xs",
                isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
              )}
            >
              {targetApp?.loginHint}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                className={cn(
                  "text-xs",
                  isDesignV2 && "text-[var(--p-text-2)]",
                )}
              >
                Bezeichnung / Label
              </Label>
              <Input
                autoFocus
                placeholder="z. B. Privat, Arbeit, Stefan-Account"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className={cn(
                  "text-xs h-9",
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border-[var(--p-border)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-dim)] focus-visible:border-[var(--p-accent)]"
                    : "rounded-xl",
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                className={cn(
                  "text-xs",
                  isDesignV2 && "text-[var(--p-text-2)]",
                )}
              >
                E-Mail (optional)
              </Label>
              <Input
                type="email"
                placeholder="stefan@nordwind-capital.de"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={cn(
                  "text-xs h-9",
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border-[var(--p-border)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-dim)] focus-visible:border-[var(--p-accent)]"
                    : "rounded-xl",
                )}
              />
            </div>
          </DialogBody>
          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                  : "rounded-xl",
              )}
              onClick={() => setDialogOpen(false)}
              disabled={loading}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs gap-1.5",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-text-on-accent)] font-medium shadow-[var(--p-shadow-sm)]"
                  : "rounded-xl",
              )}
              onClick={handleCreateAccount}
              disabled={!newLabel.trim() || loading}
            >
              <IconDeviceFloppy className="size-3.5" />
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* App Live Preview Panel */}
      {preview ? (
        <AppPreviewPanel
          accountId={preview.accountId}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {/* Restart Offer Dialog */}
      <Dialog
        open={Boolean(restartOffer)}
        onOpenChange={(open) => !open && setRestartOffer(null)}
      >
        <DialogContent
          className={cn(
            "max-w-sm p-5 shadow-2xl",
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)]"
              : "rounded-2xl bg-card border-sidebar-border",
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "text-base font-semibold",
                isDesignV2 && "text-[var(--p-text-1)]",
              )}
            >
              App neu starten?
            </DialogTitle>
            <DialogDescription
              className={cn(
                "text-xs pt-1",
                isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
              )}
            >
              {restartOffer?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                  : "rounded-xl",
              )}
              onClick={() => setRestartOffer(null)}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-text-on-accent)] font-medium"
                  : "rounded-xl",
              )}
              onClick={() => {
                if (restartOffer?.accountId) {
                  void handleLaunch(restartOffer.accountId, { withPreview: true });
                }
              }}
            >
              Neu starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AppsSectionV06;
