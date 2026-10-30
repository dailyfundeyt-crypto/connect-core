import type { Hono as HonoApp } from "hono";
import { registerLane01Routes } from "./lane-01";
import { registerLane02Routes } from "./lane-02";
import { registerLane03Routes } from "./lane-03";
import { registerLane04Routes } from "./lane-04";
import { registerLane05Routes } from "./lane-05";
import { registerLane06Routes } from "./lane-06";
import { registerLane07Routes } from "./lane-07";
import { registerLane08Routes } from "./lane-08";
import { registerLane09Routes } from "./lane-09";
import { registerLane10Routes } from "./lane-10";
import { registerSwarmV3Stubs } from "../swarm-v3/router-stubs";
import { registerUsageRoutes } from "../routes/usage";
import { registerConductorRoutes } from "../routes/conductor";

/**
 * Global Swarm Lane Route Registration Hook
 * Dispatches to individual lane modules so each lane can develop
 * independently without merge conflicts in the main server entry.
 */
export function registerLaneRoutes(app: any, database?: any): void {
  registerLane01Routes(app);
  registerLane02Routes(app);
  registerLane03Routes(app, database);
  registerLane04Routes(app);
  registerLane05Routes(app);
  registerLane06Routes(app);
  registerLane07Routes(app, database);
  registerLane08Routes(app, database);
  registerLane09Routes(app);
  registerLane10Routes(app, database);
  registerUsageRoutes(app);
  registerConductorRoutes(app);
}

export default registerLaneRoutes;
