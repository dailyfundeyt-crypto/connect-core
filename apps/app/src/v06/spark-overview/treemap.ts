/**
 * A17 – Squarified-Treemap-Layout als pure Funktion (keine externen Abhängigkeiten).
 * Gibt Rechtecke (x, y, w, h) in Pixeln zurück; Größe = noteCount.
 *
 * Klassischer Squarified-Algorithmus (Bruls/Huizing/van Wijk): Reihen werden
 * entlang der kürzeren Seite gestapelt; eine Reihe nimmt so viele Elemente auf,
 * dass das schlechteste Seitenverhältnis minimal bleibt.
 */
import type { Cluster } from "./api";

export interface TreemapRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  noteCount: number;
  heat: number;
}

export interface TreemapLayoutOptions {
  width: number;
  height: number;
  /** Innenabstand zwischen Kacheln in Pixeln (Standard 2). */
  gap?: number;
}

interface LayoutItem extends Cluster {
  area: number;
}

export function computeLayout(clusters: Cluster[], options: TreemapLayoutOptions): TreemapRect[] {
  const { width, height } = options;
  const gap = options.gap ?? 2;
  if (width <= 0 || height <= 0 || clusters.length === 0) return [];

  const sorted = [...clusters].sort((a, b) => b.noteCount - a.noteCount);
  const total = sorted.reduce((s, c) => s + Math.max(0, c.noteCount), 0);
  if (total <= 0) return [];

  const scale = (width * height) / total;
  const items: LayoutItem[] = sorted.map((c) => ({ ...c, area: Math.max(0, c.noteCount) * scale }));

  const rects: TreemapRect[] = [];
  fillStrip(items, 0, 0, width, height, rects);

  // Gap-Erzeugung: jede Kachel um gap/2 auf jeder Seite einziehen (kein Overflow).
  for (const rect of rects) {
    rect.x = rect.x + gap / 2;
    rect.y = rect.y + gap / 2;
    rect.w = Math.max(1, rect.w - gap);
    rect.h = Math.max(1, rect.h - gap);
  }
  return rects;
}

function fillStrip(items: LayoutItem[], x: number, y: number, w: number, h: number, rects: TreemapRect[]): void {
  if (items.length === 0 || w <= 0 || h <= 0) return;

  const area = items.reduce((s, it) => s + it.area, 0);
  // Streifen entlang der kürzeren Seite: vertikal, wenn die Höhe ≥ Breite ist.
  const isColumn = w <= h;
  const depth = isColumn ? h : w;
  const thickness = Math.min(isColumn ? w : h, area / depth);

  // Wie viele Elemente in diesen Streifen? Faule Suche minimales Worst-Seitenverhältnis.
  let count = 1;
  let bestWorst = Infinity;
  let runningArea = 0;
  for (let k = 1; k <= items.length; k++) {
    runningArea += items[k - 1].area;
    const rowThickness = runningArea / depth;
    if (rowThickness <= 0) continue;
    let worst = 0;
    for (let j = 0; j < k; j++) {
      const len = items[j].area / rowThickness;
      const ratio = len >= rowThickness ? len / rowThickness : rowThickness / len;
      if (ratio > worst) worst = ratio;
    }
    if (worst < bestWorst || count === 0) {
      bestWorst = worst;
      count = k;
    } else {
      break;
    }
  }
  count = Math.max(1, Math.min(count, items.length));

  const stripItems = items.slice(0, count);
  const stripArea = stripItems.reduce((s, it) => s + it.area, 0);
  const stripThickness = Math.min(thickness, stripArea / depth);

  let offset = 0;
  for (const item of stripItems) {
    const len = stripThickness > 0 ? item.area / (stripArea / depth) : 0;
    if (isColumn) {
      rects.push(toRect(item, x, y + offset, stripThickness, len));
    } else {
      rects.push(toRect(item, x + offset, y, len, stripThickness));
    }
    offset += len;
  }

  const rest = items.slice(count);
  if (rest.length === 0) return;
  if (isColumn) {
    fillStrip(rest, x + stripThickness, y, w - stripThickness, h, rects);
  } else {
    fillStrip(rest, x, y + stripThickness, w, h - stripThickness, rects);
  }
}

function toRect(item: LayoutItem, x: number, y: number, w: number, h: number): TreemapRect {
  return {
    id: item.id,
    label: item.label,
    noteCount: item.noteCount,
    heat: item.heat,
    x: Math.max(0, x),
    y: Math.max(0, y),
    w: Math.max(0, w),
    h: Math.max(0, h),
  };
}

export default computeLayout;
