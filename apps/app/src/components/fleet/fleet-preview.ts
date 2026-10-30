/**
 * Die Vorschau der Massen-Anlage (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Hier wird aus dem Backlog eine **Vorschau** — eine Liste von Agenten, die
 * angelegt würden. Diese Liste entsteht, indem die Idee mit einem
 * **stabilen Hash** in einen Agentennamen, eine CLI, einen Arbeitsordner-Namen
 * und ein Maskottchen übersetzt wird.
 *
 * Wichtig: Die Vorschau ist eine **Vorhersage**, keine Anlage. Sie ruft
 * keinen schreibenden Endpunkt auf. Erst der Klick auf „Anlegen“ schreibt —
 * und auch dann nur, wenn `confirm: true` mitgeht (der Server prüft das
 * noch einmal).
 *
 * Die Ableitungen sind bewusst **deterministisch**: dieselbe Idee ergibt
 * denselben Vorschau-Namen, denselben Ordner-Namen und dasselbe Maskottchen.
 * Sonst würde die Vorschau beim erneuten Öffnen anders aussehen als beim
 * Anlegen, und der Dialog wäre unzuverlässig.
 */

import type { FleetCliId, FleetIdea } from "./fleet-client";
import { FLEET_CLI_LABELS } from "./fleet-client";

/** Die Formen, die der Vertrag (A01) kennt. */
export const FLEET_AVATAR_SHAPES = [
  "circle",
  "pebble",
  "squircle",
  "capsule",
  "triangle",
  "hexagon",
  "cloud",
  "drop",
  "diamond",
  "star",
  "flower",
  "pumpkin",
] as const;

/** Die Farben, die der Vertrag (A01) kennt. */
export const FLEET_AVATAR_COLORS = [
  "white",
  "ink",
  "brown",
  "red",
  "orange",
  "amber",
  "green",
  "turquoise",
  "blue",
  "violet",
  "pink",
  "gray",
  "cream",
] as const;

export type FleetAvatarShape = (typeof FLEET_AVATAR_SHAPES)[number];
export type FleetAvatarColor = (typeof FLEET_AVATAR_COLORS)[number];

/** FNV-1a — derselbe Hash wie in A31 (`hashAgentId`). */
export function hashFleetIdea(ideaId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < ideaId.length; index += 1) {
    hash ^= ideaId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Der Ordnername, den der Agent bekommen würde.
 *
 * Dieselben Regeln wie A07 (`slugifyAgentName`): nur `a-z`, `0-9` und `-`,
 * Umlaute werden transliteriert, Höchstlänge 48. Deshalb ist der Ordner hier
 * eine **Vorhersage** — der Server vergibt den endgültigen Namen und hängt
 * bei Namensgleichheit `-2` an.
 */
export function previewWorkspaceSlug(name: string): string {
  const lower = name.trim().toLowerCase();
  const transliterated = lower
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  return slug || "agent";
}

/**
 * Das Maskottchen aus der Ideen-ID.
 *
 * Form und Farbe kommen aus dem Hash — so sieht die Vorschau aus wie der
 * Agent danach aussehen wird, statt bei jedem Öffnen zu flackern.
 */
export function previewAvatar(ideaId: string): {
  shape: FleetAvatarShape;
  color: FleetAvatarColor;
} {
  const hash = hashFleetIdea(ideaId || "idee");
  return {
    shape: FLEET_AVATAR_SHAPES[hash % FLEET_AVATAR_SHAPES.length] ?? "circle",
    color:
      FLEET_AVATAR_COLORS[(hash >>> 8) % FLEET_AVATAR_COLORS.length] ?? "orange",
  };
}

/** Eine Zeile der Vorschau. */
export type FleetPreviewRow = {
  idea: FleetIdea;
  /** Der Name des Agenten. */
  name: string;
  /** Die CLI, auf der er laufen soll. */
  cli: FleetCliId;
  /** Die CLI im Klartext. */
  cliLabel: string;
  /** Der Ordnername, den er bekommen würde. */
  workspaceSlug: string;
  /** Das Maskottchen. */
  avatar: { shape: FleetAvatarShape; color: FleetAvatarColor };
};

/**
 * Baut die Vorschau aus den Ideen.
 *
 * Doppelte Namen werden **nicht** stillschweigend umbenannt: die zweite
 * Zeile behält ihren Namen, und der Server meldet beim Anlegen, dass der
 * Name belegt ist. Ein stillschweigend geänderter Name wäre ein Agent, den
 * Stefan später nicht wiederfindet.
 */
export function buildFleetPreview(
  ideas: readonly FleetIdea[],
): FleetPreviewRow[] {
  return ideas.map((idea) => {
    const name = idea.name?.trim() || idea.title?.trim() || "Agent";
    return {
      idea,
      name,
      cli: idea.cli,
      cliLabel: FLEET_CLI_LABELS[idea.cli] ?? idea.cli,
      workspaceSlug: previewWorkspaceSlug(name),
      avatar: previewAvatar(idea.id || idea.title),
    };
  });
}
