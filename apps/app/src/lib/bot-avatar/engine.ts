/**
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Die Maskottchen-Engine.
 *
 * Anders als die Engine des Originals (dort auch der 14-stufige Videostates-
 * Automat mit Ringen, Partikeln und Effekten) hat diese hier nur eine
 * Aufgabe: aus Form, Ausdruck und Zeit ein Bild erzeugen.
 *
 * Zwei Eigenschaften sind bewusst uebernommen:
 *
 * 1. `sample(t)` ist eine REINE Funktion der Zeit. Pause, Fortsetzung und
 *    Sprung an ein beliebiges Datum liefern exakt dasselbe Bild, und das
 *    Rendering ist ohne DOM testbar.
 * 2. Die Augen sind echte Luecken im Koerper, keine weissen Formen darauf.
 *    Sie werden deshalb von der Silhouette beschnitten, sobald sie zum Rand
 *    wandern - ohne jeden Sonderfall.
 *
 * Der Zustand wird ueber dateierte Setter gesetzt (`setShape`, `setExpression`,
 * `setState`), nie ueber eine Variable, die waehrend `sample` gelesen wird.
 * Sonst hoert die Engine auf, eine Funktion der Zeit zu sein.
 */

import { type BotExpression, blendExpression } from "./expressions";
import { blinkScale, eyePoses, type HeadGaze, liveliness } from "./face";
import { clamp, easings, lerp, r2 } from "./math";
import {
  capsulePath,
  closedPath,
  type Point,
  radiusAtAngle,
  type Silhouette,
  toPoints,
} from "./shape";

/** Radius der Kugel in viewBox-Einheiten. */
export const RAYON = 100;

/** Zustand des Maskottchens. */
export type MascotState = "idle" | "thinking" | "working" | "sleep";

export interface RenderedEye {
  /** Pfad der Augenkapsel. */
  d: string;
  /** SVG-Transformationsmatrix. */
  matrix: string;
  /** Deckkraft. */
  alpha: number;
}

export interface MascotFrame {
  /** Pfad des Koerpers. */
  bodyPath: string;
  /** Die beiden Augen als Masken-Luecken. */
  eyes: RenderedEye[];
}

/** Dauer des Ueberblendens beim Wechsel von Form oder Ausdruck. */
export const MORPH_DURATION = 0.45;

/**
 * Toleranz, bis zu der sich der Koerperpfad nicht neu berechnen muss.
 *
 * In viewBox-Einheiten bei Radius 100: eine halbe Pixel.
 */
const PATH_EPSILON = 0.5;

const UNIT_SILHOUETTE: Silhouette = {
  radii: [],
  rot: 0,
  cx: 0,
  cy: 0,
  sx: 1,
  sy: 1,
};

/**
 * Der Zustand, den eine Zustaendigkeit ueberlagert.
 *
 * Die Video-Engine liest den Zustand aus einer grossen Tabelle. Hier gibt es
 * nur vier Zustaende, und die Abweichung zum Ausdruck ist klein und explizit:
 * der Schlafzustand schliesst die Augen, die Arbeitszustaende heben den Blick.
 */
const STATE_OVERRIDE: Record<
  MascotState,
  { gaze?: Partial<HeadGaze>; open?: number; wander?: number; blink?: boolean }
> = {
  idle: {},
  thinking: { gaze: { yaw: 14, pitch: -8 }, wander: 0.5 },
  working: { gaze: { yaw: 6, pitch: 6 }, wander: 0.35 },
  sleep: { open: 0.06, blink: false, wander: 0.2 },
};

export class MascotEngine {
  /** Radius der Kugel in viewBox-Einheiten. */
  readonly scale: number;

  /**
   * Eingefroren: keine Drift, kein Atmen, kein Blinzeln, kein Blickwandern.
   *
   * Der Grund ist nicht nur die Last: ein eingefrorenes Bild muss auch
   * DESSELBE Bild bleiben. Ohne diesen Schalter wandert der Blick weiter und
   * das Bild aendert sich trotzdem.
   */
  private frozen = false;

  private radii: number[] | null = null;
  private radiiPrev: number[] | null = null;
  private radiiAt = -10;

