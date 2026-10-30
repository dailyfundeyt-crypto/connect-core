import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import {
  listCompanyToolsWithToggles,
  setCompanyToolToggleState,
  CANONICAL_CONNECT_TOOLS,
} from "./service";
import { resetMemoryToggles } from "./repo";
import { registerCompanyToolsRoutes, createCompanyToolsRouter } from "./routes";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";

describe("Company Tools Service & Toggles", () => {
  beforeEach(() => {
    resetMemoryToggles();
    delete process.env.CONNECT_FLAGS_V06;
  });

  it("liefert alle bekannten Standard-Tools mit default enabled = true", async () => {
    const tools = await listCompanyToolsWithToggles("test-company-1");

    expect(tools.length).toBeGreaterThanOrEqual(5);

    const analysis = tools.find((t) => t.id === "analysis");
    expect(analysis).toBeDefined();
    expect(analysis?.enabled).toBe(true);
    expect(analysis?.name).toBe("Analysis");
    expect(analysis?.logoUrl).toBe("/brand/analysis-logo.png");

    const sozial = tools.find((t) => t.id === "connect-sozial");
    expect(sozial).toBeDefined();
    expect(sozial?.enabled).toBe(true);
    expect(sozial?.url).toBe("/social");

    const flux = tools.find((t) => t.id === "flux");
    expect(flux).toBeDefined();
    expect(flux?.enabled).toBe(true);
  });

  it("kann einen Toggle deaktivieren und wieder aktivieren", async () => {
    const companyId = "company-toggle-test";

    // 1. Zunaechst ist Flux aktiv (Default)
    const initialTools = await listCompanyToolsWithToggles(companyId);
    expect(initialTools.find((t) => t.id === "flux")?.enabled).toBe(true);

    // 2. Flux deaktivieren
    const toggledOff = await setCompanyToolToggleState(companyId, "flux", false);
    expect(toggledOff.enabled).toBe(false);
    expect(toggledOff.toolId).toBe("flux");
    expect(toggledOff.companyId).toBe(companyId);

    // Pruefen, ob die Liste die Deaktivierung widerspiegelt
    const updatedTools1 = await listCompanyToolsWithToggles(companyId);
    expect(updatedTools1.find((t) => t.id === "flux")?.enabled).toBe(false);
    // Andere Tools bleiben unberuehrt
    expect(updatedTools1.find((t) => t.id === "analysis")?.enabled).toBe(true);

    // 3. Flux wieder aktivieren
    const toggledOn = await setCompanyToolToggleState(companyId, "flux", true);
    expect(toggledOn.enabled).toBe(true);

    const updatedTools2 = await listCompanyToolsWithToggles(companyId);
    expect(updatedTools2.find((t) => t.id === "flux")?.enabled).toBe(true);
  });

  it("isoliert Toggles sauber zwischen verschiedenen Firmen", async () => {
    await setCompanyToolToggleState("company-A", "analysis", false);
    await setCompanyToolToggleState("company-B", "analysis", true);

    const toolsA = await listCompanyToolsWithToggles("company-A");
    const toolsB = await listCompanyToolsWithToggles("company-B");

    expect(toolsA.find((t) => t.id === "analysis")?.enabled).toBe(false);
    expect(toolsB.find((t) => t.id === "analysis")?.enabled).toBe(true);
  });
});

describe("Company Tools Hono Routes", () => {
  beforeEach(() => {
    resetMemoryToggles();
    delete process.env.CONNECT_FLAGS_V06;
  });

  it("gibt 404 zurueck, wenn Feature-Flag companyTools deaktiviert ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "no-companytools";

    const app = new Hono();
    registerCompanyToolsRoutes(app);

    const res = await app.request(API_PATHS_V06.companyTools("acme-inc"), {
      method: "GET",
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("disabled");
  });

  it("GET liefert 200 und Tool-Liste wenn Flag aktiv ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "companyTools";

    const app = new Hono();
    registerCompanyToolsRoutes(app);

    const res = await app.request(API_PATHS_V06.companyTools("acme-inc"), {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThanOrEqual(CANONICAL_CONNECT_TOOLS.length);

    const analysis = tools.find((t: any) => t.id === "analysis");
    expect(analysis.enabled).toBe(true);
  });

  it("PUT schaltet ein Tool aus und liefert neues Toggle", async () => {
    process.env.CONNECT_FLAGS_V06 = "companyTools";

    const app = new Hono();
    registerCompanyToolsRoutes(app);

    const res = await app.request(API_PATHS_V06.companyTools("acme-inc"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: "analysis", enabled: false }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.toggle.toolId).toBe("analysis");
    expect(data.toggle.enabled).toBe(false);

    // Kontrollabfrage per GET
    const getRes = await app.request(API_PATHS_V06.companyTools("acme-inc"), {
      method: "GET",
    });
    const tools = await getRes.json();
    expect(tools.find((t: any) => t.id === "analysis").enabled).toBe(false);
  });
});
