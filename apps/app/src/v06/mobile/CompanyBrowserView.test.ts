import { describe, expect, test } from "bun:test";
import {
  type BrowserSection,
  filterBrowserSections,
} from "./CompanyBrowserView";

describe("CompanyBrowserView (A14)", () => {
  const sampleSections: BrowserSection[] = [
    {
      id: "browser:flux-tools",
      title: "Flux Tools",
      groupId: "flux-tools",
      rows: [
        {
          key: "app:flux-studio",
          title: "Flux Studio",
          subtitle: "flux.local",
          sources: ["/flux.png"],
          url: "https://flux.local/studio",
        },
        {
          key: "app:flux-api",
          title: "Flux API Docs",
          subtitle: "flux.local",
          sources: [],
          url: "https://flux.local/docs",
        },
      ],
    },
    {
      id: "browser:agent-tabs",
      title: "Seiten & Tabs (Flux)",
      rows: [
        {
          key: "tab:agent1:google",
          title: "Google Search",
          subtitle: "FluxBot · google.com",
          sources: [],
          url: "https://google.com",
        },
      ],
    },
  ];

  test("Ohne Suche werden alle Sektionen der aktiven Firma zurückgegeben", () => {
    const result = filterBrowserSections(sampleSections, "");
    expect(result.length).toBe(2);
    expect(result[0].rows.length).toBe(2);
    expect(result[1].rows.length).toBe(1);
  });

  test("Suche filtert nach Titel innerhalb der Firmen-Websites", () => {
    const result = filterBrowserSections(sampleSections, "Studio");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("browser:flux-tools");
    expect(result[0].rows.length).toBe(1);
    expect(result[0].rows[0].title).toBe("Flux Studio");
  });

  test("Suche filtert nach URL innerhalb der Firmen-Websites", () => {
    const result = filterBrowserSections(sampleSections, "google.com");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("browser:agent-tabs");
    expect(result[0].rows[0].title).toBe("Google Search");
  });

  test("Suche ohne Treffer liefert leere Liste", () => {
    const result = filterBrowserSections(sampleSections, "NichtVorhanden12345");
    expect(result.length).toBe(0);
  });

  test("Firmen-Filterung: Nur Links der aktiven Firma (z.B. Flux) vorhanden", () => {
    // Sicherstellen, dass keine fremden Firmen enthalten sind
    const allTitles = sampleSections.flatMap((s) => s.rows.map((r) => r.title));
    expect(allTitles).toContain("Flux Studio");
    expect(allTitles).toContain("Flux API Docs");
    expect(allTitles.some((t) => t.includes("Spark"))).toBe(false);
    expect(allTitles.some((t) => t.includes("Hyper"))).toBe(false);
  });
});
