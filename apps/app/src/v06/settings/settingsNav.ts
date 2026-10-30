import type {
  SettingsGroup,
  SettingsSectionMeta,
  SettingsSectionStatus,
} from "@/contracts/v06/settings-meta";

/**
 * Definition der maximal 6 Einstellungs-Gruppen (Audit-Konformität).
 */
export interface SettingsGroupDef {
  id: SettingsGroup;
  label: string;
  description: string;
  iconName: string;
}

export const SETTINGS_GROUPS: readonly SettingsGroupDef[] = [
  {
    id: "konto",
    label: "Konto & Profil",
    description: "Benutzerprofil, Sitzungen und Authentifizierung",
    iconName: "IconUser",
  },
  {
    id: "firma",
    label: "Firma & Workspace",
    description: "Firmenprofile, Tools und Browser-Gruppen",
    iconName: "IconBuildingStore",
  },
  {
    id: "verbindungen",
    label: "Verbindungen & MCP",
    description: "API-Keys, Modell-Provider, CLIs, MCP-Server und Geräte",
    iconName: "IconPlugConnected",
  },
  {
    id: "agenten",
    label: "Agenten & KI",
    description: "Standing Instructions, Fokus-Kette, Voice und Desktop-Steuerung",
    iconName: "IconRobot",
  },
  {
    id: "darstellung",
    label: "Darstellung & Shortcuts",
    description: "Farbschema (Hell/Dunkel) und Tastatur-Shortcuts",
    iconName: "IconPalette",
  },
  {
    id: "system",
    label: "System & Diagnose",
    description: "Backup, Deployment, Telemetrie, Logs und Diagnose",
    iconName: "IconShieldLock",
  },
] as const;

/**
 * Erweiterte Metadaten für die Einstellungs-Navigation
 */
export interface SettingsNavItemMeta extends SettingsSectionMeta {
  mergedInto?: string;
  description?: string;
}

/**
 * Vollständiges Mapping der 40 Abschnitte aus settings-inventory.json
 * mit Zuordnung zu den 6 Gruppen und Status (keep | merge | hide).
 */
