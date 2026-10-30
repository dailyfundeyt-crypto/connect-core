import type { Hono as HonoApp } from "hono";
import type { Database } from "../db/client";
import { registerBrainInsightsRoutes } from "../brain/insights";
import { createBrowserFoldersRouter } from "../brain/browser-folders/routes";

/**
 * Lane 03: Brain-Struktur, Brain-Insights & Agent-Access + Spark Folders
 * - GET /api/brain/structure?companyId
 * - GET /api/brain/agent-access/:agentId
 * - GET /api/brain/agent-access
 * - POST /api/brain/agent-access/log
 * - POST /api/brain/insights/refresh
 * - /api/spark/folders/* (Browser-Ordner, Links, Notizen)
 */
export function registerLane03Routes(app: HonoApp<any, any, any>, database?: Database): void {
  registerBrainInsightsRoutes(app);
  app.route("/api/spark/folders", createBrowserFoldersRouter(database));
}

export default registerLane03Routes;
