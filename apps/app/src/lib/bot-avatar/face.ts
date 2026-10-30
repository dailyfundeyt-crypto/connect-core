/**
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Die Augen sind auf eine Kugel gemalt, nicht flach darauf gesetzt.
 *
 * Gemessen an der Referenz-Video: das naeher am Rand liegende Auge ist 0.69
 * mal so breit wie das andere und hat 0.663 mal dessen Flaeche - genau der
 * Tiefenfaktor (z = 0.669) eines Kugelpunktes in diesem Abstand zum Zentrum.
 * Modelliert wird deshalb eine echte Kopforientierung: jedes Auge holt sich
 * das Tangenten-Basis des Kugelpunktes und wird orthografisch projiziert.
 * Kompression und Neigung fallen damit von selbst ab - das erzeugt das
 * Volumen.
 */

import { clamp, createRng, loopNoise } from "./math";

type Vec3 = [number, number, number];

/** Halber Abstand der Augen auf der Kugel, in Grad (Gesamtabstand ~31 Grad). */
export const EYE_SPLIT = 15.46;
/** Breite des Auges im Ruhezustand, in Einheiten des Kugelradius. */
export const EYE_W = 0.186;
/** Hoehe des Auges im Ruhezustand, in Einheiten des Kugelradius. */
export const EYE_H = 0.412;

/** Ruhende Kopforientierung, an den Referenzbildern abgeglichen. */
export const REST_GAZE: HeadGaze = { yaw: 28.49, pitch: 28.62, roll: -13 };

export interface EyePose {
  x: number;
  y: number;
  /** Tangenten-Matrix 2x2: [a b c d] im SVG-Sinn matrix(a,b,c,d,e,f) */
  a: number;
  b: number;
  c: number;
  d: number;
  /** z-Komponente der Normale: > 0 = sichtbare Seite */
  depth: number;
}

export interface HeadGaze {
  /** Gieren, Grad, positiv = schaut nach rechts */
  yaw: number;
  /** Nicken, Grad, positiv = schaut nach oben */
  pitch: number;
  /** Rollen, Grad, Neigung des Kopfes */
  roll: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Dreht zwei Vektoren eines orthonormalen Systems in ihrer gemeinsamen Ebene. */
function spin(u: Vec3, v: Vec3, angle: number): [Vec3, Vec3] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
    [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s],
  ];
}

/**
 * Augenreperes des Kopfes und der beiden Augen.
 * Bildschirm: x nach rechts, y nach unten, z zum Betrachter.
 * Index 0 ist das innere Auge, Index 1 das aeussere.
 */
export function eyePoses(
  gaze: HeadGaze,
  scale: number,
  split = EYE_SPLIT,
): [EyePose, EyePose] {
  let f: Vec3 = [0, 0, 1];
  let right: Vec3 = [1, 0, 0];
  let down: Vec3 = [0, 1, 0];

  [f, right] = spin(f, right, deg(gaze.yaw));
  [down, f] = spin(down, f, deg(gaze.pitch));
  [right, down] = spin(right, down, deg(gaze.roll));

  const build = (side: number): EyePose => {
    const [ef, er] = spin(f, right, deg(split * side));
    return {
      x: ef[0] * scale,
      y: ef[1] * scale,
      a: er[0],
      b: er[1],
      c: down[0],
      d: down[1],
      depth: ef[2],
    };
  };

  return [build(-1), build(1)];
}

/**
 * Lebendigkeit im Ruhezustand: langsame Blickdrift, Sakkaden, Blinzeln.
 *
 * Reine Funktion der Zeit (kein innerer Zustand), also liefern Pause,
 * Fortsetzung und Sprung an ein beliebiges Datum immer dasselbe Bild. Die
 * Werte sind DELTA-WERTE, die auf die Pose des aktuellen Zustands kommen.
 */
export interface Liveliness {
  dYaw: number;
  dPitch: number;
  dRoll: number;
  /** 1 = Auge offen, 0 = geschlossen (vertikale Stauchung im Bildraum) */
  lid: number;
  driftX: number;
  driftY: number;
  breath: number;
}

const BLINK_RNG = createRng(0x5eed);
/** Vorab gezogener Blink-Kalender: deterministisch und zustandslos. */
const BLINKS: number[] = (() => {
  const out: number[] = [];
  let t = 1.4;
  while (t < 900) {
    out.push(t);
    // 1.9 bis 4.6 s zwischen zwei Blinzeln, manchmal ein Doppelblinzeln
    t += 1.9 + BLINK_RNG() * 2.7;
    if (BLINK_RNG() < 0.18) {
      out.push(t);
      t += 0.24;
    }
  }
  return out;
})();

/** Gemessen: 1 bis 2 Frames bei 10 fps. */
const BLINK_DUR = 0.18;

function blinkLid(t: number): number {
  for (let i = 0; i < BLINKS.length; i++) {
    const start = BLINKS[i];
    if (start === undefined) break;
    if (t < start) break;
    const k = (t - start) / BLINK_DUR;
    if (k >= 0 && k <= 1) {
      // schnelles Schliessen, etwas langsameres Oeffnen
      return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55;
    }
  }
  return 1;
}

export interface LivelinessOptions {
  wander?: number;
  blink?: boolean;
  float?: boolean;
}

export function liveliness(t: number, opt: LivelinessOptions = {}): Liveliness {
  const { wander = 1, blink = true, float = true } = opt;

  // Die Perioden sind untereinander verschieden: die Drift wiederholt sich nie sichtbar.
  return {
    dYaw:
      (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
    dPitch:
      (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
    dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
    lid: blink ? blinkLid(t) : 1,
    // Im Ruhezustand ist die Video praktisch still (Zentrum stabil auf +-0.003,
    // Radius konstant): die ganze Lebendigkeit steckt im Blick und im Blinzeln.
    driftX: float ? loopNoise(t, 7.9, 1.9) * 0.006 : 0,
    driftY: float ? loopNoise(t, 5.3, 0.3) * 0.007 : 0,
    // Die Breite bleibt konstant, nur die Hoehe atmet sehr leicht.
    breath: float ? 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 : 1,
  };
}

/**
 * Das Blinzeln ist eine vertikale Stauchung im BILDRAUM um die Augenmitte
 * (gemessen: die Breite bleibt, die Hoehe faellt auf ~0.35), nicht eine
 * Verkleinerung entlang der geneigten Achse. Deshalb wird es erst NACH der
 * Tangentenmatrix angewendet und wirkt nur auf die y-Ausgaben.
 */
export function blinkScale(lid: number): number {
  return 0.06 + 0.94 * clamp(lid);
}
