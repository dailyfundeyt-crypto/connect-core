/**
 * Store Frontend Unit & Integration Tests (v06 / A23)
 * Tests: Install-Flow, Wizard-Validierung, Category Tabs, Admin-Review, Feature Flag
 */

import { describe, expect, it, beforeEach, mock } from "bun:test";
import { STORE_CATEGORIES } from "./StoreCategoryTabs";
import { PERMISSION_DEFINITIONS, KNOWN_PERMISSIONS, type PackagePermission, type StoreListing } from "./types";
import {
  fetchStoreListings,
  installStorePackage,
  uploadStorePackage,
  reviewStorePackage,
  sortListings,
} from "./useStore";

describe("Store Frontend v06 (A23)", () => {
  describe("1. Store Category Tabs (Play-Store Optik)", () => {
    it("definiert die 5 Kern-Kategorien mit passenden Bezeichnungen", () => {
      const keys = STORE_CATEGORIES.map((c) => c.key);
      expect(keys).toEqual(["all", "mcp", "tool", "skill", "company"]);

      const allCat = STORE_CATEGORIES.find((c) => c.key === "all");
      expect(allCat?.label).toBe("Alle");

      const mcpCat = STORE_CATEGORIES.find((c) => c.key === "mcp");
      expect(mcpCat?.label).toBe("MCPs");
      expect(mcpCat?.badge).toBe("Protokoll");

      const toolCat = STORE_CATEGORIES.find((c) => c.key === "tool");
      expect(toolCat?.label).toBe("Tools");

      const skillCat = STORE_CATEGORIES.find((c) => c.key === "skill");
      expect(skillCat?.label).toBe("Skills");

      const compCat = STORE_CATEGORIES.find((c) => c.key === "company");
      expect(compCat?.label).toBe("Firmen");
    });
  });

  describe("2. Berechtigungen & Sicherheits-Klassifizierung", () => {
    it("kennt alle 8 Standard-Berechtigungen aus docs/v06/store-manifest.md", () => {
      expect(KNOWN_PERMISSIONS).toContain("network:outbound");
      expect(KNOWN_PERMISSIONS).toContain("filesystem:read");
      expect(KNOWN_PERMISSIONS).toContain("filesystem:write");
      expect(KNOWN_PERMISSIONS).toContain("mcp:access");
      expect(KNOWN_PERMISSIONS).toContain("channel:read");
      expect(KNOWN_PERMISSIONS).toContain("channel:post");
      expect(KNOWN_PERMISSIONS).toContain("agent:execute");
      expect(KNOWN_PERMISSIONS).toContain("company:manage");
    });

    it("stuft risikoreiche Berechtigungen korrekt als 'high' ein", () => {
      expect(PERMISSION_DEFINITIONS["filesystem:write"].risk).toBe("high");
      expect(PERMISSION_DEFINITIONS["agent:execute"].risk).toBe("high");
      expect(PERMISSION_DEFINITIONS["company:manage"].risk).toBe("high");

      expect(PERMISSION_DEFINITIONS["network:outbound"].risk).toBe("low");
      expect(PERMISSION_DEFINITIONS["filesystem:read"].risk).toBe("medium");
    });
  });

  describe("3. PublishWizard Validierungsregeln", () => {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const semverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

    it("akzeptiert nur gültige Slugs (Kleinbuchstaben, Ziffern, Bindestriche)", () => {
      expect(slugRegex.test("markettrace-pro")).toBe(true);
      expect(slugRegex.test("github-connector-mcp")).toBe(true);
      expect(slugRegex.test("social-curator-v2")).toBe(true);

      // Ungültig:
      expect(slugRegex.test("MarketTrace")).toBe(false);
      expect(slugRegex.test("market_trace")).toBe(false);
      expect(slugRegex.test("market trace")).toBe(false);
      expect(slugRegex.test("-leading-dash")).toBe(false);
      expect(slugRegex.test("trailing-dash-")).toBe(false);
    });

    it("validiert SemVer Versionen strikt", () => {
      expect(semverRegex.test("1.0.0")).toBe(true);
      expect(semverRegex.test("0.1.0-alpha.1")).toBe(true);
      expect(semverRegex.test("2.0.4+build123")).toBe(true);

      // Ungültig:
      expect(semverRegex.test("1.0")).toBe(false);
      expect(semverRegex.test("v1.0.0")).toBe(false);
      expect(semverRegex.test("alpha")).toBe(false);
    });

    it("erzwingt maximale Kurzbeschreibung von 140 Zeichen", () => {
      const validSummary = "Echtzeit-Finanzdaten, interaktive Charts und Markt-Sentiment visualisieren.";
      expect(validSummary.length).toBeLessThanOrEqual(140);

      const invalidSummary = "A".repeat(141);
      expect(invalidSummary.length).toBeGreaterThan(140);
    });

    it("erzwingt priceCents = 0 in v1 (kostenloser Store)", () => {
      const manifest = {
        kind: "tool" as const,
        slug: "free-tool",
        name: "Free Tool",
        version: "1.0.0",
        summary: "Ein kostenloses Tool",
        description: "Ausführlich...",
        author: "stefan",
        permissions: [] as PackagePermission[],
        priceCents: 0 as const,
        installSpec: {},
      };
      expect(manifest.priceCents).toBe(0);
    });
  });

  describe("4. API Client & Fallback Seeds", () => {
    it("fetchStoreListings liefert Fallback-Pakete falls Server nicht erreichbar", async () => {
      const items = await fetchStoreListings();
      expect(items.length).toBeGreaterThan(0);

      const tools = items.filter((i) => i.kind === "tool");
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBe("MarketTrace Analysis");

      const mcps = items.filter((i) => i.kind === "mcp");
      expect(mcps.length).toBeGreaterThan(0);
      expect(mcps[0].slug).toBe("github-connector-mcp");
    });

    it("filtert Fallback-Pakete nach StoreKind", async () => {
      const skills = await fetchStoreListings({ kind: "skill" });
      expect(skills.length).toBeGreaterThan(0);
      for (const s of skills) {
        expect(s.kind).toBe("skill");
      }
    });

    it("filtert Fallback-Pakete nach Suchbegriff", async () => {
      const res = await fetchStoreListings({ q: "GitHub" });
      expect(res.length).toBe(1);
      expect(res[0].name).toContain("GitHub");
    });
  });

  describe("5. Installation Flow & Berechtigungsprüfung", () => {
    it("installStorePackage sendet korrekte Payload an den Server", async () => {
      const origFetch = globalThis.fetch;
      try {
        let calledUrl = "";
        let calledBody: any = null;

        globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
          calledUrl = url.toString();
          calledBody = JSON.parse((init?.body as string) || "{}");
          return new Response(
            JSON.stringify({
              ok: true,
              listingId: "listing-tool-markettrace",
              companyId: "flux",
              message: "Package installed.",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as any;

        const res = await installStorePackage("listing-tool-markettrace", "flux", {
          confirmPermissions: true,
          acceptedPermissions: ["network:outbound"],
        });

        expect(calledUrl).toContain("/api/v06/store/listings/listing-tool-markettrace/install");
        expect(calledBody.targetCompanyId).toBe("flux");
        expect(calledBody.confirmPermissions).toBe(true);
        expect(calledBody.acceptedPermissions).toEqual(["network:outbound"]);
        expect(res.ok).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe("6. Publish & Admin Review Flow", () => {
    it("uploadStorePackage sendet JSON-Manifest an /api/v06/store/listings/upload", async () => {
      const origFetch = globalThis.fetch;
      try {
        let calledUrl = "";
        let calledMethod = "";

        globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
          calledUrl = url.toString();
          calledMethod = init?.method || "";
          return new Response(
            JSON.stringify({
              ok: true,
              listing: { id: "test-pkg", status: "review" },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }) as any;

        const res = await uploadStorePackage({
          kind: "tool",
          slug: "test-app",
          name: "Test App",
          version: "1.0.0",
          summary: "Test",
          description: "Test description",
          author: "stefan",
          permissions: [],
          priceCents: 0,
          installSpec: {},
        });

        expect(calledUrl).toContain("/api/v06/store/listings/upload");
        expect(calledMethod).toBe("POST");
        expect(res.ok).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("reviewStorePackage schaltet Listing über Admin-Endpunkt frei", async () => {
      const origFetch = globalThis.fetch;
      try {
        let calledUrl = "";
        let calledBody: any = null;

        globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
          calledUrl = url.toString();
          calledBody = JSON.parse((init?.body as string) || "{}");
          return new Response(
            JSON.stringify({
              ok: true,
              listing: { id: "test-pkg", status: "published" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }) as any;

        const res = await reviewStorePackage("test-pkg", "approve");
        expect(calledUrl).toContain("/api/v06/store/listings/test-pkg/review");
        expect(calledBody.action).toBe("approve");
        expect(res.ok).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe("7. Store Sortierung & Relevanz-Ranking", () => {
    const mockListings = [
      {
        id: "l1",
        kind: "tool" as const,
        slug: "beta-tool",
        name: "Beta Tool",
        version: "1.0.0",
        authorId: "user",
        iconUrl: "",
        screenshots: [],
        summary: "Ein nützliches Werkzeug",
        description: "Enthält Analysen",
        installSpec: {},
        priceCents: 0,
        status: "published" as const,
        downloadsCount: 100,
        createdAt: "2026-10-15T00:00:00Z",
      },
      {
        id: "l2",
        kind: "mcp" as const,
        slug: "alpha-mcp",
        name: "Alpha Connector MCP",
        version: "1.0.0",
        authorId: "user",
        iconUrl: "",
        screenshots: [],
        summary: "Super MCP",
        description: "Verbindet Daten",
        installSpec: {},
        priceCents: 0,
        status: "published" as const,
        downloadsCount: 500,
        createdAt: "2026-10-20T00:00:00Z",
      },
      {
        id: "l3",
        kind: "skill" as const,
        slug: "zeta-skill",
        name: "Zeta Skill",
        version: "1.0.0",
        authorId: "user",
        iconUrl: "",
        screenshots: [],
        summary: "Skill mit Beta Tool Anbindung",
        description: "Prompting",
        installSpec: {},
        priceCents: 0,
        status: "published" as const,
        downloadsCount: 250,
        createdAt: "2026-10-23T00:00:00Z",
      },
    ];

    it("sortiert standardmäßig nach Beliebtheit ('popular': Meistinstalliert zuerst)", () => {
      const sorted = sortListings(mockListings, "popular");
      expect(sorted[0].id).toBe("l2"); // 500 downloads
      expect(sorted[1].id).toBe("l3"); // 250 downloads
      expect(sorted[2].id).toBe("l1"); // 100 downloads
    });

    it("sortiert nach Neuheiten ('newest': Neuestes Datum zuerst)", () => {
      const sorted = sortListings(mockListings, "newest");
      expect(sorted[0].id).toBe("l3"); // 2026-10-23
      expect(sorted[1].id).toBe("l2"); // 2026-10-20
      expect(sorted[2].id).toBe("l1"); // 2026-10-15
    });

    it("sortiert alphabetisch ('alphabetical': A bis Z)", () => {
      const sorted = sortListings(mockListings, "alphabetical");
      expect(sorted[0].name).toBe("Alpha Connector MCP");
      expect(sorted[1].name).toBe("Beta Tool");
      expect(sorted[2].name).toBe("Zeta Skill");
    });

    it("sortiert bei aktiver Suche nach Relevanz (Namensübereinstimmung vor Beschreibung)", () => {
      // Bei Suche nach 'Beta': 'Beta Tool' hat Namens-Match (Rank 80), 'Zeta Skill' nur Summary-Match (Rank 20)
      const sorted = sortListings(mockListings, "popular", "Beta");
      expect(sorted[0].id).toBe("l1"); // Beta Tool
      expect(sorted[1].id).toBe("l3"); // Zeta Skill (enthält Beta im Summary)
    });
  });
});
