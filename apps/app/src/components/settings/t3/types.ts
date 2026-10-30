/**
 * T3-Einstellungen — Typdefinitionen (Lane A25).
 *
 * EIGENTÜMER: A25 (T3-Einstellungen in Connect-Settings).
 * Liest Verträge aus apps/app/src/lib/t3/contracts.ts (A01).
 *
 * Verwaltet:
 *  1. CLIs / Provider (Status, Login-Status, „In T3 anmelden"-Hinweis)
 *  2. Gleichzeitigkeit (gesamt max. 5, Codex max. 3, Claude max. 2, sonst 1)
 *  3. Kontext (Schwelle 100 000, Zusammenfassung sichtbar)
 *  4. Token-Sparen (5 Regeln an/aus, strikte Invarianz des Nutzer-Texts)
 *  5. Sidecar-Status (Port 3773, Version, Loopback-Bindung)
 *
 * REGEL: Keine Eingabefelder für API-Keys! API-Keys bleiben in der bestehenden Connect-Key-Verwaltung.
 */

import type {
  SchedulerLimits,
  T3ProviderId,
  T3ProviderStatus,
  T3StatusResponse,
} from "@/lib/t3/contracts";

/* ---------------------------------------------------------------------------------------- *
 * 1. Sidecar Einstellungen
 * ---------------------------------------------------------------------------------------- */

export type T3SidecarSettings = {
  /** Automatischer Start des Sidecars durch Connect */
  autoStart: boolean;
  /** Loopback-Host (immer 127.0.0.1) */
  host: string;
  /** Loopback-Port (Standard 3773) */
  port: number;
  /** Pfad zum T3-Home (%LOCALAPPDATA%\ConnectAgents\t3-home) */
  homePathHint: string;
};

export const DEFAULT_T3_SIDECAR_SETTINGS: T3SidecarSettings = {
  autoStart: true,
  host: "127.0.0.1",
  port: 3773,
  homePathHint: "%LOCALAPPDATA%\\ConnectAgents\\t3-home",
};

/* ---------------------------------------------------------------------------------------- *
 * 2. CLI / Provider Einstellungen
 * ---------------------------------------------------------------------------------------- */

export type T3ProviderDisplayInfo = {
  provider: T3ProviderId;
  label: string;
  description: string;
  supportsCliLogin: boolean;
  loginHint: string;
};

export const T3_PROVIDER_META: Record<T3ProviderId, { label: string; description: string; loginHint: string }> = {
  codex: {
    label: "Codex",
    description: "OpenAI Codex CLI mit bestehender Anmeldung oder ChatGPT-Konto.",
    loginHint: "In T3 anmelden oder 'codex login' im Terminal ausführen.",
  },
  claudeAgent: {
    label: "Claude",
    description: "Anthropic Claude CLI für autonome Agentenaufgaben.",
    loginHint: "In T3 anmelden oder 'claude auth' im Terminal ausführen.",
  },
  cursor: {
    label: "Cursor",
    description: "Cursor AI Agent-Bridge mit bestehender IDE-Session.",
    loginHint: "In T3 mit bestehendem Cursor-Account koppeln.",
  },
  grok: {
    label: "Grok",
    description: "xAI Grok Integration für DeepSearch und Schnelligkeit.",
    loginHint: "In T3 anmelden oder über die Desktop-App verbinden.",
  },
  hermes: {
    label: "Hermes",
    description: "Hermes Agent Harness (Fork) für erweiterte Tool-Workflows.",
    loginHint: "Wird automatisch vom lokalen Sidecar verwaltet.",
  },
  freebuff: {
    label: "Freebuff",
    description: "Lokale Buffer- und Caching-CLI für Offline-Vorbereitung.",
    loginHint: "In T3 aktivieren oder freebuff CLI konfigurieren.",
  },
  opencode: {
    label: "OpenCode",
    description: "Open-Source-Modelle über vLLM, Ollama oder lokale Endpunkte.",
    loginHint: "Lokalen Endpunkt in T3 hinterlegen.",
  },
  antigravity: {
    label: "Antigravity",
    description: "Google Deepmind Antigravity Agent Harness mit Google-Login.",
    loginHint: "Google-Anmeldung in T3 oder per Terminal starten.",
  },
  pi: {
    label: "Pi",
    description: "Inflection Pi Konversations-Treiber.",
    loginHint: "In T3 verknüpfen.",
  },
  muse: {
    label: "Muse",
    description: "Muse Personal AI Agent & Memory Harness.",
    loginHint: "In T3 mit Muse-Konto verbinden.",
  },
  acpRegistry: {
    label: "ACP Registry",
    description: "Agent Communication Protocol Registry für verteilte Agenten.",
    loginHint: "ACP-Kanal in T3 registrieren.",
  },
};

/* ---------------------------------------------------------------------------------------- *
 * 3. Gleichzeitigkeit & Scheduler
 * ---------------------------------------------------------------------------------------- */

export type T3ConcurrencySettings = SchedulerLimits & {
  /** Maximale gleichzeitige Turns je Provider */
  providerLimits: Record<T3ProviderId | string, number>;
  /** Drosselung bei hoher Systemlast aktivieren (A09 Hook) */
  autoThrottleOnHighLoad: boolean;
};

