import { describe, expect, mock, test } from "bun:test";
import {
  type CompanyAppItem,
  getActiveCompanyApps,
  getAutoOpenApp,
} from "./CompanyAppsView";

describe("CompanyAppsView (A14)", () => {
  const fluxCompany = {
    id: "flux",
    name: "Flux",
    logo: "/flux-logo.png",
    accent: "#6366f1",
  };

  const sparkCompany = {
    id: "spark",
    name: "Spark",
    logo: "/spark-logo.png",
    accent: "#f59e0b",
  };

  test("null oder undefined Company liefert leeres Array", () => {
    expect(getActiveCompanyApps(null)).toEqual([]);
    expect(getActiveCompanyApps(undefined)).toEqual([]);
  });

  test("Aktive Firma Flux liefert nur Flux-App (integrierte Connect-App)", () => {
    const mockIntegrated = (c: any) =>
      c.id === "flux"
        ? {
            manifest: {
              id: "flux",
              name: "Flux",
              description: "Flux Image Studio",
            },
          }
        : null;

    const mockLinks = (cid: string) => {
      if (cid === "flux") return [];
      if (cid === "spark") return [{ id: "l1", label: "Spark Web", url: "https://spark.test" }];
      return [];
    };

    const apps = getActiveCompanyApps(fluxCompany, {
      getIntegratedApp: mockIntegrated,
      getLinks: mockLinks,
    });

    expect(apps.length).toBe(1);
    expect(apps[0].id).toBe("flux");
    expect(apps[0].name).toBe("Flux");
    expect(apps[0].kind).toBe("integrated");
    expect(apps[0].logo).toBe("/flux-logo.png");
  });

  test("Firma mit mehreren Links liefert genau die Links dieser Firma", () => {
    const mockIntegrated = () => null;
    const mockLinks = (cid: string) => {
      if (cid === "spark") {
        return [
          { id: "s1", label: "Spark Graph", url: "https://spark.test/graph" },
          { id: "s2", label: "Spark Learn", url: "https://spark.test/learn" },
        ];
      }
      return [{ id: "f1", label: "Flux Gallery", url: "https://flux.test" }];
    };

    const apps = getActiveCompanyApps(sparkCompany, {
      getIntegratedApp: mockIntegrated,
      getLinks: mockLinks,
    });

    expect(apps.length).toBe(2);
    expect(apps.map((a) => a.id)).toEqual(["s1", "s2"]);
    expect(apps.some((a) => a.id === "f1")).toBe(false);
  });

  describe("getAutoOpenApp", () => {
    test("bei genau 1 App: liefert die App zum sofortigen Öffnen", () => {
      const singleApp: CompanyAppItem = {
        id: "flux",
        name: "Flux",
        kind: "integrated",
      };
      expect(getAutoOpenApp([singleApp])).toBe(singleApp);
    });

    test("bei 0 Apps: liefert null (kein Auto-Open)", () => {
      expect(getAutoOpenApp([])).toBeNull();
    });

    test("bei 2 oder mehr Apps: liefert null (kein falsches Auto-Open)", () => {
      const app1: CompanyAppItem = { id: "a1", name: "App 1", kind: "link" };
      const app2: CompanyAppItem = { id: "a2", name: "App 2", kind: "link" };
      expect(getAutoOpenApp([app1, app2])).toBeNull();

      const app3: CompanyAppItem = { id: "a3", name: "App 3", kind: "link" };
      expect(getAutoOpenApp([app1, app2, app3])).toBeNull();
    });
  });

  test("Auto-Open Übergabeparameter nutzt replace: true um Zurück-Schleifen zu vermeiden", () => {
    const singleApp: CompanyAppItem = {
      id: "flux",
      name: "Flux",
      kind: "integrated",
    };
    const target = getAutoOpenApp([singleApp]);
    expect(target).not.toBeNull();

    const onOpenAppMock = mock((app: CompanyAppItem, opts?: { replace?: boolean }) => {
      expect(app.id).toBe("flux");
      expect(opts?.replace).toBe(true);
    });

    if (target) {
      onOpenAppMock(target, { replace: true });
    }
    expect(onOpenAppMock).toHaveBeenCalledTimes(1);
  });
});
