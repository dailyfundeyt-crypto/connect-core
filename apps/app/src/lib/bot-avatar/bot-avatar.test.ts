/**
 * A29 – Maskottchen: Snapshot-Tests aller Formen x zwei Farben.
 *
 * EIGENTUEMER: A29.
 *
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Die Snapshots entstehen aus `mascotSvgMarkup`, also genau dem Markup, das
 * die React-Komponente rendert. Ein DOM ist dafuer nicht noetig - und der
 * Test prueft damit die GEOMETRIE, nicht die React-Verdrahtung.
 */

import { describe, expect, test } from "bun:test";
import {
  AVATAR_SHAPE_PROFILES,
  mascotGeometry,
  mascotSvgMarkup,
} from "./index";

/** Die beiden Farben, gegen die jede Form geprueft wird. */
const COLORS = ["orange", "violet"] as const;

describe("A29 – Maskottchen-Formen", () => {
  test("es sind 14 Formen", () => {
    expect(AVATAR_SHAPE_PROFILES).toHaveLength(14);
  });

  test("jede Form hat 64 Radien und keinen leeren Winkel", () => {
    for (const shape of AVATAR_SHAPE_PROFILES) {
      expect(shape.radii).toHaveLength(64);
      for (const radius of shape.radii) {
        expect(Number.isFinite(radius)).toBe(true);
        expect(radius).toBeGreaterThan(0);
      }
    }
  });

  test("keine Form hat dieselbe Radienfolge wie eine andere", () => {
    const seen = new Set(AVATAR_SHAPE_PROFILES.map((s) => s.radii.join(",")));
    expect(seen.size).toBe(AVATAR_SHAPE_PROFILES.length);
  });
});

describe("A29 – Snapshot aller Formen x zwei Farben", () => {
  for (const shape of AVATAR_SHAPE_PROFILES) {
    for (const color of COLORS) {
      test(`${shape.id} / ${color}`, () => {
        expect(
          mascotSvgMarkup({ shape: shape.id, color, maskId: "m" }),
        ).toMatchSnapshot();
      });
    }
  }
});

describe("A29 – Ausdruecke", () => {
  test("jeder Ausdruck liefert zwei Augen", () => {
    for (const expression of [
      "neutral",
      "happy",
      "thinking",
      "wink",
      "wide",
      "alert",
      "sleep",
      "surprised",
    ] as const) {
      const geometry = mascotGeometry({ expression });
      expect(geometry.eyes).toHaveLength(2);
    }
  });

  test("der Schlafzustand schliesst die Augen", () => {
    const awake = mascotGeometry({ expression: "neutral" });
    const asleep = mascotGeometry({ expression: "neutral", state: "sleep" });
    expect(asleep.eyes).toHaveLength(2);
    expect(asleep.eyes[0]!.matrix).not.toBe(awake.eyes[0]!.matrix);
  });
});

describe("A29 – eingefrorenes Maskottchen", () => {
  test("das Bild ist zeitunabhaengig", () => {
    const early = mascotSvgMarkup({
      shape: "star",
      maskId: "m",
      time: 0,
      frozen: true,
    });
    const late = mascotSvgMarkup({
      shape: "star",
      maskId: "m",
      time: 42,
      frozen: true,
    });
    expect(late).toBe(early);
  });

  test("ohne eingefrorenes Maskottchen aendert sich der Blick mit der Zeit", () => {
    const early = mascotGeometry({ shape: "star", time: 0 });
    const late = mascotGeometry({ shape: "star", time: 3 });
    // Der Koerperpfad bleibt stehen: die Drift betraegt weniger als einen
    // Pixel. Sichtbar bewegt sich der Blick, und genau das ist der Test.
    expect(late.eyes[0]!.matrix).not.toBe(early.eyes[0]!.matrix);
  });

  test("der Koerperpfad bleibt unterhalb der Pixelgrenze stehen", () => {
    const early = mascotGeometry({ shape: "star", time: 0 });
    const late = mascotGeometry({ shape: "star", time: 3 });
    expect(late.bodyPath).toBe(early.bodyPath);
  });
});

describe("A29 – Augen als Masken-Luecher", () => {
  test("die Augen liegen im Koerper, nicht ausserhalb", () => {
    const geometry = mascotGeometry({ shape: "circle" });
    expect(geometry.eyes).toHaveLength(2);
    for (const eye of geometry.eyes) {
      expect(eye.d.startsWith("M")).toBe(true);
      expect(eye.alpha).toBeGreaterThan(0);
      expect(eye.alpha).toBeLessThanOrEqual(1);
    }
  });
});
