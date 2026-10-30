import type { MultiLoginAppDef, MultiLoginAppId } from "../../contracts/v06/multilogin";
import { getFlag } from "../../contracts/v06/flags";
import { findGrokBotExe } from "./launchers/grokbot";
import { launchCodexAccount } from "../../cli-bridge/accounts/providers/codex";
import { launchAntigravityAccount } from "../../cli-bridge/accounts/providers/antigravity";
import { launchManusAccount } from "../../cli-bridge/accounts/providers/manus";
import { launchGrokBotAccount } from "./launchers/grokbot";
import { launchCueAccount } from "./launchers/cue";

export interface RegisteredMultiLoginApp extends MultiLoginAppDef {
  /** Gibt an, ob diese App im System einsatzbereit / freigegeben ist */
  enabled: boolean;
  /** Optionale Kurzbeschreibung */
  description?: string;
  /** UI Badge Hint */
  badge?: string;
}

/**
 * Erzeugt die vollstaendige Liste aller in Connect registrierten Multi-Login-Apps.
 * Pfade und Faehigkeiten werden dynamisch ermittelt (z.B. Desktop-Pfad von Grok Bot).
 */
export function buildMultiLoginRegistry(): RegisteredMultiLoginApp[] {
  const grokExe = findGrokBotExe();

  return [
    {
      id: "codex",
      name: "Codex",
      iconUrl: "/v06/icons/codex.svg",
      launch: {
        kind: "desktop",
        target: "ChatGPT.exe",
      },
      supportsLivePreview: true,
      enabled: true,
      badge: "CLI / Desktop",
      description: "Isolierte Codex/ChatGPT Instanz mit eigenem User-Data & Config Profil",
    },
    {
      id: "antigravity",
      name: "Antigravity",
      iconUrl: "/v06/icons/antigravity.svg",
      launch: {
        kind: "desktop",
        target: "Antigravity.exe",
      },
      supportsLivePreview: true,
      enabled: true,
      badge: "Agentic IDE",
      description: "Agentic IDE (VS Code Fork) mit Google-Login Umschaltung",
    },
    {
      id: "manus",
      name: "Manus",
      iconUrl: "/v06/icons/manus.svg",
      launch: {
        kind: "web",
        target: "https://manus.im/app",
      },
      supportsLivePreview: true,
      enabled: true,
      badge: "Web-Agent",
      description: "Manus Web-Agent im isolierten Helium-Browser-Agentenprofil",
    },
    {
      id: "grokbot",
      name: "Grok Bot",
      iconUrl: "/v06/icons/grokbot.svg",
      launch: grokExe
        ? {
            kind: "desktop",
            target: grokExe,
          }
        : {
            kind: "web",
            target: "https://grok.com",
          },
      supportsLivePreview: Boolean(grokExe),
      enabled: true,
      badge: grokExe ? "Desktop" : "Web",
      description: grokExe
        ? "Lokale Grok Bot Desktop-App mit isoliertem Benutzerprofil und CDP-Vorschau"
        : "Grok Bot Webportal (keine Desktop-Installation gefunden)",
    },
    {
      id: "cue",
      name: "Cue",
      iconUrl: "/v06/icons/cue.svg",
      launch: {
        kind: "web",
        target: "https://cue.app",
      },
      supportsLivePreview: false,
      enabled: false,
      badge: "Inaktiv",
      description: "Cue Bot / Desktop App (Inaktiv - wartet auf Bestaetigung von Stefan bzgl. Produkt/URL/Desktop)",
    },
  ];
}

/**
 * Liefert die Liste der verfuegbaren Multi-Login-Apps gemaess Feature-Flag und Aktivierungsstatus.
 *
 * - Bei Flag multiLoginGrokCue = false: Exakt die drei bisherigen Apps (codex, antigravity, manus).
 * - Bei Flag multiLoginGrokCue = true: Alle aktivierten Apps (codex, antigravity, manus, grokbot).
 *   Cue bleibt ausgeschlossen, solange enabled: false.
 */
export function getMultiLoginApps(options?: { flagOverride?: boolean }): MultiLoginAppDef[] {
  const isFlagActive =
    options?.flagOverride !== undefined
      ? options.flagOverride
      : getFlag("multiLoginGrokCue");

  const registry = buildMultiLoginRegistry();

  if (!isFlagActive) {
    // Nur die urspruenglichen 3 Standard-Apps
    return registry
      .filter((app) => app.id === "codex" || app.id === "antigravity" || app.id === "manus")
      .map(({ id, name, iconUrl, launch, supportsLivePreview }) => ({
        id,
        name,
        iconUrl,
        launch,
        supportsLivePreview,
      }));
  }

  // Bei aktivertem Flag: alle aktivierten Apps
  return registry
    .filter((app) => app.enabled)
    .map(({ id, name, iconUrl, launch, supportsLivePreview }) => ({
      id,
      name,
      iconUrl,
      launch,
      supportsLivePreview,
    }));
}

/**
 * Liefert die vollstaendige Registrierungsdefinition inklusive Metadaten und enabled-Status.
 */
export function getAppDef(id: MultiLoginAppId): RegisteredMultiLoginApp | undefined {
  return buildMultiLoginRegistry().find((app) => app.id === id);
}

/**
 * Gibt den passenden Launcher fuer eine App-ID zurueck.
 */
export function getLauncherForApp(id: MultiLoginAppId) {
  switch (id) {
    case "codex":
      return launchCodexAccount;
    case "antigravity":
      return launchAntigravityAccount;
    case "manus":
      return launchManusAccount;
    case "grokbot":
      return launchGrokBotAccount;
    case "cue":
      return launchCueAccount;
  }
}
