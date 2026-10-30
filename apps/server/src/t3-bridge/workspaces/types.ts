/**
 * T3-Bridge — Workspace-Manager: Typen.
 *
 * Lane: A07 (Welle W1). Abhängigkeiten: A01 (Verträge), A05 (`agent_workspace`).
 *
 * Ein Agent = ein Ordner. Der Ordner gehört dem Agenten dauerhaft (auch nach
 * dem Löschen/Archivieren), damit keine zwei Agenten im selben Verzeichnis
 * arbeiten und keine Arbeit verloren geht. Ordner werden deshalb **niemals**
 * gelöscht — nur als `archived` markiert.
 *
 * Feature-Flag: `connect.t3.bridge` (siehe `../contracts`). Ist es aus, legt
 * der Manager nichts an und liest nichts: Connect verhält sich wie heute.
 */

/** Woher der Ordner kommt: Standardordner oder von Stefan ausgewähltes Projekt. */
export type WorkspaceKind = "default" | "project";

/** `archived` = Agent gelöscht/abgeschaltet, Ordner und Inhalt bleiben erhalten. */
export type WorkspaceStatus = "active" | "archived";

/**
 * Ein Agent-Arbeitsordner, wie er in der Registry steht.
 *
 * `slug` ist der Ordnername unterhalb der Wurzel und bleibt stabil, auch wenn
 * der Agent später umbenannt wird. Bei zugewiesenen Projektordnern ist `slug`
 * nur noch ein Anzeige-/Registry-Schlüssel, `path` zeigt auf Stefans Ordner.
 */
export type AgentWorkspace = {
  agentId: string;
  agentName: string;
  slug: string;
  /** Absoluter Pfad, wie er auf der Platte steht. */
  path: string;
  kind: WorkspaceKind;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  /** Zeitpunkt der Archivierung (`null`, solange aktiv). */
  archivedAt: string | null;
};

/** Dateiinhalt von `<workspaces>/_registry.json`. */
export type WorkspaceRegistrySnapshot = {
  version: 1;
  updatedAt: string;
  workspaces: AgentWorkspace[];
};

/* ---------------------------------------------------------------------------------------- *
 * Pfad-Validierung
 * ---------------------------------------------------------------------------------------- */

/**
 * Warum ein Pfad als Arbeitsordner abgelehnt wird.
 *
 *  - `empty`            → leerer/whitespace-Pfad
 *  - `not_absolute`     → relativer Pfad (würde vom Prozess-CWD abhängen)
 *  - `traversal`        → enthält `..`
 *  - `unc`              → Netzwerk-/Gerätepfad (`\\server\share`, `\\?\C:\…`)
 *  - `drive_root`       → Laufwerkswurzel (`C:\`)
 *  - `system_dir`       → Windows/Program Files/ProgramData/AppData-Roaming …
 *  - `home_root`        → Nutzerprofil, Desktop, Dokumente, Downloads, `.ssh`, `.gemini` …
 *  - `protected_project`→ Connect-Repo (OpenBot-v2*), T3-Fork, T3-Homes
 *  - `helium_profile`   → Stefans Helium-Profil (Regel 6/11)
 *  - `connect_data`     → Connects eigene Daten (`%LOCALAPPDATA%\ConnectApp`, `ConnectAgents`)
 *  - `workspaces_root`  → die Workspace-Wurzel selbst (kein Agentenordner)
 *  - `in_use`           → ein anderer Agent hat exakt diesen Ordner
 *  - `nested`           → Ordner liegt in einem anderen Agentenordner (oder umgekehrt)
 */
export type WorkspacePathErrorCode =
  | "empty"
  | "not_absolute"
  | "traversal"
  | "unc"
  | "drive_root"
  | "system_dir"
  | "home_root"
  | "protected_project"
  | "helium_profile"
  | "connect_data"
  | "workspaces_root"
  | "in_use"
  | "nested";

export type WorkspacePathValidation =
  | { ok: true; path: string; key: string }
  | { ok: false; code: WorkspacePathErrorCode; reason: string; path: string };

/** Ein geschützter Bereich, den kein Agent als Arbeitsordner bekommen darf. */
export type ProtectedRoot = {
  path: string;
  code: WorkspacePathErrorCode;
  /** Kurze Beschreibung für die Fehlermeldung (deutsch). */
  label: string;
};

/** Bereits vergebene Ordner (Agent-Id → Pfad), für die Eindeutigkeitsprüfung. */
export type TakenWorkspacePath = {
  agentId: string;
  path: string;
};

