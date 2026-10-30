/**
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Ruheausdruecke des Maskottchens.
 *
 * Das Gesicht besteht nur aus zwei Kapseln, also laeuft alles ueber vier
 * Hebel: die Kopforientierung, der Augenabstand, ihre Proportionen und die
 * eigene Neigung jedes Auges. Letztere erlaubt Wut und Traurigkeit: sie
 * verlangen NEIGUNGEN IM SPIEGEL (die Oberkanten konvergieren oder
 * divergieren), was mit dem Kopfrollen allein nicht geht, weil der beide
 * Augen gleich neigt.
 *
 * Der Vertrag (A01) kennt acht Ausdruecke. Sie bilden eine Auswahl der
 * sechzehn Original-Ausdruecke ab; die Ids sind die Vertrags-Ids.
 */

import type { AvatarExpression } from "@/lib/t3/contracts";
import { EYE_H, EYE_SPLIT, EYE_W, type HeadGaze, REST_GAZE } from "./face";
import { lerp } from "./math";

export type { AvatarExpression };

/** Konfiguration eines Auges. */
export interface EyeCfg {
  /** Breite in Einheiten des Kugelradius. */
  w: number;
  /** Hoehe in Einheiten des Kugelradius. */
  h: number;
  /** Neigung in Grad, positiv = Oberkante der Kapsel zeigt nach rechts. */
  tilt?: number;
  /** Offenheitsgrad 0..1 (fuer Schlaf). */
  open: number;
}

export interface BotExpression {
  id: AvatarExpression;
  gaze: HeadGaze;
  split: number;
  eyes: [EyeCfg, EyeCfg];
}

/** `tilt` in Grad, positiv = die Oberkante der Kapsel zeigt nach rechts. */
const eye = (w: number, h: number, tilt = 0, open = 1): EyeCfg => ({
  w,
  h,
  tilt,
  open,
});

/** Zwei identische Augen, bei `tilt` in Spiegelung. */
const pair = (w: number, h: number, tilt = 0, open = 1): [EyeCfg, EyeCfg] => [
  eye(w, h, tilt, open),
  eye(w, h, -tilt, open),
];

/**
 * Der neutrale Ausdruck als benannte Konstante.
 *
 * Er ist der Rueckfall fuer unbekannte Ids und die Basis jeder Interpolation,
 * deshalb steht er nicht nur in der Liste.
 */
const NEUTRAL: BotExpression = {
  // die an der Referenz-Video abgeglichene Ruhepose
  id: "neutral",
  gaze: { ...REST_GAZE },
  split: EYE_SPLIT,
  eyes: [eye(EYE_W, EYE_H), eye(EYE_W, EYE_H)],
};

export const EXPRESSIONS: readonly BotExpression[] = [
  NEUTRAL,
  {
    id: "happy",
    gaze: { yaw: 5, pitch: 9, roll: 0 },
    split: 17,
    // Augen in einem Bogen: die Oberkanten konvergieren leicht
    eyes: pair(0.27, 0.17, 14),
  },
  {
    id: "thinking",
    gaze: { yaw: 16, pitch: -9, roll: -15 },
    split: 16.5,
    eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)],
  },
  {
    id: "wink",
    gaze: { yaw: 12, pitch: 6, roll: -6 },
    split: 16,
    // ein Auge deutlich geschlossen, das andere offen
    eyes: [eye(0.21, 0.4), eye(0.22, 0.15)],
  },
  {
    id: "wide",
    gaze: { yaw: 3, pitch: -3, roll: 0 },
    split: 19,
    eyes: pair(0.45, 0.47),
  },
  {
    id: "alert",
    gaze: { yaw: 3, pitch: 7, roll: 0 },
    split: 17,
    // Oberkanten konvergieren stark, Augen schmal
    eyes: pair(0.34, 0.15, 30),
  },
  {
    id: "sleep",
    gaze: { yaw: 6, pitch: -9, roll: -3 },
    split: 16,
    // halb geschlossene Lider ueber `open`, also derselbe Mechanismus
    // wie beim Blinzeln
    eyes: pair(0.2, 0.42, 0, 0.42),
  },
  {
    id: "surprised",
    gaze: { yaw: 2, pitch: -20, roll: 0 },
    split: 20.5,
    eyes: pair(0.4, 0.6),
  },
];

const EXPRESSION_BY_ID = new Map<string, BotExpression>(
  EXPRESSIONS.map((e) => [e.id, e]),
);

export const DEFAULT_EXPRESSION: AvatarExpression = "neutral";

/** Ausdruck eines Vertragswerts. Unbekanntes faellt auf `neutral` zurueck. */
export function expressionProfile(id: string): BotExpression {
  return EXPRESSION_BY_ID.get(id) ?? NEUTRAL;
}

const lerpEyeCfg = (a: EyeCfg, b: EyeCfg, t: number): EyeCfg => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
  open: lerp(a.open, b.open, t),
});

/** Interpolation zweier Ausdruecke: der Wechsel geschieht gleitend. */
export function blendExpression(
  a: BotExpression,
  b: BotExpression,
  t: number,
): BotExpression {
  return {
    id: b.id,
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [
      lerpEyeCfg(a.eyes[0], b.eyes[0], t),
      lerpEyeCfg(a.eyes[1], b.eyes[1], t),
    ],
  };
}