  private expression: BotExpression | null = null;
  private expressionPrev: BotExpression | null = null;
  private expressionAt = -10;

  private state: MascotState = "idle";

  private points: Point[] = [];

  /** Zuletzt berechneter Koerperpfad und das Profil dahinter. */
  private lastPath: string | null = null;
  private lastRadii: number[] | null = null;
  private lastDrift = 0;
  private lastBreath = 0;

  constructor(scale = RAYON) {
    this.scale = scale;
  }

  /** Bild einfrieren oder wieder freigeben. */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /**
   * Formprofil setzen. Der Wechsel geschieht als Morph: weil alle Formen an
   * denselben Winkeln abgetastet sind, reicht eine Interpolation der Radien.
   */
  setShape(radii: number[] | null, now = 0): void {
    if (radii === this.radii) return;
    this.radiiPrev = this.radii;
    this.radii = radii;
    this.radiiAt = now;
  }

  /**
   * Formprofil ohne Morph setzen.
   *
   * Ein eingefrorenes Maskottchen hat keine Zeit, in der ein Morph laufen
   * koennte: es wuerde auf der alten Form stehen bleiben. Deshalb wird der
   * Morph hier abgeschlossen statt begonnen.
   */
  setShapeImmediate(radii: number[] | null): void {
    this.radii = radii;
    this.radiiPrev = radii;
    this.radiiAt = -Infinity;
  }

  /** Ruheausdruck setzen. Wechselt ebenfalls gleitend. */
  setExpression(expression: BotExpression | null, now = 0): void {
    if (expression === this.expression) return;
    this.expressionPrev = this.expression;
    this.expression = expression;
    this.expressionAt = now;
  }

  /** Ruheausdruck ohne Morph setzen. Siehe `setShapeImmediate`. */
  setExpressionImmediate(expression: BotExpression | null): void {
    this.expression = expression;
    this.expressionPrev = expression;
    this.expressionAt = -Infinity;
  }

  /** Zustaendigkeit setzen. Wirkt sofort, ohne Ueberblendung. */
  setState(state: MascotState): void {
    this.state = state;
  }

  get currentState(): MascotState {
    return this.state;
  }

  /** Formprofil zum Zeitpunkt `now`, Morph laeuft mit. */
  private radiiAtTime(now: number): number[] | null {
    const to = this.radii;
    const from = this.radiiPrev;
    if (!to || !from) return to;
    const k = (now - this.radiiAt) / MORPH_DURATION;
    if (k >= 1) return to;
    const t = easings.easeOutQuint(clamp(k));
    return to.map((r, i) => lerp(from[i] ?? r, r, t));
  }

