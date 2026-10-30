/**
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Formen und Farben des Maskottchens.
 *
 * Anders als die Animations-Silhouetten (profiles.ts) sind diese Formen NICHT
 * von der Referenz-Video abgetastet: sie werden analytisch gebaut. Zwei
 * Quellen, und das ist Absicht - die Video-Profile bleiben dem gemessenen
 * Motiv treu, die Grundformen sind eine Gestaltungsentscheidung.
 *
 * Die Ids der Formen und Farben sind die A01-Vertragswerte
 * (`AvatarShape` / `AvatarColor` aus `@/lib/t3/contracts`), damit die
 * Komponente ohne Uebersetzung direkt mit dem Vertrag arbeiten kann.
 */

import type { AvatarColor, AvatarShape } from "@/lib/t3/contracts";
import { PROFILE_SAMPLES, PROFILES } from "./profiles";
import {
  hullOfCircles,
  type Point,
  profileFromPolygon,
  regularPolygonProfile,
  roundedPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile,
} from "./shape";

export type { AvatarColor, AvatarShape };

/**
 * Zwei Formen (Zahnrad, Ei) gehen ueber den A01-Vertrag (Stand 29.10.2026)
 * hinaus. Sie sind hier vorgezogen, damit die Komponente die geforderten
 * 14 Formen anbietet; der Vertrag muss nachgezogen werden (Wunsch an A01).
 */
export type ExtraAvatarShape = "gear" | "egg";

/** Alle Formen des Maskottchens: Vertragsformen plus die zwei Ergaenzungen. */
export type BotAvatarShape = AvatarShape | ExtraAvatarShape;

/** Radiusfunktion eines Maskottchens: 64 Stichpunkte, theta im Uhrzeigersinn. */
export interface AvatarShapeProfile {
  /** Vertrags-Id der Form. */
  id: BotAvatarShape;
  /** Radien an den 64 Stichpunkten, normiert auf max. 1. */
  radii: number[];
}

/** Ramene den maximalen Radius auf `max`, damit alle Formen gleich schwer wirken. */
function normalize(radii: number[], max = 1): number[] {
  const peak = Math.max(...radii);
  if (peak <= 0) return radii;
  const k = max / peak;
  return radii.map((r) => r * k);
}

const ANGLES = Array.from(
  { length: PROFILE_SAMPLES },
  (_, i) => (i / PROFILE_SAMPLES) * Math.PI * 2,
);

/** Galet: Kreis, durch zwei tiefe Harmoniken verformt - unregelmaessig, aber glatt. */
const pebble = normalize(
  ANGLES.map(
    (a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1),
  ),
  1.02,
);

/** Nuage: Vereinigung von Noppen, breit unten, zwei Lappen oben. */
const cloud = normalize(
  unionOfCirclesProfile([
    { x: -0.44, y: 0.2, r: 0.54 },
    { x: 0.46, y: 0.2, r: 0.5 },
    { x: 0.02, y: 0.3, r: 0.6 },
    { x: -0.24, y: -0.3, r: 0.48 },
    { x: 0.3, y: -0.24, r: 0.44 },
  ]),
  1.02,
);

/** Goutte: grosser Kreis unten, auslaufende Spitze oben. */
const droplet = normalize(
  profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0),
  1.04,
);

/** Capsule: Huelle zweier Kreise nebeneinander. */
const capsule = normalize(
  profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0),
  1.04,
);

/** Raute: Quadrat, um 45 Grad gedreht, weich abgerundet. */
const diamond = normalize(regularPolygonProfile(4, 1.08, 0.14, -90), 1.04);

/** Stern: fuenf Zacken, weich abgerundet. */
function starProfile(points: number, inner: number, radius: number): number[] {
  const verts: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * inner;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return normalize(roundedPolygonProfile(verts, radius * 0.09), 1.04);
}

/** Blume: fuenf Bluetenblaetter plus Kern. */
const flower = normalize(
  unionOfCirclesProfile([
    { x: 0, y: 0, r: 0.5 },
    { x: 0, y: -0.52, r: 0.42 },
    { x: 0.49, y: -0.16, r: 0.42 },
    { x: -0.49, y: -0.16, r: 0.42 },
    { x: 0.3, y: 0.4, r: 0.42 },
    { x: -0.3, y: 0.4, r: 0.42 },
  ]),
  1.04,
);

/** Kuerbis: breiter, in Lappen geteilter Koerper. */
const pumpkin = normalize(
  unionOfCirclesProfile([
    { x: -0.44, y: 0.08, r: 0.46 },
    { x: 0, y: 0.04, r: 0.52 },
    { x: 0.44, y: 0.08, r: 0.46 },
    { x: 0, y: -0.18, r: 0.34 },
  ]),
  1.04,
);

/** Zahnrad: zehn Zaehne, flache Spitzen, tiefer Einschnitt dazwischen. */
function gearProfile(teeth: number, radius: number, root: number): number[] {
  const verts: Point[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const half = step * 0.26;
    const rootHalf = step * 0.42;
    verts.push({
      x: Math.cos(a - rootHalf) * root,
      y: Math.sin(a - rootHalf) * root,
    });
    verts.push({
      x: Math.cos(a - half) * radius,
      y: Math.sin(a - half) * radius,
    });
    verts.push({
      x: Math.cos(a + half) * radius,
      y: Math.sin(a + half) * radius,
    });
    verts.push({
      x: Math.cos(a + rootHalf) * root,
      y: Math.sin(a + rootHalf) * root,
    });
  }
  return normalize(roundedPolygonProfile(verts, radius * 0.05), 1.04);
}

