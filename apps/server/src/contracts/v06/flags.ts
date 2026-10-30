/** Contract v06 – Änderungen nur durch A00/Integrator */

export const FLAGS_V06 = {
  sidebarV2Order: false,
  focusV2: false,
  themeV2: false,
  liveToggleOnly: false,
  multiLoginGrokCue: false,
  companyTools: false,
  botLifecycle: false,
  cliDeElevated: false,
  cliUnifiedSession: false,
  sparkMcp: false,
  browserProfiles: false,
  settingsV2: false,
  mobileV2: false,
  browserSplitLayout: false,
  sparkOverview: false,
  connectMcp: false,
  emailAgents: false,
  storeV1: false,
  socialV1: false,
  onboardingV2: false,
  designV2: false,
  projectSwarm: false,
  pcAppsInGroups: false,
  linkCurator: false,
  futureSim: false,
} as const;

export type FlagV06Key = keyof typeof FLAGS_V06;

/**
 * Ermittelt den Zustand eines v06 Feature-Flags.
 * Auf dem Server: Wird durch Umgebungsvariable CONNECT_FLAGS_V06 (kommagetrennte Liste von Flag-Namen) überschrieben.
 * Im Frontend: Standardmäßig FLAGS_V06; kann zur Laufzeit mit Daten von GET /api/v06/flags initialisiert werden.
 */
export function getFlag(name: FlagV06Key): boolean {
  if (typeof window !== "undefined") {
    const runtimeValue = (window as typeof window & {
      __CONNECT_FLAGS_V06?: Partial<Record<FlagV06Key, unknown>>;
    }).__CONNECT_FLAGS_V06?.[name];
    if (typeof runtimeValue === "boolean") return runtimeValue;
  }
  if (typeof process !== "undefined" && process.env?.CONNECT_FLAGS_V06) {
    const envFlags = process.env.CONNECT_FLAGS_V06.split(",").map((s) => s.trim().toLowerCase());
    const lowerName = name.toLowerCase();
    if (envFlags.includes(lowerName) || envFlags.includes("all") || envFlags.includes("true")) {
      return true;
    }
    if (envFlags.includes(`-${lowerName}`) || envFlags.includes(`no-${lowerName}`)) {
      return false;
    }
  }
  return FLAGS_V06[name];
}