  /** Ausdruck zum Zeitpunkt `now`, Morph laeuft mit. */
  private expressionAtTime(now: number): BotExpression | null {
    const to = this.expression;
    const from = this.expressionPrev;
    if (!to || !from) return to;
    const k = (now - this.expressionAt) / MORPH_DURATION;
    if (k >= 1) return to;
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)));
  }

  /**
   * Pfad des Koerpers.
   *
   * Der Pfad ist die teuerste Stelle der Engine: 64 Punkte, daraus 64
   * Catmull-Rom-Segmente, also ueber 400 Zahlen pro Bild. Bei 40 Avataren
   * x 60 Bildern sind das rund eine Million Zahlen pro Sekunde - und der
   * Koerper bewegt sich dabei um weniger als einen Pixel.
   *
   * Deshalb wird der Pfad nur neu gerechnet, wenn er sich seit der letzten
   * Berechnung sichtbar bewegt hat. Gemessen wird die Verschiebung RELATIV
   * zum zuletzt berechneten Pfad, nicht relativ zur Nulllage: eine Drift, die
   * langsam von 0 nach 0.6 Pixel wandert und wieder zurueck, waere sonst
   * immer "weit weg" von der Nulllage und wuerde jedes Bild neu rechnen.
   *
   * Die Toleranz von einem halben Pixel liegt unterhalb der Darstellungs-
   * genauigkeit: das Bild steht, es ruckelt nicht.
   */
  private bodyPath(sil: Silhouette): string {
    const drift = Math.hypot(sil.cx, sil.cy) * this.scale;
    const breath = Math.abs(sil.sy - 1);
    if (
      this.lastPath !== null &&
      this.lastRadii === sil.radii &&
      Math.abs(drift - this.lastDrift) < PATH_EPSILON &&
      Math.abs(breath - this.lastBreath) < PATH_EPSILON
    ) {
      return this.lastPath;
    }
    const path = closedPath(toPoints(sil, this.scale, this.points));
    this.lastPath = path;
    this.lastRadii = sil.radii;
    this.lastDrift = drift;
    this.lastBreath = breath;
    return path;
  }

  /**
   * Bild zum Zeitpunkt `now`. Reine Funktion der Zeit.
   */
  sample(now: number): MascotFrame {
    const R = this.scale;
    const radii = this.radiiAtTime(now);
    const expression = this.expressionAtTime(now);
    const override = STATE_OVERRIDE[this.state];

    // --- Leben im Ruhezustand ------------------------------------------------
    const life = liveliness(now, {
      wander: override.wander ?? 1,
      blink: override.blink ?? true,
      // Eingefroren heisst: das Bild steht. Ohne diese Abschaltung wandert
      // der Blick weiter und das Bild waere trotzdem nicht mehr das gleiche.
      float: !this.frozen,
    });
    if (this.frozen) {
      life.dYaw = 0;
      life.dPitch = 0;
      life.dRoll = 0;
      life.lid = 1;
    }

    const baseGaze = expression?.gaze ?? { yaw: 0, pitch: 0, roll: 0 };
    const gaze: HeadGaze = {
      yaw: baseGaze.yaw + (override.gaze?.yaw ?? 0) + life.dYaw,
      pitch: baseGaze.pitch + (override.gaze?.pitch ?? 0) + life.dPitch,
      roll: baseGaze.roll + life.dRoll,
    };

    // --- Koerper -------------------------------------------------------------
    const sil: Silhouette = {
      ...UNIT_SILHOUETTE,
      radii: radii ?? new Array(64).fill(1),
      sy: life.breath,
      cx: life.driftX,
      cy: life.driftY,
    };
    const bodyPath = this.bodyPath(sil);

    // --- Augen ---------------------------------------------------------------
    const eyes: RenderedEye[] = [];
    if (expression) {
      const poses = eyePoses(gaze, R, expression.split);
      for (let i = 0; i < 2; i++) {
        const e = poses[i];
        const cfg = expression.eyes[i];
        if (!e || !cfg) continue;
        if (e.depth <= 0.02) continue;
        // Die Augen leben auf einer Kugel vom Radius 1: sobald die Silhouette
        // kein Kreis mehr ist, muessen sie anteilig auf den tatsaechlichen
        // Radius in ihrer Richtung zurueckgerechnet werden, sonst ragen sie
        // ueber den Rand und die Maske schneidet sie ab.
        const fit = radiusAtAngle(sil.radii, Math.atan2(e.y, e.x) - sil.rot);
        // Eigene Neigung des Auges: Tangenten-Basis mal Rotation in der
        // Augenebene. Das erlaubt die Neigungen in Spiegelung zwischen den
        // beiden Augen.
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const ax = e.a * cp + e.c * sp;
        const ay = e.b * cp + e.d * sp;
        const cx = -e.a * sp + e.c * cp;
        const cy = -e.b * sp + e.d * cp;
        // Das Blinzeln wirkt NACH allem anderen: es ist eine vertikale Stauchung
        // im Bildraum, nicht entlang der geneigten Kapselachse.
        const open = override.open ?? cfg.open;
        const k = blinkScale(Math.min(life.lid, open));
        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          matrix:
            `matrix(${r2(ax)},${r2(ay * k)},${r2(cx)},${r2(cy * k)},` +
            `${r2(e.x * fit + sil.cx * R)},${r2(e.y * fit + sil.cy * R)})`,
          alpha: clamp(e.depth / 0.12),
        });
      }
    }

    return { bodyPath, eyes };
  }
}
