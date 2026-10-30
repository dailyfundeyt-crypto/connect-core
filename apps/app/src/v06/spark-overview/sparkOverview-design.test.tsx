import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { ClusterTreemap, heatColor, TREEMAP_COLORS, TREEMAP_DESIGN_TOKENS } from "./ClusterTreemap";
import { ClusterDetail } from "./ClusterDetail";
import type { Cluster } from "./api";

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe("Spark-Overview Design-System V2 (A36)", () => {
  const originalEnv = process.env.CONNECT_FLAGS_V06;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONNECT_FLAGS_V06 = originalEnv;
    } else {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });

  test("heatColor liefert bei designV2=false die hex-Farben, bei designV2=true Token-Variablen", () => {
    // Flag aus
    expect(heatColor(0, false)).toBe(TREEMAP_COLORS[0]);
    expect(heatColor(1, false)).toBe(TREEMAP_COLORS[TREEMAP_COLORS.length - 1]);

    // Flag an: Treemap-Farben aus Tokens
    expect(heatColor(0, true)).toBe("var(--p-success)");
    expect(heatColor(1, true)).toBe("var(--p-danger)");
    expect(TREEMAP_DESIGN_TOKENS).toContain("var(--p-accent)");
    expect(TREEMAP_DESIGN_TOKENS).toContain("var(--p-warning)");
  });

  test("ClusterTreemap nutzt Design-System V2 Token-Styling und Kachel-Border", () => {
    process.env.CONNECT_FLAGS_V06 = "designv2";
    const sampleClusters: Cluster[] = [
      { id: "c1", label: "Marketing", noteCount: 10, heat: 0.1, topTerms: ["seo", "lead"] },
      { id: "c2", label: "Finanzen", noteCount: 5, heat: 0.9, topTerms: ["steuer", "bilanz"] },
    ];

    const { container } = render(
      <ClusterTreemap
        clusters={sampleClusters}
        width={600}
        height={300}
      />,
    );

    const treemap = container.querySelector("[data-testid='spark-cluster-treemap']")!;
    expect(treemap.className).toContain("var(--p-border)");
    expect(treemap.className).toContain("var(--p-surface-1)");

    const tile1 = container.querySelector("[data-testid='spark-cluster-tile-c1']") as HTMLElement;
    expect(tile1).not.toBeNull();
    expect(tile1.className).toContain("var(--p-radius-sm)");
    expect(tile1.style.background).toBe("var(--p-success)");

    const tile2 = container.querySelector("[data-testid='spark-cluster-tile-c2']") as HTMLElement;
    expect(tile2).not.toBeNull();
    expect(tile2.style.background).toBe("var(--p-danger)");
  });

  test("ClusterDetail rendert Design-System Card mit Hairline-Border und Token-Badges", () => {
    process.env.CONNECT_FLAGS_V06 = "designv2";
    const cluster: Cluster = {
      id: "c1",
      label: "Architektur",
      noteCount: 8,
      heat: 0.4,
      topTerms: ["schema", "drizzle"],
    };

    const { container } = render(
      <ClusterDetail cluster={cluster} />
    );

    const detail = container.querySelector("[data-testid='spark-cluster-detail']")!;
    expect(detail.className).toContain("var(--p-border)");
    expect(detail.className).toContain("var(--p-surface-2)");

    expect(container.textContent).toContain("Architektur");
    expect(container.textContent).toContain("schema");
  });
});
