import {
  IconCheck,
  IconChevronDown,
  IconDeviceFloppy,
  IconExternalLink,
  IconEye,
  IconPlayerPlay,
  IconPlus,
  IconSparkles,
  IconTerminal2,
  IconWorldWww,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
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
import { CountPill, FolderTile, GROUP_ROW_CLASS, RowName, SectionLabel } from "./group-row";
import type { AppAccountUI } from "./types";
import { AppPreviewPanel } from "./app-preview-panel";
import { PcAppsSection } from "./pc-apps-section";
import { SidebarSection, ListRow, EmptyState, Skeleton } from "@/v06/design";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

interface SupportedAppConfig {
  id: string;
  name: string;
  badge: string;
  icon: typeof IconSparkles;
  colorClass: string;
  /** Verlauf der grossen App-Kachel (GRUPPEN-Stil). */
  gradient: string;
  loginHint: string;
}

const SUPPORTED_APPS: SupportedAppConfig[] = [
  {
    id: "codex",
    name: "Codex",
    badge: "CLI / Desktop",
    icon: IconTerminal2,
    colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    gradient: "linear-gradient(to bottom, #6ee7b7, #059669)",
    loginHint: "Öffnet eine isolierte Codex/ChatGPT Instanz mit eigenem User-Data & Config Profil.",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    badge: "Agentic IDE",
    icon: IconSparkles,
    colorClass: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    gradient: "linear-gradient(to bottom, #7ec8f5, #3b9de0)",
    loginHint: "Schaltet den aktiven Antigravity CLI Account (AGY_ACCOUNT) um.",
  },
  {
    id: "manus",
    name: "Manus",
    badge: "Web-Agent",
    icon: IconWorldWww,
    colorClass: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    gradient: "linear-gradient(to bottom, #d8b4fe, #7c3aed)",
    loginHint: "Öffnet Manus in einem isolierten Helium-Browser-Agentenprofil.",
  },
];

export function AppsSection() {
  const [accounts, setAccounts] = useState<AppAccountUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const isDesignV2 = getFlag("designV2");

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetApp, setTargetApp] = useState<SupportedAppConfig | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // helium-appcast: rechte Live-Vorschau + Angebot "Neu mit Vorschau starten"
  const [preview, setPreview] = useState<{ accountId: string; title: string } | null>(null);
  const [restartOffer, setRestartOffer] = useState<{ accountId: string; message: string } | null>(null);

  const titleFor = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    const app = SUPPORTED_APPS.find((x) => x.id === acc?.app?.toLowerCase());
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

  const handleLaunch = async (accountId: string, withPreview = false) => {
    try {
      setActiveActionId(accountId);
      setRestartOffer(null);
      const res = await fetch(`/api/app-accounts/${encodeURIComponent(accountId)}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withPreview }),
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

  const openAddDialog = (app: SupportedAppConfig) => {
    setTargetApp(app);
    setNewLabel("");
    setNewEmail("");
    setDialogOpen(true);
  };

  const renderDropdownContent = (app: SupportedAppConfig, appAccounts: AppAccountUI[], activeAccount?: AppAccountUI) => (
    <DropdownMenuContent
      align="end"
      className={cn(
        "w-64 p-1.5 shadow-xl",
        isDesignV2
          ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] backdrop-blur-md shadow-[var(--p-shadow-lg)]"
          : "rounded-xl",
      )}
    >
      <DropdownMenuLabel
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider px-2 py-1",
          isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
        )}
      >
        {app.name} Profile
      </DropdownMenuLabel>

      {appAccounts.map((acc) => (
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
      ))}

      {appAccounts.length === 0 ? (
        <div className={cn("px-2.5 py-2 text-xs italic", isDesignV2 ? "text-[var(--p-text-dim)]" : "text-muted-foreground")}>
          Noch keine Accounts gespeichert.
        </div>
      ) : null}

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
          "gap-2 px-2.5 py-2 text-xs font-medium cursor-pointer transition-colors",
          isDesignV2
            ? "rounded-[var(--p-radius-md)] text-[var(--p-accent)] hover:text-[var(--p-accent-hover)] hover:bg-[var(--p-accent-subtle)]"
            : "rounded-lg text-primary",
        )}
        onClick={() => openAddDialog(app)}
      >
        <IconPlus className="size-3.5" />
        + Account hinzufügen
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <>
      {isDesignV2 ? (
        <SidebarSection
          title="APPS"
          badge={SUPPORTED_APPS.length}
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
          ) : (
            <div className="flex flex-col gap-0.5 w-full">
              {SUPPORTED_APPS.map((app) => {
                const appAccounts = accounts.filter(
                  (a) => a.app.toLowerCase() === app.id.toLowerCase(),
                );
                const activeAccount = appAccounts.find((a) => a.isActive) || appAccounts[0];
                const Icon = app.icon;

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
                              : "Kein Profil eingerichtet"
                          }
                          status={activeAccount ? "online" : undefined}
                          badge={appAccounts.length > 0 ? `${appAccounts.length}` : undefined}
                          leftAccessory={
                            <div
                              className="size-6 rounded-[var(--p-radius-sm)] flex items-center justify-center shrink-0 shadow-xs"
                              style={{ background: app.gradient }}
                            >
                              <Icon className="size-3.5 text-white drop-shadow-xs" />
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
                    {renderDropdownContent(app, appAccounts, activeAccount)}
                  </DropdownMenu>
                );
              })}
            </div>
          )}
        </SidebarSection>
      ) : (
        <SidebarGroup className="gap-0.5 p-0 px-2 py-1 w-full group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <SectionLabel>Apps ({SUPPORTED_APPS.length})</SectionLabel>

          {statusMsg ? (
            <div className="rounded-lg bg-primary/10 px-2 py-1 text-[11px] text-primary">
              {statusMsg}
            </div>
          ) : null}

          {restartOffer ? (
            <div className="my-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
              <p className="mb-1.5">{restartOffer.message}</p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-7 rounded-lg px-2 text-[11px]"
                  disabled={activeActionId === restartOffer.accountId}
                  onClick={() => handleLaunch(restartOffer.accountId, true)}
                >
                  Neu mit Vorschau starten
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-lg px-2 text-[11px]"
                  onClick={() => setRestartOffer(null)}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-0.5 w-full">
            {SUPPORTED_APPS.map((app) => {
              const appAccounts = accounts.filter(
                (a) => a.app.toLowerCase() === app.id.toLowerCase(),
              );
              const activeAccount = appAccounts.find((a) => a.isActive) || appAccounts[0];
              const Icon = app.icon;

              return (
                <div
                  key={app.id}
                  title={app.name}
                  className={`group/item ${GROUP_ROW_CLASS} cursor-default`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
                    <FolderTile gradient={app.gradient} center={<Icon className="size-[18px]" stroke={2} />} />
                    <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                      <div className="flex min-w-0 items-center">
                        <RowName>{app.name}</RowName>
                        <CountPill count={appAccounts.length} />
                      </div>
                      <p className="truncate text-[11px] text-sidebar-foreground/45">
                        {activeAccount
                          ? activeAccount.email || activeAccount.label
                          : "Kein Profil eingerichtet"}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons: Switcher / Launch */}
                  <div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:hidden">
                    {activeAccount ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-foreground/10 hover:text-emerald-400"
                        title={`${app.name} (${activeAccount.label}) starten`}
                        onClick={() => handleLaunch(activeAccount.id)}
                        disabled={activeActionId === activeAccount.id}
                      >
                        <IconPlayerPlay className="size-3.5" />
                      </Button>
                    ) : null}

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                            title="Accounts verwalten"
                          />
                        }
                      >
                        <IconChevronDown className="size-3.5" />
                      </DropdownMenuTrigger>
                      {renderDropdownContent(app, appAccounts, activeAccount)}
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </SidebarGroup>
      )}

      {/* Apps vom PC: Klick oeffnet das installierte Programm direkt am Rechner. */}
      <PcAppsSection />

      {/* Dialog for adding an account */}
      {targetApp ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            className={cn(
              "max-w-md p-6 shadow-2xl",
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
                <targetApp.icon
                  className={cn(
                    "size-5",
                    isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
                  )}
                />
                Neuen {targetApp.name} Account hinzufügen
              </DialogTitle>
              <DialogDescription
                className={cn(
                  "text-xs",
                  isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
                )}
              >
                {targetApp.loginHint}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3 py-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="account-label"
                  className={cn(
                    "text-xs font-medium",
                    isDesignV2 && "text-[var(--p-text-2)]",
                  )}
                >
                  Bezeichnung / Profil-Name
                </Label>
                <Input
                  id="account-label"
                  placeholder="z. B. Privat, Firma, Work 2"
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

              <div className="space-y-1.5">
                <Label
                  htmlFor="account-email"
                  className={cn(
                    "text-xs font-medium",
                    isDesignV2 && "text-[var(--p-text-2)]",
                  )}
                >
                  E-Mail (optional)
                </Label>
                <Input
                  id="account-email"
                  type="email"
                  placeholder="name@beispiel.de"
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

              <div
                className={cn(
                  "p-2.5 text-[11px]",
                  isDesignV2
                    ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] text-[var(--p-text-3)] border border-[var(--p-border-subtle)]"
                    : "rounded-xl bg-sidebar-accent/50 text-muted-foreground border border-sidebar-border/30",
                )}
              >
                Datenordner wird isoliert unter{" "}
                <code
                  className={cn(
                    "font-mono text-[10px]",
                    isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                  )}
                >
                  %LOCALAPPDATA%\ConnectAgents\accounts\{targetApp.id}\...
                </code>{" "}
                angelegt.
              </div>
            </DialogBody>

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
                onClick={() => setDialogOpen(false)}
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
                disabled={loading || !newLabel.trim()}
              >
                <IconDeviceFloppy className="size-3.5" />
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {preview ? (
        <AppPreviewPanel
          accountId={preview.accountId}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

export default AppsSection;