export type ValidateWorkspacePathOptions = {
  /** Agent, der den Ordner bekommen soll (bei reiner Prüfung `null`). */
  agentId?: string | null;
  /** Bereits vergebene Ordner. */
  taken?: readonly TakenWorkspacePath[];
  /** Workspace-Wurzel (Standard: `%LOCALAPPDATA%\ConnectAgents\workspaces`). */
  rootDir?: string;
  /** Zusätzliche geschützte Wurzeln (Tests/Verwaltung). */
  extraProtectedRoots?: readonly (ProtectedRoot | string)[];
};

/* ---------------------------------------------------------------------------------------- *
 * Ergebnisse des Managers
 * ---------------------------------------------------------------------------------------- */

/**
 * Alle Fehler des Managers. Die Pfad-Codes kommen aus der Validierung,
 * `disabled` bedeutet „Feature-Flag aus“ (dann passiert gar nichts).
 */
export type WorkspaceErrorCode =
  | "disabled"
  | "invalid_input"
  | WorkspacePathErrorCode
  | "not_found"
  | "not_a_directory"
  | "io_error"
  | "registry_error";

export type WorkspaceSuccess = {
  ok: true;
  enabled: true;
  workspace: AgentWorkspace;
  /** Ordner wurde neu angelegt (nicht nur registriert). */
  created: boolean;
  /** Ein archivierter Eintrag wurde wieder aktiviert. */
  reactivated?: boolean;
  /** Bei `assignProjectFolder`: Pfad hat sich gegenüber dem Eintrag geändert. */
  reassigned?: boolean;
};

export type WorkspaceFailure = {
  ok: false;
  enabled: boolean;
  code: WorkspaceErrorCode;
  reason: string;
};

export type WorkspaceOutcome = WorkspaceSuccess | WorkspaceFailure;

export type WorkspaceListResult = {
  enabled: boolean;
  rootDir: string;
  workspaces: AgentWorkspace[];
  /** Gesetzt, wenn die Registry nicht lesbar war (dann leer gestartet). */
  loadError: string | null;
};

/* ---------------------------------------------------------------------------------------- *
 * Speicherplatz (für Monitor A09)
 * ---------------------------------------------------------------------------------------- */

export type WorkspaceDiskUsage = {
  path: string;
  bytes: number;
  files: number;
  directories: number;
  /** Symlinks/Junctions und zu tiefe Zweige — bewusst nicht verfolgt. */
  skipped: number;
  /** Bis zu `maxErrors` Meldungen (Zugriff verweigert o. ä.). */
  errors: string[];
  /** Messung wurde durch Grenzen/Abort abgebrochen. */
  truncated: boolean;
  measuredAt: string;
  durationMs: number;
};

export type AgentWorkspaceDiskUsage = WorkspaceDiskUsage & {
  agentId: string;
  slug: string;
  status: WorkspaceStatus;
};

export type WorkspaceDiskUsageReport = {
  enabled: boolean;
  rootDir: string;
  measuredAt: string;
  totalBytes: number;
  workspaces: AgentWorkspaceDiskUsage[];
  reason?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Optionale Datenbank-Spiegelung (A05: `agent_workspace`)
 * ---------------------------------------------------------------------------------------- */

export type WorkspaceDbRow = {
  agentId: string;
  path: string;
  updatedAt?: string;
};

/**
 * Schmale Schnittstelle zur Tabelle `agent_workspace` (A05).
 *
 * Die Registry-Datei bleibt die Wahrheit; die Datenbank ist eine Absicherung,
 * damit die Brücke den Pfad nach einem Verlust der JSON-Datei wiederfindet.
 * Fehlt die Tabelle (Migration noch nicht eingespielt), schluckt der Manager
 * den Fehler und arbeitet weiter — siehe Bericht A07.
 */
export type WorkspaceDbStore = {
  loadAll(): Promise<WorkspaceDbRow[]>;
  upsert(row: { agentId: string; path: string }): Promise<void>;
};

/* ---------------------------------------------------------------------------------------- *
 * Manager-Optionen
 * ---------------------------------------------------------------------------------------- */

export type AgentWorkspaceManagerOptions = {
  /** Überschreibt `%LOCALAPPDATA%\ConnectAgents\workspaces` (Tests). */
  rootDir?: string;
  /** Überschreibt den Pfad der Registry-Datei. */
  registryPath?: string;
  /** Flag-Prüfung; Standard ist `getT3Flag("bridge")` aus A01. */
  isEnabled?: () => boolean;
  now?: () => Date;
  log?: (message: string, detail?: Record<string, unknown>) => void;
  dbStore?: WorkspaceDbStore | null;
  /** Zusätzliche geschützte Wurzeln (Tests). */
  protectedRoots?: readonly (ProtectedRoot | string)[];
};
