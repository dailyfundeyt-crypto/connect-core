/**
 * Avatar-Helfer für die Connect-App (Lane A31).
 *
 * Zwei Fragen, die der Client stellen muss:
 *  - Welchen Avatar hat dieser Bot? (`getAgentAvatar`)
 *  - Wie sieht der Avatar aus, wenn der Server noch keinen kennt? (`defaultAgentAvatar`)
 *
 * Der Cache hier ist ein Memo: ein Bot, dessen Avatar einmal geladen wurde, wird nicht bei
 * jedem Render erneut gefragt. Er ist absichtlich flüchtig — er lebt nur in diesem Fenster und
 * wird nach einem `PUT` verworfen, damit das neue Maskottchen sofort da ist.
 *
 * Solange das Feature-Flag `mascot` aus ist, wird nichts geladen und nichts geändert. Der
 * Aufrufer benutzt dann weiterhin die bisherigen Bilder aus `connect-avatars.ts`. Das alte
 * Verhalten bleibt damit vollständig erhalten.
 */

import {
  type AgentAvatar,
  AVATAR_COLORS,
  AVATAR_SHAPES,
  type AvatarColor,
  type AvatarShape,
  getT3Flag,
} from "@/lib/t3/contracts";
import { resolveBotAvatarUrl } from "./connect-avatars";

export type { AgentAvatar, AvatarColor, AvatarShape };

/** FNV-1a, 32 Bit. Dieselbe Funktion wie auf dem Server (`apps/server/src/agent-avatar/defaults.ts`). */
export function hashAgentId(agentId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < agentId.length; index += 1) {
    hash ^= agentId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Der Standardavatar eines Agenten: Form aus dem Hash der ID, Farbe Orange.
 *
 * Das ist derselbe Wert, den der Server ableitet. Der Client braucht ihn für den Moment, in dem
 * der Server noch nicht geantwortet hat — sonst flackert das Maskottchen beim Laden.
 */
export function defaultAgentAvatar(
  agentId: string,
  options: { colorFromHash?: boolean } = {},
): {
  shape: AvatarShape;
  color: AvatarColor;
} {
  const hash = hashAgentId(agentId);
  return {
    shape: AVATAR_SHAPES[hash % AVATAR_SHAPES.length] as AvatarShape,
    color: options.colorFromHash
      ? (AVATAR_COLORS[(hash >>> 8) % AVATAR_COLORS.length] as AvatarColor)
      : "orange",
  };
}

/** Der Cache. Ein `Map` genügt: die Anzahl der Bots ist klein. */
const avatarCache = new Map<string, AgentAvatar>();

/** Löscht den Cache ganz. Nach einem PUT wird nur der eine Bot vergessen. */
export function clearAgentAvatarCache(agentId?: string): void {
  if (agentId) {
    avatarCache.delete(agentId);
    return;
  }
  avatarCache.clear();
}

/** Der Cache-Inhalt, ohne einen Request. Für Tests und für den Render-Pfad. */
export function peekAgentAvatar(agentId: string): AgentAvatar | undefined {
  return avatarCache.get(agentId);
}

/**
 * Welches Bild ein Agent anzeigt.
 *
 * `mascot` heißt: der Maskottchen-Avatar ist da und wird von der Avatar-Komponente (A29)
 * gezeichnet. `image` heißt: das bisherige Bot-Bild aus `connect-avatars.ts`, unverändert.
 *
 * Solange das Flag aus ist, kommt immer `image` — so bleibt das bisherige Bild in jeder Ansicht
 * erhalten, die den Avatar noch nicht kennt.
 */
export type AgentAvatarPresentation =
  | { kind: "mascot"; avatar: AgentAvatar }
  | { kind: "image"; url: string };

export function resolveAgentAvatar(
  agentId: string,
  avatar?: AgentAvatar | null,
): AgentAvatarPresentation {
  if (getT3Flag("mascot") && avatar) {
    return { kind: "mascot", avatar };
  }
  return { kind: "image", url: resolveBotAvatarUrl(agentId) };
}

/**
 * Ein zufälliger Avatar für einen neuen Bot.
 *
 * Die Form wird gewürfelt, die Farbe bleibt Orange. Wird der Avatar danach auf dem Server
 * gespeichert, ist er dauerhaft — gewürfelt wird nur einmal.
 */
export function randomAgentAvatar(options: { random?: () => number } = {}): {
  shape: AvatarShape;
  color: AvatarColor;
} {
  const random = options.random ?? Math.random;
  return {
    shape: AVATAR_SHAPES[
      Math.floor(random() * AVATAR_SHAPES.length)
    ] as AvatarShape,
    color: "orange",
  };
}

export type GetAgentAvatarOptions = {
  /** Erzwingt das Neuladen statt des Caches. */
  refresh?: boolean;
  signal?: AbortSignal;
};

/**
 * Liest den Avatar eines Agenten.
 *
 * Hinter dem Flag `mascot`: ist es aus, gibt es keinen Request und keinen Cache-Eintrag. Der
 * Aufrufer bleibt beim bisherigen Bild und fragt hier nichts ab.
 */
export async function getAgentAvatar(
  agentId: string,
  options: GetAgentAvatarOptions = {},
): Promise<AgentAvatar | null> {
  if (!getT3Flag("mascot")) return null;

  if (!options.refresh) {
    const cached = avatarCache.get(agentId);
    if (cached) return cached;
  }

  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/avatar`,
    {
      credentials: "include",
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Avatar für Agent '${agentId}' konnte nicht geladen werden.`,
    );
  }

  const avatar = (await response.json()) as AgentAvatar;
  avatarCache.set(agentId, avatar);
  return avatar;
}

/**
 * Setzt Form, Farbe oder Ausdruck eines Agenten.
 *
 * Nur der Besitzer darf das; der Server antwortet sonst mit 403. Nach dem Speichern ist der
 * Cache-Eintrag veraltet und wird ersetzt.
 */
export async function setAgentAvatar(
  agentId: string,
  patch: Partial<Pick<AgentAvatar, "shape" | "color" | "expression">>,
  options: { signal?: AbortSignal } = {},
): Promise<AgentAvatar> {
  if (!getT3Flag("mascot")) {
    throw new Error("Avatare sind gerade nicht verfügbar.");
  }

  const response = await fetch(
    `/api/agents/${encodeURIComponent(agentId)}/avatar`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  const avatar = (await response.json()) as AgentAvatar;
  avatarCache.set(agentId, avatar);
  return avatar;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // Kein JSON - dann die Standardmeldung.
  }
  return "Avatar konnte nicht gespeichert werden.";
}
