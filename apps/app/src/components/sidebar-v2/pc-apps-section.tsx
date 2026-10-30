import {
  IconAppWindow,
  IconCheck,
  IconLoader2,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarGroup } from "@/components/ui/sidebar";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { ListRow, SidebarSection } from "@/v06/design";
import {
  CountPill,
  FolderTile,
  GROUP_ROW_CLASS,
  RowName,
  SectionLabel,
} from "./group-row";

/**
 * PC-Apps: installierte Programme vom Rechner (z. B. Obsidian) in der Sidebar.
 * Ein Klick startet die App direkt auf diesem PC - kein Spiegelbild, keine Vorschau.
 */

interface PcAppAccount {
  id: string;
  app: string;
  label: string;
  metadata?: Record<string, unknown> | null;
}

interface InstalledPcApp {
  name: string;
  path: string;
}

const PC_APP_GRADIENT = "linear-gradient(to bottom, #c4b5fd, #7c3aed)";

function fileName(targetPath: string): string {
  return targetPath.split(/[\\/]/).filter(Boolean).pop() || targetPath;
}

function pathOf(account: PcAppAccount): string {
  const value = account.metadata?.path;
  return typeof value === "string" ? value : "";
}

export function PcAppsSection() {
  const isDesignV2 = getFlag("designV2");
  const [accounts, setAccounts] = useState<PcAppAccount[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [installed, setInstalled] = useState<InstalledPcApp[]>([]);
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedError, setInstalledError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPath, setManualPath] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/app-accounts");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.accounts)) {
        setAccounts(
          (data.accounts as PcAppAccount[]).filter(
            (account) => account.app?.toLowerCase() === "pc",
          ),
        );
      }
    } catch {
      // Sidebar bleibt einfach leer, wenn der Server nicht antwortet.
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const flash = (text: string, error = false) => {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 5000);
  };

  const alreadyAdded = useMemo(() => {
    const set = new Set<string>();
    for (const account of accounts) {
      const target = pathOf(account).toLowerCase();
      if (target) set.add(target);
    }
    return set;
  }, [accounts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return installed;
    return installed.filter(
      (app) =>
        app.name.toLowerCase().includes(needle) ||
        app.path.toLowerCase().includes(needle),
    );
  }, [installed, query]);

  const loadInstalled = async () => {
    setInstalledLoading(true);
    setInstalledError(null);
    try {
      const res = await fetch("/api/pc-apps");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Liste konnte nicht geladen werden.");
      }
      setInstalled(Array.isArray(data.apps) ? data.apps : []);
    } catch (error) {
      setInstalled([]);
      setInstalledError(
        error instanceof Error
          ? error.message
          : "Liste konnte nicht geladen werden.",
      );
    } finally {
      setInstalledLoading(false);
    }
  };

  const openDialog = () => {
    setDialogOpen(true);
    setQuery("");
    setManualName("");
    setManualPath("");
    void loadInstalled();
  };

  const addApp = async (name: string, targetPath: string) => {
    if (!name.trim() || !targetPath.trim()) return;
    setAdding(targetPath);
    try {
      const res = await fetch("/api/app-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app: "pc",
          label: name.trim(),
          metadata: { path: targetPath.trim(), name: name.trim() },
        }),
      });
      if (!res.ok) {
        throw new Error("App konnte nicht gespeichert werden.");
      }
      await fetchAccounts();
      setDialogOpen(false);
      flash(
        `„${name.trim()}“ hinzugefügt – Klick öffnet die App auf diesem PC.`,
      );
    } catch (error) {
      setInstalledError(
        error instanceof Error
          ? error.message
          : "App konnte nicht gespeichert werden.",
      );
    } finally {
      setAdding(null);
    }
  };

  const launchApp = async (account: PcAppAccount) => {
    setBusyId(account.id);
    try {
      const res = await fetch(
        `/api/app-accounts/${encodeURIComponent(account.id)}/launch`,
        {
          method: "POST",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        flash(
          data?.message || `„${account.label}“ konnte nicht geöffnet werden.`,
          true,
        );
      }
    } catch {
      flash(`„${account.label}“ konnte nicht geöffnet werden.`, true);
    } finally {
      setBusyId(null);
    }
  };

  const removeApp = async (account: PcAppAccount) => {
    setBusyId(account.id);
    try {
      await fetch(`/api/app-accounts/${encodeURIComponent(account.id)}`, {
        method: "DELETE",
      });
      await fetchAccounts();
    } finally {
      setBusyId(null);
    }
  };

  const addRow = (design: boolean) =>
    design ? (
      <ListRow
        compact
        clickable
        as="div"
        title="App vom PC hinzufügen"
        subtitle="Installierte Programme, z. B. Obsidian"
        leftAccessory={
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[var(--p-radius-sm)] border border-dashed border-[var(--p-border-strong)] text-[var(--p-text-3)]">
            <IconPlus className="size-3.5" />
          </div>
        }
        onClick={openDialog}
        className="py-1.5"
        data-testid="pc-apps-add"
      />
    ) : (
      <button
        className={cn(
          GROUP_ROW_CLASS,
          "cursor-pointer text-sidebar-foreground/70",
        )}
        data-testid="pc-apps-add"
        onClick={openDialog}
        type="button"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-sidebar-foreground/25">
          <IconPlus className="size-[18px]" stroke={2} />
        </span>
        <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-[13px] font-medium">
            App vom PC hinzufügen
          </span>
          <span className="block truncate text-[11px] text-sidebar-foreground/45">
            Installierte Programme, z. B. Obsidian
          </span>
        </span>
      </button>
    );

  const rows = (design: boolean) => (
    <>
      {accounts.map((account) => {
        const target = pathOf(account);
        const busy = busyId === account.id;
        if (design) {
          return (
            <ListRow
              key={account.id}
              compact
              clickable
              as="div"
              title={account.label}
              subtitle={target ? fileName(target) : "PC-App"}
              leftAccessory={
                <div
                  className="flex size-6 shrink-0 items-center justify-center rounded-[var(--p-radius-sm)] shadow-xs"
                  style={{ background: PC_APP_GRADIENT }}
                >
                  <IconAppWindow className="size-3.5 text-white drop-shadow-xs" />
                </div>
              }
              rightAccessory={
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    aria-label={`${account.label} öffnen`}
                    className="flex size-7 items-center justify-center rounded-lg text-[var(--p-text-3)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)] disabled:opacity-40"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void launchApp(account);
                    }}
                    type="button"
                  >
                    {busy ? (
                      <IconLoader2 className="size-3.5 animate-spin" />
                    ) : (
                      <IconPlayerPlay className="size-3" />
                    )}
                  </button>
                  <button
                    aria-label={`${account.label} entfernen`}
                    className="flex size-7 items-center justify-center rounded-lg text-[var(--p-text-3)] hover:bg-[var(--p-surface-2)] hover:text-red-400 disabled:opacity-40"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeApp(account);
                    }}
                    type="button"
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </span>
              }
              onClick={() => void launchApp(account)}
              className="py-1.5"
            />
          );
        }
        return (
          <div
            key={account.id}
            className={cn(GROUP_ROW_CLASS, "cursor-default")}
            title={target || account.label}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              onClick={() => void launchApp(account)}
              type="button"
            >
              <FolderTile
                center={<IconAppWindow className="size-[18px]" stroke={2} />}
                gradient={PC_APP_GRADIENT}
              />
              <span className="block min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <RowName>{account.label}</RowName>
                <span className="block truncate text-[11px] text-sidebar-foreground/45">
                  {target ? fileName(target) : "PC-App"}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:hidden">
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-foreground/10 hover:text-emerald-400"
                disabled={busy}
                onClick={() => void launchApp(account)}
                title={`${account.label} auf dem PC öffnen`}
              >
                {busy ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconPlayerPlay className="size-3.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-red-400"
                disabled={busy}
                onClick={() => void removeApp(account)}
                title="Aus der Sidebar entfernen"
              >
                <IconTrash className="size-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
      {addRow(design)}
      {message ? (
        <p
          className={cn(
            "px-2 py-1 text-[11px] leading-snug",
            message.error ? "text-red-400" : "text-emerald-500",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      {isDesignV2 ? (
        <SidebarSection
          title="PC-Apps"
          badge={accounts.length}
          collapsible
          defaultExpanded
          className="px-1"
        >
          <div
            className="flex w-full flex-col gap-0.5"
            data-testid="pc-apps-section"
          >
            {rows(true)}
          </div>
        </SidebarSection>
      ) : (
        <SidebarGroup className="w-full gap-0.5 p-0 px-2 py-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <SectionLabel>
            <span className="flex items-center gap-1.5">
              PC-Apps
              <CountPill count={accounts.length} />
            </span>
          </SectionLabel>
          <div
            className="flex w-full flex-col gap-0.5"
            data-testid="pc-apps-section"
          >
            {rows(false)}
          </div>
        </SidebarGroup>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={cn(
            "max-w-md p-6 shadow-2xl",
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border-strong)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)]"
              : "rounded-2xl border-sidebar-border bg-card",
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "flex items-center gap-2 text-base font-semibold",
                isDesignV2 && "text-[var(--p-text-1)]",
              )}
            >
              <IconAppWindow
                className={cn(
                  "size-5",
                  isDesignV2 ? "text-[var(--p-accent)]" : "text-primary",
                )}
              />
              App vom PC hinzufügen
            </DialogTitle>
            <DialogDescription
              className={cn(
                "text-xs",
                isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
              )}
            >
              Programme aus dem Startmenü dieses PCs. Ein Klick in der Sidebar
              öffnet die App direkt auf dem Rechner.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 py-3">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className={cn(
                  "h-9 pl-8 text-xs",
                  isDesignV2 ? "rounded-[var(--p-radius-md)]" : "rounded-xl",
                )}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Suchen, z. B. Obsidian"
                value={query}
              />
            </div>

            {installedError ? (
              <p className="text-[11px] text-red-400">{installedError}</p>
            ) : null}

            <div
              className={cn(
                "max-h-64 overflow-auto rounded-xl border",
                isDesignV2
                  ? "border-[var(--p-border)]"
                  : "border-sidebar-border/60",
              )}
            >
              {installedLoading ? (
                <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <IconLoader2 className="size-3.5 animate-spin" /> Lade
                  installierte Programme…
                </p>
              ) : null}
              {!installedLoading && filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Keine Programme gefunden. Pfad unten direkt eintragen.
                </p>
              ) : null}
              {!installedLoading &&
                filtered.map((app) => {
                  const added = alreadyAdded.has(app.path.toLowerCase());
                  const busy = adding === app.path;
                  return (
                    <button
                      className="flex w-full items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/40 disabled:cursor-default disabled:opacity-60"
                      disabled={added || adding !== null}
                      key={app.path}
                      onClick={() => void addApp(app.name, app.path)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {app.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {app.path}
                        </span>
                      </span>
                      {busy ? (
                        <IconLoader2 className="size-4 shrink-0 animate-spin" />
                      ) : added ? (
                        <IconCheck className="size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <IconPlus className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
            </div>

            <div
              className={cn(
                "space-y-2 rounded-xl border p-3",
                isDesignV2
                  ? "border-[var(--p-border-subtle)] bg-[var(--p-surface-1)]"
                  : "border-sidebar-border/50 bg-sidebar-accent/30",
              )}
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                Nicht im Startmenü? Pfad angeben
              </p>
              <div className="space-y-1">
                <Label className="text-[11px]" htmlFor="pc-app-name">
                  Name
                </Label>
                <Input
                  className="h-8 text-xs"
                  id="pc-app-name"
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="z. B. Obsidian"
                  value={manualName}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]" htmlFor="pc-app-path">
                  Pfad (.exe oder .lnk)
                </Label>
                <Input
                  className="h-8 text-xs"
                  id="pc-app-path"
                  onChange={(event) => setManualPath(event.target.value)}
                  placeholder="Pfad zur .exe oder .lnk eintragen"
                  value={manualPath}
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              className="text-xs"
              disabled={
                !manualName.trim() || !manualPath.trim() || adding !== null
              }
              onClick={() => void addApp(manualName, manualPath)}
              size="sm"
              variant={isDesignV2 ? "outline" : "default"}
            >
              <IconPlus className="size-3.5" />
              Pfad hinzufügen
            </Button>
            <Button
              className="text-xs"
              onClick={() => setDialogOpen(false)}
              size="sm"
              variant="ghost"
            >
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PcAppsSection;
