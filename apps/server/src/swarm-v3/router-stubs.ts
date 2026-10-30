import { Hono } from "hono";
import type { Hono as HonoApp } from "hono";

/**
 * Creates an empty router for a Swarm-v3 endpoint prefix returning 501 Not Implemented.
 * Allows other lanes to test against route stubs before feature logic is integrated.
 */
export function createStubRouter(prefix: string): Hono {
  const router = new Hono();
  const handler = (c: any) => {
    return c.json(
      {
        error: "Not Implemented",
        message: `Swarm-v3 stub endpoint for ${prefix}. This endpoint will be implemented by the assigned lane agent.`,
        prefix,
        method: c.req.method,
        path: c.req.path,
        timestamp: new Date().toISOString(),
      },
      501
    );
  };

  router.all("/", handler);
  router.all("/*", handler);
  return router;
}

/**
 * Registers all canonical Swarm-v3 prefix stubs on the Hono application.
 */
export function registerSwarmV3Stubs(app: HonoApp<any, any, any>): void {
  // Lane 2: Company Apps (/api/companies/:id/apps)
  const companyAppsHandler = (c: any) => {
    return c.json(
      {
        error: "Not Implemented",
        message: "Swarm-v3 stub endpoint for /api/companies/:id/apps. To be implemented by Lane 2.",
        prefix: "/api/companies/:id/apps",
        method: c.req.method,
        path: c.req.path,
        companyId: c.req.param("id"),
        timestamp: new Date().toISOString(),
      },
      501
    );
  };
  app.all("/api/companies/:id/apps", companyAppsHandler);
  app.all("/api/companies/:id/apps/*", companyAppsHandler);

  // Lane 3: Spark Folders (/api/spark/folders)
  app.route("/api/spark/folders", createStubRouter("/api/spark/folders"));

  // Lane 4: Transcriber Template (/api/agents/templates/transcriber)
  app.route("/api/agents/templates/transcriber", createStubRouter("/api/agents/templates/transcriber"));

  // Lane 5: Personas (/api/personas)
  app.route("/api/personas", createStubRouter("/api/personas"));

  // Lane 6: Council (/api/council)
  app.route("/api/council", createStubRouter("/api/council"));

  // Lane 7: Simulation (/api/simulation)
  app.route("/api/simulation", createStubRouter("/api/simulation"));

  // Lane 8: Swarm Runs (/api/swarm/runs)
  app.route("/api/swarm/runs", createStubRouter("/api/swarm/runs"));

  // Lane 10: Brains (/api/brains)
  app.route("/api/brains", createStubRouter("/api/brains"));
}

export default registerSwarmV3Stubs;