export const DEFAULT_T3_CONCURRENCY_SETTINGS: T3ConcurrencySettings = {
  maxConcurrentTurns: 5,
  maxConcurrentPerProvider: 3,
  queueTimeoutMinutes: 120,
  idleSessionTimeoutMinutes: 15,
  maxAwakeAgents: 8,
  providerLimits: {
    codex: 3,
    claudeAgent: 2,
    cursor: 1,
    grok: 1,
    hermes: 1,
    freebuff: 1,
    opencode: 1,
    antigravity: 1,
    pi: 1,
    muse: 1,
    acpRegistry: 1,
  },
  autoThrottleOnHighLoad: true,
};

/* ---------------------------------------------------------------------------------------- *
 * 4. Kontext-Rotation
 * ---------------------------------------------------------------------------------------- */

export type T3ContextSettings = {
  /** Schwellenwert in Tokens für automatische Rotation (Standard: 100 000) */
  thresholdTokens: number;
  /** Trenner „Neues Kontextfenster · Zusammenfassung“ im Chat sichtbar anzeigen */
  showContextSwitchBadge: boolean;
  /** Automatische Zusammenfassung durch Sub-Agenten (A16) */
  autoSummarize: boolean;
  /** Maximale Tokenlänge der generierten Zusammenfassung */
  maxSummaryTokens: number;
  /** Kontext-Rotation nur am Turn-Ende durchführen (niemals mitten im Turn) */
  rotateOnlyAtTurnEnd: boolean;
};

export const DEFAULT_T3_CONTEXT_SETTINGS: T3ContextSettings = {
  thresholdTokens: 100_000,
  showContextSwitchBadge: true,
  autoSummarize: true,
  maxSummaryTokens: 8_000,
  rotateOnlyAtTurnEnd: true,
};

/* ---------------------------------------------------------------------------------------- *
 * 5. Token-Sparen (A14)
 * ---------------------------------------------------------------------------------------- */

export type T3TokenSavingSettings = {
  /** Master-Schalter: Token-Sparen aktiv */
  enabled: boolean;
  /** Regel 1: Lange Terminal-/Tool-Ausgaben kürzen (Head + Tail erhalten) */
  truncateCommandOutputs: boolean;
  /** Regel 2: Doppelte Tool-Ausgaben deduplizieren (Hash-Referenz) */
  deduplicateToolOutputs: boolean;
  /** Regel 3: Große Dateianhänge nur als Pfad übergeben */
  attachmentsAsPath: boolean;
  /** Regel 4: Redundante System-Prompts verdichten */
  compactSystemInstructions: boolean;
  /** Regel 5: Günstige Economy-Modelle für Hilfsaufgaben (Titel, Zusammenfassung) */
  economyModelForAuxiliary: boolean;
  /** Langlebige Sessions für serverseitiges Prompt-Caching (bis 90 % Rabatt) */
  preservePromptCaching: boolean;
  /** Maximale Zeilenanzahl vor Kürzung von Befehlsausgaben */
  maxCommandOutputLines: number;
};

export const DEFAULT_T3_TOKEN_SAVING_SETTINGS: T3TokenSavingSettings = {
  enabled: true,
  truncateCommandOutputs: true,
  deduplicateToolOutputs: true,
  attachmentsAsPath: true,
  compactSystemInstructions: true,
  economyModelForAuxiliary: true,
  preservePromptCaching: true,
  maxCommandOutputLines: 25,
};

/* ---------------------------------------------------------------------------------------- *
 * Gesamte T3-Einstellungen
 * ---------------------------------------------------------------------------------------- */

export type T3UnifiedSettings = {
  sidecar: T3SidecarSettings;
  concurrency: T3ConcurrencySettings;
  context: T3ContextSettings;
  tokenSaving: T3TokenSavingSettings;
  updatedAt: string;
};

/**
 * Patch-Typ fuer `saveT3UnifiedSettings` / `updateSettings`.
 *
 * `Partial<T3UnifiedSettings>` reicht hier nicht: es macht jeden Abschnitt zu
 * `T3SidecarSettings | undefined`, aber INNERHALB eines Abschnitts bleiben alle
 * Felder pflichtig. `updateSettings({ sidecar: { autoStart: true } })` waere dann
 * ein Typfehler, obwohl genau das der gaengige Aufruf ist.
 *
 * `DeepPartial` loest das: jeder Abschnitt darf unvollstaendig sein, und jeder
 * Abschnitt selbst darf fehlen.
 *
 * WICHTIG: Die Rekursion endet bei Index-Signaturen (`Record<...>`). Ohne diese
 * Grenze wird `providerLimits: Record<string, number>` zu
 * `Record<string, number | undefined>` — und der Wert einer nicht gesetzten
 * Provider-Id waere dann `undefined` statt der gesetzten Zahl. Ein Patch darf
 * einzelne Werte ENTHALTEN, aber nie einen Wert loeschen; das Merge in
 * `saveT3UnifiedSettings` uebernimmt den Rest.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly DeepPartial<U>[]
    : // Index-Signatur: nicht rekursivieren (siehe Kommentar oben).
      string extends keyof T[K]
      ? T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};

export type T3UnifiedSettingsPatch = DeepPartial<Omit<T3UnifiedSettings, "updatedAt">> & {
  updatedAt?: string;
};

export const DEFAULT_T3_UNIFIED_SETTINGS: T3UnifiedSettings = {
  sidecar: DEFAULT_T3_SIDECAR_SETTINGS,
  concurrency: DEFAULT_T3_CONCURRENCY_SETTINGS,
  context: DEFAULT_T3_CONTEXT_SETTINGS,
  tokenSaving: DEFAULT_T3_TOKEN_SAVING_SETTINGS,
  updatedAt: "2026-10-29T12:00:00.000Z",
};