/**
 * Die 14 Formen des Maskottchens.
 *
 * Die ersten acht stammen aus dem Personalisierer des Grok-Bots (dort mit
 * franzoesischen Ids, hier mit den Vertrags-Ids). Die sechs weiteren sind
 * analytisch ergaenzt: Raute, Stern, Blume, Kuerbis, Zahnrad und Ei.
 */
export const AVATAR_SHAPE_PROFILES: readonly AvatarShapeProfile[] = [
  { id: "circle", radii: new Array(PROFILE_SAMPLES).fill(1) },
  { id: "pebble", radii: pebble },
  // 1.15 statt 1.02: bei einer Superellipse ist der maximale Radius die Diagonale,
  // und darueber normalisiert wirkt die Form kleiner als der Kreis.
  { id: "squircle", radii: normalize(superellipseProfile(4.2), 1.15) },
  { id: "capsule", radii: capsule },
  // Die gemessenen Video-Profile bleiben unangetastet: sie sind das Originalmotiv.
  { id: "triangle", radii: [...PROFILES.triangle] },
  { id: "hexagon", radii: [...PROFILES.hexagon] },
  { id: "cloud", radii: cloud },
  { id: "drop", radii: droplet },
  { id: "diamond", radii: diamond },
  { id: "star", radii: starProfile(5, 0.46, 1.06) },
  { id: "flower", radii: flower },
  { id: "pumpkin", radii: pumpkin },
  { id: "gear", radii: gearProfile(10, 1.02, 0.78) },
  { id: "egg", radii: [...PROFILES.egg] },
];

/** Vertragsformen, die der A01-Vertrag kennt. */
export const CONTRACT_SHAPES: readonly AvatarShape[] = [
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

/** Zusaetzliche Formen, die ueber den A01-Vertrag hinausgehen. */
export const EXTRA_SHAPES: readonly ExtraAvatarShape[] = ["gear", "egg"];

const SHAPE_BY_ID = new Map<string, AvatarShapeProfile>(
  AVATAR_SHAPE_PROFILES.map((s) => [s.id, s]),
);

export const DEFAULT_SHAPE: BotAvatarShape = "circle";

/** Das Profil des Kreises: der Rueckfall fuer unbekannte Formen. */
const CIRCLE_RADII = new Array(PROFILE_SAMPLES).fill(1);

/** Radienprofil einer Form. Unbekannte Formen fallen auf den Kreis zurueck. */
export function shapeRadii(id: string): number[] {
  return SHAPE_BY_ID.get(id)?.radii ?? CIRCLE_RADII;
}

/** Farbe des Maskottchens. */
export interface AvatarColorProfile {
  id: AvatarColor;
  hex: string;
  /** Augenfarbe: bei dunklen Koerpern hell, sonst dunkel. */
  eye: string;
}

/**
 * Die Palette des Personalisierers. Orange ist der Standard, weil es der
 * x.ai-Vorgabe entspricht.
 */
export const AVATAR_COLORS: readonly AvatarColorProfile[] = [
  { id: "white", hex: "#f7f7f5", eye: "#23232b" },
  { id: "ink", hex: "#0a0a0c", eye: "#f1efe9" },
  { id: "brown", hex: "#8b5e3c", eye: "#f1efe9" },
  { id: "red", hex: "#e8483f", eye: "#f1efe9" },
  { id: "orange", hex: "#f08a24", eye: "#f1efe9" },
  { id: "amber", hex: "#f0b429", eye: "#23232b" },
  { id: "green", hex: "#3ecf8e", eye: "#23232b" },
  { id: "turquoise", hex: "#2fbfa0", eye: "#23232b" },
  { id: "blue", hex: "#3b93f0", eye: "#f1efe9" },
  { id: "violet", hex: "#8b5cf6", eye: "#f1efe9" },
  { id: "pink", hex: "#e152b0", eye: "#23232b" },
  { id: "gray", hex: "#a3a3a3", eye: "#23232b" },
  { id: "cream", hex: "#f1efe9", eye: "#23232b" },
];

export const DEFAULT_COLOR: AvatarColor = "orange";

const COLOR_BY_ID = new Map<string, AvatarColorProfile>(
  AVATAR_COLORS.map((c) => [c.id, c]),
);

/** Die Standardfarbe: der Rueckfall fuer unbekannte Farben. */
const ORANGE: AvatarColorProfile = {
  id: "orange",
  hex: "#f08a24",
  eye: "#f1efe9",
};

/** Farbe einer Vertragsfarbe. Unbekannte Farben fallen auf Orange zurueck. */
export function colorProfile(id: string): AvatarColorProfile {
  return COLOR_BY_ID.get(id) ?? ORANGE;
}

/** Mischt zwei Hex-Farben. */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string) => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const a = parse(from);
  const b = parse(to);
  const c = a.map((x, i) => Math.round(x + ((b[i] ?? x) - x) * t));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
