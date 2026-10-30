import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { getFlag } from "@/contracts/v06/flags";
import { SettingsShellV2 } from "@/v06/settings";
import { FocusChainSettingsPanel } from "@/components/settings/focus-chain-settings";
import { PhoneConnectPanel } from "@/components/settings/phone-connect-panel";
import { useQuery } from "@tanstack/react-query";
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
import { ApiKeysSettingsPanel } from "@/components/settings/api-keys-settings";
import { CompanySettingsPanel } from "@/components/settings/company-settings";
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
import { T3SettingsPanel } from "@/components/settings/t3";
import { MachinesSettingsPanel } from "@/components/settings/machines";
import { UsageT3View } from "@/components/usage-t3/UsageT3View";
import { VoiceSettingsPanel } from "@/components/settings/voice-settings";
import { CalendarSettingsPanel } from "@/components/calendar/calendar-settings-panel";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { DesktopControlSettingsPanel } from "@/components/settings/desktop-control-settings";
import {
  getLabPrefs,
  subscribeLabPrefs,
} from "@/lib/ui/lab-prefs";
import {
  getLocalProfile,
  subscribeLocalProfile,
} from "@/lib/auth/local-profile";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { SidebarShell } from "@/components/layout/sidebar-shell";
import { IconChevronLeft } from "@tabler/icons-react";
import { getT3Flag } from "@/lib/t3/contracts";

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

// ─── Inlined pages ────────────────────────────────────────────────────────────

/*
 * Four sidebar entries used to be separate routes: Brain and MCP were their own `PageShell` pages
 * under /settings, and Skills and Agents left /settings altogether. Everything else is a hash on
 * this page, so those four were the only menu items that left the settings screen — a sidebar
 * where clicking an item can drop you on a different page is a sidebar nobody can learn.
 *
 * Their components are page-level by construction: each renders its own heading, description and
 * `PageSection` spacing, and Brain is `width="wide"` because its graph needs the room. Rendering
 * them here would stack a second page title inside this one, so each is given the heading it
 * needs and the page wrapper is dropped. Nothing is reimplemented — the gallery, the MCP rows and
 * the whole Brain page are the same components the routes mounted, minus their `PageShell`.
 */

/** The MCP route, without its page shell. */
function McpSettingsInlinePanel() {
  return (
    <>
      <ConnectorGallery className="mt-2" pageSize={8} />
      <McpSettingsPanel />
    </>
  );
}

/**
 * Sync & Backup = Google-Drive-Sicherung + Online-Abgleich (Supabase).
 * Die Supabase-Karte war importiert, aber nie eingehängt; der Chip "Supabase-Sync" landete
 * deshalb auf einer Seite ohne Abgleich-Status (helium-mobile4).
 */
function SyncBackupPanel() {
  return (
    <>
      <DriveBackupPanel />
      <div className="mt-10">
        <SupabaseSyncCard />
      </div>
    </>
  );
}

/** The Brain route, without its page shell. */
function BrainInlinePanel() {
  return <BrainSettingsPage />;
}

/**
 * How much this device is holding for the site.
 *
 * Replaces a button that pointed at a `storage` hash no panel has ever claimed. `navigator.storage.
 * estimate()` is the only figure available without a backend, it covers the whole origin rather than
 * Connect's own keys, and it needs a secure context — so the reading is taken once on mount and the
 * row falls back to the plain description when the browser will not answer.
 */
