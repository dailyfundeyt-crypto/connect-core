export type AgentVisibility = "public" | "private";

export type AgentActor = {
  id: string;
  role: "admin" | "user";
};

/**
 * CLI-Engine-Konfiguration (Stufe 1.1+).
 *
 * Wenn `engine = "cli"` gesetzt ist, läuft der Agent auf einer der
 * installierten CLI-Engines (Antigravity, Codex, Claude). Das ist der
 * Standard für Connect-Bots ohne eigene Endpoint.
 *
 * Wenn `endpoint` gesetzt ist, läuft er auf einer externen AG-UI-URL.
 * Wenn keines von beiden gesetzt ist, läuft er auf dem lokalen Bot.
 */
export type CliEngine = {
  kind: "antigravity" | "codex" | "claude";
  /** Default "auto" — die CLI wählt ihr eigenes Modell. */
  model: string;
  /** Ob die CLI Dateien schreiben darf. Default false (read-only). */
  allowWrite: boolean;
};

/**
 * Browser-Profile-Engine (Stufe 2 Phase C).
 *
 * Ein Agent kann ein Helium-Browser-Profil haben, das beim Öffnen
 * automatisch eine Start-URL lädt. Das Profil ist persistent (Cookies,
 * LocalStorage, etc.) und der Agent kann den Browser nutzen.
 */
export type BrowserProfileEngine = {
  kind: "browser_profile";
  /** URL die beim Öffnen des Agent-Browsers automatisch geladen wird. */
  startUrl: string;
  /** Name des Browser-Profils im %LOCALAPPDATA%/Helium/profiles/-Verzeichnis. */
  profileName: string;
  /** Ob der Browser schreibend agieren darf (Formulare ausfüllen, etc.). */
  allowWrite: boolean;
};

/**
 * Manus-Cloud-Engine (Stufe 3).
 *
 * Wenn diese Engine gesetzt ist, läuft der Agent auf Manus 1.5/1.6 mit
 * dem globalen Manus-API-Key (der vom Server gelesen wird). Ideal für
 * Aufgaben, die Cloud-Compute brauchen (lange Tasks, Background-Jobs,
 * Mail-Manus, geteilte Results).
 */
export type ManusEngine = {
  kind: "manus";
  /** Default "auto" — Manus wählt das Modell. */
  model: string;
  /** Optional: Agent-Manus-Profile (login session) — für Multi-Account */
  profileName?: string;
};

/**
 * Sidecar-Browser-Use-Engine (Stufe 3).
 *
 * Wenn diese Engine gesetzt ist, läuft der Agent über den
 * browser-use Python-Sidecar (lokaler Service, Port 8765). Der Sidecar
 * ist ein vollwertiger Browser-Use-Agent, der z.B. Formulare ausfüllen
 * oder mehrere Seiten besuchen kann.
 */
export type BrowserUseEngine = {
  kind: "browser_use";
  /** Optionale Start-URL die der Sidecar zuerst öffnet. */
  startUrl?: string;
  /** Ob der Sidecar schreibend agieren darf. Default false. */
  allowWrite: boolean;
};

/**Union aller Engine-Typen. */
export type AgentEngine = CliEngine | BrowserProfileEngine | ManusEngine | BrowserUseEngine;

export type AgentProfile = {
  id: string;
  name: string;
  title: string;
  roleDescription: string;
  avatarSeed: string;
  visibility: AgentVisibility;
  ownerUserId: string | null;
  systemOwned: boolean;
  hidden: boolean;
  deletedAt: Date | null;
  /** Where this coworker runs. Null for the Bot in the box. */
  endpoint: string | null;
  /** Whether a key is set for it. Never the key. */
  hasAuth: boolean;
  /**
   * Whether this agent holds a credential for calling tools back.
   *
   * A boolean, never the token: the token exists in a readable form once, in the response that issued
   * it. A surface only needs to know whether to offer "generate" or "rotate".
   */
  hasCallbackToken: boolean;
  /** Engine-Konfiguration (Stufe 1.1+): CLI oder Browser-Profile. */
  engine: AgentEngine | null;
};

export type CreateAgentInput = Pick<
  AgentProfile,
  "name" | "title" | "roleDescription" | "visibility"
> & {
  /**
   * The AG-UI endpoint this Bot runs on, or undefined for the one in the box.
   *
   * This field is the AG-UI endpoint for a customer-provided agent. Without it the Bot runs on the
   * built-in endpoint.
   */
  endpoint?: string;
  /**
   * A key this agent sits behind, if any.
   *
   * Write-only. It goes to the vault and is never read back to a person: the edit form shows that a
   * key is set, not what it is. Absent on an update means "leave whatever is there alone", which is
   * why it is optional rather than defaulting to empty; a blank field must not drop a key.
   */
  auth?: { header: string; value: string };
  /**
   * CLI-Engine-Konfiguration (Stufe 1.1+). Optional: wenn nicht gesetzt,
   * nutzt der Agent das lokale Modell (ohne CLI).
   */
  cliEngine?: CliEngine;
  /**
   * Browser-Profile-Engine (Stufe 2 Phase C). Optional: wenn nicht gesetzt,
   * hat der Agent kein eigenes Browser-Profil.
   */
  browserProfile?: BrowserProfileEngine;
  /**
   * Manus-Cloud-Engine (Stufe 3). Optional: wenn nicht gesetzt, läuft
   * der Agent nicht auf Manus. Erfordert globalen Manus-API-Key
   * (MANUS_API_KEY) auf dem Server.
   */
  manusEngine?: ManusEngine;
  /**
   * browser-use Sidecar-Engine (Stufe 3). Optional: wenn nicht gesetzt,
   * nutzt der Agent nicht den Sidecar. Erfordert laufenden Sidecar auf
   * $BROWSER_USE_URL (default http://127.0.0.1:8765).
   */
  browserUseEngine?: BrowserUseEngine;
};
