/**
 * Avatar-Ableitung aus der Agent-ID (Lane A28).
 *
 * EIGENTÜMER: A28.
 *
 * Connect hat heute `AbstractAvatar` (`@/components/agents/abstract-avatar`), das
 * ein **Bild** lädt (`resolveBotAvatarUrl`). Das Maskottchen-Modell von A29
 * (Form + Farbe, Vertrag `AgentAvatar` aus A01) ist server-seitig gespeichert —
 * für 40 Agenten im Raster wäre ein Hook je Agent (`useAgentAvatar`) zu teuer.
 *
 * Deshalb leitet diese Datei aus der Agent-ID **stabil** Form und Farbe ab:
 * gleiche Agent-ID → gleicher Avatar, in jeder Sitzung, ohne Netzwerk. Das ist
 * dieselbe Idee, die A31 („Avatar-Speicherung & Zufalls-Standard") für den
 * serverseitigen Avatar verfolgt — diese Datei ist der Übergang, bis A31 eine
 * Sammel-Endpunkt liefert.
 *
 * Wunsch an A31 (im Bericht vermerkt): ein Endpunkt, der alle Avatare einer
 * Firma in einem Aufruf liefert, damit das Raster die gespeicherten Avatare
 * statt der abgeleiteten zeigen kann.
 */

import type { AvatarColor, AvatarShape } from "@/lib/t3/contracts";

/** Die Formen, die der Vertrag (A01) kennt. */
const SHAPES: AvatarShape[] = [
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
];

/** Die Farben, die der Vertrag (A01) kennt. */
const COLORS: AvatarColor[] = [
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
];

/** Stabiler 32-Bit-Hash (FNV-1a). */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Form + Farbe stabil aus der Agent-ID ableiten.
 */
export function deriveAgentAvatar(agentId: string): {
  shape: AvatarShape;
  color: AvatarColor;
} {
  const h = hashString(agentId || "agent");
  const shape = SHAPES[h % SHAPES.length] ?? "circle";
  const color = COLORS[(h >>> 8) % COLORS.length] ?? "orange";
  return { shape, color };
}
