import type { Hono as HonoApp } from "hono";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  CANONICAL_SIDEBAR_SLOTS,
  type SidebarLayout,
  type SidebarSectionSlot,
} from "../contracts/sidebar";

function getLayoutFilePath(): string {
  const localAppData =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || "C:\\Users\\Kunc GmbH", "AppData", "Local");
  const dir = path.join(localAppData, "ConnectApp", "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "sidebar-layout.json");
}

const DEFAULT_LAYOUT: SidebarLayout = {
  slots: [...CANONICAL_SIDEBAR_SLOTS],
  collapsedFolders: [],
  toolsEnabled: {
    flux: true,
    analysis: true,
    "connect-sozial": true,
    // Trading-Tools erhalten (ausgeblendet / archiviert, nicht gelöscht)
    markettrace: false,
    tradingview: false,
    btcusdt: false,
    prorealtime: false,
    allcategories: false,
  },
};

function readLayout(): SidebarLayout {
  const file = getLayoutFilePath();
  if (!fs.existsSync(file)) {
    return { ...DEFAULT_LAYOUT };
  }
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      slots: Array.isArray(parsed.slots) && parsed.slots.length > 0
        ? (parsed.slots as SidebarSectionSlot[])
        : [...CANONICAL_SIDEBAR_SLOTS],
      collapsedFolders: Array.isArray(parsed.collapsedFolders) ? parsed.collapsedFolders : [],
      toolsEnabled: parsed.toolsEnabled && typeof parsed.toolsEnabled === "object"
        ? {
            ...DEFAULT_LAYOUT.toolsEnabled,
            ...parsed.toolsEnabled,
            flux: parsed.toolsEnabled.flux ?? true,
            analysis: parsed.toolsEnabled.analysis ?? true,
            "connect-sozial": parsed.toolsEnabled["connect-sozial"] ?? true,
          }
        : { ...DEFAULT_LAYOUT.toolsEnabled },
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

function writeLayout(layout: SidebarLayout): void {
  const file = getLayoutFilePath();
  fs.writeFileSync(file, JSON.stringify(layout, null, 2), "utf-8");
}

export function registerSidebarRoutes(app: HonoApp<any, any, any>): void {
  // GET /api/sidebar - Uebersicht/Alias fuer das Sidebar-Layout (Integration 2026-10-22)
  app.get("/api/sidebar", (c) => {
    const layout = readLayout();
    return c.json({
      ok: true,
      layout,
      endpoints: ["/api/sidebar/layout", "/api/sidebar/tools/toggle", "/api/app-accounts"],
    });
  });
  // GET /api/sidebar/layout
  app.get("/api/sidebar/layout", (c) => {
    const layout = readLayout();
    return c.json({
      ok: true,
      layout,
    });
  });

  // POST /api/sidebar/layout
  app.post("/api/sidebar/layout", async (c) => {
    try {
      const body = await c.req.json();
      const current = readLayout();
      const updated: SidebarLayout = {
        slots: Array.isArray(body.slots) ? body.slots : current.slots,
        collapsedFolders: Array.isArray(body.collapsedFolders)
          ? body.collapsedFolders
          : current.collapsedFolders,
        toolsEnabled:
          body.toolsEnabled && typeof body.toolsEnabled === "object"
            ? { ...current.toolsEnabled, ...body.toolsEnabled }
            : current.toolsEnabled,
      };
      writeLayout(updated);
      return c.json({ ok: true, layout: updated });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || "Invalid layout payload" }, 400);
    }
  });

  // POST /api/sidebar/tools/toggle
  app.post("/api/sidebar/tools/toggle", async (c) => {
    try {
      const body = await c.req.json();
      const { toolId, enabled } = body;
      if (!toolId || typeof enabled !== "boolean") {
        return c.json({ ok: false, error: "Missing toolId or enabled boolean" }, 400);
      }
      const current = readLayout();
      current.toolsEnabled[toolId] = enabled;
      writeLayout(current);
      return c.json({ ok: true, toolId, enabled, toolsEnabled: current.toolsEnabled });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || "Invalid toggle payload" }, 400);
    }
  });
}

export default registerSidebarRoutes;
