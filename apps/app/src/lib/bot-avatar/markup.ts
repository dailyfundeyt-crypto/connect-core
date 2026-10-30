/**
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Reines Markup des Maskottchens.
 *
 * Die React-Komponente rendert dasselbe SVG wie diese Funktion, nur mit
 * React-Attributen statt eines Strings. Deshalb steht die Geometrie hier und
 * nicht in der Komponente: die Snapshot-Tests brauchen kein DOM, und die
 * Komponente kann nichts davon abweichen.
 */

import type { MascotState } from "./engine";
import { MascotEngine, RAYON } from "./engine";
import type { AvatarExpression } from "./expressions";
import { expressionProfile } from "./expressions";
import type { AvatarColor, BotAvatarShape } from "./skins";
import { colorProfile, shapeRadii } from "./skins";

/** Halbe ViewBOX. Augen und Koerper bleiben innerhalb des Radius. */
export const VIEWBOX_HALF = RAYON * 1.06;

export interface MascotMarkupOptions {
  shape?: BotAvatarShape;
  color?: AvatarColor;
  state?: MascotState;
  expression?: AvatarExpression;
  /** Zeitpunkt in Sekunden. Ohne Wert steht das Maskottchen still. */
  time?: number;
  /** Eingefroren: kein Blickwandern, kein Atmen, kein Blinzeln. */
  frozen?: boolean;
  /** Eindeutige Id der Maske. Ohne Id entfaellt die Maske (Augen ohne Ausschnitt). */
  maskId?: string;
}

export interface MascotGeometry {
  bodyPath: string;
  eyes: Array<{ d: string; matrix: string; alpha: number }>;
  fill: string;
  eye: string;
  viewBox: string;
}

/**
 * Cache der eingefrorenen Bilder.
 *
 * Ein eingefrorenes Maskottchen ist ein STANDbild. Ohne Cache wuerde jede
 * Komponente den Pfad bei jedem Rendern neu berechnen - das ist bei 40
 * Avataren in einer Liste pure Verschwendung, obwohl sich nichts aendert.
 *
 * Der Schluessel ist das Standbild selbst, also Form, Farbe, Zustand und
 * Ausdruck. Der Cache ist bewusst klein gehalten (die Formen und Farben sind
 * eine kleine, feste Menge).
 */
const FROZEN_CACHE = new Map<string, MascotGeometry>();

const FROZEN_CACHE_LIMIT = 256;

function frozenKey(options: MascotMarkupOptions): string {
  return [
    options.shape ?? "circle",
    options.color ?? "orange",
    options.state ?? "idle",
    options.expression ?? "neutral",
  ].join("|");
}

/**
 * Engines pro Form.
 *
 * Die Engine haelt ihren Koerperpfad-Cache, und der Pfad ist der teuerste
 * Teil der Berechnung. Deshalb wird die Engine WIEDERVERWENDET statt pro
 * Bild neu gebaut: sonst waere der Cache nach einem Bild schon wieder leer.
 *
 * Der Schluessel ist die Form, denn die Form bestimmt das Profil und damit
 * den Pfad. Form, Zustand und Ausdruck werden pro Bild gesetzt.
 */
const ENGINES = new Map<string, MascotEngine>();

function engineFor(shape: BotAvatarShape): MascotEngine {
  let engine = ENGINES.get(shape);
  if (!engine) {
    engine = new MascotEngine(RAYON);
    ENGINES.set(shape, engine);
  }
  return engine;
}

/**
 * Geometrie des Maskottchens zum Zeitpunkt `time`.
 *
 * `time` von 0 (oder nicht gesetzt) ergibt das ruhende Bild: der Ausdruck ist
 * gesetzt, die Augen sind offen, der Blick steht.
 */
export function mascotGeometry(options: MascotMarkupOptions): MascotGeometry {
  const {
    shape = "circle",
    color = "orange",
    state = "idle",
    expression = "neutral",
    time = 0,
    frozen = false,
  } = options;

  if (frozen) {
    const key = frozenKey(options);
    const cached = FROZEN_CACHE.get(key);
    if (cached) return cached;
    const computed = computeGeometry({
      shape,
      color,
      state,
      expression,
      time: 0,
      frozen: true,
    });
    if (FROZEN_CACHE.size >= FROZEN_CACHE_LIMIT) {
      FROZEN_CACHE.clear();
    }
    FROZEN_CACHE.set(key, computed);
    return computed;
  }

  return computeGeometry({
    shape,
    color,
    state,
    expression,
    time,
    frozen: false,
  });
}

function computeGeometry(options: {
  shape: BotAvatarShape;
  color: AvatarColor;
  state: MascotState;
  expression: AvatarExpression;
  time: number;
  frozen: boolean;
}): MascotGeometry {
  const { shape, color, state, expression, time, frozen } = options;

  const engine = engineFor(shape);
  engine.setFrozen(frozen);
  engine.setShapeImmediate(shapeRadii(shape));
  engine.setExpressionImmediate(expressionProfile(expression));
  engine.setState(state);
  const frame = engine.sample(time);
  const paint = colorProfile(color);

  return {
    bodyPath: frame.bodyPath,
    eyes: frame.eyes,
    fill: paint.hex,
    eye: paint.eye,
    viewBox: `${-VIEWBOX_HALF} ${-VIEWBOX_HALF} ${VIEWBOX_HALF * 2} ${VIEWBOX_HALF * 2}`,
  };
}

const attr = (name: string, value: string | number): string =>
  `${name}="${String(value)}"`;

/**
 * Das vollstaendige SVG als String.
 *
 * Reihenfolge: erst der Koerper in der Augenfarbe, dann der Koerper in der
 * Koerperfarbe durch die Maske. Die Maske schneidet die Augen aus dem
 * Koerper heraus - sie sind Luecher, keine aufgesetzten Formen.
 */
export function mascotSvgMarkup(options: MascotMarkupOptions = {}): string {
  const { maskId } = options;
  const g = mascotGeometry(options);
  const eyes = g.eyes
    .map(
      (eye) =>
        `<path ${attr("d", eye.d)} ${attr("fill", "#000")} ${attr("opacity", eye.alpha)} ${attr("transform", eye.matrix)} />`,
    )
    .join("");

  const mask = maskId
    ? `<mask ${attr("id", maskId)} ${attr("maskUnits", "userSpaceOnUse")} ${attr("x", -VIEWBOX_HALF)} ${attr("y", -VIEWBOX_HALF)} ${attr("width", VIEWBOX_HALF * 2)} ${attr("height", VIEWBOX_HALF * 2)}><path ${attr("d", g.bodyPath)} ${attr("fill", "#fff")} />${eyes}</mask>`
    : "";

  const body = maskId
    ? `<g ${attr("mask", `url(#${maskId})`)}><rect ${attr("x", -VIEWBOX_HALF)} ${attr("y", -VIEWBOX_HALF)} ${attr("width", VIEWBOX_HALF * 2)} ${attr("height", VIEWBOX_HALF * 2)} ${attr("fill", g.fill)} /></g>`
    : `<path ${attr("d", g.bodyPath)} ${attr("fill", g.fill)} />`;

  return (
    `<svg ${attr("viewBox", g.viewBox)} ${attr("xmlns", "http://www.w3.org/2000/svg")}>` +
    (maskId ? `<defs>${mask}</defs>` : "") +
    `<path ${attr("d", g.bodyPath)} ${attr("fill", g.eye)} />` +
    body +
    `</svg>`
  );
}