export const SETTINGS_INVENTORY_ITEMS: readonly SettingsNavItemMeta[] = [
  // ── Gruppe: konto ──
  {
    id: "konto",
    label: "Konto & Profil",
    group: "konto",
    status: "keep",
    description: "Benutzername, Avatar und persönliche Daten",
    usedBy: [
      "apps/app/src/routes/_authed/settings/index.tsx",
      "apps/app/src/components/settings/profile-edit-dialog.tsx",
      "apps/app/src/lib/auth/local-profile.ts",
      "apps/app/src/components/sidebar-v2/profile-footer.tsx",
    ],
  },
  {
    id: "abmelden",
    label: "Abmelden",
    group: "konto",
    status: "keep",
    description: "Aktuelle Sitzung beenden und abmelden",
    usedBy: [
      "apps/app/src/lib/auth/use-sign-out.ts",
      "apps/app/src/routes/_authed/settings/index.tsx",
      "apps/app/src/components/sidebar-v2/profile-footer.tsx",
    ],
  },
  {
    id: "security",
    label: "Anmelde-Sitzungen",
    group: "konto",
    status: "merge",
    mergedInto: "konto",
    description: "Aktive Sitzungen einsehen und widerrufen",
    usedBy: [
      "apps/app/src/routes/_authed/settings/index.tsx",
      "apps/app/src/lib/auth/queries.ts",
    ],
  },

  // ── Gruppe: firma ──
  {
    id: "companies",
    label: "Firmenprofile",
    group: "firma",
    status: "keep",
    description: "Firmen verwalten, anlegen, umbenennen und Logos pflegen",
    usedBy: [
      "apps/app/src/components/settings/company-settings.tsx",
      "apps/app/src/routes/_authed/settings/companies.tsx",
      "apps/app/src/lib/companies/store.ts",
      "apps/app/src/components/companies/company-switcher.tsx",
    ],
  },
  {
    id: "company-tools",
    label: "Tools pro Firma",
    group: "firma",
    status: "keep",
    description: "Workspace-Apps und Tools für das aktive Unternehmen",
    usedBy: [
      "apps/app/src/components/settings/company-apps-settings.tsx",
      "apps/app/src/lib/market/catalog.ts",
      "apps/server/src/contracts/v06/company-tools.ts",
    ],
  },
  {
    id: "sidebar-tools",
    label: "Sidebar-Tools",
    group: "firma",
    status: "merge",
    mergedInto: "company-tools",
    description: "Sichtbarkeit von Tools in der Chat-Seitenleiste",
    usedBy: [
      "apps/app/src/components/settings/sidebar-tools-settings.tsx",
      "apps/app/src/components/sidebar-v2/tools-store.ts",
      "apps/server/src/routes/sidebar-routes.ts",
    ],
  },
  {
    id: "browser-groups",
    label: "Browser-Gruppen",
    group: "firma",
    status: "keep",
    description: "Standard-Tabgruppen und Apple-Dot Verhalten",
    usedBy: [
      "apps/app/src/components/settings/browser-groups-panel.tsx",
      "apps/app/src/lib/companies/level3-tools.ts",
      "apps/server/src/contracts/v06/browser-profiles.ts",
    ],
  },

  // ── Gruppe: agenten ──
  {
    id: "standing-instructions",
    label: "Standing Instructions",
    group: "agenten",
    status: "keep",
    description: "Dauerhafte Arbeitsanweisungen für alle Bots",
    usedBy: [
      "apps/app/src/components/settings/standing-instructions.tsx",
      "packages/shared/src/bot-prompt.ts",
      "apps/server/src/user-instructions.ts",
    ],
  },
  {
    id: "fokus",
    label: "Fokus-Kette",
    group: "agenten",
    status: "keep",
    description: "Fokus-Timer und Konzentrations-Modus",
    usedBy: [
      "apps/app/src/components/settings/focus-chain-settings.tsx",
      "apps/app/src/lib/focus-chain.ts",
      "apps/app/src/components/focus/focus-chain.tsx",
      "apps/app/src/routes/_authed/focus.tsx",
    ],
  },
  {
    id: "voice",
    label: "Voice & Keyring",
    group: "agenten",
    status: "keep",
    description: "ElevenLabs, Whisper und Sprachausgabe-Schlüssel",
    usedBy: [
      "apps/app/src/components/settings/voice-settings.tsx",
      "apps/app/src/lib/voice/elevenlabs.ts",
      "apps/app/src/lib/voice/whisper.ts",
      "apps/app/src/components/focus/mobile-music-card.tsx",
    ],
  },
  {
    id: "desktop-control",
    label: "Desktop-Steuerung & Sicherheit",
    group: "agenten",
    status: "keep",
    description: "Hitodama-Desktop-Steuerung und Berechtigungen",
    usedBy: [
      "apps/app/src/components/settings/desktop-control-settings.tsx",
      "packages/shared/src/desktop/contracts.ts",
      "apps/server/src/desktop/routes.ts",
    ],
  },
  {
    id: "connect-agenten",
    label: "Connect-Agenten",
    group: "agenten",
    status: "merge",
    mergedInto: "standing-instructions",
    description: "Standard-Agent und Agentenverwaltung",
    usedBy: [
      "apps/app/src/routes/_authed/settings/index.tsx",
      "apps/app/src/routes/_authed/_app/agents/index.tsx",
    ],
  },
  {
    id: "email-agents",
    label: "E-Mail-Agenten",
    group: "agenten",
    status: "keep",
    description: "Automatische E-Mail-Bearbeitung und Postfächer",
    usedBy: [
      "apps/app/src/components/settings/email-agents/email-agents-settings.tsx",
      "apps/server/src/connect/email-agents/routes.ts",
      "apps/server/src/contracts/v06/email-agents.ts",
    ],
  },
  {
    id: "model-one",
    label: "Model One",
    group: "agenten",
    status: "merge",
    mergedInto: "standing-instructions",
    description: "Model One Konfiguration",
    usedBy: [
      "apps/app/src/components/settings/model-one-panel.tsx",
      "apps/server/src/model-one/routes.ts",
      "apps/app/src/routes/_authed/_app/model-one.tsx",
    ],
  },

  // ── Gruppe: verbindungen ──
  {
    id: "api-keys",
    label: "Globale API-Keys",
    group: "verbindungen",
    status: "keep",
    description: "OpenAI, Anthropic, Google und weitere LLM-Keys",
    usedBy: [
      "apps/app/src/components/settings/api-keys-settings.tsx",
      "apps/app/src/lib/agents/global-api-keys.ts",
      "apps/app/src/lib/agents/agent-api-keys.ts",
    ],
  },
  {
    id: "model-provider",
    label: "Modell-Provider",
    group: "verbindungen",
    status: "merge",
    mergedInto: "api-keys",
    description: "LLM-Anbieter und Modell-Auswahl",
    usedBy: [
      "apps/app/src/components/settings/model-provider-settings.tsx",
      "apps/app/src/lib/agents/model-provider.ts",
    ],
  },
  {
    id: "cli-providers",
    label: "Anbieter-CLIs",
    group: "verbindungen",
    status: "keep",
    description: "Lokale Befehlszeilen-Tools (Codex, Antigravity, etc.)",
    usedBy: [
      "apps/app/src/components/settings/cli-providers-settings.tsx",
      "apps/app/src/lib/agent-hub/api.ts",
      "apps/server/src/agent-hub/cli-model.ts",
    ],
  },
  {
    id: "mcp",
    label: "MCP-Server",
    group: "verbindungen",
    status: "keep",
    description: "Model Context Protocol Server konfigurieren",
    usedBy: [
      "apps/app/src/components/settings/mcp-settings.tsx",
      "apps/app/src/lib/mcp/local-servers.ts",
      "apps/app/src/routes/_authed/settings/mcp.tsx",
    ],
  },
  {
    id: "connector-mapping",
    label: "Connector-Mapping",
    group: "verbindungen",
    status: "merge",
    mergedInto: "mcp",
    description: "Zuweisung von Konnektoren zu Datenquellen",
    usedBy: [
      "apps/app/src/components/settings/mcp-connector-mapping.tsx",
      "apps/app/src/lib/mcp/connector-sources.ts",
    ],
  },
  {
    id: "mcp-grants",
    label: "MCP-Freigaben (Grok Bot)",
    group: "verbindungen",
    status: "merge",
    mergedInto: "mcp",
    description: "Berechtigungen für MCP-Werkzeuge",
    usedBy: [
      "apps/app/src/components/settings/email-agents/mcp-grants-settings.tsx",
      "apps/server/src/lanes/lane-10.ts",
      "apps/server/src/contracts/v06/connect-mcp.ts",
    ],
  },
  {
    id: "handy-verbinden",
    label: "Handy verbinden",
    group: "verbindungen",
    status: "keep",
    description: "Tunnel & QR-Code für mobilen Zugriff (nur einmal in Nav)",
    usedBy: [
      "apps/app/src/components/settings/phone-connect-panel.tsx",
      "apps/server/src/tunnel/index.ts",
      "apps/app/src/components/app-sidebar/app-sidebar.tsx",
      "apps/app/src/components/companies/level-chrome-sidebar.tsx",
    ],
  },
  {
    id: "mein-helium",
    label: "Mein Helium",
    group: "verbindungen",
    status: "keep",
    description: "Helium Browser-Verbindung und Integration",
    usedBy: [
      "apps/app/src/components/pc-bridge/mein-helium.tsx",
      "apps/app/src/lib/pc-bridge/helium-api.ts",
      "apps/server/src/pc-bridge/index.ts",
    ],
  },
  {
    id: "calendar",
    label: "Kalender",
    group: "verbindungen",
    status: "keep",
    description: "Kalender-Synchronisation und Terminvorschau",
    usedBy: [
      "apps/app/src/components/calendar/calendar-settings-panel.tsx",
      "apps/app/src/lib/ui/calendar-prefs.ts",
      "apps/app/src/lib/calendar/queries.ts",
    ],
  },
  {
    id: "konnektoren",
    label: "Konnektoren",
    group: "verbindungen",
    status: "hide",
    description: "Legacy Konnektoren (ausgeblendet)",
    usedBy: ["apps/app/src/routes/_authed/settings/index.tsx"],
  },
  {
    id: "connected-accounts",
    label: "Connected Accounts",
    group: "verbindungen",
    status: "hide",
    description: "Legacy OAuth Accounts (ausgeblendet)",
    usedBy: [
      "apps/app/src/routes/_authed/settings/connected-accounts/index.tsx",
      "apps/app/src/routes/_authed/settings/connected-accounts/$key.tsx",
    ],
  },

  // ── Gruppe: darstellung ──
  {
    id: "appearance",
    label: "Farbmodus",
    group: "darstellung",
    status: "keep",
    description: "System / Dunkel / Hell Farbschema (ThemeSettingsSection)",
    usedBy: [
      "apps/app/src/components/settings/appearance-settings.tsx",
      "apps/app/src/lib/theme.ts",
      "apps/app/src/components/theme-provider.tsx",
      "apps/app/src/components/mobile/mobile-theme-sync.tsx",
    ],
  },
  {
    id: "shortcuts",
    label: "Tastatur-Shortcuts",
    group: "darstellung",
    status: "keep",
    description: "Tastenkombinationen und Tastaturkürzel anpassen",
    usedBy: [
      "apps/app/src/components/settings/shortcuts-panel.tsx",
      "apps/app/src/lib/hotkeys/hotkeys.ts",
    ],
  },

  // ── Gruppe: system ──
  {
    id: "sync-backup",
    label: "Sync & Backup",
    group: "system",
    status: "keep",
    description: "Google Drive Sicherung und Supabase-Synchronisation",
    usedBy: [
      "apps/app/src/components/settings/drive-backup-panel.tsx",
      "apps/app/src/components/settings/supabase-sync-card.tsx",
      "apps/server/src/drive-backup/routes.ts",
    ],
  },
  {
    id: "deployment-mode",
    label: "Deployment Mode",
    group: "system",
    status: "keep",
    description: "Lokale Instanz vs. Cloud-Betrieb",
    usedBy: [
      "apps/app/src/components/settings/deployment-mode-panel.tsx",
      "apps/app/src/lib/deployment/mode.ts",
    ],
  },
  {
    id: "codex-usage",
    label: "Codex-Nutzung",
    group: "system",
    status: "merge",
    mergedInto: "deployment-mode",
    description: "Token-Verbrauch und Aufruf-Statistiken",
    usedBy: [
      "apps/app/src/components/settings/codex-usage-panel.tsx",
      "apps/server/src/cli-bridge/routes.ts",
      "apps/app/src/routes/_authed/_app/usage.tsx",
    ],
  },
  {
    id: "erweitert",
    label: "Erweitert & Lab",
    group: "system",
    status: "merge",
    mergedInto: "deployment-mode",
    description: "Experimentelle Features und Entwickler-Optionen",
    usedBy: [
      "apps/app/src/components/settings/erweitert-panel.tsx",
      "apps/app/src/lib/ui/lab-prefs.ts",
    ],
  },
  {
    id: "uber",
    label: "Über & Info",
    group: "system",
    status: "keep",
    description: "App-Version, Logs, Datenschutz und Nutzungsbedingungen",
    usedBy: ["apps/app/src/routes/_authed/settings/index.tsx"],
  },
  {
    id: "brain",
    label: "Brain & Spark",
    group: "system",
    status: "merge",
    mergedInto: "uber",
    description: "Brain Graph und Wissens-Einstellungen",
    usedBy: [
      "apps/app/src/components/brain/brain-settings-page.tsx",
      "apps/app/src/routes/_authed/settings/brain.tsx",
      "apps/app/src/routes/_authed/_app/brain.tsx",
    ],
  },
  {
    id: "ubuntu-machines",
    label: "Ubuntu-Maschinen",
    group: "system",
    status: "hide",
    description: "Ubuntu SSH Maschinen (ausgeblendet)",
    usedBy: [
      "apps/app/src/components/settings/ubuntu-machines-settings.tsx",
      "apps/app/src/lib/computers/queries.ts",
      "apps/server/src/computer/routes.ts",
    ],
  },
  {
    id: "donate",
    label: "Feedback & Unterstützen",
    group: "system",
    status: "hide",
    description: "Spenden & Feedback (ausgeblendet)",
    usedBy: [
      "apps/app/src/components/settings/donate-panel.tsx",
      "apps/app/src/lib/donations/blue-check.ts",
    ],
  },
  {
    id: "helium-shell",
    label: "Helium-Shell",
    group: "system",
    status: "hide",
    description: "Helium Shell Shortcut (ausgeblendet)",
    usedBy: ["apps/app/src/routes/_authed/settings/index.tsx"],
  },
  {
    id: "benachrichtigungen",
    label: "Benachrichtigungen",
    group: "system",
    status: "hide",
    description: "Push- & E-Mail-Meldungen (ausgeblendet)",
    usedBy: ["apps/app/src/routes/_authed/settings/index.tsx"],
  },
  {
    id: "datenschutz",
    label: "Datenschutz",
    group: "system",
    status: "merge",
    mergedInto: "uber",
    description: "Lokale Daten, Telemetrie und Datenschutzerklärung",
    usedBy: ["apps/app/src/routes/_authed/settings/index.tsx"],
  },
  {
    id: "diagnose",
    label: "Admin-Diagnose",
    group: "system",
    status: "keep",
    description: "Systemstatus, Integrität und Fehlerdiagnose",
    usedBy: ["apps/app/src/routes/_authed/settings/diagnose.tsx"],
  },
  {
    id: "diagnose-companies",
    label: "Firmen-Diagnose",
    group: "system",
    status: "merge",
    mergedInto: "diagnose",
    description: "Reparatur und Bereinigung von Firmenprofilen",
    usedBy: ["apps/app/src/routes/_authed/settings/diagnose-companies.tsx"],
  },
];

