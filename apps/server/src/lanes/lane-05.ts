import type { Hono as HonoApp } from "hono";
import { registerLane5SocialRoutes } from "../social/lane5-routes";
import { createPersonaRouter } from "../swarm/persona/router";
import { createMemoryRouter } from "../swarm/memory/router";

/**
 * Lane 05: Social Posts, Articles, Media, Bot Listings & Persona/Memory Engine
 */
export function registerLane05Routes(app: HonoApp<any, any, any>): void {
  registerLane5SocialRoutes(app);
  app.route("/api/personas", createPersonaRouter());
  app.route("/api/personas", createMemoryRouter());
}

export default registerLane05Routes;
