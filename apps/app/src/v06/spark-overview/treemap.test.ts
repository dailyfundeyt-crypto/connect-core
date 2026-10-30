/**
 * A17 – Tests für das Squarified-Treemap-Layout (pure Funktion).
 * Ausführen: `cd apps/app && bun test src/v06/spark-overview`
 */
import { describe, expect, it } from "bun:test";
import { computeLayout } from "./treemap";
import type { Cluster } from "./api";

function makeClusters(): Cluster[] {
  return [
    { id: "a", label: "Kunden", noteCount: 40, topTerms: ["kunde", "vertrag"], heat: 0.8 },
    { id: "b", label: "Produkt", noteCount: 20, topTerms: ["release"], heat: 0.4 },
    { id: "c", label: "Admin", noteCount: 10, topTerms: ["rechnung"], heat: 0.2 },
    { id: "d", label: "Wissen", noteCount: 5, topTerms: ["finanzamt"], heat: 0.1 },
  ];
}

describe("computelLayout (squarified Treemap, A17)", () => {
  it("erzeugt für jedes Cluster eine, mit Ausnahme von leeren", () => {
    const layout = computeLayout(makeClusters(), { width: 400, height: 300 });
    expect(layout.length).toBe(4);
  });

  it("respektiert die Fläche: Summe der Pläne ≈ Gesamtfläche", () => {
    const width = 400;
    const height = 300;
    // Ohne Gap muss die Fläche exakt aufgehen; mit Gap schrumpfen Kacheln bewusst.
    const layout = computeLayout(makeClusters(), { width, height, gap: 0 });
    const totalArea = width * height;
    const sum = layout.reduce((accumulator, rect) => accumulator + rect.w * rect.h, 0);
    expect(Math.abs(sum - totalArea)).toBeLessThan(0.01);
  });

  it("gibt größere Kacheln (Breite oder Höhe) für höhere noteCount", () => {
    const layout = computeLayout(makeClusters(), { width: 400, height: 300 });
    const a = layout.find((rect) => rect.id === "a")!;
    const d = layout.find((rect) => rect.id === "d")!;
    expect(Math.max(a.w, a.h)).toBeGreaterThan(Math.max(d.w, d.h));
  });

  it("produziert keine Negativ-Dimensionen oder Overflow", () => {
    const layout = computeLayout(makeClusters(), { width: 200, height: 150 });
    for (const rect of layout) {
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(200.5);
      expect(rect.y + rect.h).toBeLessThanOrEqual(150.5);
    }
  });

  it("sortiert Cluster vorab (größte zuerst) unabhängig von der Eingabereihenfolge", () => {
    const reversed = [...makeClusters()].reverse();
    const layout = computeLayout(reversed, { width: 400, height: 300 });
    const a = layout.find((rect) => rect.id === "a")!;
    const d = layout.find((rect) => rect.id === "d")!;
    expect(Math.max(a.w, a.h)).toBeGreaterThan(Math.max(d.w, d.h));
  });
});