/**
 * Liefert alle Abschnitte mit status === 'keep'.
 */
export function getKeepSections(): SettingsNavItemMeta[] {
  return SETTINGS_INVENTORY_ITEMS.filter((item) => item.status === "keep");
}

/**
 * Liefert alle ausgeblendeten Abschnitte (status === 'hide').
 */
export function getHiddenSections(): SettingsNavItemMeta[] {
  return SETTINGS_INVENTORY_ITEMS.filter((item) => item.status === "hide");
}

/**
 * Liefert alle zusammengelegten Abschnitte (status === 'merge').
 */
export function getMergedSections(): SettingsNavItemMeta[] {
  return SETTINGS_INVENTORY_ITEMS.filter((item) => item.status === "merge");
}

/**
 * Liefert alle sichtbaren Abschnitte (status !== 'hide').
 */
export function getVisibleSections(): SettingsNavItemMeta[] {
  return SETTINGS_INVENTORY_ITEMS.filter((item) => item.status !== "hide");
}

/**
 * Liefert die Gruppen mit ihren sichtbaren Navigationselementen.
 * Garantiert: maximal 6 Gruppen.
 */
export interface NavGroupWithItems extends SettingsGroupDef {
  items: SettingsNavItemMeta[];
}

export function getNavGroups(): NavGroupWithItems[] {
  return SETTINGS_GROUPS.map((group) => {
    const items = SETTINGS_INVENTORY_ITEMS.filter(
      (item) => item.group === group.id && item.status === "keep",
    );
    return {
      ...group,
      items,
    };
  });
}

/**
 * Suchfunktion über alle sichtbaren Abschnitte.
 */
export function searchSections(query: string): SettingsNavItemMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return getVisibleSections();

  return getVisibleSections().filter((item) => {
    return (
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      item.group.toLowerCase().includes(q)
    );
  });
}
