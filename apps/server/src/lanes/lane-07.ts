import type { Hono as HonoApp } from "hono";
import type { Database } from "../db/client";
import { createSimulationRouter } from "../swarm/simulation/router";

/**
 * Lane 07: Zukunfts-Simulation (Native & MiroFish Sidecar Engine)
 */
export function registerLane07Routes(app: HonoApp<any, any, any>, database?: Database): void {
  app.route("/api/simulation", createSimulationRouter(database));
}

export default registerLane07Routes;
