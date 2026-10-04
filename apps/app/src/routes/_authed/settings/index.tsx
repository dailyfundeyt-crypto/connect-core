import { createFileRoute } from "@tanstack/react-router";
import { SidebarShell } from "@/components/layout/sidebar-shell";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import React, { useEffect, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconBolt,
  IconCloudUpload,
  IconDownload,
  IconKeyboard,
  IconLock,
  IconMail,
  IconPlus,
  IconPlugConnected,
  IconRefresh,
  IconTrash,
  IconChevronDown,
  IconBell,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { SaveToast } from "@/components/settings/save-toast";
import { DeleteConfirmDialog } from "@/components/settings/delete-confirm-dialog";
import { ErweitertPanel } from "@/components/settings/erweitert-panel";
import { ProfileEditDialog } from "@/components/settings/profile-edit-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  getLocalProfile,
  subscribeLocalProfile,
} from "@/lib/auth/local-profile";
import {
  getLabPrefs,
  subscribeLabPrefs,
} from "@/lib/ui/lab-prefs";
import {
  getVoiceSettings,
  subscribeVoiceSettings,
} from "@/lib/voice/elevenlabs";
import { useTheme } from "@/components/theme-provider";
import { LanguageSwitcher } from "@/components/i18n/language-gate";
import { cn } from "@/lib/utils";

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
        <IconChevronDown
          className={cn(
            "size-3 text-[#444] transition-transform duration-150",
            !open && "-rotate-90",
          )}
        />
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
  variant = "ghost",
  danger = false,
}: {
  label: string;
  description?: string;
  onClick?: () => void;
  variant?: "ghost" | "outline" | "destructive";
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
        variant={danger ? "destructive" : variant}
        className={cn(
          !danger && variant === "ghost" && "border border-white/10 text-[#888] hover:border-white/20 hover:text-white",
          variant === "outline" && "border border-white/10 text-[#888] hover:border-white/20 hover:text-white",
        )}
      >
        {label}
      </Button>
    </div>
  );
}

