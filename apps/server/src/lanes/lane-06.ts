import type { Hono as HonoApp } from "hono";
import { projectsApi, swarmTasksApi } from "../social/projects";
import { createCouncilRouter } from "../swarm/council/router";

/**
 * Lane 06: Swarm Tasks & Projects + Council (Roast-Room) Engine
 */
export function registerLane06Routes(app: HonoApp<any, any, any>): void {
  // Lane 06 route registrations
  app.route("/api/projects", projectsApi);
  app.route("/api/swarm/tasks", swarmTasksApi);
  app.route("/api/council", createCouncilRouter());
}

export default registerLane06Routes;
