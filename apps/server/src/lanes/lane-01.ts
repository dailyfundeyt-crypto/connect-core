import type { Hono as HonoApp } from "hono";
import { registerSidebarRoutes } from "../routes/sidebar-routes";
import { registerAccountsRoutes } from "../cli-bridge/accounts-routes";

/**
 * Lane 01: Navigation, App Sidebar, Multi-Login
 */
export function registerLane01Routes(app: HonoApp<any, any, any>): void {
  registerSidebarRoutes(app);
  registerAccountsRoutes(app);
}

export default registerLane01Routes;