function LocalStorageUsage() {
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    navigator.storage?.estimate?.().then(
      ({ quota = 0, usage: used = 0 }) => {
        if (cancelled) return;
        // A quota of zero is how an unavailable estimate reports, not an empty device.
        if (!quota) return;
        setUsage(`${formatBytes(used)} von ${formatBytes(quota)} belegt`);
      },
      () => {
        /* No estimate available — the description stands on its own. */
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Row
      description={
        usage
          ? `Datenbank und Cache auf diesem Gerät — ${usage}`
          : "Datenbank und Cache auf diesem Gerät"
      }
      label="Lokale Daten"
    >
      <span className="text-[#888] text-xs">auf diesem Gerät</span>
    </Row>
  );
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Bytes as a short human string — one decimal below 10, none above, so the number stays scannable. */
function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
}

// ─── Panel router ─────────────────────────────────────────────────────────────
//
// The sidebar (components/settings/settings-sidebar.tsx) links to 19 hashes. Each one now
// resolves to the panel component that was written for it. Before this map existed the panels
// were written but never rendered: every sidebar item pointed at a section id that no longer
// existed, so all 19 entries scrolled nowhere.
//
// `SettingsItemBackground` is deliberately absent — it is an SVG backdrop for the admin
// components pages, not a settings panel.

const PANELS: Record<string, React.ComponentType | null> = {
  appearance: AppearanceSettings,
  // Konto & Sicherheit
  profile: CompanySettingsPanel,
  companies: CompanySettingsPanel,
  security: null, // rendered inline below (session list)
  // Verbindungen
  "api-keys": ApiKeysSettingsPanel,
  "model-provider": ModelProviderSettingsPanel,
  "cli-providers": CliProvidersSettingsPanel,
  "model-one": ModelOnePanel,
  "mein-helium": MeinHeliumPanel,
  "connector-mapping": McpConnectorMappingPanel,
  "mcp": McpSettingsInlinePanel,
  // Lane 10 (Integration 2026-10-22)
  "mcp-grants": McpGrantsSettings,
  "email-agents": EmailAgentsSettings,
  "ubuntu-machines": UbuntuMachinesPanel,
  voice: VoiceSettingsPanel,
  calendar: CalendarSettingsPanel,
  // System & Hilfe
  "sync-backup": SyncBackupPanel,
  "browser-groups": BrowserGroupsPanel,
  brain: BrainInlinePanel,
  erweitert: ErweitertPanel,
  shortcuts: ShortcutsPanel,
  "standing-instructions": StandingInstructions,
  donate: DonatePanel,
  "deployment-mode": DeploymentModePanel,
  "codex-usage": CodexUsagePanel,
  fokus: FocusChainSettingsPanel,
  "handy-verbinden": PhoneConnectPanel,
  info: null, // rendered inline below
  privacy: null, // rendered inline below (Datenschutz)
  terms: null, // rendered inline below (Nutzungsbedingungen)
  // Per-Company Tool-Verwaltung (Marketplace-Integration)
  "company-tools": CompanyAppsSettingsPanel,
  // Sidebar-Tools an/aus (Schalter aus der Chat-Sidebar hierher verlegt, helium-sidebar)
  "sidebar-tools": SidebarToolsSettingsPanel,
  // Connect Desktop / Hitodama-Features Steuerung & Sicherheit
  "desktop-control": DesktopControlSettingsPanel,
  // T3-Backend (A25) — Flag `connect.t3.bridge`
  t3: T3SettingsPanel,
  // Cua-Maschinen (A26) — Flag `connect.t3.cuaMachines`
  machines: MachinesSettingsPanel,
  // Volle Nutzungsansicht (A24) — Flag `connect.t3.bridge`
  "nutzung-limits": UsageT3View,
};

/**
 * Flag to hide dead/mock legacy settings identified during the audit (Prompt 4.3).
 */
const SHOW_LEGACY_FIELDS = false;

/**
 * The section ids rendered inline at the bottom of /settings.
 *
 * `PANELS` leaves `security`, `info`, `privacy` and `terms` null on purpose — they were always
 * meant to be drawn by the inline stack, not by a panel component. The other five (`konto`,
 * `konnektoren`, `helium-shell`, `connect-agenten`, `benachrichtigungen`) had no entry at all,
 * which is what made their settings read as removed: nothing linked to them and they still took up
 * 2000px of scroll under the overview.
 *
 * A hash in this set makes the inline stack render. A section is therefore reachable as soon as
 * its id is listed here, and unreachable in no way at all.
 */
const INLINE_SECTIONS = new Set([
  "datenschutz",
  "security",
  "info",
  "privacy",
  "terms",
  "konto",
  "konnektoren",
  "helium-shell",
  "connect-agenten",
  "benachrichtigungen",
  "uber",
]);

/**
 * Alte bzw. doppelte Hashes → echtes Ziel (helium-mobile4). `#backup` kam aus dem Profilblatt der
 * Handy-Version, `#background` aus der Erweitert-Kachel; beide zeigten eine leere Seite.
 */
const HASH_ALIASES: Record<string, string> = {
  backup: "sync-backup",
  sync: "sync-backup",
  background: "erweitert",
  companies: "profile",
  usage: "codex-usage",
  timer: "fokus",
};

/**
 * Die Alias-Auflösung, mit dem Flag-Gedanken.
 *
 * `#usage` ist der alte Einstieg in die Nutzungsansicht. Mit T3-Brücke zeigt der
 * Menüpunkt die volle A24-Ansicht (Cost / Tokens / Limits) — der alte Hash führt
 * dann dorthin, statt zur Codex-Nutzung. Ohne Brücke bleibt er beim Codex-Panel.
 */
function resolveSettingsHash(rawHash: string): string {
  if (rawHash === "usage" && getT3Flag("bridge")) return "nutzung-limits";
  return HASH_ALIASES[rawHash] ?? rawHash;
}

/**
 * Auf dem Handy zeigt ein Hash aus dem Inline-Stapel NUR seinen Abschnitt (eine eigene Seite),
 * statt alle sieben Abschnitte untereinander. Diese Hashes haben keinen eigenen Abschnitt und
 * landen im passenden.
 */
const PHONE_SECTION_FOR: Record<string, string> = {
  security: "konto",
  info: "uber",
  privacy: "datenschutz",
  terms: "uber",
};

/** Titel der Kopfzeile auf dem Handy. */
const PHONE_TITLES: Record<string, string> = {
  profile: "Unternehmen & Profil",
  "api-keys": "API-Keys",
  "model-provider": "KI-Modelle",
  "connector-mapping": "Connector-Mapping",
  mcp: "MCP-Server",
  "ubuntu-machines": "Ubuntu-Maschinen",
  voice: "Stimme",
  "sync-backup": "Sync & Backup",
  "browser-groups": "Browser-Gruppen",
  "sidebar-tools": "Sidebar-Tools",
  "mein-helium": "Mein Helium",
  brain: "Brain",
  erweitert: "Erweitert",
  shortcuts: "Shortcuts",
  "standing-instructions": "Standing Instructions",
  donate: "Feedback & Unterstützen",
  "deployment-mode": "Deployment",
  "codex-usage": "Codex-Nutzung",
  appearance: "Darstellung",
  konto: "Konto",
  fokus: "Fokus",
  "desktop-control": "Desktop-Steuerung & Sicherheit",
  "handy-verbinden": "Handy verbinden",
  t3: "T3 Backend",
  machines: "Maschinen & Sandboxes",
  "nutzung-limits": "Nutzung & Limits",
  konnektoren: "Konnektoren",
  "helium-shell": "Helium-Shell",
  "connect-agenten": "Connect-Agenten",
  benachrichtigungen: "Benachrichtigungen",
  datenschutz: "Datenschutz",
  uber: "Über & Rechtliches",
};

/** Kontext: welcher Inline-Abschnitt auf dem Handy allein sichtbar ist (null = alle). */
const PhoneSectionContext = React.createContext<string | null>(null);

/**
 * True when a hash names something the settings page can actually show.
 *
 * A hash that is neither a registered panel nor an inline section would render an empty pane, so
 * this is what the overview checks before it advertises a destination.
 */
export function isKnownSettingsHash(hash: string): boolean {
  return hash in PANELS || INLINE_SECTIONS.has(hash);
}

/**
 * Desktop light palette, scoped to the light theme only.
 *
 * The section list and the sidebar were both written for a near-black pane with every colour
 * hardcoded: text-[#666] for a label, text-[#888] for a button, border-white/[0.06] for a divider,
 * and a separate set of shadcn sidebar tokens. Recolouring ~40 call sites by hand is the kind of
 * edit that silently misses one, and it did — an override that forced every grey to the same value
 * flattened the hierarchy that made the page readable.
 *
 * So the list now carries its own light/dark pairs on the elements that need them (see `Row` and
 * `Section`), and this stylesheet only does the two things CSS is better at than Tailwind here:
 * the surface colour, and the sidebar, which is built on tokens rather than literals. Scoping both
 * `html:not(.dark)` makes this page follow the same persisted theme as every other route.
 */
const DESKTOP_PALETTE = `
@media (min-width: 768px) {
  /* Light mode overrides only. Dark mode inherits the app-wide palette and token values. */
  html:not(.dark) .settings-pane { color: #1c1b19; }

  /*
   * The sidebar is a token-driven surface, so it takes a token override. Nothing else: every colour
   * on the rows is a real Tailwind class with a dark: pair, carried in the markup, so the same
   * markup is right on cream and on the phone's near-black without a stylesheet to keep in step.
   */
  html:not(.dark) .settings-shell {
    --sidebar: #efece6;
    --sidebar-foreground: #1c1b19;
    --sidebar-accent: rgba(28, 27, 25, 0.07);
    --sidebar-accent-foreground: #1c1b19;
    --sidebar-border: rgba(28, 27, 25, 0.12);
  }
  html:not(.dark) .settings-shell [data-slot="sidebar"] { background-color: #efece6; }
  html:not(.dark) .settings-shell [data-slot="sidebar-header"] { border-color: rgba(28, 27, 25, 0.12); }
  html:not(.dark) .settings-shell .bg-\\[\\#0a0a0a\\] { background-color: #e7e4de; }
  html:not(.dark) .settings-shell .bg-\\[\\#111\\] { background-color: #e2dfd9; }

  /*
   * The panel rows inside the pane are Item cards on the shadcn token set, so on cream they keep
   * the dark theme's transparent background and white border. Both are restored here — the one
   * place where a token override is right, because these are token-driven, not literal.
   */
  html:not(.dark) .settings-pane [data-slot="item"] {
    background-color: #fff;
    border-color: rgba(28, 27, 25, 0.10);
  }
  html:not(.dark) .settings-pane [data-slot="item"]:hover { background-color: #fbfaf8; }
  html:not(.dark) .settings-pane [data-slot="item-title"] { color: #1c1b19; }
  html:not(.dark) .settings-pane [data-slot="item-description"] { color: #6b6862; }
  html:not(.dark) .settings-pane [data-slot="item-actions"] .text-\\[\\#888\\] { color: #4a4741; }


  /*
   * The inline Oeffnen / Bearbeiten buttons are handled by GHOST_BUTTON in the markup, not here:
   * Tailwind v4 emits their border as a color-mix in oklab, so a rule written against the class name
   * does not match the element. Their labels still come from these two rules, which do match.
   */
  html:not(.dark) .settings-pane .text-\[\#888\] { color: #4a4741; }
  html:not(.dark) .settings-pane .hover\:text-white:hover { color: #1c1b19; }
}`;


function PanelOutlet({ hash }: { hash: string }) {
  const Panel = PANELS[hash];
  if (!Panel) return null;
  return (
    <div className={cn(hash === "brain" ? "h-full min-h-0" : "mb-8")}>
      <Panel />
    </div>
  );
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
  const phoneOnly = React.useContext(PhoneSectionContext);

  return (
    <section
      className={cn("mt-8 first:mt-0", phoneOnly && phoneOnly !== id && "max-md:hidden", phoneOnly === id && "max-md:mt-0")}
      id={id}
    >
      <button
        className="flex w-full cursor-pointer items-center gap-2 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {/*
         * The section label is a heading, not a caption. It was `text-[#666]` at 11px, which is a
         * body-grey at caption size — legible against black, a grey smudge against cream, and the
         * only thing separating one group of settings from the next. It is now near-black on the
         * light pane and full white on the dark one, at the weight a heading should carry.
         */}
        <span className="text-[11px] font-bold tracking-[0.12em] text-[#1c1b19] uppercase dark:text-white">
          {label}
        </span>
        <svg
          className={cn(
            "size-3 text-[#6b6862] transition-transform duration-150 dark:text-[#444]",
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
        {/*
         * The gap lives between the cards, not as a border on them. `gap-2` is the same rhythm the
         * panel rows use, so a setting looks the same here as it does inside a panel — the two
         * lists are the same idea drawn at two levels and they should not disagree.
         */}
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </section>
  );
}

// ─── Row primitives ──────────────────────────────────────────────────────────

/**
 * The ghost button every control in the section list uses.
 *
 * All ~30 of them were the same button written out in full, on the dark theme: a 10% white border
 * and a #888 label. On the cream pane that border is invisible and the label is light grey on
 * white, so a control that works looks disabled — and the border could not be fixed from a
 * stylesheet, because Tailwind v4 emits `border-white/10` as a color-mix in oklab and the class name
 * in a rule does not match what lands on the element.
 *
 * One constant with both themes on it is the fix: `dark:` carries the old values verbatim, so the
 * phone is unchanged, and the light values are real Tailwind classes that will compile.
 */
const GHOST_BUTTON = cn(
  "border-black/[0.16] text-[#3d3a35] hover:border-black/30 hover:text-[#1c1b19]",
  "dark:border-white/10 dark:text-[#888] dark:hover:border-white/20 dark:hover:text-white",
);

/**
 * One setting: a label, what it means, and the control that changes it.
 *
 * This is a card, not a line in a list. It used to be a bare row with a `border-b` at 6% white and
 * nothing else, which read as a list on a near-black pane and as unlined text on a light one — the
 * same markup looked finished in one theme and unfinished in the other, and no amount of colour
 * alone fixes a row that has no edge to be read against.
 *
 * The padding is on the card rather than between rows, so the gap does the grouping and a row with
 * a tall control next to a one-line description still reads as one block.
 */
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
        "rounded-lg border border-black/[0.07] bg-white/60 px-4 py-3",
        "transition-colors hover:bg-white/80 dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]",
        !border && "border-transparent bg-transparent hover:bg-transparent dark:hover:bg-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#1c1b19] dark:text-white">{label}</p>
          {description ? (
            <p className="mt-0.5 text-[#6b6862] text-xs dark:text-[#666]">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
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
    <div className="rounded-lg border border-black/[0.07] bg-white/60 px-4 py-3 transition-colors hover:bg-white/80 dark:border-white/[0.07] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium",
              danger ? "text-red-600 dark:text-red-400" : "text-[#1c1b19] dark:text-white",
            )}
          >
            {label}
          </p>
          {description ? (
            <p className="mt-0.5 text-[#6b6862] text-xs dark:text-[#666]">
              {description}
            </p>
          ) : null}
        </div>
        <Button
          onClick={onClick}
          size="sm"
          type="button"
          variant={danger ? "destructive" : "ghost"}
          className={cn(
            !danger &&
              "border-black/[0.14] text-[#4a4741] hover:border-black/25 hover:text-[#1c1b19] dark:border-white/10 dark:text-[#888] dark:hover:border-white/20 dark:hover:text-white",
          )}
        >
          {label}
        </Button>
      </div>
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
  if (getFlag("settingsV2")) {
    return <SettingsShellV2 />;
  }
  const { savedAt, triggerSave } = useAutoSave();
  const [profile, setProfile] = useState(() => getLocalProfile());
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: currentUser } = useQuery(currentUserQueryOptions());
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

  /*
   * Which panel is open, read from the URL.
   *
   * This used to be `useState` plus a `hashchange` listener, and the listener was the whole problem:
   * the sidebar links are TanStack `Link`s, so a click navigates with `history.pushState`, and
   * `pushState` does not fire `hashchange`. The URL updated, the state never did, and every panel
   * stayed closed — the sidebar highlighted an item and nothing appeared. A manual listener for a
   * browser event the router has already handled is also a second source of truth about the URL,
   * which is the part that goes wrong quietly.
   *
   * The router already tracks the hash, and it is the same object that performed the navigation, so
   * reading it from there cannot disagree with the address bar. Re-navigating to the same hash is
   * now a no-op rather than a missed update, and a browser back button lands on the previous panel
   * because the history entry was the router's all along.
   */
  const rawHash = useRouterState({
    select: (s) => s.location.hash.replace(/^#/, ""),
  });
  const hash = resolveSettingsHash(rawHash);
  const phoneSection = INLINE_SECTIONS.has(hash) ? (PHONE_SECTION_FOR[hash] ?? hash) : null;
  const phoneTitle = hash ? (PHONE_TITLES[phoneSection ?? hash] ?? "Einstellungen") : null;

  // Scroll to top when the hash changes. The hash now selects a panel (PanelOutlet) instead of
  // anchoring to an in-page section, so the previous scrollIntoView lookup found nothing — every
  // entry landed at the same scroll offset. Starting at the top is what makes each panel read as
  // its own page.
  useEffect(() => {
    document.getElementById("settings-scroll")?.scrollTo({ top: 0 });
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
    <SidebarShell
      className="h-svh overflow-hidden settings-shell"
      width="300px"
    >
      {/* Settings sidebar — 3 collapsible groups */}
      <SettingsSidebar activeHash={hash} />

      {/*
       * The content pane.
       *
       * Desktop gets the flat list the settings page has always had — sections one under another,
       * no cards. `SettingsOverview` is a phone-only affordance now: on a wide screen a grid of
       * seven tiles and a sidebar both claim to be the navigation, and the two disagree. The
       * palette follows the same split — the list is the milky desktop surface, the tiles keep the
       * near-black one, because that contrast is what the phone layout is built around.
       */}
      <div
        id="settings-scroll"
        className="settings-pane min-h-0 flex-1 overflow-y-auto bg-transparent md:bg-[#f6f5f2] dark:md:bg-[#07080c]"
      >
        {/*
         * The list was written for a near-black pane: every label, divider and outline is a dark
         * grey or a translucent white, which on the milky desktop surface means dark text on a
         * light background and hairline borders that vanish. Recolouring all forty of those
         * call sites by hand is the kind of edit that silently misses one, so the desktop palette
         * is applied as overrides scoped to this pane instead — `md:` only, so the phone keeps the
         * dark theme it is designed for.
         */}
        <style>{DESKTOP_PALETTE}</style>
        {/*
         * Handy-Kopfzeile (helium-mobile4): Auf dem Handy gibt es keine Seitenleiste, also hatte
         * ein geöffnetes Panel (Sync & Backup, API-Keys, …) keinen Weg zurück. Jetzt: Zurück zur
         * Übersicht bzw. zum Start, Titel des Bereichs, im Tech-Look der Handy-Version.
         */}
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-white/[0.06] bg-[#07080c]/85 px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
          <Link
            aria-label={hash ? "Zurück zur Übersicht" : "Zurück"}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
            to={hash ? "/settings" : "/"}
          >
            <IconChevronLeft className="size-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-sky-300/70">
              Einstellungen
            </p>
            <p className="truncate text-[17px] font-semibold text-white">
              {phoneTitle ?? "Übersicht"}
            </p>
          </div>
        </div>
        {/* Grok-Bot 7-Group Card Overview when no hash is selected */}
        {!hash && <SettingsOverview />}

        {/* Focused inline section when hash is an inline section */}
        {hash && !PANELS[hash] && INLINE_SECTIONS.has(hash) ? (
          <PhoneSectionContext.Provider value={phoneSection}>
          <div
            className="mx-auto flex w-full max-w-[560px] flex-col px-4 pb-16 pt-5 md:px-6 md:pt-8"
          >
            {/* Back (Handy: Kopfzeile oben übernimmt) */}
            <div className="mb-6 flex items-center max-md:hidden">
            <Button
              render={(props) => (
                <Link {...props} to="/settings">
                  <IconArrowLeft className="mr-1 size-4" />
                  Zur Übersicht
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
                  className={GHOST_BUTTON}
                >
                  Bearbeiten
                </Button>
              </div>
            </Row>

            {SHOW_LEGACY_FIELDS ? (
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
                  className={GHOST_BUTTON}
                >
                  Anzeigen
                </Button>
              </Row>
            ) : null}

            <Row
              description="Sitzung beenden und zur Anmeldung"
              label="Abmelden"
            >
              <SignOutRowButton className={GHOST_BUTTON} />
            </Row>
          </Section>

          {/* ── 2. Konnektoren ── */}
          <div className="mt-8 border-t border-white/[0.06] max-md:hidden" />
          <Section id="konnektoren" label="Konnektoren">
            {SHOW_LEGACY_FIELDS ? (
              <Row
                description="IMAP/SMTP für E-Mail-basierte Kanäle"
                label="E-Mail-Konten"
              >
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className={GHOST_BUTTON}
                >
                  <IconPlus className="mr-1 size-3.5" />
                  Hinzufügen
                </Button>
              </Row>
            ) : null}

            <Row description="Google Drive Backup" label="Cloud-Sync">
              <Button
                render={(props) => (
                  <Link {...props} to="/settings" hash="sync-backup" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className={GHOST_BUTTON}
              >
                Öffnen
              </Button>
            </Row>

            {SHOW_LEGACY_FIELDS ? (
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
                    className={GHOST_BUTTON}
                  >
                    <IconRefresh className="mr-1 size-3.5" />
                    Retry
                  </Button>
                </div>
              </Row>
            ) : null}
          </Section>

          {/* ── 3. Helium-Shell ── */}
          <div className="mt-8 border-t border-white/[0.06] max-md:hidden" />
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
                  className={GHOST_BUTTON}
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
                  <Link {...props} to="/settings" hash="browser-groups" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className={GHOST_BUTTON}
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
                className={GHOST_BUTTON}
              >
                Bearbeiten
              </Button>
            </Row>
          </Section>

          {/* ── 4. Connect-Agenten ── */}
          <div className="mt-8 border-t border-white/[0.06] max-md:hidden" />
          <Section id="connect-agenten" label="Connect-Agenten">
            {SHOW_LEGACY_FIELDS ? (
              <>
                <Row
                  description="Agent für neue Chats"
                  label="Standard-Agent"
                >
                  <Button
                    render={(props) => <Link {...props} to="/agents" />}
                    size="sm"
                    type="button"
                    variant="ghost"
                    className={GHOST_BUTTON}
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
                    className={GHOST_BUTTON}
                  >
                    Öffnen
                  </Button>
                </Row>
              </>
            ) : null}

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
                className={GHOST_BUTTON}
              >
                Verwalten
              </Button>
            </Row>

            <Row
              description="Model Context Protocol Server"
              label="MCP-Server"
            >
              <Button
                render={(props) => (
                  <Link {...props} hash="mcp" to="/settings" />
                )}
                size="sm"
                type="button"
                variant="ghost"
                className={GHOST_BUTTON}
              >
                Öffnen
              </Button>
            </Row>
          </Section>

          {/* ── 5. Benachrichtigungen (Legacy / Mock) ── */}
          {SHOW_LEGACY_FIELDS ? (
            <>
              <div className="mt-8 border-t border-white/[0.06] max-md:hidden" />
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
                    className={GHOST_BUTTON}
                  >
                    Konfigurieren
                  </Button>
                </Row>
              </Section>
            </>
          ) : null}

          {/* ── 6. Datenschutz ── */}
          <div className="mt-8 border-t border-white/[0.06] max-md:hidden" />
          <Section id="datenschutz" label="Datenschutz">
            <LocalStorageUsage />
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
            {SHOW_LEGACY_FIELDS ? (
              <Row
                description="Alle Daten als JSON herunterladen"
                label="Daten exportieren"
              >
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className={GHOST_BUTTON}
                >
                  <IconDownload className="mr-1 size-3.5" />
                  Export
                </Button>
              </Row>
            ) : null}
            <ActionRow
              danger
              description="Alle lokalen Connect-Daten dauerhaft entfernen"
              label="Daten löschen"
              onClick={() => setDeleteOpen(true)}
            />
          </Section>

          {/* ── 7. Über ── */}
          <div className="mt-8 border-t border-white/[0.06] max-md:hidden" />
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
                className={GHOST_BUTTON}
              >
                Öffnen
              </Button>
            </Row>
            {SHOW_LEGACY_FIELDS ? (
              <Row
                description="Problem melden oder Feature vorschlagen"
                label="Feedback"
              >
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className={GHOST_BUTTON}
                >
                  <IconMail className="mr-1 size-3.5" />
                  Feedback
                </Button>
              </Row>
            ) : null}
            <Row description="Wie Connect deine Daten verarbeitet" label="Datenschutzerklärung">
              <Button
                render={(props) => <a {...props} href="/datenschutz" rel="noopener" target="_blank" />}
                size="sm"
                type="button"
                variant="ghost"
                className={GHOST_BUTTON}
              >
                Öffnen
              </Button>
            </Row>
            <Row description="Regeln für die Nutzung von Connect" label="Nutzungsbedingungen">
              <Button
                render={(props) => <a {...props} href="/nutzungsbedingungen" rel="noopener" target="_blank" />}
                size="sm"
                type="button"
                variant="ghost"
                className={GHOST_BUTTON}
              >
                Öffnen
              </Button>
            </Row>
          </Section>

          {/* ── Erweitert ── (auf dem Handy eigene Seite #erweitert) */}
          <div className="max-md:hidden">
            <ErweitertPanel />
          </div>

          {/* Bottom spacer */}
          <div className="h-8" />
        </div>
          </PhoneSectionContext.Provider>
      ) : null}

      {/* Handy: unbekannter Hash → statt leerer Seite ein Hinweis mit Weg zurück. */}
      {hash && !PANELS[hash] && !INLINE_SECTIONS.has(hash) ? (
        <div className="mx-auto w-full max-w-[560px] px-6 pb-16 pt-8 text-sm text-[#888]">
          Diesen Bereich gibt es nicht (mehr).{" "}
          <Link className="text-sky-400 underline-offset-2 hover:underline" to="/settings">
            Zur Übersicht
          </Link>
        </div>
      ) : null}

      {/*
       * The registered panels, one at a time. A hash in PANELS renders its component; `null` and an
       * unknown hash both render nothing, which is correct — the sidebar and the overview only
       * advertise hashes that resolve.
       *
       * On the phone a panel replaces the list entirely, so a chip on a tile is a page of its own.
       * On the desktop the list is hidden whenever a panel is showing, which is the only case where
       * the two would stack — the two sets of hashes do not overlap, so nothing is ever cut off.
       */}
      {hash && PANELS[hash] ? (
        <div
          className={cn(
            hash === "brain"
              ? "h-full min-h-0 w-full max-w-none px-0 py-0"
              : "mx-auto w-full px-4 pb-16 pt-5 md:px-6 md:pt-8",
            hash !== "brain" && (hash === "calendar" ? "max-w-6xl" : "max-w-[560px]"),
          )}
        >
          <PanelOutlet hash={hash} />
        </div>
      ) : null}
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

/** "Abmelden" in Konto & Sicherheit: really ends the session (it used to only link to /sign,
 * which bounced straight back because the session was still alive). */
function SignOutRowButton({ className }: { className?: string }) {
  const { signOut, isPending } = useSignOut();
  return (
    <Button
      className={className}
      disabled={isPending}
      onClick={() => void signOut()}
      size="sm"
      type="button"
      variant="ghost"
    >
      {isPending ? "Abmelde…" : "Abmelden"}
    </Button>
  );
}