function AddRow({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex w-full cursor-pointer items-center gap-2 py-3 text-sm text-[#555] transition-colors hover:text-white"
      onClick={onClick}
      type="button"
    >
      <IconPlus className="size-4" />
      {label}
    </button>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-[#111] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors duration-150",
            value === opt.value
              ? "bg-[#1f1f1f] text-white"
              : "text-[#666] hover:text-[#aaa]",
          )}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Dark pill input ──────────────────────────────────────────────────────────

function DarkInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#555]">
          {label}
        </span>
      )}
      <input
        className="h-9 w-full rounded-full border-0 bg-[#161616] px-4 text-sm text-white placeholder:text-[#444]"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
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
  const [dark, setDark] = useTheme();
  const { data: currentUser } = React.useQuery(currentUserQueryOptions());
  const [telemetry, setTelemetry] = useState(() => getTelemetryEnabled());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labKeepLogin, setLabKeepLogin] = useState(() => getLabPrefs().keepLoggedIn);

  // Helium connection status (mock — real impl would call /api/helium/status)
  const [heliumStatus, setHeliumStatus] = useState<"ok" | "offline">("ok");

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

  useEffect(() => subscribeLocalProfile(() => setProfile(getLocalProfile())), []);
  useEffect(
    () => subscribeLabPrefs(() => setLabKeepLogin(getLabPrefs().keepLoggedIn)),
    [],
  );

  const avatarSrc = profile.avatarUrl || currentUser?.image || undefined;

  const handleDarkToggle = (checked: boolean) => {
    setDark(checked);
    triggerSave();
  };

  const handleTelemetryToggle = (checked: boolean) => {
    setTelemetryEnabled(checked);
    setTelemetry(checked);
    triggerSave();
  };

  const handleDeleteData = () => {
    try {
      localStorage.clear();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      window.location.reload();
    } catch {
      // fallback
      window.location.reload();
    }
  };

  return (
    <>
      {/* Save indicator */}
      <SaveToast savedAt={savedAt} />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        confirmWord="LÖSCHEN"
        description="Alle lokalen Connect-Daten werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        onConfirm={handleDeleteData}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="Alle Daten löschen"
      />

      {/* Profile dialog */}
      <ProfileEditDialog onOpenChange={setProfileOpen} open={profileOpen} />

      {/* ── Minimalist settings page ── */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#000]">
        <div className="mx-auto flex w-full max-w-[560px] flex-col px-6 pb-16 pt-8">
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

          {/* Title */}
          <h1 className="mb-8 text-2xl font-bold text-white">Einstellungen</h1>

          {/* ── 1. Konto ── */}
          <Section id="konto" label="Konto">
            {/* Profil */}
            <Row label="Name & Foto" description={profile.name !== "Connect User" && profile.name.trim() ? profile.name : "Noch nicht gesetzt"}>
              <div className="flex items-center gap-2">
                <div className="size-8 overflow-hidden rounded-full bg-[#1f1f1f]">
                  {avatarSrc ? (
                    <img alt="" className="size-full object-cover" referrerPolicy="no-referrer" src={avatarSrc} />
                  ) : null}
                </div>
                <Button onClick={() => setProfileOpen(true)} size="sm" type="button" variant="outline" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                  Bearbeiten
                </Button>
              </div>
            </Row>

            {/* Anmelde-Sitzungen */}
            <Row label="Anmelde-Sitzungen" description="Aktive Sitzungen anzeigen und beenden">
              <Button render={(props) => <Link {...props} to="/settings" hash="security" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Anzeigen
              </Button>
            </Row>

            {/* Abmelden */}
            <Row label="Abmelden" description="Sitzung beenden und zur Anmeldung">
              <Button render={(props) => <Link {...props} to="/sign" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Abmelden
              </Button>
            </Row>
          </Section>

          {/* ── 2. Konnektoren ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="konnektoren" label="Konnektoren">
            {/* E-Mail-Konten */}
            <Row label="E-Mail-Konten" description="IMAP/SMTP für E-Mail-basierte Kanäle">
              <Button size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                <IconPlus className="mr-1 size-3.5" />
                Hinzufügen
              </Button>
            </Row>

            {/* Cloud-Sync */}
            <Row label="Cloud-Sync" description="Google Drive Backup">
              <Button render={(props) => <Link {...props} to="/settings" hash="backup" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Öffnen
              </Button>
            </Row>

            {/* Helium-Verbindung */}
            <Row label="Helium-Verbindung" description={heliumStatus === "ok" ? "Verbunden" : "Offline"}>
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", heliumStatus === "ok" ? "bg-emerald-500" : "bg-red-500")} />
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
            {/* Shortcut */}
            <Row label="Shortcut" description="Tastenkürzel zum Öffnen der Shell">
              <div className="flex items-center gap-2">
                <code className="rounded bg-[#1f1f1f] px-2 py-1 text-xs text-[#888]">{shellShortcut}</code>
                <Button
                  render={(props) => (
                    <a href="chrome://extensions/shortcuts" rel="noopener noreferrer" target="_blank" {...props}>
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

            {/* Apple-Dot Verhalten */}
            <Row label="Apple-Dot Verhalten" description="Sichtbarkeit und Pin-Verhalten pro Domain">
              <Button render={(props) => <Link {...props} to="/settings" hash="apple-dot" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Konfigurieren
              </Button>
            </Row>

            {/* Browser-Gruppen-Defaults */}
            <Row label="Browser-Gruppen" description="Standard-Gruppen für neue Tabs">
              <Button render={(props) => <Link {...props} to="/settings" hash="browser-groups" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Bearbeiten
              </Button>
            </Row>
          </Section>

          {/* ── 4. Connect-Agenten ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="connect-agenten" label="Connect-Agenten">
            {/* Standard-Agent */}
            <Row label="Standard-Agent" description="Agent für neue Chats">
              <Button render={(props) => <Link {...props} to="/agents" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Auswählen
              </Button>
            </Row>

            {/* Agent-Liste */}
            <Row label="Agent-Liste" description="Alle Agents verwalten">
              <Button render={(props) => <Link {...props} to="/agents" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Öffnen
              </Button>
            </Row>

            {/* API-Keys */}
            <Row label="API-Keys" description="Globale Keys für alle Agents">
              <Button render={(props) => <Link {...props} to="/settings" hash="api-keys" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Verwalten
              </Button>
            </Row>

            {/* MCP-Server */}
            <Row label="MCP-Server" description="Model Context Protocol Server">
              <Button render={(props) => <Link {...props} to="/settings/mcp" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Öffnen
              </Button>
            </Row>
          </Section>

          {/* ── 5. Benachrichtigungen ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="benachrichtigungen" label="Benachrichtigungen">
            <Row label="Push-Benachrichtigungen" description="Desktop-Benachrichtigungen">
              <Switch
                aria-label="Push"
                checked={true}
                onCheckedChange={(checked) => { triggerSave(); }}
              />
            </Row>
            <Row label="E-Mail-Benachrichtigungen" description="Updates und Alerts per E-Mail">
              <Switch
                aria-label="E-Mail"
                checked={false}
                onCheckedChange={(checked) => { triggerSave(); }}
              />
            </Row>
            <Row label="Quiet Hours" description="Keine Benachrichtigungen von … bis">
              <Button size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Konfigurieren
              </Button>
            </Row>
          </Section>

          {/* ── 6. Datenschutz ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="datenschutz" label="Datenschutz">
            <Row label="Lokale Daten" description="Datenbank und Cache auf diesem Gerät">
              <Button render={(props) => <Link {...props} to="/settings" hash="storage" />} size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                Anzeigen
              </Button>
            </Row>
            <Row label="Telemetrie" description="Anonyme Nutzungsstatistiken">
              <Switch
                aria-label="Telemetrie"
                checked={telemetry}
                onCheckedChange={handleTelemetryToggle}
              />
            </Row>
            <Row label="Daten exportieren" description="Alle Daten als JSON herunterladen">
              <Button size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
                <IconDownload className="mr-1 size-3.5" />
                Export
              </Button>
            </Row>
            <ActionRow
              label="Daten löschen"
              description="Alle lokalen Connect-Daten dauerhaft entfernen"
              danger
              onClick={() => setDeleteOpen(true)}
            />
          </Section>

          {/* ── 7. Über ── */}
          <div className="mt-8 border-t border-white/[0.06]" />
          <Section id="uber" label="Über">
            <Row label="Version" description={`Connect App · Build ${import.meta.env.VITE_APP_VERSION ?? "dev"}`}>
              <span className="text-xs text-[#555]">v{import.meta.env.VITE_APP_VERSION ?? "dev"}</span>
            </Row>
            <Row label="Logs öffnen" description="Browser-Konsole und Server-Logs">
              <Button
                onClick={() => {
                  try {
                    (window as unknown as { __openLogs__?: () => void }).__openLogs__?.();
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
            <Row label="Feedback" description="Problem melden oder Feature vorschlagen">
              <Button size="sm" type="button" variant="ghost" className="border border-white/10 text-[#888] hover:border-white/20 hover:text-white">
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
    </>
  );
}
