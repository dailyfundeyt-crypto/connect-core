import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconDownload,
  IconMail,
  IconPlus,
  IconRefresh,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SaveToast } from "@/components/settings/save-toast";
import { DeleteConfirmDialog } from "@/components/settings/delete-confirm-dialog";
import { ErweitertPanel } from "@/components/settings/erweitert-panel";
import { ProfileEditDialog } from "@/components/settings/profile-edit-dialog";
import { SettingsOverview } from "@/components/settings/settings-overview";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import {
  getLabPrefs,
  subscribeLabPrefs,
} from "@/lib/ui/lab-prefs";
import {
  getLocalProfile,
  subscribeLocalProfile,
} from "@/lib/auth/local-profile";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { SidebarShell } from "@/components/layout/sidebar-shell";

// ─── Auto-save hook ──────────────────────────────────────────────────────────

function useAutoSave() {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSavedAt(Date.now());
    timerRef.current = setTimeout(() => setSavedAt(null), 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { savedAt, triggerSave };
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section id={id}>
      <button
        className="flex w-full cursor-pointer items-center gap-2 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#666]">
          {label}
        </span>
        <svg
          className={cn(
            "size-3 text-[#444] transition-transform duration-150",
            !open && "-rotate-90",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out",
          open ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="flex flex-col">{children}</div>
      </div>
    </section>
  );
}

// ─── Row primitives ──────────────────────────────────────────────────────────

function Row({
  label,
  description,
  children,
  border = true,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3",
        border && "border-b border-white/[0.06]",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-[#666]">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function ActionRow({
  label,
  description,
  onClick,
  danger = false,
}: {
  label: string;
  description?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/[0.06]">
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", danger ? "text-red-400" : "text-white")}>
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-[#666]">{description}</p>
        )}
      </div>
      <Button
        onClick={onClick}
        size="sm"
        type="button"
        variant={danger ? "destructive" : "ghost"}
        className={cn(
          !danger && "border border-white/10 text-[#888] hover:border-white/20 hover:text-white",
        )}
      >
        {label}
      </Button>
    </div>
  );
}

// ─── Telemetry / privacy helpers ──────────────────────────────────────────────

function getTelemetryEnabled(): boolean {
  try {
    return localStorage.getItem("connect.telemetry") !== "off";
  } catch {
    return true;
  }
}

function setTelemetryEnabled(v: boolean) {
  try {
    localStorage.setItem("connect.telemetry", v ? "on" : "off");
  } catch {
    // ignore
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { savedAt, triggerSave } = useAutoSave();
  const [profile, setProfile] = useState(() => getLocalProfile());
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: currentUser } = React.useQuery(currentUserQueryOptions());
  const [telemetry, setTelemetry] = useState(() => getTelemetryEnabled());
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Helium connection status (mock)
  const [heliumStatus] = useState<"ok" | "offline">("ok");

  // Shell shortcut hint
  const [shellShortcut] = useState(() => {
    try {
      const raw = localStorage.getItem("connect.shortcuts");
      if (raw) {
        const map = JSON.parse(raw) as Record<string, { key?: string }>;
        return map["shell-toggle"]?.key || "Strg+Shift+Y";
      }
    } catch { /* ignore */ }
    return "Strg+Shift+Y";
  });

  // Read hash from URL for sidebar highlighting and scroll-to-section
  const [hash, setHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash.replace("#", "") : "",
  );

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "");
      setHash(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Scroll to hash section when hash changes
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [hash]);

  useEffect(
    () => subscribeLocalProfile(() => setProfile(getLocalProfile())),
    [],
  );

  const avatarSrc = profile.avatarUrl || currentUser?.image || undefined;

  const handleTelemetryToggle = (checked: boolean) => {
    setTelemetryEnabled(checked);
    setTelemetry(checked);
    triggerSave();
  };

  const handleDeleteData = () => {
    try {
      localStorage.clear();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <SidebarShell className="h-svh overflow-hidden" width="300px">
      {/* Settings sidebar — 3 collapsible groups */}
      <SettingsSidebar activeHash={hash} />

      {/* Content pane */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#000]">
        {/* When no hash: show the overview */}
        {!hash && <SettingsOverview />}

        {/* Settings panels — always rendered so all hashes are available */}
        <div
          className={cn(
            "mx-auto flex w-full max-w-[560px] flex-col px-6 pb-16",
            !hash ? "pt-0" : "pt-8",
          )}
        >
          {/* Back */}
          <div className="mb-6 flex items-center">
            <Button
              render={(props) => (
                <Link {...props} to="/">
                  <IconArrowLeft className="mr-1 size-4" />
                  Zurück
                </Link>
              )}
              size="sm"
              type="button"
              variant="ghost"
              className="text-[#666] hover:text-white"
            />
          </div>

          {/* ── 1. Konto ── */}
          <Section id="konto" label="Konto">
            <Row
              description={
                profile.name !== "Connect User" && profile.name.trim()
                  ? profile.name
                  : "Noch nicht gesetzt"
              }
              label="Name & Foto"
            >
              <div className="flex items-center gap-2">
                <div className="size-8 overflow-hidden rounded-full bg-[#1f1f1f]">
                  {avatarSrc ? (
                    <img
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                      src={avatarSrc}
                    />
                  ) : null}
                </div>
                <Button
                  onClick={() => setProfileOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                  className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
                >
                  Bearbeiten
                </Button>
              </div>
            </Row>

            <Row
              description="Aktive Sitzungen anzeigen und beenden"
              label="Anmelde-Sitzungen"
            >
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="security" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Anzeigen
              </Button>
            </Row>

            <Row
              description="Sitzung beenden und zur Anmeldung"
              label="Abmelden"
            >
              <Button
                render={(props) => <Link {...props} to="/sign" />}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Abmelden
              </Button>
            </Row>
          </Section>

          {/* ── 2. Konnektoren ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="konnektoren" label="Konnektoren">
            <Row
              description="IMAP/SMTP für E-Mail-basierte Kanäle"
              label="E-Mail-Konten"
            >
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                <IconPlus className="mr-1 size-3.5" />
                Hinzufügen
              </Button>
            </Row>

            <Row description="Google Drive Backup" label="Cloud-Sync">
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="backup" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Öffnen
              </Button>
            </Row>

            <Row
              description={heliumStatus === "ok" ? "Verbunden" : "Offline"}
              label="Helium-Verbindung"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    heliumStatus === "ok" ? "bg-emerald-500" : "bg-red-500",
                  )}
                />
                <Button
                  onClick={() => triggerSave()}
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
                >
                  <IconRefresh className="mr-1 size-3.5" />
                  Retry
                </Button>
              </div>
            </Row>
          </Section>

          {/* ── 3. Helium-Shell ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="helium-shell" label="Helium-Shell">
            <Row
              description="Tastenkürzel zum Öffnen der Shell"
              label="Shortcut"
            >
              <div className="flex items-center gap-2">
                <code className="rounded bg-[#1f1f1f] px-2 py-1 text-xs text-[#888]">
                  {shellShortcut}
                </code>
                <Button
                  render={(props) => (
                    <a
                      href="chrome://extensions/shortcuts"
                      rel="noopener noreferrer"
                      target="_blank"
                      {...props}
                    >
                      chrome://extensions/shortcuts
                    </a>
                  )}
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
                >
                  Ändern
                </Button>
              </div>
            </Row>

            <Row
              description="Sichtbarkeit und Pin-Verhalten pro Domain"
              label="Apple-Dot Verhalten"
            >
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="apple-dot" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Konfigurieren
              </Button>
            </Row>

            <Row
              description="Standard-Gruppen für neue Tabs"
              label="Browser-Gruppen"
            >
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="browser-groups" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Bearbeiten
              </Button>
            </Row>
          </Section>

          {/* ── 4. Connect-Agenten ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="connect-agenten" label="Connect-Agenten">
            <Row
              description="Agent für neue Chats"
              label="Standard-Agent"
            >
              <Button
                render={(props) => <Link {...props} to="/agents" />}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Auswählen
              </Button>
            </Row>

            <Row
              description="Alle Agents verwalten"
              label="Agent-Liste"
            >
              <Button
                render={(props) => <Link {...props} to="/agents" />}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Öffnen
              </Button>
            </Row>

            <Row
              description="Globale Keys für alle Agents"
              label="API-Keys"
            >
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="api-keys" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Verwalten
              </Button>
            </Row>

            <Row
              description="Model Context Protocol Server"
              label="MCP-Server"
            >
              <Button
                render={(props) => <Link {...props} to="/settings/mcp" />}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Öffnen
              </Button>
            </Row>
          </Section>

          {/* ── 5. Benachrichtigungen ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="benachrichtigungen" label="Benachrichtigungen">
            <Row
              description="Desktop-Benachrichtigungen"
              label="Push-Benachrichtigungen"
            >
              <Switch
                aria-label="Push"
                checked={true}
                onCheckedChange={() => {
                  triggerSave();
                }}
              />
            </Row>
            <Row
              description="Updates und Alerts per E-Mail"
              label="E-Mail-Benachrichtigungen"
            >
              <Switch
                aria-label="E-Mail"
                checked={false}
                onCheckedChange={() => {
                  triggerSave();
                }}
              />
            </Row>
            <Row
              description="Keine Benachrichtigungen von … bis"
              label="Quiet Hours"
            >
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Konfigurieren
              </Button>
            </Row>
          </Section>

          {/* ── 6. Datenschutz ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="datenschutz" label="Datenschutz">
            <Row
              description="Datenbank und Cache auf diesem Gerät"
              label="Lokale Daten"
            >
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="storage" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Anzeigen
              </Button>
            </Row>
            <Row
              description="Anonyme Nutzungsstatistiken"
              label="Telemetrie"
            >
              <Switch
                aria-label="Telemetrie"
                checked={telemetry}
                onCheckedChange={handleTelemetryToggle}
              />
            </Row>
            <Row
              description="Alle Daten als JSON herunterladen"
              label="Daten exportieren"
            >
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                <IconDownload className="mr-1 size-3.5" />
                Export
              </Button>
            </Row>
            <ActionRow
              danger
              description="Alle lokalen Connect-Daten dauerhaft entfernen"
              label="Daten löschen"
              onClick={() => setDeleteOpen(true)}
            />
          </Section>

          {/* ── 7. Über ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="uber" label="Über">
            <Row
              description={`Connect App · Build ${import.meta.env.VITE_APP_VERSION ?? "dev"}`}
              label="Version"
            >
              <span className="text-xs text-[#555]">
                v{import.meta.env.VITE_APP_VERSION ?? "dev"}
              </span>
            </Row>
            <Row
              description="Browser-Konsole und Server-Logs"
              label="Logs öffnen"
            >
              <Button
                onClick={() => {
                  try {
                    (
                      window as unknown as {
                        __openLogs__?: () => void;
                      }
                    ).__openLogs__?.();
                  } catch { /* ignore */ }
                  triggerSave();
                }}
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                Öffnen
              </Button>
            </Row>
            <Row
              description="Problem melden oder Feature vorschlagen"
              label="Feedback"
            >
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white"
              >
                <IconMail className="mr-1 size-3.5" />
                Feedback
              </Button>
            </Row>
          </Section>

          {/* ── Erweitert ── */}
          <ErweitertPanel />

          {/* Bottom spacer */}
          <div className="h-8" />
        </div>
      </div>

      {/* Dialogs */}
      <SaveToast savedAt={savedAt} />
      <DeleteConfirmDialog
        confirmWord="LÖSCHEN"
        description="Alle lokalen Connect-Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        onConfirm={handleDeleteData}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Alle Daten löschen"
      />
      <ProfileEditDialog
        onOpenChange={setProfileOpen}
        open={profileOpen}
      />
    </SidebarShell>
  );
}
