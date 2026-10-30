/**
 * T3-Bridge — Avatar-Standards (Lane A31).
 *
 * Zwei Dinge an dieser Stelle, und beide sind bewusst klein:
 *
 *  - `defaultAvatarFor` ist die ABLEITUNG aus der Agent-ID. Sie ist deterministisch: derselbe
 *    Agent bekommt immer dieselbe Form. Das ist der Ersatz für einen gespeicherten Avatar bei
 *    Bots, die es schon gibt und deren Form noch niemand gewählt hat.
 *  - `randomAvatar` ist der WURF für neue Bots. Er wird einmal gewürfelt und dann gespeichert,
 *    damit der Bot ihn behält.
 *
 * Die Formen- und Farblisten kommen aus `../t3-bridge/contracts` (A01). Diese Datei erweitert die
 * Liste nicht, damit ein Wert, den A01 kennt, hier immer einen Avatar findet.
 *
 * Die Hash-Funktion ist bewusst FNV-1a: sie ist kurz, ohne Abhängigkeiten und liefert über
 * dieselbe Eingabe immer denselben Wert. Sie ist absichtlich KEINE kryptografische Funktion —
 * hier geht es um eine Form, nicht um Geheimnisse.
 */

import {
  AVATAR_COLORS,
  AVATAR_DEFAULT_COLOR,
  AVATAR_SHAPES,
  type AvatarColor,
  type AvatarShape,
} from "../t3-bridge/contracts";

/** Die Ausdrücke, die der Vertrag (A01) kennt. */
export const AVATAR_EXPRESSIONS = [
  "neutral",
  "happy",
  "thinking",
  "wink",
  "wide",
  "alert",
  "sleep",
  "surprised",
] as const;

export type AvatarExpressionName = (typeof AVATAR_EXPRESSIONS)[number];

export function isAvatarExpression(
  value: unknown,
): value is AvatarExpressionName {
  return (
    typeof value === "string" &&
    (AVATAR_EXPRESSIONS as readonly string[]).includes(value)
  );
}

export type AvatarDefaults = {
  shape: AvatarShape;
  color: AvatarColor;
};

/**
 * FNV-1a über die Agent-ID.
 *
 * 32 Bit, damit der Wert auf jeder Plattform derselbe ist. `Math.imul` rechnet mit 32-Bit-
 * Ganzzahlen und schneidet sonst still ab, was die Verteilung der Formen verzerren würde.
 */
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
 * Orange ist der Standard, weil der Vertrag (A01) Orange als Standardfarbe führt und die
 * Maskottchen im Grok-Dialog denselben Ton als Hausfarbe haben. Stefans Wunsch nach mehr
 * Vielfalt lässt sich über `colorFromHash` einschalten, ohne dass sich etwas hier ändert.
 */
export function defaultAvatarFor(
  agentId: string,
  options: { colorFromHash?: boolean } = {},
): AvatarDefaults {
  const hash = hashAgentId(agentId);
  const shape = AVATAR_SHAPES[hash % AVATAR_SHAPES.length] as AvatarShape;
  const color = options.colorFromHash
    ? (AVATAR_COLORS[(hash >>> 8) % AVATAR_COLORS.length] as AvatarColor)
    : AVATAR_DEFAULT_COLOR;
  return { shape, color };
}

/**
 * Ein zufälliger Avatar für einen neuen Bot.
 *
 * Das Ergebnis wird einmal gewürfelt und danach gespeichert. Ein Bot, der die Farbe wechselt,
 * weil jemand die Seite neu geladen hat, wäre kein zufälliger Avatar, sondern ein flackernder.
 */
export function randomAvatar(
  options: { random?: () => number; colorFromHash?: boolean } = {},
): AvatarDefaults {
  const random = options.random ?? Math.random;
  const shape = AVATAR_SHAPES[
    Math.floor(random() * AVATAR_SHAPES.length)
  ] as AvatarShape;
  const color = options.colorFromHash
    ? (AVATAR_COLORS[
        Math.floor(random() * AVATAR_COLORS.length)
      ] as AvatarColor)
    : AVATAR_DEFAULT_COLOR;
  return { shape, color };
}
