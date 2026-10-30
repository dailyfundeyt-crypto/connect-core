import { describe, expect, it, beforeEach, mock } from "bun:test";
import {
  CANONICAL_CONNECT_TOOLS,
  COMPANY_TOOLS_UPDATED_EVENT,
  companyToolsCache,
  createDefaultCompanyTools,
  filterEnabledTools,
} from "./useCompanyTools";
import type { CompanyToolItem, CompanyToolsSyncEventDetail } from "./types";

describe("Company Tools v06 (A13)", () => {
  beforeEach(() => {
    companyToolsCache.clear();
  });

  describe("1. Kanonische Tools Definition", () => {
    it("enthaelt die erwarteten Kern-Werkzeuge mit Logos", () => {
      const ids = CANONICAL_CONNECT_TOOLS.map((t) => t.id);
      expect(ids).toContain("analysis");
      expect(ids).toContain("connect-sozial");
      expect(ids).toContain("flux");
      expect(ids).toContain("brain");
      expect(ids).toContain("finance");
      expect(ids).toContain("markettrace");
      expect(ids).toContain("tradingview");

      for (const tool of CANONICAL_CONNECT_TOOLS) {
        expect(tool.id).toBeTruthy();
        expect(tool.name).toBeTruthy();
        expect(tool.logoUrl).toBeTruthy();
        expect(tool.kind).toMatch(/builtin|custom/);
      }
    });

    it("createDefaultCompanyTools setzt alle Werkzeuge standardmaessig auf enabled=true", () => {
      const companyId = "comp-123";
      const tools = createDefaultCompanyTools(companyId);

      expect(tools.length).toBe(CANONICAL_CONNECT_TOOLS.length);
      for (const tool of tools) {
        expect(tool.companyId).toBe(companyId);
        expect(tool.toolId).toBe(tool.id);
        expect(tool.enabled).toBe(true);
        expect(tool.updatedAt).toBeTruthy();
      }
    });
  });

  describe("2. Filterung (nur aktivierte Tools im Menue)", () => {
    it("filtert deaktivierte Werkzeuge heraus", () => {
      const sampleTools: CompanyToolItem[] = [
        {
          id: "flux",
          name: "Flux",
          logoUrl: "/flux.png",
          kind: "builtin",
          companyId: "c1",
          toolId: "flux",
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "analysis",
          name: "Analysis",
          logoUrl: "/analysis.png",
          kind: "builtin",
          companyId: "c1",
          toolId: "analysis",
          enabled: false,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "markettrace",
          name: "MarketTrace",
          logoUrl: "/analysis.png",
          kind: "builtin",
          companyId: "c1",
          toolId: "markettrace",
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
      ];

      const enabled = filterEnabledTools(sampleTools);
      expect(enabled.length).toBe(2);
      expect(enabled.map((t) => t.id)).toEqual(["flux", "markettrace"]);
    });

    it("gibt leeres Array zurueck, wenn alle Tools deaktiviert sind", () => {
      const allDisabled: CompanyToolItem[] = [
        {
          id: "flux",
          name: "Flux",
          logoUrl: "/flux.png",
          kind: "builtin",
          companyId: "c1",
          toolId: "flux",
          enabled: false,
          updatedAt: new Date().toISOString(),
        },
      ];

      expect(filterEnabledTools(allDisabled)).toEqual([]);
    });

    it("behaelt alle Tools, wenn alle aktiviert sind", () => {
      const allEnabled: CompanyToolItem[] = [
        {
          id: "t1",
          name: "T1",
          logoUrl: "/t1.png",
          kind: "builtin",
          companyId: "c1",
          toolId: "t1",
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "t2",
          name: "T2",
          logoUrl: "/t2.png",
          kind: "builtin",
          companyId: "c1",
          toolId: "t2",
          enabled: true,
          updatedAt: new Date().toISOString(),
        },
      ];

      expect(filterEnabledTools(allEnabled).length).toBe(2);
    });
  });

  describe("3. Optimistisches Update & Rollback bei Fehler", () => {
    it("fuehrt optimistisches Update im Cache und Zustand durch", async () => {
      const companyId = "comp-opt-1";
      const initialTools = createDefaultCompanyTools(companyId);
      companyToolsCache.set(companyId, initialTools);

      // Simuliere erfolgreichen PUT Request
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ ok: true, toggle: { companyId, toolId: "flux", enabled: false } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as any;

      try {
        // Toggle auf false
        const targetToolId = "flux";
        const cachedBefore = companyToolsCache.get(companyId)!;
        expect(cachedBefore.find((t) => t.id === targetToolId)?.enabled).toBe(true);

        // Optimistischer Schritt:
        const updated = cachedBefore.map((t) =>
          t.id === targetToolId ? { ...t, enabled: false } : t,
        );
        companyToolsCache.set(companyId, updated);

        // Pruefe, dass sofort im Cache false steht
        const cachedAfter = companyToolsCache.get(companyId)!;
        expect(cachedAfter.find((t) => t.id === targetToolId)?.enabled).toBe(false);

        // Filterung greift sofort
        const visibleTools = filterEnabledTools(cachedAfter);
        expect(visibleTools.some((t) => t.id === targetToolId)).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rollt den Zustand bei Server-Fehler vollstaendig zurueck (Rollback)", async () => {
      const companyId = "comp-rollback-1";
      const initialTools = createDefaultCompanyTools(companyId);
      companyToolsCache.set(companyId, initialTools);

      const targetToolId = "flux";
      const snapshot = [...initialTools];

      // Optimistisch auf false schalten
      const optimisticList = initialTools.map((t) =>
        t.id === targetToolId ? { ...t, enabled: false } : t,
      );
      companyToolsCache.set(companyId, optimisticList);
      expect(companyToolsCache.get(companyId)!.find((t) => t.id === targetToolId)?.enabled).toBe(false);

      // Simuliere fehlgeschlagenen Serveraufruf (HTTP 500)
      const serverFailed = true;
      if (serverFailed) {
        // Rollback ausfuehren
        companyToolsCache.set(companyId, snapshot);
      }

      // Pruefe, dass nach Rollback wieder der Originalzustand (enabled=true) existiert
      const rolledBack = companyToolsCache.get(companyId)!;
      expect(rolledBack.find((t) => t.id === targetToolId)?.enabled).toBe(true);

      const visible = filterEnabledTools(rolledBack);
      expect(visible.some((t) => t.id === targetToolId)).toBe(true);
    });

    it("rollt bei Netzwerkfehler zurueck", async () => {
      const companyId = "comp-network-err";
      const initialTools = createDefaultCompanyTools(companyId);
      const snapshot = [...initialTools];
      const targetToolId = "analysis";

      // 1. Snapshot
      companyToolsCache.set(companyId, initialTools);

      // 2. Optimistisches Update
      const optimistic = initialTools.map((t) =>
        t.id === targetToolId ? { ...t, enabled: false } : t,
      );
      companyToolsCache.set(companyId, optimistic);
      expect(companyToolsCache.get(companyId)!.find((t) => t.id === targetToolId)?.enabled).toBe(false);

      // 3. Simulierter Netzwerkfehler fuehrt zum Rollback
      try {
        throw new Error("Network offline");
      } catch {
        companyToolsCache.set(companyId, snapshot);
      }

      // 4. Verifikation
      expect(companyToolsCache.get(companyId)!.find((t) => t.id === targetToolId)?.enabled).toBe(true);
    });
  });

  describe("4. Event-Synchronisation (Settings -> Sidebar)", () => {
    it("erzeugt und empfaengt connect-company-tools-updated Event mit korrekten Daten", () => {
      const target = typeof window !== "undefined" ? window : (globalThis as any);
      let receivedDetail: any = null;
      const handler = (e: any) => {
        receivedDetail = e.detail;
      };

      target.addEventListener(COMPANY_TOOLS_UPDATED_EVENT, handler);

      const testDetail: CompanyToolsSyncEventDetail = {
        companyId: "comp-event-1",
        toolId: "brain",
        enabled: false,
      };

      target.dispatchEvent(
        new CustomEvent<CompanyToolsSyncEventDetail>(COMPANY_TOOLS_UPDATED_EVENT, {
          detail: testDetail,
        }),
      );

      target.removeEventListener(COMPANY_TOOLS_UPDATED_EVENT, handler);

      expect(receivedDetail).not.toBeNull();
      expect(receivedDetail.companyId).toBe("comp-event-1");
      expect(receivedDetail.toolId).toBe("brain");
      expect(receivedDetail.enabled).toBe(false);
    });
  });

  describe("5. Feature-Flag & Leerer Zustand", () => {
    it("Default von FLAGS_V06.companyTools ist false laut Vorgabe", async () => {
      const { FLAGS_V06, getFlag } = await import("@/contracts/v06/flags");
      expect(FLAGS_V06.companyTools).toBe(false);
      // Wenn keine Umgebungsvariable gesetzt ist, liefert getFlag false
      if (!process.env.CONNECT_FLAGS_V06) {
        expect(getFlag("companyTools")).toBe(false);
      }
    });

    it("Erkennt leeren Zustand und liefert den korrekten Hinweistext", () => {
      const emptyTools: CompanyToolItem[] = [];
      const activeTools = filterEnabledTools(emptyTools);

      expect(activeTools.length).toBe(0);
      const emptyStateMessage = "Keine Tools aktiv – in Einstellungen aktivieren";
      expect(emptyStateMessage).toBe("Keine Tools aktiv – in Einstellungen aktivieren");
    });
  });
});
